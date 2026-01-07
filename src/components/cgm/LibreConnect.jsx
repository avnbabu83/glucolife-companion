import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import { toast } from "sonner";

export default function LibreConnect({ onConnected }) {
  const [connecting, setConnecting] = useState(false);
  const [sharingCode, setSharingCode] = useState('');

  const handleConnect = async (e) => {
    e.preventDefault();
    setConnecting(true);

    try {
      const response = await base44.functions.invoke('connectLibre', { sharingCode });
      
      if (response.data.success) {
        onConnected?.();
        toast.success('Connected! Click "Sync Libre" button to import your glucose data');
      } else {
        toast.error(response.data.error || 'Connection failed');
      }
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to connect to LibreView');
    } finally {
      setConnecting(false);
    }
  };

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader>
        <CardTitle className="text-lg">Connect LibreView Data Share</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleConnect} className="space-y-4">
          <div className="p-4 bg-blue-50 rounded-xl">
            <p className="text-sm text-blue-700 mb-2">
              <strong>Get your sharing code:</strong>
            </p>
            <ol className="text-sm text-blue-600 space-y-1 list-decimal list-inside">
              <li>Go to <a href="https://www.libreview.com/sharing" target="_blank" className="underline">libreview.com/sharing</a></li>
              <li>Login with your LibreView account</li>
              <li>Generate a data sharing code</li>
              <li>Copy and paste it below</li>
            </ol>
          </div>

          <div>
            <Label htmlFor="sharing-code">Data Sharing Code</Label>
            <Input
              id="sharing-code"
              type="text"
              value={sharingCode}
              onChange={(e) => setSharingCode(e.target.value.toUpperCase())}
              placeholder="228Q-CJ-CA"
              pattern="[A-Z0-9]{4}-[A-Z0-9]{2}-[A-Z0-9]{2}"
              required
              className="mt-2 font-mono text-center text-lg"
              maxLength={12}
            />
            <p className="text-xs text-slate-500 mt-1">Format: XXXX-XX-XX (valid for 72 hours)</p>
          </div>

          <div className="p-3 bg-amber-50 rounded-lg">
            <p className="text-xs text-amber-700">
              <strong>Note:</strong> Sharing codes expire after 72 hours. You'll need to generate a new code after it expires.
            </p>
          </div>

          <Button 
            type="submit" 
            className="w-full bg-emerald-600 hover:bg-emerald-700"
            disabled={connecting}
          >
            {connecting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Connecting...
              </>
            ) : (
              'Connect LibreView'
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}