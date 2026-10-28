// Unit tests for src/api/session-logic.js and the photo resize maths. Run: node --test src/api/
import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { bootstrapSession, completeFitbit, firstRunStep, makeNonce } from './session-logic.js';
import { fitSize } from './image.js';

function fakeClient({ consents = [], profiles = [], me = { id: 'u1' }, fitbit } = {}) {
  return {
    auth: { me: async () => me },
    entities: {
      PrivacyConsent: { list: async () => consents },
      UserProfile: { list: async () => profiles },
    },
    integrations: { fitbit: { connect: fitbit || (async () => ({ success: true })) } },
  };
}

function memoryStore(init = {}) {
  const m = new Map(Object.entries(init));
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k) };
}

test('session bootstrap: refresh then /me; no session when refresh fails', async () => {
  assert.deepEqual(await bootstrapSession(fakeClient(), async () => true), { id: 'u1' });
  assert.equal(await bootstrapSession(fakeClient(), async () => false), null);
});

test('first run: consent first, then profile, then the app', async () => {
  assert.equal(await firstRunStep(fakeClient()), 'consent');
  assert.equal(await firstRunStep(fakeClient({ consents: [{ id: 'c' }] })), 'profile');
  assert.equal(await firstRunStep(fakeClient({ consents: [{ id: 'c' }], profiles: [{ id: 'p' }] })), 'done');
});

test('fitbit callback posts code, state and redirect_uri, then returns to the saved route', async () => {
  let body;
  const client = fakeClient({ fitbit: async (b) => { body = b; return { success: true }; } });
  const store = memoryStore({ fitbit_return_to: '/Sleep' });
  const res = await completeFitbit('?code=c1&state=s1', client, 'https://diabeteasy.com', store);
  assert.deepEqual(res, { ok: true, returnTo: '/Sleep' });
  assert.deepEqual(body, { code: 'c1', state: 's1', redirect_uri: 'https://diabeteasy.com/fitbit/callback' });
  assert.deepEqual(await completeFitbit('?error=access_denied', client, 'https://x', memoryStore()), { ok: false, returnTo: '/' });
});

test('nonce is fresh per attempt and photos fit 1568 px without upscaling', () => {
  const a = makeNonce(webcrypto);
  assert.match(a, /^[0-9a-f]{64}$/);
  assert.notEqual(a, makeNonce(webcrypto));
  assert.deepEqual(fitSize(4032, 3024), { width: 1568, height: 1176 });
  assert.deepEqual(fitSize(800, 600), { width: 800, height: 600 });
});
