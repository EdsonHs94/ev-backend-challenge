import type { Pool, PoolClient } from 'pg';
import type { Clock } from '../../application/clock.js';
import type { DeliveryStore, DeliveryUpdate, PendingDelivery } from '../../application/reminder-delivery.js';
import { withTransaction } from './transaction.js';

export class PostgresDeliveryStore implements DeliveryStore {
  constructor(
    private readonly database: Pool,
    private readonly clockFor: (client: PoolClient) => Clock,
  ) {}

  processNext(
    cutoff: Date,
    handle: (reminder: PendingDelivery, clock: Clock) => Promise<DeliveryUpdate>,
  ): Promise<'empty' | 'stale' | 'processed'> {
    return withTransaction(this.database, async (client) => {
      const clock = this.clockFor(client);
      const now = await clock.now();
      const dueBy = now < cutoff ? now : cutoff;
      const selection = await client.query<{ id: string }>(
        `SELECT r.id
         FROM reminders r
         JOIN appointments a ON a.id = r.appointment_id
         WHERE r.status = 'pending' AND a.status <> 'cancelled'
           AND COALESCE(r.next_run_at, r.scheduled_for) <= $1
         ORDER BY COALESCE(r.next_run_at, r.scheduled_for), r.history_order
         LIMIT 1
         FOR UPDATE OF a SKIP LOCKED`,
        [dueBy],
      );
      const candidate = selection.rows[0];
      if (!candidate) return 'empty';

      // Cancellation and reprogramming lock the appointment first as well.
      // A new statement also sees changes committed while selection acquired its lock.
      const current = await client.query<PendingDelivery>(
        `SELECT r.id, r.attempts, a.starts_at AS "startsAt", c.timezone, c.name AS "clinicName",
                p.name AS "patientName", p.phone, p.accepts_reminders AS "acceptsReminders"
         FROM reminders r
         JOIN appointments a ON a.id = r.appointment_id
         JOIN clinics c ON c.id = a.clinic_id
         JOIN patients p ON p.id = a.patient_id
         WHERE r.id = $1 AND r.status = 'pending' AND a.status <> 'cancelled'
           AND COALESCE(r.next_run_at, r.scheduled_for) <= $2
         FOR UPDATE OF r`,
        [candidate.id, dueBy],
      );
      const reminder = current.rows[0];
      if (!reminder) return 'stale';

      const update = await handle(reminder, clock);
      await client.query(
        `UPDATE reminders
         SET status = $2, attempts = $3, next_run_at = $4, sent_at = $5, skip_reason = $6,
             sent_order = CASE WHEN $2 = 'sent' THEN nextval('reminder_sent_order_seq') END
         WHERE id = $1`,
        [
          reminder.id, update.status, update.attempts,
          update.status === 'pending' ? update.nextRunAt : null,
          update.status === 'sent' ? update.sentAt : null,
          update.status === 'skipped' ? update.skipReason : null,
        ],
      );
      return 'processed';
    });
  }
}
