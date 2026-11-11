import React, { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Link2, Unlink, RefreshCw, CheckCircle } from 'lucide-react';
import { toast } from "sonner";
import api from '@/api/client';

// Real Dexcom connection, shown only when GET /api/v1/me lists 'dexcom' in integrations_available.
export default function DexcomConnect({ connected = false, lastSyncAt, onChanged }) {
  const [busy, setBusy] = useState(false);

  const connect = async () => {
    setBusy(true);
    try {
      const { authorize_url } = await api.integrations.dexcom.authorize();
      window.location.assign(authorize_url);
    } catch {
      toast.error('Dexcom not connected');
      setBusy(false);
    }
  };

  const sync = async () => {
    setBusy(true);
    try {
      const res = await api.integrations.dexcom.sync();
      toast.success(`Dexcom: ${res.imported} imported, ${res.skipped} skipped`);
      onChanged?.();
    } catch (error) {
      if (error.needsAuth) { toast.error('Please connect Dexcom again'); onChanged?.(); }
      else toast.error('Dexcom unavailable, try later');
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async () => {
    setBusy(true);
    try {
      await api.integrations.dexcom.disconnect();
      onChanged?.();
    } catch {
      toast.error('Could not disconnect Dexcom');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl" data-testid="dexcom-real">
      <div className="flex items-center gap-3">
        <span className="text-2xl">📊</span>
        <div>
          <p className="font-medium text-slate-800">Dexcom (G6 / G7)</p>
          {connected ? (
            <p className="text-xs text-emerald-600 flex items-center gap-1">
              <CheckCircle className="w-3 h-3" /> Connected
              {lastSyncAt ? ` · last sync ${new Date(lastSyncAt).toLocaleString()}` : ''}
            </p>
          ) : (
            <p className="text-xs text-slate-500">Dexcom delivers readings with a delay.</p>
          )}
        </div>
      </div>
      {connected ? (
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={sync} disabled={busy}>
            <RefreshCw className={`w-4 h-4 mr-1 ${busy ? 'animate-spin' : ''}`} /> Sync
          </Button>
          <Button size="sm" variant="outline" onClick={disconnect} disabled={busy} className="text-rose-600">
            <Unlink className="w-4 h-4 mr-1" /> Disconnect
          </Button>
        </div>
      ) : (
        <Button size="sm" onClick={connect} disabled={busy}>
          <Link2 className="w-4 h-4 mr-1" /> Connect Dexcom
        </Button>
      )}
    </div>
  );
}
