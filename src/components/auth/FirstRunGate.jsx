import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import api from '@/api/client';
import { firstRunStep } from '@/api/session-logic';
import PrivacyConsent from '@/components/privacy/PrivacyConsent';
import ProfileSetup from '@/components/profile/ProfileSetup';

// After sign-in: no PrivacyConsent row opens the consent dialog, then no UserProfile opens ProfileSetup.
export default function FirstRunGate({ children }) {
  const [step, setStep] = useState('loading');
  const [saving, setSaving] = useState(false);

  const check = () => firstRunStep().then(setStep).catch(() => setStep('done'));
  useEffect(() => { check(); }, []);

  const saveProfile = async (data) => {
    setSaving(true);
    try {
      // Empty form fields are left out so typed number columns do not reject ''.
      const clean = Object.fromEntries(Object.entries(data || {}).filter(([, v]) => v !== '' && v !== null && v !== undefined));
      await api.entities.UserProfile.create(clean);
      setStep('done');
    } catch {
      toast.error('Failed to save profile');
    } finally {
      setSaving(false);
    }
  };

  if (step === 'loading') return null;
  if (step === 'consent') return <PrivacyConsent open onComplete={check} />;
  if (step === 'profile') {
    return (
      <div className="min-h-screen bg-slate-50 p-4 flex justify-center">
        <div className="w-full max-w-2xl"><ProfileSetup profile={null} onSave={saveProfile} isLoading={saving} /></div>
      </div>
    );
  }
  return children;
}
