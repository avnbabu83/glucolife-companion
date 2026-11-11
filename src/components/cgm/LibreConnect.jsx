import React, { useState } from 'react';
import api from '@/api/client';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Link2, RefreshCw } from 'lucide-react';
import { toast } from "sonner";

export default function LibreConnect({ onConnected }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [connecting, setConnecting] = useState(false);

  const handleConnect = async (e) => {
    e.preventDefault();
    
    if (!email.trim() || !password.trim()) {
      toast.error('Please enter your LibreLinkUp email and password');
      return;
    }

    setConnecting(true);
    try {
      const result = await api.integrations.libre.connect({ email, password });

      if (result?.success) {
        toast.success('LibreLinkUp connected! Syncing data...');
        // Trigger initial sync
        await api.integrations.libre.sync();
        onConnected?.();
      }
    } catch (error) {
      toast.error(error?.status === 502 ? 'LibreLinkUp is unavailable, please try again' : (error?.code || 'Failed to connect'));
    } finally {
      setConnecting(false);
    }
  };

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader>
        <CardTitle className="text-lg">Connect LibreLinkUp</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleConnect} className="space-y-4">
          <div>
            <Label>LibreLinkUp Email</Label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com"
              className="mt-1"
              required
            />
          </div>

          <div>
            <Label>LibreLinkUp Password</Label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="mt-1"
              required
            />
          </div>

          <div className="flex gap-2">
            <Button 
              type="submit"
              className="flex-1 bg-emerald-600 hover:bg-emerald-700"
              disabled={connecting}
            >
              {connecting ? (
                <>
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  Connecting...
                </>
              ) : (
                <>
                  <Link2 className="w-4 h-4 mr-2" />
                  Connect
                </>
              )}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="flex-shrink-0"
              onClick={async () => {
                try {
                  const result = await api.integrations.libre.sync();
                  if (result?.success) {
                    toast.success(`Synced ${result.imported} readings (${result.skipped} already saved)`);
                  } else {
                    toast.error(result?.error || 'Sync failed');
                  }
                } catch (error) {
                  toast.error(error?.needsAuth ? 'Please connect LibreLinkUp first' : 'Failed to sync');
                }
              }}
            >
              <RefreshCw className="w-4 h-4 mr-1" />
              Sync
            </Button>
          </div>

          <div className="p-3 bg-blue-50 rounded-lg text-sm text-blue-700">
            <p className="font-medium mb-1">How to connect:</p>
            <ol className="list-decimal ml-4 space-y-1">
              <li>Download LibreLinkUp app (caregiver app)</li>
              <li>Create account or log in</li>
              <li>Have someone share their Libre data with you, or use your own account</li>
              <li>Enter your LibreLinkUp credentials above</li>
            </ol>
            <p className="mt-2 text-xs text-blue-600">
              Your credentials are stored securely and only used to fetch your glucose data.
            </p>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}