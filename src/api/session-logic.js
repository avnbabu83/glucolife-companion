// Framework-free session helpers used by the sign-in screen, the session provider and the
// Fitbit return page. Kept separate from React so Node tests can cover them.
import { api, refresh } from './client.js';

/** Fresh random nonce per sign-in attempt (hex, 32 bytes). The API accepts it raw or SHA-256 hashed. */
export function makeNonce(cryptoImpl = globalThis.crypto) {
  const bytes = new Uint8Array(32);
  cryptoImpl.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * App start: refresh through the httpOnly cookie, then load /me.
 * Resolves to the user, or null when there is no session.
 */
export async function bootstrapSession(client = api, doRefresh = refresh) {
  if (!(await doRefresh())) return null;
  try {
    return await client.auth.me();
  } catch {
    return null;
  }
}

/** First-run order after sign-in: privacy consent first, then the profile, then the app. */
export async function firstRunStep(client = api) {
  const consents = await client.entities.PrivacyConsent.list(undefined, 1);
  if (!consents.length) return 'consent';
  const profiles = await client.entities.UserProfile.list(undefined, 1);
  if (!profiles.length) return 'profile';
  return 'done';
}

const FITBIT_RETURN_KEY = 'fitbit_return_to';

export function fitbitRedirectUri(origin = globalThis.location?.origin) {
  return `${origin}/fitbit/callback`;
}

/** Starts Fitbit OAuth: remembers the current route and sends the browser to Fitbit's consent page. */
export async function startFitbitConnect(client = api, loc = globalThis.location, store = globalThis.sessionStorage) {
  store?.setItem(FITBIT_RETURN_KEY, loc.pathname + loc.search);
  const { authorize_url } = await client.integrations.fitbit.connect({ redirect_uri: fitbitRedirectUri(loc.origin) });
  loc.assign(authorize_url);
}

/** /fitbit/callback: posts code and state back to the API. Returns { ok, returnTo }. */
export async function completeFitbit(search, client = api, origin = globalThis.location?.origin, store = globalThis.sessionStorage) {
  const params = new URLSearchParams(search);
  const code = params.get('code');
  const state = params.get('state');
  const returnTo = store?.getItem(FITBIT_RETURN_KEY) || '/';
  store?.removeItem(FITBIT_RETURN_KEY);
  if (params.get('error') || !code || !state) return { ok: false, returnTo };
  try {
    await client.integrations.fitbit.connect({ code, state, redirect_uri: fitbitRedirectUri(origin) });
    return { ok: true, returnTo };
  } catch {
    return { ok: false, returnTo };
  }
}
