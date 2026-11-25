import assert from 'node:assert/strict';
import { randomInt, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import http from 'node:http';
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

async function launch(providerUrl = PROVIDER_URL) {
  const app = await startApi({ databaseUrl: databaseUrl.href, providerUrl, clockMode: 'test', port: 0, quiet: true });
  apps.push(app);
  return app.getUrl();
}

async function request(base, path, { method = 'GET', body, status = 200 } = {}) {
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

const setClock = (now) => request(origin, '/test/clock', { method: 'PUT', body: { now }, status: 204 });
const run = (base = origin) => request(base, '/jobs/reminders/run', { method: 'POST' });
const get = (id) => request(origin, '/appointments/' + id);
const calls = (phone) => request(PROVIDER_URL, '/admin/requests?to=' + encodeURIComponent(phone));
const deliveries = (phone) => request(PROVIDER_URL, '/admin/messages?to=' + encodeURIComponent(phone));
const rule = (to, mode, count = 1) => request(PROVIDER_URL, '/admin/rules', {
  method: 'POST', status: 204, body: { to, mode, count },
});

async function makeAppointment({
  phone = '+34' + randomInt(600000000, 699999999),
  acceptsReminders = true,
  timezone = 'Europe/Madrid',
  startsAt = '2027-03-28T08:05:00Z',
} = {}) {
  const clinic = await request(origin, '/clinics', { method: 'POST', status: 201, body: { name: 'Clínica Sol', timezone } });
  const patient = await request(origin, '/patients', {
    method: 'POST', status: 201,
    body: { clinicId: clinic.id, name: 'Ana', phone, acceptsReminders },
  });
  const appointment = await request(origin, '/appointments', {
    method: 'POST', status: 201, body: { clinicId: clinic.id, patientId: patient.id, startsAt },
  });
  return { phone, appointment };
}

async function listen(t, handler) {
  const server = http.createServer(handler).listen(0, '127.0.0.1');
  t.after(async () => {
    const closed = once(server, 'close');
    server.close();
    server.closeAllConnections();
    await closed;
  });
  await once(server, 'listening');
  return 'http://127.0.0.1:' + server.address().port;
}

before(async () => {
  await admin.connect();
  await admin.query(`CREATE DATABASE "${database}"`);
  databaseCreated = true;
  origin = await launch();
  for (let attempt = 0; attempt < 20; attempt++) {
    try {
      await request(PROVIDER_URL, '/health');
      return;
    } catch {
      await delay(100);
    }
  }
  await request(PROVIDER_URL, '/health');
});

beforeEach(async () => {
  await data.query('TRUNCATE appointments, patients, clinics, reminders');
  await setClock('2027-03-26T09:00:00Z');
});

after(async () => {
  try {
    await Promise.all([...apps.map((app) => app.close()), data.end()]);
    if (databaseCreated) await admin.query(`DROP DATABASE "${database}" WITH (FORCE)`);
  } finally {
    await admin.end();
  }
});

test('sends all due reminders with local time and leaves future and cancelled reminders alone', async () => {
  const madrid = await makeAppointment();
  const canary = await makeAppointment({ timezone: 'Atlantic/Canary', startsAt: '2027-03-28T08:05:00Z' });
  const future = await makeAppointment({ startsAt: '2027-03-29T08:05:00Z' });
  const cancelled = await makeAppointment();
  await request(origin, '/appointments/' + cancelled.appointment.id + '/cancel', { method: 'POST' });

  assert.deepEqual(await run(), { processed: 0 });
  await setClock('2027-03-27T09:05:00Z');
  assert.deepEqual(await run(), { processed: 2 });
  assert.deepEqual(await run(), { processed: 0 });

  const [madridCall] = await calls(madrid.phone);
  assert.equal(madridCall.text, 'Hola Ana, te recordamos tu cita en Clínica Sol el 28/03/2027 a las 10:05. Responde SI para confirmar o NO para cancelar.');
  assert.equal((await calls(canary.phone))[0].text, 'Hola Ana, te recordamos tu cita en Clínica Sol el 28/03/2027 a las 09:05. Responde SI para confirmar o NO para cancelar.');
  assert.deepEqual(await calls(future.phone), []);
  assert.deepEqual(await calls(cancelled.phone), []);
  assert.deepEqual((await get(madrid.appointment.id)).reminders[0], {
    ...madrid.appointment.reminders[0], status: 'sent', attempts: 1, sentAt: '2027-03-27T09:05:00.000Z',
  });
});

test('skips ineligible records without calling the provider', async () => {
  const noPhone = await makeAppointment({ phone: null, acceptsReminders: false });
  const optedOut = await makeAppointment({ acceptsReminders: false });
  const late = await makeAppointment({ startsAt: '2027-03-27T09:05:00Z' });
  await setClock('2027-03-27T09:05:00Z');
  assert.deepEqual(await run(), { processed: 3 });
  for (const [item, reason] of [[noPhone, 'no_phone'], [optedOut, 'opted_out'], [late, 'too_late']]) {
    const [reminder] = (await get(item.appointment.id)).reminders;
    assert.equal(reminder.status, 'skipped');
    assert.equal(reminder.skipReason, reason);
    assert.equal(reminder.attempts, 0);
    if (item.phone) assert.deepEqual(await calls(item.phone), []);
  }
});

test('defers a first send after closing and skips when the next opening is too late', async () => {
  const eligible = await makeAppointment();
  const tooLate = await makeAppointment({ startsAt: '2027-03-28T07:00:00Z' });
  await setClock('2027-03-27T20:00:00Z');
  assert.deepEqual(await run(), { processed: 2 });
  assert.deepEqual(await run(), { processed: 0 });
  assert.deepEqual((await get(eligible.appointment.id)).reminders[0], eligible.appointment.reminders[0]);
  assert.equal((await get(tooLate.appointment.id)).reminders[0].skipReason, 'too_late');
  assert.deepEqual(await calls(eligible.phone), []);
  assert.deepEqual(await calls(tooLate.phone), []);
  await setClock('2027-03-28T07:00:00Z');
  assert.deepEqual(await run(), { processed: 1 });
  assert.equal((await calls(eligible.phone)).length, 1);
});

test('retries at one and five minutes, including after closing, and stops after three failures', async () => {
  const { phone, appointment } = await makeAppointment({ startsAt: '2027-03-29T18:59:00Z' });
  await rule(phone, 'unavailable', 3);
  for (const [now, expected] of [
    ['2027-03-28T18:59:00Z', 1],
    ['2027-03-28T18:59:59Z', 0],
    ['2027-03-28T19:00:00Z', 1],
    ['2027-03-28T19:04:59Z', 0],
    ['2027-03-28T19:05:00Z', 1],
    ['2027-03-28T19:15:00Z', 0],
  ]) {
    await setClock(now);
    assert.deepEqual(await run(), { processed: expected });
  }
  const [reminder] = (await get(appointment.id)).reminders;
  assert.equal(reminder.status, 'failed');
  assert.equal(reminder.attempts, 3);
  assert.equal(reminder.sentAt, null);
  assert.deepEqual((await calls(phone)).map((call) => call.status), [503, 503, 503]);
  assert.deepEqual(await deliveries(phone), []);
});

test('recovers a lost response with one delivery and uses a new key after rescheduling', async () => {
  const { phone, appointment } = await makeAppointment();
  await rule(phone, 'lost-response');
  await setClock('2027-03-27T09:05:00Z');
  assert.deepEqual(await run(), { processed: 1 });
  assert.equal((await get(appointment.id)).reminders[0].status, 'pending');
  await setClock('2027-03-27T09:06:00Z');
  assert.deepEqual(await run(), { processed: 1 });
  const [first, second] = await calls(phone);
  assert.deepEqual([first.status, second.status], [504, 200]);
  assert.equal(first.idempotencyKey, second.idempotencyKey);
  assert.equal((await deliveries(phone)).length, 1);
  const [sent] = (await get(appointment.id)).reminders;
  assert.equal(sent.status, 'sent');
  assert.equal(sent.attempts, 2);
  assert.equal(sent.sentAt, '2027-03-27T09:06:00.000Z');

  await request(origin, '/appointments/' + appointment.id, {
    method: 'PATCH', body: { startsAt: '2027-03-29T08:05:00Z' },
  });
  await setClock('2027-03-28T08:05:00Z');
  assert.deepEqual(await run(), { processed: 1 });
  const third = (await calls(phone))[2];
  assert.equal(third.status, 202);
  assert.notEqual(third.idempotencyKey, first.idempotencyKey);
  assert.equal((await deliveries(phone)).length, 2);
});

test('handles a rejection and skips a retry after the appointment starts', async () => {
  const rejected = await makeAppointment();
  await rule(rejected.phone, 'reject');
  const late = await makeAppointment({ startsAt: '2027-03-27T09:05:30Z' });
  await rule(late.phone, 'unavailable');

  await setClock('2027-03-27T09:05:00Z');
  assert.deepEqual(await run(), { processed: 2 });
  await setClock('2027-03-27T09:06:00Z');
  assert.deepEqual(await run(), { processed: 1 });
  assert.deepEqual(await run(), { processed: 0 });
  assert.deepEqual((await calls(rejected.phone)).map((call) => call.status), [422]);
  const [failed] = (await get(rejected.appointment.id)).reminders;
  assert.equal(failed.status, 'failed');
  assert.equal(failed.attempts, 1);
  assert.equal(failed.sentAt, null);
  assert.equal((await calls(late.phone)).length, 1);
  const [expired] = (await get(late.appointment.id)).reminders;
  assert.equal(expired.status, 'skipped');
  assert.equal(expired.skipReason, 'too_late');
  assert.equal(expired.attempts, 1);
});

test('two instances skip locked work and each sends a different record once', { timeout: 12000 }, async (t) => {
  const first = await makeAppointment();
  const second = await makeAppointment({ startsAt: '2027-03-28T08:06:00Z' });
  await setClock('2027-03-27T09:06:00Z');

  const held = Promise.withResolvers();
  const release = Promise.withResolvers();
  const received = [];
  const fake = await listen(t, async (request, response) => {
    let body = '';
    for await (const chunk of request) body += chunk;
    const { to } = JSON.parse(body);
    received.push(to);
    if (to === first.phone) {
      held.resolve();
      await release.promise;
    }
    response.writeHead(202).end();
  });
  const firstInstance = await launch(fake);
  const secondInstance = await launch(fake);
  const firstPass = run(firstInstance);
  try {
    await Promise.race([
      held.promise,
      firstPass.then(() => assert.fail('The first pass should hold the provider connection')),
    ]);
    assert.deepEqual(await run(secondInstance), { processed: 1 });
  } finally {
    release.resolve();
    await firstPass;
  }
  assert.deepEqual(await firstPass, { processed: 1 });
  assert.deepEqual(received, [first.phone, second.phone]);
  assert.equal((await get(first.appointment.id)).reminders[0].attempts, 1);
  assert.equal((await get(second.appointment.id)).reminders[0].attempts, 1);
});

test('treats network disconnects and a response past five seconds as retryable', { timeout: 15000 }, async (t) => {
  const { appointment } = await makeAppointment();
  let requests = 0;
  const fake = await listen(t, (request, response) => {
    requests++;
    if (requests === 1) request.socket.destroy();
    if (requests === 3) response.writeHead(202).end();
  });
  const instance = await launch(fake);
  await setClock('2027-03-27T09:05:00Z');
  assert.deepEqual(await run(instance), { processed: 1 });
  assert.equal((await get(appointment.id)).reminders[0].status, 'pending');

  await setClock('2027-03-27T09:06:00Z');
  const started = performance.now();
  assert.deepEqual(await run(instance), { processed: 1 });
  assert.ok(performance.now() - started >= 4900);
  assert.equal((await get(appointment.id)).reminders[0].attempts, 2);

  await setClock('2027-03-27T09:11:00Z');
  assert.deepEqual(await run(instance), { processed: 1 });
  assert.equal(requests, 3);
  const [sent] = (await get(appointment.id)).reminders;
  assert.equal(sent.status, 'sent');
  assert.equal(sent.attempts, 3);
});

test('survives a database disconnect during delivery and reuses the key on recovery', { timeout: 12000 }, async (t) => {
  const { appointment } = await makeAppointment();
  const held = Promise.withResolvers();
  const release = Promise.withResolvers();
  const keys = [];
  const fake = await listen(t, async (request, response) => {
    for await (const chunk of request) assert.ok(chunk.length > 0);
    keys.push(request.headers['idempotency-key']);

    if (keys.length === 1) {
      held.resolve();
      await release.promise;
      response.writeHead(202).end();
    } else {
      response.writeHead(200).end();
    }
  });
  const instance = await launch(fake);
  await setClock('2027-03-27T09:05:00Z');
  const pass = request(instance, '/jobs/reminders/run', { method: 'POST', status: 500 });

  try {
    await Promise.race([held.promise, pass.then(() => assert.fail('Expected a pending provider call'))]);
    const terminated = await admin.query(
      `SELECT pg_terminate_backend(pid, 5000) AS stopped FROM pg_stat_activity
       WHERE datname = $1 AND state = 'idle in transaction'`,
      [database],
    );
    assert.deepEqual(terminated.rows, [{ stopped: true }]);
  } finally {
    release.resolve();
    await pass;
  }

  assert.deepEqual(await request(instance, '/health'), { status: 'ok' });
  assert.deepEqual(await run(instance), { processed: 1 });
  assert.deepEqual(keys, [appointment.reminders[0].id, appointment.reminders[0].id]);
  assert.equal((await get(appointment.id)).reminders[0].status, 'sent');
});
