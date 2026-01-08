import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent } from "@/components/ui/card";
import { Shield, MapPin, Activity, Clock, AlertCircle } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { toast } from "sonner";

export default function PrivacyConsent({ open, onComplete }) {
  const [consents, setConsents] = useState({
    location: false,
    cgm: false,
    wearables: false,
    email: true // Email enabled by default
  });

  const permissions = [
    {
      key: 'location',
      icon: MapPin,
      title: 'Location Data',
      description: 'Access your location to provide weather-based exercise recommendations',
      impact: 'Without this: Exercise suggestions will be generic, not weather-aware',
      color: 'blue'
    },
    {
      key: 'cgm',
      icon: Activity,
      title: 'CGM Device Data',
      description: 'Connect to Freestyle Libre, Dexcom, or other CGM devices to automatically import glucose readings',
      impact: 'Without this: You\'ll need to manually enter all glucose readings',
      color: 'emerald'
    },
    {
      key: 'wearables',
      icon: Clock,
      title: 'Wearable Health Data',
      description: 'Sync with Fitbit, Apple Health, or Google Fit for activity, sleep, and heart rate data',
      impact: 'Without this: Manual entry required for sleep, activity, and exercise logs',
      color: 'violet'
    }
  ];

  const handleSave = async () => {
    try {
      const profiles = await base44.entities.UserProfile.list();
      const profile = profiles[0];
      
      await base44.entities.UserProfile.update(profile.id, {
        consent_location: consents.location,
        consent_cgm: consents.cgm,
        consent_wearables: consents.wearables,
        consent_email: consents.email,
        consent_given_at: new Date().toISOString()
      });
      
      toast.success('Privacy preferences saved');
      onComplete();
    } catch (error) {
      toast.error('Failed to save preferences');
    }
  };

  const allDeclined = !consents.location && !consents.cgm && !consents.wearables;

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Shield className="w-6 h-6 text-emerald-600" />
            Your Privacy & Data Permissions
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 pt-4">
          <div className="p-4 bg-blue-50 rounded-xl border border-blue-200">
            <p className="text-sm text-slate-700 leading-relaxed">
              DiabetEasy works best when connected to your health devices and services. 
              We take your privacy seriously and give you full control over what data we can access.
            </p>
          </div>

          <div className="space-y-4">
            {permissions.map((perm) => {
              const Icon = perm.icon;
              return (
                <Card key={perm.key} className="border-2">
                  <CardContent className="p-4">
                    <div className="flex items-start gap-4">
                      <div className={`w-12 h-12 rounded-xl bg-${perm.color}-100 flex items-center justify-center flex-shrink-0`}>
                        <Icon className={`w-6 h-6 text-${perm.color}-600`} />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <Checkbox
                            checked={consents[perm.key]}
                            onCheckedChange={(checked) => 
                              setConsents(prev => ({ ...prev, [perm.key]: checked }))
                            }
                            id={perm.key}
                          />
                          <label htmlFor={perm.key} className="font-semibold text-slate-800 cursor-pointer">
                            {perm.title}
                          </label>
                        </div>
                        <p className="text-sm text-slate-600 mb-2">{perm.description}</p>
                        <p className="text-xs text-slate-500 italic">{perm.impact}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {allDeclined && (
            <div className="p-4 bg-amber-50 rounded-xl border border-amber-200 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
              <div className="text-sm text-amber-800">
                <p className="font-semibold mb-1">Limited Functionality Mode</p>
                <p>
                  Without these permissions, DiabetEasy will rely on manual entries and default AI suggestions. 
                  You can enable permissions anytime in your Profile settings.
                </p>
              </div>
            </div>
          )}

          <div className="p-4 bg-slate-50 rounded-xl text-xs text-slate-600">
            <p className="font-semibold mb-2">Your Data Security</p>
            <ul className="space-y-1">
              <li>• All health data is encrypted and secured with row-level security</li>
              <li>• Only you can access your personal health information</li>
              <li>• You can revoke permissions or delete your data anytime</li>
              <li>• We never share your data with third parties</li>
            </ul>
          </div>

          <div className="flex gap-3">
            <Button 
              onClick={handleSave}
              className="flex-1 bg-emerald-600 hover:bg-emerald-700"
            >
              Save Preferences & Continue
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}