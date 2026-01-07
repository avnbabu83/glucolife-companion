import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Activity, Link2, Unlink, RefreshCw, CheckCircle, AlertCircle, Info } from 'lucide-react';
import { cn } from "@/lib/utils";
import { base44 } from '@/api/base44Client';
import { toast } from "sonner";
import LibreConnect from './LibreConnect';

export default function CGMIntegration({ currentDevice, onDeviceChange, latestReadings = [], libreConnected = false, onLibreConnected }) {
  const [connecting, setConnecting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [showLibreConnect, setShowLibreConnect] = useState(false);

  const devices = [
    { id: 'libre2', name: 'Freestyle Libre 2', logo: '📱', status: 'available' },
    { id: 'libre3', name: 'Freestyle Libre 3', logo: '📱', status: 'available' },
    { id: 'dexcom_g6', name: 'Dexcom G6', logo: '📊', status: 'available' },
    { id: 'dexcom_g7', name: 'Dexcom G7', logo: '📊', status: 'available' },
    { id: 'medtronic', name: 'Medtronic Guardian', logo: '🏥', status: 'available' }
  ];

  const handleConnect = async (deviceId) => {
    setConnecting(true);
    // Simulate connection process
    setTimeout(() => {
      onDeviceChange?.(deviceId);
      setConnecting(false);
    }, 1500);
  };

  const handleDisconnect = () => {
    onDeviceChange?.('none');
  };

  const handleSyncNow = async () => {
    setSyncing(true);
    try {
      const response = await base44.functions.invoke('syncLibreData', {});
      if (response.data.success) {
        toast.success(`Synced ${response.data.synced} new readings`);
      } else if (response.data.needsAuth) {
        toast.error('Please connect your LibreView account first');
        setShowLibreConnect(true);
      } else {
        toast.error(response.data.error || 'Sync failed');
      }
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to sync data');
    } finally {
      setSyncing(false);
    }
  };

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg font-semibold flex items-center gap-2">
          <Activity className="w-5 h-5 text-blue-500" />
          CGM Integration
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {currentDevice && currentDevice !== 'none' ? (
          <div className="space-y-4">
            <div className="p-4 bg-emerald-50 rounded-xl">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <CheckCircle className="w-5 h-5 text-emerald-600" />
                  <div>
                    <p className="font-semibold text-emerald-800">
                      {devices.find(d => d.id === currentDevice)?.name || currentDevice}
                    </p>
                    <p className="text-sm text-emerald-600">
                      {libreConnected ? 'LibreLinkUp connected' : 'Device selected'}
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  {(currentDevice === 'libre2' || currentDevice === 'libre3') && libreConnected && (
                    <Button 
                      size="sm" 
                      variant="outline"
                      onClick={handleSyncNow}
                      disabled={syncing}
                    >
                      {syncing ? (
                        <RefreshCw className="w-4 h-4 mr-1 animate-spin" />
                      ) : (
                        <RefreshCw className="w-4 h-4 mr-1" />
                      )}
                      Sync Now
                    </Button>
                  )}
                  <Button 
                    size="sm" 
                    variant="outline" 
                    onClick={handleDisconnect}
                    className="text-rose-600 hover:bg-rose-50"
                  >
                    <Unlink className="w-4 h-4 mr-1" />
                    Disconnect
                  </Button>
                </div>
              </div>
            </div>

            {(currentDevice === 'libre2' || currentDevice === 'libre3') && !libreConnected && (
              <LibreConnect onConnected={() => {
                onLibreConnected?.();
                setShowLibreConnect(false);
              }} />
            )}
            
            {latestReadings.length > 0 && (
              <div className="mt-4 pt-4 border-t border-emerald-200">
                <p className="text-sm text-emerald-700 mb-2">Latest Synced Readings</p>
                <div className="flex gap-2 overflow-x-auto pb-2">
                  {latestReadings.slice(0, 5).map((reading, idx) => (
                    <div key={idx} className="flex-shrink-0 px-3 py-2 bg-white rounded-lg">
                      <p className="text-lg font-bold text-slate-800">{reading.reading}</p>
                      <p className="text-xs text-slate-500">{reading.reading_time}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <>
            <div className="p-4 bg-blue-50 rounded-xl">
              <div className="flex items-start gap-3">
                <Info className="w-5 h-5 text-blue-600 mt-0.5" />
                <div>
                  <p className="font-medium text-blue-800">Connect Your CGM Device</p>
                  <p className="text-sm text-blue-600 mt-1">
                    Sync your continuous glucose monitor to automatically import readings 
                    and get personalized diet recommendations based on your glucose patterns.
                  </p>
                </div>
              </div>
            </div>
            
            <div className="space-y-2">
              {devices.map((device) => (
                <div 
                  key={device.id}
                  className="flex items-center justify-between p-3 bg-slate-50 rounded-xl hover:bg-slate-100 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{device.logo}</span>
                    <div>
                      <p className="font-medium text-slate-800">{device.name}</p>
                      <Badge variant="outline" className="text-xs text-emerald-600">
                        Available
                      </Badge>
                    </div>
                  </div>
                  <Button 
                    size="sm"
                    onClick={() => handleConnect(device.id)}
                    disabled={connecting}
                  >
                    {connecting ? (
                      <RefreshCw className="w-4 h-4 mr-1 animate-spin" />
                    ) : (
                      <Link2 className="w-4 h-4 mr-1" />
                    )}
                    Connect
                  </Button>
                </div>
              ))}
            </div>
          </>
        )}
        
        {showLibreConnect && (
          <LibreConnect onConnected={() => {
            onLibreConnected?.();
            setShowLibreConnect(false);
          }} />
        )}
      </CardContent>
    </Card>
  );
}