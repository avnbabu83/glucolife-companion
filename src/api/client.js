// Dependency-free client for the DiabetEasy API (/api/v1, same origin).
// Replaces the former Base44 SDK client. The access token lives in memory only.

const BASE = '/api/v1';
const COMPUTED = ['image_url', 'libre_connected', 'fitbit_connected', 'dexcom_connected'];
export const DEXCOM_REDIRECT_URI = 'https://diabeteasy.com/dexcom/callback';

/** True when GET /api/v1/me lists dexcom in integrations_available (server has Dexcom configured). */
export function dexcomAvailable(me) {
  return Boolean(me && Array.isArray(me.integrations_available) && me.integrations_available.includes('dexcom'));
}
const SERVER_OWNED = ['id', 'user_id', 'created_at', 'updated_at', 'created_date', 'base44_id'];

export const ENTITIES = [
  'UserProfile', 'GlucoseReading', 'MealPlan', 'ExercisePlan', 'ExerciseLog',
  'SleepLog', 'ActivityData', 'StressLog', 'PrivacyConsent', 'Medication',
];

export class ApiError extends Error {
  constructor(status, body = {}, headers) {
    const code = (body && (body.error || body.detail)) || `http_${status}`;
    super(typeof code === 'string' ? code : `http_${status}`);
    this.name = 'ApiError';
    this.status = status;
    this.code = typeof code === 'string' ? code : `http_${status}`;
    this.body = body;
    this.retryable = Boolean(body && body.retryable) || status === 503;
    const ra = headers && headers.get ? headers.get('Retry-After') : null;
    this.retryAfter = ra != null ? Number(ra) : null;
    this.needsAuth = Boolean(body && body.needsAuth);
  }
}

let accessToken = null;
let refreshing = null;
let entityFields = {};
const listeners = new Set();

export function setAccessToken(token) { accessToken = token || null; }
export function getAccessToken() { return accessToken; }
export function onSignedOut(fn) { listeners.add(fn); return () => listeners.delete(fn); }
/** fields: { Entity: ['field', ...] } from src/api/entity-fields.json (typed columns per entity). */
export function setEntityFields(fields) { entityFields = fields || {}; }

function emitSignedOut() {
  accessToken = null;
  listeners.forEach((fn) => { try { fn(); } catch { /* listener errors are ignored */ } });
}

async function parse(res) {
  if (res.status === 204) return null;
  const text = await res.text();
  if (!text) return null;
  try { return JSON.parse(text); } catch { return { error: text }; }
}

async function raw(method, path, { body, headers = {}, auth = true } = {}) {
  const h = { ...headers };
  if (auth && accessToken) h.Authorization = `Bearer ${accessToken}`;
  let payload = body;
  if (body !== undefined && !(typeof FormData !== 'undefined' && body instanceof FormData)) {
    h['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  return fetch(BASE + path, { method, headers: h, body: payload, credentials: 'same-origin' });
}

/** One shared refresh for all concurrent 401s. Resolves true when a new token was obtained. */
export function refresh() {
  if (!refreshing) {
    refreshing = (async () => {
      try {
        const res = await raw('POST', '/auth/refresh', {
          auth: false, headers: { 'X-Requested-With': 'XMLHttpRequest' },
        });
        if (!res.ok) return false;
        const data = await parse(res);
        setAccessToken(data && data.access_token);
        return Boolean(accessToken);
      } catch {
        return false;
      } finally {
        refreshing = null;
      }
    })();
  }
  return refreshing;
}

export async function request(method, path, opts = {}) {
  let res = await raw(method, path, opts);
  if (res.status === 401 && opts.auth !== false) {
    if (await refresh()) {
      res = await raw(method, path, opts);
    } else {
      emitSignedOut();
    }
  }
  const data = await parse(res);
  if (!res.ok) throw new ApiError(res.status, data || {}, res.headers);
  return data;
}

// ---- Row adapter -----------------------------------------------------------
export function fromRow(row) {
  if (!row || typeof row !== 'object') return row;
  const { extra, ...typed } = row;
  const flat = { ...(extra && typeof extra === 'object' ? extra : {}), ...typed };
  if (flat.created_at && !flat.created_date) flat.created_date = flat.created_at;
  return flat;
}

export function toRow(entity, data) {
  const known = entityFields[entity];
  const out = {};
  const extra = { ...(data && typeof data.extra === 'object' ? data.extra : {}) };
  for (const [k, v] of Object.entries(data || {})) {
    if (k === 'extra' || COMPUTED.includes(k) || SERVER_OWNED.includes(k)) continue;
    if (!known || known.includes(k)) out[k] = v; else extra[k] = v;
  }
  if (Object.keys(extra).length) out.extra = extra;
  return out;
}

function query(params) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') q.set(k, String(v));
  const s = q.toString();
  return s ? `?${s}` : '';
}

function entityApi(name) {
  const p = `/entities/${name}`;
  return {
    list: async (sort, limit) => (await request('GET', p + query({ sort, limit }))).map(fromRow),
    filter: async (where = {}, sort, limit) => (await request('GET', p + query({ ...where, sort, limit }))).map(fromRow),
    create: async (data) => fromRow(await request('POST', p, { body: toRow(name, data) })),
    /** Base44 bulkCreate equivalent: one POST per row (the API has no bulk route). */
    bulkCreate: async (rows = []) => Promise.all(rows.map(async (data) => fromRow(await request('POST', p, { body: toRow(name, data) })))),
    update: async (id, data) => fromRow(await request('PATCH', `${p}/${id}`, { body: toRow(name, data) })),
    delete: (id) => request('DELETE', `${p}/${id}`),
  };
}

async function signIn(provider, payload) {
  const data = await request('POST', `/auth/${provider}`, { auth: false, body: { ...payload, client: 'web' } });
  setAccessToken(data.access_token);
  return data.user;
}

/** User-facing text for AI card errors (429 daily limit, 503 busy, 422 not enough data). */
export function aiErrorMessage(error, fallback = 'Analysis failed, please try again') {
  if (!error) return fallback;
  if (error.status === 429) {
    const at = error.retryAfter ? new Date(Date.now() + error.retryAfter * 1000) : null;
    return at ? `Daily AI limit reached, try again after ${at.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'Daily AI limit reached, try again tomorrow';
  }
  if (error.status === 503 || error.status === 504) return 'The assistant is busy, please try again';
  if (error.code === 'insufficient_data') return 'Not enough data yet for this analysis';
  if (error.code === 'image_not_supported_for_ai') return 'This photo cannot be analyzed, please try a JPEG or PNG';
  return fallback;
}

export const api = {
  entities: Object.fromEntries(ENTITIES.map((n) => [n, entityApi(n)])),
  auth: {
    apple: (payload) => signIn('apple', payload),
    google: (payload) => signIn('google', payload),
    refresh,
    me: () => request('GET', '/me'),
    logout: async () => {
      try { await request('POST', '/auth/logout', { headers: { 'X-Requested-With': 'XMLHttpRequest' } }); }
      finally { emitSignedOut(); }
    },
  },
  me: {
    delete: async () => { await request('DELETE', '/me'); emitSignedOut(); },
  },
  uploads: {
    upload: (file) => { const fd = new FormData(); fd.append('file', file); return request('POST', '/uploads', { body: fd }); },
  },
  ai: {
    /** Returns the task's result object (the API answers with the result itself, or { task, result }). */
    run: async (task, input = {}) => {
      const data = await request('POST', `/ai/${task}`, { body: input });
      return data && typeof data === 'object' && 'task' in data && 'result' in data ? data.result : data;
    },
  },
  integrations: {
    libre: {
      connect: (body) => request('POST', '/integrations/libre/connect', { body }),
      sync: () => request('POST', '/integrations/libre/sync', { body: {} }),
      disconnect: () => request('POST', '/integrations/libre/disconnect', { body: {} }),
    },
    fitbit: {
      connect: (body) => request('POST', '/integrations/fitbit/connect', { body }),
      sync: (body = {}) => request('POST', '/integrations/fitbit/sync', { body }),
      disconnect: () => request('POST', '/integrations/fitbit/disconnect', { body: {} }),
    },
    dexcom: {
      /** Starts the login: returns { authorize_url }. */
      authorize: (redirect_uri = DEXCOM_REDIRECT_URI) =>
        request('POST', '/integrations/dexcom/connect', { body: { redirect_uri } }),
      /** Finishes the login with the code and state Dexcom sent to /dexcom/callback. */
      complete: ({ code, state, redirect_uri = DEXCOM_REDIRECT_URI }) =>
        request('POST', '/integrations/dexcom/connect', { body: { code, state, redirect_uri } }),
      sync: () => request('POST', '/integrations/dexcom/sync', { body: {} }),
      disconnect: () => request('POST', '/integrations/dexcom/disconnect', { body: {} }),
    },
  },
};

export default api;
