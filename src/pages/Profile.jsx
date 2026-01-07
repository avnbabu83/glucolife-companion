import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  User, 
  Activity, 
  Settings,
  LogOut,
  Shield,
  Bell
} from 'lucide-react';
import { toast } from "sonner";

import ProfileSetup from '@/components/profile/ProfileSetup';
import CGMIntegration from '@/components/cgm/CGMIntegration';

export default function Profile() {
  const [user, setUser] = useState(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    const loadUser = async () => {
      const userData = await base44.auth.me();
      setUser(userData);
    };
    loadUser();
  }, []);

  const { data: profiles = [], isLoading } = useQuery({
    queryKey: ['userProfile'],
    queryFn: () => base44.entities.UserProfile.list(),
  });

  const { data: glucoseReadings = [] } = useQuery({
    queryKey: ['allGlucose'],
    queryFn: () => base44.entities.GlucoseReading.list('-date', 5),
  });

  const createProfileMutation = useMutation({
    mutationFn: (data) => base44.entities.UserProfile.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['userProfile'] });
      toast.success('Profile created successfully');
    },
  });

  const updateProfileMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.UserProfile.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['userProfile'] });
      toast.success('Profile updated successfully');
    },
  });

  const handleSaveProfile = (data) => {
    if (profiles.length > 0) {
      updateProfileMutation.mutate({ id: profiles[0].id, data });
    } else {
      createProfileMutation.mutate(data);
    }
  };

  const handleCGMChange = (device) => {
    if (profiles.length > 0) {
      updateProfileMutation.mutate({ 
        id: profiles[0].id, 
        data: { cgm_device: device } 
      });
    }
  };

  const handleLogout = () => {
    base44.auth.logout();
  };

  const profile = profiles[0];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-slate-800">Settings</h1>
          <Button variant="outline" onClick={handleLogout} className="text-rose-600">
            <LogOut className="w-4 h-4 mr-2" />
            Sign Out
          </Button>
        </div>

        {/* User Info Card */}
        {user && (
          <Card className="border-0 shadow-sm bg-gradient-to-r from-emerald-500 to-teal-500">
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-full bg-white/20 flex items-center justify-center">
                  <User className="w-8 h-8 text-white" />
                </div>
                <div className="text-white">
                  <h2 className="text-xl font-bold">{user.full_name || 'User'}</h2>
                  <p className="text-emerald-100">{user.email}</p>
                  {profile?.diabetes_type && (
                    <p className="text-sm text-emerald-200 mt-1 capitalize">
                      {profile.diabetes_type.replace('_', ' ')} Diabetes • {profile.dietary_preference?.replace('_', ' ')}
                    </p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <Tabs defaultValue="profile" className="space-y-6">
          <TabsList className="bg-white shadow-sm">
            <TabsTrigger value="profile">
              <User className="w-4 h-4 mr-2" />
              Profile
            </TabsTrigger>
            <TabsTrigger value="cgm">
              <Activity className="w-4 h-4 mr-2" />
              CGM
            </TabsTrigger>
            <TabsTrigger value="notifications">
              <Bell className="w-4 h-4 mr-2" />
              Reminders
            </TabsTrigger>
          </TabsList>

          <TabsContent value="profile">
            {isLoading ? (
              <div className="text-center py-12 text-slate-500">Loading profile...</div>
            ) : (
              <ProfileSetup 
                profile={profile}
                onSave={handleSaveProfile}
                isLoading={createProfileMutation.isPending || updateProfileMutation.isPending}
              />
            )}
          </TabsContent>

          <TabsContent value="cgm">
            <CGMIntegration 
              currentDevice={profile?.cgm_device}
              onDeviceChange={handleCGMChange}
              latestReadings={glucoseReadings}
            />
          </TabsContent>

          <TabsContent value="notifications">
            <Card className="border-0 shadow-sm">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Bell className="w-5 h-5 text-slate-500" />
                  Reminder Settings
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="p-4 bg-blue-50 rounded-xl">
                  <h4 className="font-semibold text-blue-800 mb-2">Meal Reminders</h4>
                  <p className="text-sm text-blue-600">
                    You'll receive reminders based on your meal plan schedule. 
                    Make sure to set scheduled times when creating meal plans.
                  </p>
                </div>
                
                <div className="p-4 bg-violet-50 rounded-xl">
                  <h4 className="font-semibold text-violet-800 mb-2">Medication Reminders</h4>
                  <p className="text-sm text-violet-600">
                    Reminders are sent at the times you set for each medication.
                    Add medications in the Medications section to set up reminders.
                  </p>
                </div>
                
                <div className="p-4 bg-emerald-50 rounded-xl">
                  <h4 className="font-semibold text-emerald-800 mb-2">Glucose Check Reminders</h4>
                  <p className="text-sm text-emerald-600">
                    We recommend checking glucose before and after meals, 
                    and at bedtime for optimal diabetes management.
                  </p>
                </div>

                <div className="p-4 bg-amber-50 rounded-xl">
                  <h4 className="font-semibold text-amber-800 mb-2">Sleep Reminders</h4>
                  <p className="text-sm text-amber-600">
                    Your target bedtime is {profile?.sleep_time || '22:00'}. 
                    Consistent sleep helps maintain stable blood sugar levels.
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Data Summary */}
        {profile && (
          <Card className="border-0 shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Shield className="w-5 h-5 text-slate-500" />
                Your Health Summary
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="p-4 bg-slate-50 rounded-xl text-center">
                  <p className="text-sm text-slate-500">Target Range</p>
                  <p className="text-lg font-bold text-slate-800">
                    {profile.target_glucose_min || 70}-{profile.target_glucose_max || 140}
                  </p>
                  <p className="text-xs text-slate-400">mg/dL</p>
                </div>
                <div className="p-4 bg-slate-50 rounded-xl text-center">
                  <p className="text-sm text-slate-500">BMI</p>
                  <p className="text-lg font-bold text-slate-800">
                    {profile.weight && profile.height 
                      ? (profile.weight / Math.pow(profile.height / 100, 2)).toFixed(1)
                      : '--'}
                  </p>
                </div>
                <div className="p-4 bg-slate-50 rounded-xl text-center">
                  <p className="text-sm text-slate-500">Activity</p>
                  <p className="text-lg font-bold text-slate-800 capitalize">
                    {profile.activity_level?.replace('_', ' ') || '--'}
                  </p>
                </div>
                <div className="p-4 bg-slate-50 rounded-xl text-center">
                  <p className="text-sm text-slate-500">CGM</p>
                  <p className="text-lg font-bold text-slate-800">
                    {profile.cgm_device && profile.cgm_device !== 'none' 
                      ? '✓ Connected' 
                      : 'Not Connected'}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}