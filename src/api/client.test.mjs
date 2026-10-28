// Unit tests for src/api/client.js. Run: node --test src/api/
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  api, ApiError, fromRow, toRow, setAccessToken, getAccessToken, onSignedOut, setEntityFields,
} from './client.js';

function respond(status, body, headers = {}) {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status, headers: { 'Content-Type': 'application/json', ...headers },
  });
}

function mockFetch(handler) {
  const calls = [];
  globalThis.fetch = async (url, init) => { calls.push({ url, init }); return handler(url, init, calls); };
  return calls;
}

test('401 triggers one refresh with X-Requested-With, then one retry', async () => {
  setAccessToken('old');
  const calls = mockFetch((url, init) => {
    if (url === '/api/v1/auth/refresh') return respond(200, { access_token: 'new' });
    return init.headers.Authorization === 'Bearer new' ? respond(200, { id: 'u1' }) : respond(401, { error: 'expired' });
  });
  assert.deepEqual(await api.auth.me(), { id: 'u1' });
  const refreshes = calls.filter((c) => c.url === '/api/v1/auth/refresh');
  assert.equal(refreshes.length, 1);
  assert.equal(refreshes[0].init.headers['X-Requested-With'], 'XMLHttpRequest');
  assert.equal(calls.length, 3);
  assert.equal(getAccessToken(), 'new');
});

test('concurrent 401s share one refresh', async () => {
  setAccessToken('old');
  const calls = mockFetch(async (url, init) => {
    if (url === '/api/v1/auth/refresh') { await new Promise((r) => setTimeout(r, 10)); return respond(200, { access_token: 'n2' }); }
    return init.headers.Authorization === 'Bearer n2' ? respond(200, []) : respond(401, {});
  });
  await Promise.all([api.entities.MealPlan.list(), api.entities.SleepLog.list(), api.auth.me()]);
  assert.equal(calls.filter((c) => c.url === '/api/v1/auth/refresh').length, 1);
});

test('failed refresh emits signed-out and throws ApiError', async () => {
  setAccessToken('old');
  let signedOut = 0;
  const off = onSignedOut(() => { signedOut += 1; });
  mockFetch(() => respond(401, { error: 'invalid_token' }));
  await assert.rejects(api.auth.me(), (e) => e instanceof ApiError && e.status === 401);
  assert.equal(signedOut, 1);
  assert.equal(getAccessToken(), null);
  off();
});

test('list and filter build sort, limit and equality query strings', async () => {
  setAccessToken('t');
  const calls = mockFetch(() => respond(200, []));
  await api.entities.GlucoseReading.list('-date', 500);
  await api.entities.ExerciseLog.filter({ status: 'completed', date: '2024-05-01' }, '-created_date', 10);
  assert.equal(calls[0].url, '/api/v1/entities/GlucoseReading?sort=-date&limit=500');
  assert.equal(calls[1].url, '/api/v1/entities/ExerciseLog?status=completed&date=2024-05-01&sort=-created_date&limit=10');
});

test('read rows flatten extra without overwriting typed fields and gain created_date', () => {
  const row = fromRow({ id: '1', reading: 120, created_at: '2024-01-01T00:00:00Z', extra: { reading: 1, trend: 'up' } });
  assert.equal(row.reading, 120);
  assert.equal(row.trend, 'up');
  assert.equal(row.created_date, '2024-01-01T00:00:00Z');
  assert.equal('extra' in row, false);
});

test('writes move unknown keys into extra and drop computed fields', () => {
  setEntityFields({ MealPlan: ['meal_name', 'calories', 'image_file_key', 'extra'] });
  const body = toRow('MealPlan', {
    id: 'x', meal_name: 'Oats', calories: 300, image_url: 'https://s3/x', mood: 'good', created_date: 'd',
  });
  assert.deepEqual(body, { meal_name: 'Oats', calories: 300, extra: { mood: 'good' } });
});

test('ApiError exposes status, code, retryable, retryAfter and needsAuth', async () => {
  setAccessToken('t');
  mockFetch(() => respond(429, { error: 'daily_limit' }, { 'Retry-After': '3600' }));
  await assert.rejects(api.ai.run('daily-trend'), (e) => e.status === 429 && e.code === 'daily_limit' && e.retryAfter === 3600);
  mockFetch(() => respond(400, { needsAuth: true, error: 'Libre not connected' }));
  await assert.rejects(api.integrations.libre.sync(), (e) => e.needsAuth === true);
  mockFetch(() => respond(503, { retryable: true, error: 'storage' }));
  await assert.rejects(api.me.delete(), (e) => e.retryable === true);
});

test('sign-in keeps the access token in memory only', async () => {
  const store = new Map();
  globalThis.localStorage = { setItem: (k, v) => store.set(k, v), getItem: (k) => store.get(k) ?? null };
  mockFetch((url, init) => {
    assert.equal(JSON.parse(init.body).client, 'web');
    return respond(200, { access_token: 'secret-token', user: { id: 'u' } });
  });
  assert.deepEqual(await api.auth.google({ id_token: 'x', nonce: 'n' }), { id: 'u' });
  assert.equal(getAccessToken(), 'secret-token');
  assert.equal([...store.values()].some((v) => String(v).includes('secret-token')), false);
});

test('Dexcom: shown only when integrations_available lists it; connect posts redirect_uri, then code and state', async () => {
  const { dexcomAvailable, DEXCOM_REDIRECT_URI } = await import('./client.js');
  assert.equal(dexcomAvailable({ integrations_available: ['libre', 'fitbit'] }), false);
  assert.equal(dexcomAvailable({}), false);
  assert.equal(dexcomAvailable({ integrations_available: ['libre', 'fitbit', 'dexcom'] }), true);
  setAccessToken('t');
  const calls = mockFetch(() => respond(200, { authorize_url: 'https://sandbox-api.dexcom.com/v2/oauth2/login?x' }));
  assert.match((await api.integrations.dexcom.authorize()).authorize_url, /dexcom/);
  await api.integrations.dexcom.complete({ code: 'c', state: 's' });
  assert.equal(calls[0].url, '/api/v1/integrations/dexcom/connect');
  assert.deepEqual(JSON.parse(calls[0].init.body), { redirect_uri: DEXCOM_REDIRECT_URI });
  assert.deepEqual(JSON.parse(calls[1].init.body), { code: 'c', state: 's', redirect_uri: DEXCOM_REDIRECT_URI });
  mockFetch(() => respond(503, { error: 'dexcom_not_configured' }));
  await assert.rejects(api.integrations.dexcom.sync(), (e) => e.code === 'dexcom_not_configured');
});

test('bulkCreate posts one adapted row per item and returns flat rows', async () => {
  setAccessToken('t');
  setEntityFields({ ExercisePlan: ['exercise_name', 'extra'] });
  const calls = mockFetch((url, init) => respond(201, { id: String(calls.length), ...JSON.parse(init.body) }));
  const rows = await api.entities.ExercisePlan.bulkCreate([{ exercise_name: 'Walk', video_url: 'v' }, { exercise_name: 'Yoga' }]);
  assert.equal(calls.length, 2);
  assert.ok(calls.every((c) => c.url === '/api/v1/entities/ExercisePlan' && c.init.method === 'POST'));
  assert.deepEqual(JSON.parse(calls[0].init.body), { exercise_name: 'Walk', extra: { video_url: 'v' } });
  assert.equal(rows[0].video_url, 'v');
  assert.equal(rows.length, 2);
});
