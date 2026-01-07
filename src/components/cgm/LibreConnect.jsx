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
  const [credentials, setCredentials] = useState({ email: '', password: '' });

  const handleConnect = async (e) => {
    e.preventDefault();
    setConnecting(true);

    try {
      const response = await base44.functions.invoke('connectLibre', credentials);
      
      if (response.data.success) {
        toast.success('Successfully connected to LibreView!');
        onConnected?.();
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
        <CardTitle className="text-lg">Connect LibreView Account</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleConnect} className="space-y-4">
          <div className="p-4 bg-blue-50 rounded-xl">
            <p className="text-sm text-blue-700">
              Enter your LibreView credentials to sync your Freestyle Libre glucose data automatically.
            </p>
          </div>

          <div>
            <Label htmlFor="libre-email">LibreView Email</Label>
            <Input
              id="libre-email"
              type="email"
              value={credentials.email}
              onChange={(e) => setCredentials(prev => ({ ...prev, email: e.target.value }))}
              placeholder="your@email.com"
              required
              className="mt-2"
            />
          </div>

          <div>
            <Label htmlFor="libre-password">LibreView Password</Label>
            <Input
              id="libre-password"
              type="password"
              value={credentials.password}
              onChange={(e) => setCredentials(prev => ({ ...prev, password: e.target.value }))}
              placeholder="••••••••"
              required
              className="mt-2"
            />
          </div>

          <div className="p-3 bg-amber-50 rounded-lg">
            <p className="text-xs text-amber-700">
              <strong>Privacy:</strong> Your credentials are used only to authenticate with LibreView. 
              We store only the access token to sync your glucose data.
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