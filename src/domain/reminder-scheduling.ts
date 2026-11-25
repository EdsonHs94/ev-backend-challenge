import { Temporal } from '@js-temporal/polyfill';

export type ReminderSchedule =
  | { scheduledFor: Date; status: 'pending'; skipReason: null }
  | { scheduledFor: Date; status: 'skipped'; skipReason: 'too_late' };

const openingTime = Temporal.PlainTime.from('09:00');
const closingTime = Temporal.PlainTime.from('21:00');

export function scheduleReminder(startsAt: Date, timezone: string, now: Date): ReminderSchedule {
  const appointment = Temporal.Instant.fromEpochMilliseconds(startsAt.getTime());
  const dayBefore = appointment.toZonedDateTimeISO(timezone).toPlainDateTime().subtract({ days: 1 });
  const original = dayBefore.toZonedDateTime(timezone, { disambiguation: 'compatible' });

  const candidate = original.epochMilliseconds < now.getTime()
    ? Temporal.Instant.fromEpochMilliseconds(now.getTime()).toZonedDateTimeISO(timezone)
    : original;

  const scheduledFor = new Date(nextAllowedTime(candidate).epochMilliseconds);

  return scheduledFor >= startsAt
    ? { scheduledFor, status: 'skipped', skipReason: 'too_late' }
    : { scheduledFor, status: 'pending', skipReason: null };
}

function nextAllowedTime(candidate: Temporal.ZonedDateTime): Temporal.ZonedDateTime {
  const localTime = candidate.toPlainTime();
  const afterClosing = Temporal.PlainTime.compare(localTime, closingTime) >= 0;
  const beforeOpening = Temporal.PlainTime.compare(localTime, openingTime) < 0;

  if (!afterClosing && !beforeOpening) return candidate;

  const date = candidate.toPlainDate();
  const openingDate = afterClosing ? date.add({ days: 1 }) : date;
  const opening = openingDate.toPlainDateTime(openingTime);
  const firstOpening = opening.toZonedDateTime(candidate.timeZoneId, { disambiguation: 'compatible' });

  // If opening itself repeats, its first occurrence may have already passed.
  return Temporal.ZonedDateTime.compare(firstOpening, candidate) < 0
    ? opening.toZonedDateTime(candidate.timeZoneId, { disambiguation: 'later' })
    : firstOpening;
}
