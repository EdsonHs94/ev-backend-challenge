import { nextAllowedReminderTime, reminderMessage } from '../domain/reminder-scheduling.js';
import type { Clock } from './clock.js';

export interface PendingDelivery {
  id: string;
  startsAt: Date;
  timezone: string;
  patientName: string;
  clinicName: string;
  phone: string | null;
  acceptsReminders: boolean;
  attempts: number;
}

type SkippedReason = 'too_late' | 'no_phone' | 'opted_out';

export type DeliveryUpdate =
  | { status: 'pending'; attempts: number; nextRunAt: Date }
  | { status: 'sent'; attempts: number; sentAt: Date }
  | { status: 'failed'; attempts: number }
  | { status: 'skipped'; attempts: number; skipReason: SkippedReason };

export interface DeliveryStore {
  processNext(
    cutoff: Date,
    handle: (reminder: PendingDelivery, clock: Clock) => Promise<DeliveryUpdate>,
  ): Promise<'empty' | 'stale' | 'processed'>;
}

export interface ReminderProvider {
  send(message: { key: string; to: string; text: string }): Promise<'accepted' | 'rejected' | 'retry'>;
}

export class ReminderDelivery {
  constructor(
    private readonly store: DeliveryStore,
    private readonly provider: ReminderProvider,
    private readonly clock: Clock,
  ) {}

  async run(): Promise<{ processed: number }> {
    const cutoff = await this.clock.now();
    let processed = 0;

    for (;;) {
      const result = await this.store.processNext(cutoff, (reminder, clock) => this.deliver(reminder, clock));
      if (result === 'empty') return { processed };
      if (result === 'processed') processed++;
    }
  }

  private async deliver(reminder: PendingDelivery, clock: Clock): Promise<DeliveryUpdate> {
    const now = await clock.now();
    const { attempts, startsAt, timezone, phone } = reminder;

    if (now >= startsAt) return skipped(attempts, 'too_late');
    if (!phone) return skipped(attempts, 'no_phone');
    if (!reminder.acceptsReminders) return skipped(attempts, 'opted_out');

    if (attempts === 0) {
      const opening = nextAllowedReminderTime(now, timezone);
      if (opening >= startsAt) return skipped(attempts, 'too_late');
      if (opening > now) return { status: 'pending', attempts, nextRunAt: opening };
    }

    const result = await this.provider.send({
      key: reminder.id,
      to: phone,
      text: reminderMessage(startsAt, timezone, reminder.patientName, reminder.clinicName),
    });
    const calls = attempts + 1;

    if (result === 'accepted') return { status: 'sent', attempts: calls, sentAt: await clock.now() };
    if (result === 'rejected' || calls >= 3) return { status: 'failed', attempts: calls };

    const failedAt = await clock.now();
    const delay = calls === 1 ? 60_000 : 300_000;
    return { status: 'pending', attempts: calls, nextRunAt: new Date(failedAt.getTime() + delay) };
  }
}

function skipped(attempts: number, skipReason: SkippedReason): DeliveryUpdate {
  return { status: 'skipped', attempts, skipReason };
}
