// Session bootstrap for the web app: refresh via cookie on load, GET /me, and route to /sign-in
// whenever the client reports 'signed-out'. The access token lives in memory only (client.js).
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { onSignedOut } from './client.js';
import { bootstrapSession } from './session-logic.js';

const SessionContext = createContext(null);

export function SessionProvider({ children }) {
  const [state, setState] = useState({ loading: true, user: null });

  useEffect(() => {
    let alive = true;
    bootstrapSession().then((user) => { if (alive) setState({ loading: false, user }); });
    const off = onSignedOut(() => setState({ loading: false, user: null }));
    return () => { alive = false; off(); };
  }, []);

  const signedIn = useCallback((user) => setState({ loading: false, user }), []);

  return (
    <SessionContext.Provider value={{ ...state, signedIn }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used inside <SessionProvider>');
  return ctx;
}
