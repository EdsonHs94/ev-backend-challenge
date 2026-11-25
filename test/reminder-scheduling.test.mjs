import assert from 'node:assert/strict';
import { test } from 'node:test';
import { scheduleReminder } from '../dist/domain/reminder-scheduling.js';

const cases = [
  ['Madrid spring transition', '2027-03-28T08:00Z', '2027-03-26T08:00Z', '2027-03-27T09:00:00.000Z'],
  ['Madrid autumn transition', '2027-10-31T09:00Z', '2027-10-29T08:00Z', '2027-10-30T08:00:00.000Z'],
  ['Canary spring transition', '2027-03-28T09:00Z', '2027-03-26T08:00Z', '2027-03-27T10:00:00.000Z', 'Atlantic/Canary'],
  ['21:00 rolls to the next local morning', '2027-01-12T20:00Z', '2027-01-10T08:00Z', '2027-01-12T08:00:00.000Z'],
  ['08:59 rolls to the same local morning', '2027-01-12T07:59Z', '2027-01-10T08:00Z', '2027-01-11T08:00:00.000Z'],
  ['09:00 is allowed', '2027-01-12T08:00Z', '2027-01-10T08:00Z', '2027-01-11T08:00:00.000Z'],
  ['passed time moves to now', '2027-01-12T13:00Z', '2027-01-12T10:30Z', '2027-01-12T10:30:00.000Z'],
  ['passed time moves to now and then next opening', '2027-01-12T13:00Z', '2027-01-11T22:00Z', '2027-01-12T08:00:00.000Z'],
  ['opening equals start', '2027-01-12T08:00Z', '2027-01-11T22:00Z', '2027-01-12T08:00:00.000Z', undefined, 'too_late'],
  ['opening is after start', '2027-01-12T07:30Z', '2027-01-11T22:00Z', '2027-01-12T08:00:00.000Z', undefined, 'too_late'],
  ['a skipped local day advances by the gap', '2011-12-30T20:00Z', '2011-12-28T20:00Z', '2011-12-30T20:00:00.000Z', 'Pacific/Apia', 'too_late'],
];

for (const [description, startsAt, now, expected, zone = 'Europe/Madrid', skipReason = null] of cases) {
  test(description, () => {
    const result = scheduleReminder(new Date(startsAt), zone, new Date(now));
    assert.equal(result.scheduledFor.toISOString(), expected);
    assert.equal(result.status, skipReason ? 'skipped' : 'pending');
    assert.equal(result.skipReason, skipReason);
  });
}
