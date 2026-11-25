import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, beforeEach, test } from 'node:test';
import pg from 'pg';
import { startApi } from '../dist/api.js';

const { DATABASE_URL } = process.env;
assert.ok(DATABASE_URL, 'Set DATABASE_URL or run docker compose run --rm --build checks');

const database = 'test_' + randomUUID().replaceAll('-', '');
const databaseUrl = new URL(DATABASE_URL);
databaseUrl.pathname = '/' + database;
const admin = new pg.Client({ connectionString: DATABASE_URL });
const data = new pg.Pool({ connectionString: databaseUrl.href });
const now = '2027-01-10T11:00:00Z';
let app;
let origin;
let databaseCreated = false;

async function request(method, path, status, body) {
  const response = await fetch(origin + path, {
    method,
    ...(body === undefined ? {} : {
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  });

  const text = await response.text();
  assert.equal(response.status, status, text);
  const result = text ? JSON.parse(text) : undefined;
  if (status >= 400) assert.equal(typeof result.error, 'string');
  return result;
}

async function registerPatient(options = {}) {
  const clinic = await request('POST', '/clinics', 201, {
    name: 'Clínica Sol',
    timezone: 'Europe/Madrid',
  });
  const input = { clinicId: clinic.id, name: 'Ana', acceptsReminders: true, ...options };
  return request('POST', '/patients', 201, input);
}

function createAppointment(patient, startsAt = '2027-01-12T15:15:00+01:00') {
  return request('POST', '/appointments', 201, {
    clinicId: patient.clinicId,
    patientId: patient.id,
    startsAt,
  });
}

before(async () => {
  await admin.connect();
  await admin.query(`CREATE DATABASE "${database}"`);
  databaseCreated = true;
  app = await startApi({ databaseUrl: databaseUrl.href, clockMode: 'test', port: 0, quiet: true });
  origin = await app.getUrl();
});

beforeEach(async () => {
  await request('PUT', '/test/clock', 204, { now });
});

after(async () => {
  try {
    await Promise.all([app?.close(), data.end()]);
    if (databaseCreated) await admin.query(`DROP DATABASE "${database}" WITH (FORCE)`);
  } finally {
    await admin.end();
  }
});

test('registers a clinic in an IANA zone and rejects unknown zones and fixed offsets', async () => {
  const input = { name: 'Clínica Isla', timezone: 'Atlantic/Canary' };
  const clinic = await request('POST', '/clinics', 201, input);
  assert.deepEqual(clinic, { id: clinic.id, ...input });
  assert.equal(typeof clinic.id, 'string');

  for (const timezone of ['Atlantic/Madrid', '+02:00', '']) {
    await request('POST', '/clinics', 400, { ...input, timezone });
  }
  await request('POST', '/clinics', 400, { ...input, name: '' });
});

test('registers missing, null, and shared phone numbers', async () => {
  const patient = await registerPatient({ acceptsReminders: false });
  assert.deepEqual(patient, {
    id: patient.id, clinicId: patient.clinicId, name: 'Ana', phone: null, acceptsReminders: false,
  });

  const input = { clinicId: patient.clinicId, name: 'Rosa', acceptsReminders: true };
  const noPhone = await request('POST', '/patients', 201, { ...input, phone: null });
  assert.equal(noPhone.phone, null);

  const phone = '+34600111222';
  const first = await request('POST', '/patients', 201, { ...input, phone });
  const second = await request('POST', '/patients', 201, { ...input, phone });
  assert.equal(first.phone, phone);
  assert.equal(second.phone, phone);
  assert.notEqual(first.id, second.id);
});

test('rejects invalid patient inputs and unknown clinics', async () => {
  const { clinicId } = await registerPatient();
  const input = { clinicId, name: 'Pedro', acceptsReminders: true };
  await request('POST', '/patients', 400, { ...input, phone: '600111222' });
  await request('POST', '/patients', 400, { ...input, phone: '+0123456' });
  await request('POST', '/patients', 400, { ...input, acceptsReminders: 'true' });
  await request('POST', '/patients', 404, { ...input, clinicId: 'missing' });
});

test('creates a scheduled appointment and returns its saved reminder and UTC instants', async () => {
  const patient = await registerPatient();
  const appointment = await createAppointment(patient);
  const [reminder] = appointment.reminders;
  assert.deepEqual(appointment, {
    id: appointment.id, clinicId: patient.clinicId, patientId: patient.id,
    startsAt: '2027-01-12T14:15:00.000Z', status: 'scheduled',
    reminders: [{
      id: reminder.id, scheduledFor: '2027-01-11T14:15:00.000Z',
      status: 'pending', attempts: 0, sentAt: null, skipReason: null,
    }],
  });

  assert.deepEqual(await request('GET', '/appointments/' + appointment.id, 200), appointment);
  await assert.rejects(
    data.query(`INSERT INTO reminders (appointment_id, scheduled_for, status)
                VALUES ($1, $2, 'pending')`, [appointment.id, reminder.scheduledFor]),
    { code: '23505' },
  );
});

test('creates appointments using the clinic zone even when the incoming timestamp is UTC', async () => {
  const clinic = await request('POST', '/clinics', 201, {
    name: 'Clínica Isla', timezone: 'Atlantic/Canary',
  });
  const patient = await request('POST', '/patients', 201, {
    clinicId: clinic.id, name: 'Pedro', acceptsReminders: true,
  });
  const result = await createAppointment(patient, '2027-03-28T09:00:00Z');
  assert.equal(result.reminders[0].scheduledFor, '2027-03-27T10:00:00.000Z');
});

test('rejects invalid or non-future appointments and unexpected references', async () => {
  const patient = await registerPatient();
  const other = await registerPatient();
  const input = { clinicId: patient.clinicId, patientId: patient.id, startsAt: '2027-01-12T13:00:00Z' };

  for (const startsAt of [now, '2027-01-10T10:59:59Z', '2027-01-12T13:00:00', '2027-02-30T13:00:00Z']) {
    await request('POST', '/appointments', 400, { ...input, startsAt });
  }
  await request('POST', '/appointments', 400, { ...input, patientId: other.id });
  await request('POST', '/appointments', 404, { ...input, patientId: 'missing' });
  await request('POST', '/appointments', 404, { ...input, clinicId: 'missing' });
  await request('GET', '/appointments/missing', 404);
});

test('records too_late and defers checking phone or consent when the reminder can be scheduled', async () => {
  const patient = await registerPatient({ acceptsReminders: false });
  const appointment = await createAppointment(patient);
  assert.equal(appointment.reminders[0].status, 'pending');
  assert.equal(appointment.reminders[0].skipReason, null);
  assert.equal(appointment.reminders[0].attempts, 0);

  await request('PUT', '/test/clock', 204, { now: '2027-01-10T22:00:00+01:00' });
  const late = await createAppointment(patient, '2027-01-11T09:00:00+01:00');
  assert.deepEqual(late.reminders[0], {
    id: late.reminders[0].id, scheduledFor: '2027-01-11T08:00:00.000Z',
    status: 'skipped', attempts: 0, sentAt: null, skipReason: 'too_late',
  });
});

test('reschedules an appointment once for a repeated instant and preserves history', async () => {
  const initial = await createAppointment(await registerPatient());
  const path = '/appointments/' + initial.id;
  const moved = await request('PATCH', path, 200, { startsAt: '2027-01-14T16:00:00Z' });
  assert.equal(moved.startsAt, '2027-01-14T16:00:00.000Z');
  assert.equal(moved.reminders.length, 2);
  assert.deepEqual(moved.reminders[0], { ...initial.reminders[0], status: 'cancelled' });
  assert.equal(moved.reminders[1].scheduledFor, '2027-01-13T16:00:00.000Z');
  assert.equal(moved.reminders[1].status, 'pending');
  assert.deepEqual(await request('PATCH', path, 200, { startsAt: '2027-01-14T17:00:00+01:00' }), moved);
});

test('rescheduling resets a confirmed appointment while keeping its sent reminder', async () => {
  const initial = await createAppointment(await registerPatient());
  const reminder = initial.reminders[0];
  await data.query("UPDATE appointments SET status = 'confirmed' WHERE id = $1", [initial.id]);
  await data.query("UPDATE reminders SET status = 'sent', attempts = 1, sent_at = $1 WHERE id = $2", [
    reminder.scheduledFor, reminder.id,
  ]);

  const result = await request('PATCH', '/appointments/' + initial.id, 200, { startsAt: '2027-01-13T16:00:00Z' });
  assert.equal(result.status, 'scheduled');
  assert.equal(result.reminders.length, 2);
  assert.deepEqual(result.reminders[0], { ...reminder, status: 'sent', attempts: 1, sentAt: reminder.scheduledFor });
  assert.equal(result.reminders[1].status, 'pending');
});

test('keeps the original appointment and reminder if inserting its replacement fails', async () => {
  const initial = await createAppointment(await registerPatient());
  const path = '/appointments/' + initial.id;
  await data.query(`ALTER TABLE reminders ADD CONSTRAINT reject_test_schedule
                     CHECK (scheduled_for <> TIMESTAMPTZ '2027-01-13 16:00:00+00') NOT VALID`);

  try {
    await request('PATCH', path, 500, { startsAt: '2027-01-14T16:00:00Z' });
    assert.deepEqual(await request('GET', path, 200), initial);
  } finally {
    await data.query('ALTER TABLE reminders DROP CONSTRAINT reject_test_schedule');
  }
});

test('rejects rescheduling invalid, unknown, cancelled, and already-started appointments', async () => {
  const patient = await registerPatient();
  const appointment = await createAppointment(patient);
  const path = '/appointments/' + appointment.id;
  const next = { startsAt: '2027-01-15T12:00:00Z' };
  await request('PATCH', path, 400, { startsAt: now });
  await request('PATCH', path, 400, { startsAt: '2027-01-15T12:00:00' });
  await request('PATCH', '/appointments/missing', 404, next);

  const cancelled = await createAppointment(patient);
  await request('POST', '/appointments/' + cancelled.id + '/cancel', 200);
  await request('PATCH', '/appointments/' + cancelled.id, 409, next);
  await request('PUT', '/test/clock', 204, { now: appointment.startsAt });
  await request('PATCH', path, 409, next);
  assert.deepEqual(await request('GET', path, 200), appointment);
});

test('cancels appointments idempotently, including after the start, and keeps final reminders', async () => {
  const patient = await registerPatient();
  const initial = await createAppointment(patient);
  const path = '/appointments/' + initial.id;
  await request('PUT', '/test/clock', 204, { now: initial.startsAt });
  const result = await request('POST', path + '/cancel', 200);
  assert.deepEqual(result, {
    ...initial, status: 'cancelled', reminders: [{ ...initial.reminders[0], status: 'cancelled' }],
  });
  assert.deepEqual(await request('POST', path + '/cancel', 200), result);
  await request('POST', '/appointments/missing/cancel', 404);

  await request('PUT', '/test/clock', 204, { now: '2027-01-10T22:00:00+01:00' });
  const late = await createAppointment(patient, '2027-01-11T09:00:00+01:00');
  const cancelled = await request('POST', '/appointments/' + late.id + '/cancel', 200);
  assert.deepEqual(cancelled, { ...late, status: 'cancelled' });
});

test('serializes cancellation and rescheduling without leaving a pending reminder', async () => {
  const initial = await createAppointment(await registerPatient());
  const path = '/appointments/' + initial.id;

  const [patch] = await Promise.all([
    fetch(origin + path, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ startsAt: '2027-01-14T16:00:00Z' }),
    }),
    request('POST', path + '/cancel', 200),
  ]);

  assert.ok([200, 409].includes(patch.status), await patch.text());
  const result = await request('GET', path, 200);
  assert.equal(result.status, 'cancelled');
  assert.equal(result.reminders.length, patch.status === 200 ? 2 : 1);
  assert.deepEqual(result.reminders[0], { ...initial.reminders[0], status: 'cancelled' });
  assert.ok(result.reminders.every((reminder) => reminder.status === 'cancelled'));
});
