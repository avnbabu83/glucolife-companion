import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Droplet } from 'lucide-react';
import { toast } from 'sonner';
import AuthLayout from '@/components/AuthLayout';
import api from '@/api/client';
import { makeNonce } from '@/api/session-logic';
import { useSession } from '@/api/session';

const APPLE_JS = 'https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js';
const GOOGLE_JS = 'https://accounts.google.com/gsi/client';
const env = import.meta.env || {};

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) {
      if (existing.dataset.loaded) return resolve();
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', reject);
      return;
    }
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.onload = () => { s.dataset.loaded = '1'; resolve(); };
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

// Route /sign-in: Sign in with Apple (popup) and Google Identity Services.
export default function SignIn() {
  const navigate = useNavigate();
  const { signedIn } = useSession();
  const googleButton = useRef(null);
  const googleNonce = useRef(makeNonce());
  const [busy, setBusy] = useState(false);

  const finish = (user) => {
    signedIn(user);
    navigate('/', { replace: true });
  };

  useEffect(() => {
    if (!env.VITE_GOOGLE_CLIENT_ID) return;
    loadScript(GOOGLE_JS).then(() => {
      window.google.accounts.id.initialize({
        client_id: env.VITE_GOOGLE_CLIENT_ID,
        nonce: googleNonce.current,
        callback: async ({ credential }) => {
          setBusy(true);
          try {
            finish(await api.auth.google({ id_token: credential, nonce: googleNonce.current }));
          } catch {
            toast.error('Google sign-in failed, please try again');
            googleNonce.current = makeNonce();
          } finally {
            setBusy(false);
          }
        },
      });
      if (googleButton.current) {
        window.google.accounts.id.renderButton(googleButton.current, {
          theme: 'outline', size: 'large', text: 'signin_with', width: 320,
        });
      }
    }).catch(() => toast.error('Google sign-in could not load'));
  }, []);

  const signInWithApple = async () => {
    setBusy(true);
    const nonce = makeNonce();
    try {
      await loadScript(APPLE_JS);
      window.AppleID.auth.init({
        clientId: env.VITE_APPLE_SERVICES_ID,
        scope: 'name email',
        redirectURI: env.VITE_APPLE_REDIRECT_URI || `${window.location.origin}/`,
        usePopup: true,
        nonce,
      });
      const res = await window.AppleID.auth.signIn();
      const name = res.user?.name;
      const fullName = name ? [name.firstName, name.lastName].filter(Boolean).join(' ') : undefined;
      finish(await api.auth.apple({
        id_token: res.authorization.id_token,
        authorization_code: res.authorization.code,
        nonce,
        ...(fullName ? { full_name: fullName } : {}),
      }));
    } catch {
      toast.error('Apple sign-in was cancelled or failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout
      icon={Droplet}
      title="DiabetEasy"
      subtitle="Sign in to track your glucose, meals and activity."
      footer={<><a href="/privacy" className="underline">Privacy policy</a> · <a href="/terms" className="underline">Terms</a></>}
    >
      <div className="flex flex-col items-center gap-4">
        <button
          type="button"
          onClick={signInWithApple}
          disabled={busy || !env.VITE_APPLE_SERVICES_ID}
          className="w-80 h-11 rounded-md bg-black text-white font-medium flex items-center justify-center gap-2 disabled:opacity-60"
        >
          <svg aria-hidden="true" viewBox="0 0 384 512" className="w-4 h-4" fill="currentColor">
            <path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z" />
          </svg>
          Sign in with Apple
        </button>
        <div ref={googleButton} aria-label="Sign in with Google" />
        {!env.VITE_GOOGLE_CLIENT_ID && !env.VITE_APPLE_SERVICES_ID && (
          <p className="text-sm text-muted-foreground text-center">
            Sign-in is not configured: set VITE_APPLE_SERVICES_ID and VITE_GOOGLE_CLIENT_ID at build time.
          </p>
        )}
      </div>
    </AuthLayout>
  );
}
