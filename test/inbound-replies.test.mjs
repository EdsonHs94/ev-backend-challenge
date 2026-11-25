import assert from 'node:assert/strict';
import { randomInt, randomUUID } from 'node:crypto';
import { after, before, beforeEach, test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import pg from 'pg';
import { startApi } from '../dist/api.js';

const { DATABASE_URL, PROVIDER_URL } = process.env;
assert.ok(DATABASE_URL && PROVIDER_URL, 'Run docker compose run --rm --build checks');

const database = 'test_' + randomUUID().replaceAll('-', '');
const databaseUrl = new URL(DATABASE_URL);
databaseUrl.pathname = '/' + database;
const admin = new pg.Client({ connectionString: DATABASE_URL });
const data = new pg.Pool({ connectionString: databaseUrl.href });
const apps = [];
let databaseCreated = false;
let origin;

const address = () => '+34' + randomInt(700000000, 799999999);

async function launch() {
  const app = await startApi({ databaseUrl: databaseUrl.href, providerUrl: PROVIDER_URL, clockMode: 'test', port: 0, quiet: true });
  apps.push(app);
  return app.getUrl();
}

async function request(path, { method = 'GET', body, status = 200, base = origin } = {}) {
  const response = await fetch(base + path, {
    method,
    ...(body === undefined ? {} : {
      body: JSON.stringify(body),
      headers: { 'content-type': 'application/json' },
    }),
    signal: AbortSignal.timeout(10000),
  });
  const text = await response.text();
  assert.equal(response.status, status, text);
  return text ? JSON.parse(text) : undefined;
}

const setClock = (now) => request('/test/clock', { method: 'PUT', body: { now }, status: 204 });
const run = () => request('/jobs/reminders/run', { method: 'POST' });
const get = (id) => request('/appointments/' + id);
const inbound = (body, options) => request('/webhooks/inbound-messages', { method: 'POST', body, ...options });
const message = (from, text, overrides = {}) => ({
  messageId: randomUUID(),
  from,
  text,
  receivedAt: '2027-01-10T14:05:00Z',
  ...overrides,
});

async function makeAppointment(phone, startsAt = '2027-01-11T14:00:00Z') {
  const clinic = await request('/clinics', {
    method: 'POST', status: 201, body: { name: 'Clínica Sol', timezone: 'Europe/Madrid' },
  });
  const patient = await request('/patients', {
    method: 'POST', status: 201,
    body: { clinicId: clinic.id, name: 'Ana', phone, acceptsReminders: true },
  });
  return request('/appointments', {
    method: 'POST', status: 201, body: { clinicId: clinic.id, patientId: patient.id, startsAt },
  });
}

before(async () => {
  await admin.connect();
  await admin.query(`CREATE DATABASE "${database}"`);
  databaseCreated = true;
  origin = await launch();
  for (let attempt = 0; attempt < 20; attempt++) {
    try {
      await request('/health', { base: PROVIDER_URL });
      return;
    } catch {
      await delay(100);
    }
  }
  await request('/health', { base: PROVIDER_URL });
});

beforeEach(async () => {
  await data.query('TRUNCATE appointments, patients, clinics, reminders');
  await setClock('2027-01-10T10:00:00Z');
});

after(async () => {
  try {
    await Promise.all([...apps.map((app) => app.close()), data.end()]);
    if (databaseCreated) await admin.query(`DROP DATABASE "${database}" WITH (FORCE)`);
  } finally {
    await admin.end();
  }
});

test('uses the provider delivery and confirms accented or punctuated replies', async () => {
  const firstPhone = address();
  const secondPhone = address();
  const first = await makeAppointment(firstPhone);
  const second = await makeAppointment(secondPhone);
  await setClock('2027-01-10T14:05:00Z');
  assert.deepEqual(await run(), { processed: 2 });
  const deliveries = await request('/admin/messages?to=' + encodeURIComponent(firstPhone), { base: PROVIDER_URL });
  assert.equal(deliveries.length, 1);

  await inbound(message(firstPhone, ' « Si\u0301. » '));
  await inbound(message(secondPhone, ' si. '));
  const confirmed = await get(first.id);
  assert.equal(confirmed.status, 'confirmed');
  assert.equal(confirmed.reminders[0].status, 'sent');
  assert.equal((await get(second.id)).status, 'confirmed');
});

test('ignores extra words, internal spaces, empty text, and phones without a sent reminder', async () => {
  const sentPhone = address();
  const unsentPhone = address();
  const sent = await makeAppointment(sentPhone);
  const unsent = await makeAppointment(unsentPhone, '2027-01-13T14:00:00Z');
  await setClock('2027-01-10T14:05:00Z');
  assert.deepEqual(await run(), { processed: 1 });

  for (const text of ['sí, gracias', 'S I', 'SI NO', '', '…', 'S.I.']) {
    await inbound(message(sentPhone, text));
  }
  await inbound(message(unsentPhone, 'NO'));
  await inbound(message(address(), 'SI'));
  assert.equal((await get(sent.id)).status, 'scheduled');
  assert.equal((await get(unsent.id)).status, 'scheduled');
});

test('rejects invalid bodies and permits a valid notification with the same identifier', async () => {
  const phone = address();
  const appointment = await makeAppointment(phone);
  await setClock('2027-01-10T14:05:00Z');
  await run();
  const notification = message(phone, 'SI');

  for (const body of [
    { ...notification, messageId: undefined },
    { ...notification, from: 0 },
    { ...notification, text: null },
    { ...notification, receivedAt: '2027-01-10T14:05:00' },
    { ...notification, receivedAt: '2027-02-29T14:05:00Z' },
  ]) {
    const error = await inbound(body, { status: 400 });
    assert.equal(typeof error.error, 'string');
  }
  assert.equal((await get(appointment.id)).status, 'scheduled');
  await inbound({ ...notification, receivedAt: '2027-01-10t14:05:00z' });
  assert.equal((await get(appointment.id)).status, 'confirmed');
});

test('uses the last send at equal sentAt across patients and clinics sharing a phone', async () => {
  const phone = address();
  const sentLast = await makeAppointment(phone, '2027-01-11T14:02:00Z');
  const sentFirst = await makeAppointment(phone, '2027-01-11T14:00:00Z');
  await setClock('2027-01-10T14:05:00Z');
  assert.deepEqual(await run(), { processed: 2 });
  const first = await get(sentFirst.id);
  const last = await get(sentLast.id);
  assert.equal(first.reminders[0].sentAt, last.reminders[0].sentAt);
  const deliveries = await request('/admin/messages?to=' + encodeURIComponent(phone), { base: PROVIDER_URL });
  assert.deepEqual(deliveries.map((item) => item.idempotencyKey), [
    first.reminders[0].id, last.reminders[0].id,
  ]);

  await inbound(message(phone, 'SI'));
  assert.equal((await get(sentLast.id)).status, 'confirmed');
  assert.equal((await get(sentFirst.id)).status, 'scheduled');
});

test('uses the historical reminder order for equal phase 3 sent times', async () => {
  const phone = address();
  const older = await makeAppointment(phone);
  const newer = await makeAppointment(phone);
  await data.query(`UPDATE reminders SET status = 'sent', attempts = 1, sent_at = $1 WHERE id IN ($2, $3)`, [
    '2027-01-10T14:05:00Z', older.reminders[0].id, newer.reminders[0].id,
  ]);
  await setClock('2027-01-10T14:06:00Z');

  await inbound(message(phone, 'SI'));
  assert.equal((await get(newer.id)).status, 'confirmed');
  assert.equal((await get(older.id)).status, 'scheduled');
});

test('filters cancelled and started appointments using the service clock', async () => {
  const phone = address();
  const eligible = await makeAppointment(phone, '2027-01-12T14:00:00Z');
  const started = await makeAppointment(phone, '2027-01-11T14:00:00Z');
  const cancelled = await makeAppointment(phone, '2027-01-12T14:01:00Z');

  await setClock('2027-01-10T14:05:00Z');
  await run();
  await setClock('2027-01-11T14:00:00Z');
  await run();
  await setClock('2027-01-11T14:01:00Z');
  await run();
  await request('/appointments/' + cancelled.id + '/cancel', { method: 'POST' });

  await inbound(message(phone, 'SI', { receivedAt: '2027-01-10T14:05:00Z' }));
  assert.equal((await get(eligible.id)).status, 'confirmed');
  assert.equal((await get(started.id)).status, 'scheduled');
  assert.equal((await get(cancelled.id)).status, 'cancelled');

  const exact = await makeAppointment(phone, '2027-01-12T15:00:00Z');
  await setClock('2027-01-11T15:00:00Z');
  await run();
  await setClock('2027-01-12T15:00:00Z');
  await inbound(message(phone, 'NO'));
  assert.equal((await get(exact.id)).status, 'scheduled');
});

test('confirms without cancelling the pending reminder, then cancels the appointment and pending reminder for NO', async () => {
  const phone = address();
  const appointment = await makeAppointment(phone);
  await setClock('2027-01-10T14:05:00Z');
  await run();
  const path = '/appointments/' + appointment.id;
  const moved = await request(path, {
    method: 'PATCH', body: { startsAt: '2027-01-12T14:00:00Z' },
  });

  await inbound(message(phone, 'SI'));
  let result = await get(appointment.id);
  assert.deepEqual(result, { ...moved, status: 'confirmed' });

  await inbound(message(phone, '\u00a0¡nO! '));
  result = await get(appointment.id);
  assert.deepEqual(result, {
    ...moved, status: 'cancelled',
    reminders: [moved.reminders[0], { ...moved.reminders[1], status: 'cancelled' }],
  });
});

test('deduplicates simultaneous and subsequent notifications across API instances', async () => {
  const phone = address();
  const previous = await makeAppointment(phone);
  const latest = await makeAppointment(phone, '2027-01-11T14:01:00Z');
  await setClock('2027-01-10T14:05:00Z');
  await run();
  const replica = await launch();
  const notification = message(phone, 'NO');

  await Promise.all([inbound(notification), inbound(notification, { base: replica })]);
  assert.equal((await get(latest.id)).status, 'cancelled');
  assert.equal((await get(previous.id)).status, 'scheduled');

  await inbound({ ...notification, text: 'SI' });
  assert.equal((await get(previous.id)).status, 'scheduled');
});

test('selects the next eligible reminder if a concurrent cancellation wins the row lock', async () => {
  const phone = address();
  const previous = await makeAppointment(phone);
  const latest = await makeAppointment(phone, '2027-01-11T14:01:00Z');
  await setClock('2027-01-10T14:05:00Z');
  await run();

  const cancelling = await data.connect();
  try {
    await cancelling.query('BEGIN');
    await cancelling.query("UPDATE appointments SET status = 'cancelled' WHERE id = $1", [latest.id]);
    const reply = inbound(message(phone, 'SI'));

    try {
      let waiting = false;
      for (let attempt = 0; attempt < 100 && !waiting; attempt++) {
        const { rows } = await admin.query(`SELECT EXISTS (SELECT 1 FROM pg_stat_activity
          WHERE datname = $1 AND wait_event_type = 'Lock') AS waiting`, [database]);
        [{ waiting }] = rows;
        if (!waiting) await delay(20);
      }
      assert.ok(waiting, 'Expected the webhook to wait for the appointment row lock');
    } finally {
      await cancelling.query('COMMIT');
      await reply;
    }
  } finally {
    cancelling.release(true);
  }

  assert.equal((await get(latest.id)).status, 'cancelled');
  assert.equal((await get(previous.id)).status, 'confirmed');
});

test('consumes the identifier even for ignored messages', async () => {
  const phone = address();
  const appointment = await makeAppointment(phone);
  await setClock('2027-01-10T14:05:00Z');
  await run();
  const notification = message(phone, 'gracias');
  await inbound(notification);
  await inbound({ ...notification, text: 'NO' });
  assert.equal((await get(appointment.id)).status, 'scheduled');
});

test('reprocesses an identifier if its appointment transition rolled back', async () => {
  const phone = address();
  const appointment = await makeAppointment(phone);
  await setClock('2027-01-10T14:05:00Z');
  await run();
  const notification = message(phone, 'SI');
  await data.query("ALTER TABLE appointments ADD CONSTRAINT reject_test_confirmation CHECK (status <> 'confirmed') NOT VALID");
  try {
    await inbound(notification, { status: 500 });
    assert.equal((await get(appointment.id)).status, 'scheduled');
  } finally {
    await data.query('ALTER TABLE appointments DROP CONSTRAINT reject_test_confirmation');
  }

  await inbound(notification);
  assert.equal((await get(appointment.id)).status, 'confirmed');
});
