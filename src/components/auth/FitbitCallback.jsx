import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { completeFitbit, startFitbitConnect } from '@/api/session-logic';

// Route /fitbit/callback: posts code and state to the API, then returns to the previous screen.
export default function FitbitCallback() {
  const navigate = useNavigate();
  const [failed, setFailed] = useState(false);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    completeFitbit(window.location.search).then(({ ok, returnTo }) => {
      if (ok) {
        toast.success('Fitbit connected');
        navigate(returnTo, { replace: true });
      } else {
        toast.error('Fitbit was not connected');
        setFailed(true);
      }
    });
  }, []);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-6">
      <p className="text-slate-700" role="status">{failed ? 'Fitbit was not connected.' : 'Connecting Fitbit...'}</p>
      {failed && (
        <Button onClick={() => startFitbitConnect().catch(() => toast.error('Could not start Fitbit connect'))}>
          Try again
        </Button>
      )}
    </div>
  );
}
