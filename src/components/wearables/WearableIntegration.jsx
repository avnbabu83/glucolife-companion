import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Watch, Link2, Unlink, RefreshCw, CheckCircle, Info, Heart, Moon, Activity } from 'lucide-react';
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export default function WearableIntegration({ connectedDevice, onDeviceChange, latestData = {} }) {
  const [connecting, setConnecting] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const devices = [
    { id: 'apple_health', name: 'Apple Health', logo: '🍎', platform: 'iOS', status: 'available' },
    { id: 'apple_watch', name: 'Apple Watch', logo: '⌚', platform: 'iOS', status: 'available' },
    { id: 'google_fit', name: 'Google Fit', logo: '🏃', platform: 'Android', status: 'available' },
    { id: 'fitbit', name: 'Fitbit', logo: '📊', platform: 'All', status: 'available' },
    { id: 'garmin', name: 'Garmin', logo: '🎯', platform: 'All', status: 'available' },
    { id: 'samsung_health', name: 'Samsung Health', logo: '💪', platform: 'Android', status: 'available' }
  ];

  const handleConnect = async (deviceId) => {
    setConnecting(true);
    // Simulate connection
    setTimeout(() => {
      onDeviceChange?.(deviceId);
      toast.success('Wearable connected successfully');
      setConnecting(false);
    }, 1500);
  };

  const handleDisconnect = () => {
    onDeviceChange?.('none');
    toast.success('Wearable disconnected');
  };

  const handleSync = async () => {
    setSyncing(true);
    setTimeout(() => {
      toast.success('Synced health data from wearable');
      setSyncing(false);
    }, 2000);
  };

  const dataMetrics = [
    { 
      icon: Moon, 
      label: 'Sleep', 
      value: latestData.sleep_hours || '--', 
      unit: 'hrs',
      color: 'text-indigo-600',
      bgColor: 'bg-indigo-50'
    },
    { 
      icon: Heart, 
      label: 'Heart Rate', 
      value: latestData.heart_rate || '--', 
      unit: 'bpm',
      color: 'text-rose-600',
      bgColor: 'bg-rose-50'
    },
    { 
      icon: Activity, 
      label: 'Steps', 
      value: latestData.steps || '--', 
      unit: '',
      color: 'text-emerald-600',
      bgColor: 'bg-emerald-50'
    },
    { 
      icon: Activity, 
      label: 'Calories', 
      value: latestData.calories || '--', 
      unit: 'kcal',
      color: 'text-orange-600',
      bgColor: 'bg-orange-50'
    }
  ];

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg font-semibold flex items-center gap-2">
          <Watch className="w-5 h-5 text-blue-500" />
          Health Wearables
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {connectedDevice && connectedDevice !== 'none' ? (
          <div className="space-y-4">
            <div className="p-4 bg-emerald-50 rounded-xl">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="flex items-center gap-3">
                  <CheckCircle className="w-5 h-5 text-emerald-600" />
                  <div>
                    <p className="font-semibold text-emerald-800">
                      {devices.find(d => d.id === connectedDevice)?.name || connectedDevice}
                    </p>
                    <p className="text-sm text-emerald-600">Device connected</p>
                  </div>
                </div>
                <div className="flex gap-2 flex-wrap">
                  <Button 
                    size="sm" 
                    variant="outline"
                    onClick={handleSync}
                    disabled={syncing}
                    className="flex-shrink-0"
                  >
                    {syncing ? (
                      <RefreshCw className="w-4 h-4 mr-1 animate-spin" />
                    ) : (
                      <RefreshCw className="w-4 h-4 mr-1" />
                    )}
                    Sync
                  </Button>
                  <Button 
                    size="sm" 
                    variant="outline" 
                    onClick={handleDisconnect}
                    className="text-rose-600 hover:bg-rose-50 flex-shrink-0"
                  >
                    <Unlink className="w-4 h-4 mr-1" />
                    Disconnect
                  </Button>
                </div>
              </div>
            </div>

            {/* Latest Synced Data */}
            <div className="grid grid-cols-2 gap-3">
              {dataMetrics.map((metric, idx) => (
                <div key={idx} className={cn("p-3 rounded-xl", metric.bgColor)}>
                  <div className="flex items-center gap-2 mb-1">
                    <metric.icon className={cn("w-4 h-4", metric.color)} />
                    <span className="text-xs text-slate-600">{metric.label}</span>
                  </div>
                  <p className={cn("text-xl font-bold", metric.color)}>
                    {metric.value} <span className="text-sm">{metric.unit}</span>
                  </p>
                </div>
              ))}
            </div>

            <div className="p-3 bg-blue-50 rounded-lg text-xs text-blue-700">
              <p className="font-medium">📊 Auto-sync enabled</p>
              <p className="mt-1">Data syncs automatically throughout the day to provide real-time insights</p>
            </div>
          </div>
        ) : (
          <>
            <div className="p-4 bg-blue-50 rounded-xl">
              <div className="flex items-start gap-3">
                <Info className="w-5 h-5 text-blue-600 mt-0.5" />
                <div>
                  <p className="font-medium text-blue-800">Connect Your Wearable</p>
                  <p className="text-sm text-blue-600 mt-1">
                    Sync sleep patterns, heart rate, activity, and calories to get personalized 
                    health insights that correlate with your glucose control.
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
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs text-emerald-600">
                          Available
                        </Badge>
                        <span className="text-xs text-slate-500">{device.platform}</span>
                      </div>
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

            <div className="p-4 bg-amber-50 rounded-xl">
              <p className="text-sm text-amber-700">
                <strong>Note:</strong> Wearable integration requires backend functions. 
                Data will sync automatically once connected. For now, you can connect to track 
                the device type and manually log data.
              </p>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}