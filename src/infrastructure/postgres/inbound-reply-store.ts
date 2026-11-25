import { createHash } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import type { Clock } from '../../application/clock.js';
import type { InboundReplyStore, ReplyTransaction } from '../../application/inbound-replies.js';
import { cancelAppointment, cancelPendingReminder } from './appointment-store.js';
import { withTransaction } from './transaction.js';

export class PostgresInboundReplyStore implements InboundReplyStore {
  constructor(
    private readonly database: Pool,
    private readonly clockFor: (client: PoolClient) => Clock,
  ) {}

  processOnce(messageId: string, process: (transaction: ReplyTransaction) => Promise<void>): Promise<void> {
    // Hash every code unit to give opaque IDs a fixed-size, indexable representation.
    const key = createHash('sha256').update(messageId, 'utf16le').digest();
    return withTransaction(this.database, async (client) => {
      const receipt = await client.query(
        'INSERT INTO inbound_message_receipts (message_id_hash) VALUES ($1) ON CONFLICT DO NOTHING',
        [key],
      );
      if (receipt.rowCount === 1) {
        await process(new PostgresReplyTransaction(client, this.clockFor(client)));
      }
    });
  }
}

class PostgresReplyTransaction implements ReplyTransaction {
  constructor(
    private readonly client: PoolClient,
    private readonly clock: Clock,
  ) {}

  async findLatestAppointment(phone: string): Promise<string | undefined> {
    if (phone.includes('\0')) return undefined;

    const now = await this.clock.now();
    const result = await this.client.query<{ id: string }>(
      `SELECT a.id
       FROM patients p
       JOIN appointments a ON a.patient_id = p.id
       JOIN LATERAL (
         SELECT r.sent_at, r.sent_order, r.history_order
         FROM reminders r
         WHERE r.appointment_id = a.id AND r.status = 'sent' AND r.sent_at IS NOT NULL
         ORDER BY r.sent_at DESC, r.sent_order DESC NULLS LAST, r.history_order DESC
         LIMIT 1
       ) latest ON true
       WHERE p.phone = $1 AND a.starts_at > $2 AND a.status <> 'cancelled'
       ORDER BY latest.sent_at DESC, latest.sent_order DESC NULLS LAST, latest.history_order DESC
       LIMIT 1
       FOR UPDATE OF a`,
      [phone, now],
    );
    return result.rows[0]?.id;
  }

  async confirmAppointment(id: string): Promise<void> {
    await this.client.query("UPDATE appointments SET status = 'confirmed' WHERE id = $1", [id]);
  }

  async cancelAppointment(id: string): Promise<void> {
    await cancelAppointment(this.client, id);
    await cancelPendingReminder(this.client, id);
  }
}
