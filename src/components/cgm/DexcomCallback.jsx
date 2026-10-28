import React, { useEffect, useRef, useState } from 'react';
import api from '@/api/client';

/** Reads code/state (or error) from the query string Dexcom redirected to and posts them to the API. */
export async function completeDexcom(search, client = api) {
  const params = new URLSearchParams(search);
  const code = params.get('code');
  const state = params.get('state');
  if (params.get('error') || !code || !state) return { ok: false };
  try {
    await client.integrations.dexcom.complete({ code, state });
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

// Route /dexcom/callback: finishes the Dexcom login and returns to Devices.
export default function DexcomCallback() {
  const [status, setStatus] = useState('Connecting Dexcom…');
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    completeDexcom(window.location.search).then(({ ok }) => {
      setStatus(ok ? 'Dexcom connected' : 'Dexcom not connected');
      setTimeout(() => window.location.replace(`/CGMDashboard?dexcom=${ok ? 'connected' : 'failed'}`), ok ? 800 : 2500);
    });
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <p className="text-slate-700" role="status">{status}</p>
    </div>
  );
}
