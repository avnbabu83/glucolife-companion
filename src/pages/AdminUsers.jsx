import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users, Mail, Calendar, Shield, Loader2 } from 'lucide-react';
import moment from 'moment';

export default function AdminUsers() {
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const user = await base44.auth.me();
        if (user.email !== 'avn.babu@gmail.com') {
          window.location.href = '/';
          return;
        }
        setCurrentUser(user);
      } catch (error) {
        window.location.href = '/';
      } finally {
        setLoading(false);
      }
    };
    checkAuth();
  }, []);

  const { data: users = [], isLoading } = useQuery({
    queryKey: ['allUsers'],
    queryFn: () => base44.entities.User.list('-created_date'),
    enabled: !!currentUser,
  });

  const { data: profiles = [] } = useQuery({
    queryKey: ['allProfiles'],
    queryFn: () => base44.entities.UserProfile.list(),
    enabled: !!currentUser,
  });

  if (loading || !currentUser) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">User Management</h1>
            <p className="text-sm text-slate-500">Admin Dashboard</p>
          </div>
          <Badge className="bg-rose-600">Admin Only</Badge>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card className="border-0 shadow-sm">
            <CardContent className="p-4 text-center">
              <Users className="w-6 h-6 text-blue-600 mx-auto mb-2" />
              <p className="text-2xl font-bold text-slate-800">{users.length}</p>
              <p className="text-xs text-slate-500">Total Users</p>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-sm">
            <CardContent className="p-4 text-center">
              <Shield className="w-6 h-6 text-violet-600 mx-auto mb-2" />
              <p className="text-2xl font-bold text-slate-800">
                {users.filter(u => u.role === 'admin').length}
              </p>
              <p className="text-xs text-slate-500">Admins</p>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-sm">
            <CardContent className="p-4 text-center">
              <Calendar className="w-6 h-6 text-emerald-600 mx-auto mb-2" />
              <p className="text-2xl font-bold text-slate-800">
                {profiles.length}
              </p>
              <p className="text-xs text-slate-500">Profiles Created</p>
            </CardContent>
          </Card>
        </div>

        {/* Users List */}
        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg">All Users</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-slate-400 mx-auto" />
              </div>
            ) : (
              <div className="space-y-2">
                {users.map((user) => {
                  const profile = profiles.find(p => p.created_by === user.email);
                  return (
                    <div key={user.id} className="p-4 bg-slate-50 rounded-xl">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center text-white font-semibold">
                            {user.full_name?.charAt(0) || user.email?.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <p className="font-semibold text-slate-800">{user.full_name || 'No name'}</p>
                            <div className="flex items-center gap-2 text-sm text-slate-500">
                              <Mail className="w-3 h-3" />
                              {user.email}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {user.role === 'admin' && (
                            <Badge className="bg-violet-600">Admin</Badge>
                          )}
                          {profile ? (
                            <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">
                              Profile Created
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
                              No Profile
                            </Badge>
                          )}
                        </div>
                      </div>
                      <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                        <div>
                          <p className="text-slate-500">Created</p>
                          <p className="font-medium text-slate-700">
                            {moment(user.created_date).format('MMM D, YYYY')}
                          </p>
                        </div>
                        {profile && (
                          <>
                            <div>
                              <p className="text-slate-500">Diabetes Type</p>
                              <p className="font-medium text-slate-700 capitalize">
                                {profile.diabetes_type?.replace('_', ' ') || 'N/A'}
                              </p>
                            </div>
                            <div>
                              <p className="text-slate-500">Diet</p>
                              <p className="font-medium text-slate-700 capitalize">
                                {profile.dietary_preference?.replace('_', ' ') || 'N/A'}
                              </p>
                            </div>
                            <div>
                              <p className="text-slate-500">CGM Device</p>
                              <p className="font-medium text-slate-700 capitalize">
                                {profile.cgm_device === 'none' ? 'Not connected' : profile.cgm_device || 'N/A'}
                              </p>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}