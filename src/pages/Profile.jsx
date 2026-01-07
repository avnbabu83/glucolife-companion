import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
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
  Bell,
  Lock,
  Trash2
} from 'lucide-react';
import { toast } from "sonner";

import ProfileSetup from '@/components/profile/ProfileSetup';
import CGMIntegration from '@/components/cgm/CGMIntegration';
import WearableIntegration from '@/components/wearables/WearableIntegration';

export default function Profile() {
  const location = useLocation();
  const [user, setUser] = useState(null);
  const queryClient = useQueryClient();

  // Get default tab from URL params
  const urlParams = new URLSearchParams(location.search);
  const defaultTab = urlParams.get('tab') || 'profile';

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

  const handleWearableChange = (device) => {
    if (profiles.length > 0) {
      updateProfileMutation.mutate({ 
        id: profiles[0].id, 
        data: { wearable_device: device } 
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

        <Tabs defaultValue={defaultTab} className="space-y-6">
          <TabsList className="bg-white shadow-sm grid grid-cols-5 w-full">
            <TabsTrigger value="profile" className="text-xs px-2">
              <User className="w-4 h-4 sm:mr-2" />
              <span className="hidden sm:inline">Profile</span>
            </TabsTrigger>
            <TabsTrigger value="cgm" className="text-xs px-2">
              <Activity className="w-4 h-4 sm:mr-2" />
              <span className="hidden sm:inline">CGM</span>
            </TabsTrigger>
            <TabsTrigger value="wearables" className="text-xs px-2">
              <Shield className="w-4 h-4 sm:mr-2" />
              <span className="hidden sm:inline">Wearables</span>
            </TabsTrigger>
            <TabsTrigger value="notifications" className="text-xs px-2">
              <Bell className="w-4 h-4 sm:mr-2" />
              <span className="hidden sm:inline">Reminders</span>
            </TabsTrigger>
            <TabsTrigger value="account" className="text-xs px-2">
              <Settings className="w-4 h-4 sm:mr-2" />
              <span className="hidden sm:inline">Account</span>
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
              libreConnected={!!profile?.libre_sharing_code}
              onLibreConnected={() => queryClient.invalidateQueries({ queryKey: ['userProfile'] })}
            />
          </TabsContent>

          <TabsContent value="wearables">
            <WearableIntegration 
              connectedDevice={profile?.wearable_device}
              onDeviceChange={handleWearableChange}
              latestData={{
                sleep_hours: profile?.last_sleep_hours,
                heart_rate: profile?.last_heart_rate,
                steps: profile?.last_steps,
                calories: profile?.last_calories
              }}
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

          <TabsContent value="account">
            <div className="space-y-6">
              {/* Change Password */}
              <Card className="border-0 shadow-sm">
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Lock className="w-5 h-5 text-slate-500" />
                    Change Password
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="p-4 bg-blue-50 rounded-xl">
                    <p className="text-sm text-blue-700 mb-3">
                      To change your password, please sign out and use the "Forgot Password" option on the login page.
                    </p>
                    <Button 
                      variant="outline" 
                      onClick={handleLogout}
                      className="w-full sm:w-auto"
                    >
                      <LogOut className="w-4 h-4 mr-2" />
                      Sign Out to Reset Password
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Delete Account */}
              <Card className="border-0 shadow-sm border-rose-200">
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2 text-rose-600">
                    <Trash2 className="w-5 h-5" />
                    Delete Account
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="p-4 bg-rose-50 rounded-xl">
                    <h4 className="font-semibold text-rose-800 mb-2">⚠️ This action cannot be undone</h4>
                    <p className="text-sm text-rose-700 mb-3">
                      Deleting your account will permanently remove:
                    </p>
                    <ul className="text-sm text-rose-700 list-disc ml-5 space-y-1">
                      <li>Your health profile and diabetes information</li>
                      <li>All glucose readings and measurements</li>
                      <li>Meal plans and dietary history</li>
                      <li>Medication logs and schedules</li>
                      <li>Exercise plans and workout history</li>
                      <li>Sleep tracking data</li>
                    </ul>
                  </div>
                  <Button 
                    variant="destructive"
                    className="w-full sm:w-auto"
                    onClick={async () => {
                      if (confirm('Are you absolutely sure? This action cannot be undone. All your health data will be permanently deleted.')) {
                        if (confirm('Final confirmation: Delete your account and all data?')) {
                          try {
                            const response = await base44.functions.invoke('deleteAccount', {});
                            if (response.data.success) {
                              toast.success('Account deleted successfully');
                              setTimeout(() => {
                                base44.auth.logout();
                              }, 2000);
                            }
                          } catch (error) {
                            toast.error(error.response?.data?.error || 'Failed to delete account');
                          }
                        }
                      }
                    }}
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    Delete My Account
                  </Button>
                </CardContent>
              </Card>
            </div>
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