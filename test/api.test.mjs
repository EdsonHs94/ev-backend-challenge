import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, test } from 'node:test';
import pg from 'pg';
import { startApi } from '../dist/api.js';
import { CLOCK } from '../dist/application/clock.js';

const { DATABASE_URL } = process.env;
assert.ok(DATABASE_URL, 'Set DATABASE_URL or run docker compose run --rm --build checks');

const database = 'test_' + randomUUID().replaceAll('-', '');
const databaseUrl = new URL(DATABASE_URL);
databaseUrl.pathname = '/' + database;
const admin = new pg.Client({ connectionString: DATABASE_URL });
const apps = [];

async function start(clockMode) {
  const app = await startApi({
    databaseUrl: databaseUrl.href,
    clockMode,
    port: 0,
    quiet: true,
  });
  apps.push(app);
  return {
    app,
    origin: await app.getUrl(),
    get clock() {
      return app.get(CLOCK);
    },
  };
}

function setTime(origin, now) {
  return fetch(origin + '/test/clock', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ now }),
  });
}

let testApi;
let databaseCreated = false;

before(async () => {
  await admin.connect();
  await admin.query(`CREATE DATABASE "${database}"`);
  databaseCreated = true;
  testApi = await start('test');
});

after(async () => {
  try {
    await Promise.all(apps.map((app) => app.close()));
    if (databaseCreated) await admin.query(`DROP DATABASE "${database}" WITH (FORCE)`);
  } finally {
    await admin.end();
  }
});

test('health returns 200 after starting with a fresh database', async () => {
  const response = await fetch(testApi.origin + '/health');
  assert.equal(response.status, 200);
});

test('test mode reads system time before the first clock adjustment', async () => {
  const before = Date.now();
  const now = await testApi.clock.now();
  assert.ok(now.getTime() >= before && now.getTime() <= Date.now());
});

test('test mode persists the adjusted instant across restarts', async () => {
  const response = await setTime(testApi.origin, '2027-03-28T10:00:00+02:00');
  assert.equal(response.status, 204);
  assert.equal(await response.text(), '');
  assert.equal((await testApi.clock.now()).toISOString(), '2027-03-28T08:00:00.000Z');

  await testApi.app.close();
  apps.splice(apps.indexOf(testApi.app), 1);
  testApi = await start('test');
  assert.equal((await testApi.clock.now()).toISOString(), '2027-03-28T08:00:00.000Z');
  assert.equal((await fetch(testApi.origin + '/health')).status, 200);
});

test('a running replica reads a new clock adjustment from the shared database', async () => {
  const replica = await start('test');
  const firstTime = '2027-10-31T08:00:00.000Z';
  const nextTime = '2027-10-31T09:00:00.000Z';

  assert.equal((await setTime(testApi.origin, firstTime)).status, 204);
  assert.equal((await replica.clock.now()).toISOString(), firstTime);
  assert.equal((await setTime(replica.origin, nextTime)).status, 204);
  assert.equal((await testApi.clock.now()).toISOString(), nextTime);
});

test('the clock accepts lowercase date-time separators', async () => {
  const response = await setTime(testApi.origin, '2027-03-28t08:00:00z');
  assert.equal(response.status, 204);
  assert.equal((await testApi.clock.now()).toISOString(), '2027-03-28T08:00:00.000Z');
});

test('invalid adjustments preserve the configured time', async () => {
  assert.equal((await setTime(testApi.origin, '2027-11-01T09:00:00Z')).status, 204);

  for (const value of [undefined, null, '', 0, '2027-03-28T10:00:00', '2027-02-29T10:00:00Z']) {
    const response = await setTime(testApi.origin, value);
    assert.equal(response.status, 400, JSON.stringify(value));
    assert.equal(typeof (await response.json()).error, 'string');
  }

  assert.equal((await testApi.clock.now()).toISOString(), '2027-11-01T09:00:00.000Z');
});

test('system mode omits the test route and ignores the persisted test clock', async () => {
  const systemApi = await start();
  const response = await setTime(systemApi.origin, '2027-03-28T08:00:00Z');
  assert.equal(response.status, 404);
  assert.equal(typeof (await response.json()).error, 'string');

  const before = Date.now();
  const now = await systemApi.clock.now();
  assert.ok(now.getTime() >= before && now.getTime() <= Date.now());
});

test('health returns 503 when PostgreSQL no longer accepts connections', async () => {
  await admin.query(`ALTER DATABASE "${database}" ALLOW_CONNECTIONS false`);

  try {
    await admin.query(
      'SELECT pg_terminate_backend(pid, 5000) FROM pg_stat_activity WHERE datname = $1',
      [database],
    );
    const response = await fetch(testApi.origin + '/health');
    assert.equal(response.status, 503);
    assert.equal(typeof (await response.json()).error, 'string');
  } finally {
    await admin.query(`ALTER DATABASE "${database}" ALLOW_CONNECTIONS true`);
  }
});
