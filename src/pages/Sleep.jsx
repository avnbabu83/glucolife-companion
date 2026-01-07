import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import moment from 'moment';
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  Moon, 
  Sun, 
  TrendingUp,
  TrendingDown,
  Activity,
  Clock,
  Calendar
} from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';
import { cn } from "@/lib/utils";

import SleepLogger from '@/components/sleep/SleepLogger';

export default function Sleep() {
  const queryClient = useQueryClient();

  const { data: profile } = useQuery({
    queryKey: ['userProfile'],
    queryFn: () => base44.entities.UserProfile.list(),
  });

  const { data: sleepLogs = [] } = useQuery({
    queryKey: ['sleepLogs'],
    queryFn: () => base44.entities.SleepLog.list('-date', 30),
  });

  const createSleepLogMutation = useMutation({
    mutationFn: (data) => base44.entities.SleepLog.create(data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['sleepLogs'] }),
  });

  const userProfile = profile?.[0];
  const lastLog = sleepLogs[0];
  
  // Calculate weekly stats
  const weekLogs = sleepLogs.filter(l => 
    moment(l.date).isAfter(moment().subtract(7, 'days'))
  );
  
  const avgSleep = weekLogs.length > 0 
    ? (weekLogs.reduce((sum, l) => sum + (l.total_hours || 0), 0) / weekLogs.length).toFixed(1)
    : null;
  
  const avgQuality = weekLogs.length > 0
    ? weekLogs.reduce((sum, l) => {
        const scores = { excellent: 4, good: 3, fair: 2, poor: 1 };
        return sum + (scores[l.quality] || 0);
      }, 0) / weekLogs.length
    : null;

  // Chart data
  const chartData = sleepLogs
    .slice(0, 14)
    .reverse()
    .map(log => ({
      date: moment(log.date).format('MMM D'),
      hours: log.total_hours,
      quality: { excellent: 4, good: 3, fair: 2, poor: 1 }[log.quality] || 0,
      morningGlucose: log.morning_glucose
    }));

  // Glucose correlation
  const glucoseCorrelation = weekLogs.length >= 3 && weekLogs.every(l => l.morning_glucose)
    ? weekLogs.reduce((acc, log) => {
        if (log.total_hours >= 7 && log.morning_glucose) {
          acc.goodSleep.push(log.morning_glucose);
        } else if (log.morning_glucose) {
          acc.poorSleep.push(log.morning_glucose);
        }
        return acc;
      }, { goodSleep: [], poorSleep: [] })
    : null;

  const getQualityColor = (quality) => {
    const colors = {
      excellent: 'text-emerald-600 bg-emerald-50',
      good: 'text-blue-600 bg-blue-50',
      fair: 'text-amber-600 bg-amber-50',
      poor: 'text-rose-600 bg-rose-50'
    };
    return colors[quality] || 'text-slate-600 bg-slate-50';
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-slate-800">Sleep Tracking</h1>
        </div>

        {/* Stats Overview */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="border-0 shadow-sm bg-indigo-50">
            <CardContent className="p-4 text-center">
              <Moon className="w-6 h-6 text-indigo-600 mx-auto mb-2" />
              <p className="text-2xl font-bold text-indigo-600">{avgSleep || '--'}</p>
              <p className="text-xs text-indigo-500">Avg Hours/Night</p>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-sm bg-violet-50">
            <CardContent className="p-4 text-center">
              <Sun className="w-6 h-6 text-violet-600 mx-auto mb-2" />
              <p className="text-2xl font-bold text-violet-600">
                {avgQuality ? ['', 'Poor', 'Fair', 'Good', 'Great'][Math.round(avgQuality)] : '--'}
              </p>
              <p className="text-xs text-violet-500">Avg Quality</p>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-sm bg-amber-50">
            <CardContent className="p-4 text-center">
              <Clock className="w-6 h-6 text-amber-600 mx-auto mb-2" />
              <p className="text-2xl font-bold text-amber-600">
                {lastLog?.bedtime || '--'}
              </p>
              <p className="text-xs text-amber-500">Last Bedtime</p>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-sm bg-emerald-50">
            <CardContent className="p-4 text-center">
              <Activity className="w-6 h-6 text-emerald-600 mx-auto mb-2" />
              <p className="text-2xl font-bold text-emerald-600">
                {lastLog?.morning_glucose || '--'}
              </p>
              <p className="text-xs text-emerald-500">Morning Glucose</p>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Sleep Logger */}
          <SleepLogger 
            onSubmit={(data) => createSleepLogMutation.mutate(data)}
            lastSleepLog={lastLog}
          />

          {/* Sleep Insights */}
          <Card className="border-0 shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-violet-500" />
                Sleep & Glucose Insights
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="p-4 bg-indigo-50 rounded-xl">
                <h4 className="font-semibold text-indigo-800 mb-2">Why Sleep Matters for Diabetes</h4>
                <ul className="text-sm text-indigo-700 space-y-1">
                  <li>• Poor sleep increases insulin resistance</li>
                  <li>• Sleep deprivation raises cortisol and blood sugar</li>
                  <li>• Aim for 7-9 hours of quality sleep</li>
                  <li>• Consistent sleep schedule helps glucose control</li>
                </ul>
              </div>

              {glucoseCorrelation && glucoseCorrelation.goodSleep.length > 0 && (
                <div className="p-4 bg-emerald-50 rounded-xl">
                  <h4 className="font-semibold text-emerald-800 mb-2">Your Data Shows</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="text-center">
                      <p className="text-2xl font-bold text-emerald-600">
                        {Math.round(glucoseCorrelation.goodSleep.reduce((a,b) => a+b, 0) / glucoseCorrelation.goodSleep.length)}
                      </p>
                      <p className="text-xs text-emerald-600">Avg glucose (7+ hrs sleep)</p>
                    </div>
                    {glucoseCorrelation.poorSleep.length > 0 && (
                      <div className="text-center">
                        <p className="text-2xl font-bold text-amber-600">
                          {Math.round(glucoseCorrelation.poorSleep.reduce((a,b) => a+b, 0) / glucoseCorrelation.poorSleep.length)}
                        </p>
                        <p className="text-xs text-amber-600">Avg glucose (&lt;7 hrs sleep)</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Recommended Schedule */}
              {userProfile && (
                <div className="p-4 bg-slate-50 rounded-xl">
                  <h4 className="font-semibold text-slate-800 mb-2">Your Schedule</h4>
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2">
                      <Moon className="w-4 h-4 text-indigo-500" />
                      <span className="text-sm">Bedtime: {userProfile.sleep_time || '22:00'}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Sun className="w-4 h-4 text-amber-500" />
                      <span className="text-sm">Wake: {userProfile.wake_time || '06:00'}</span>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Sleep Trend Chart */}
        {chartData.length > 0 && (
          <Card className="border-0 shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Calendar className="w-5 h-5 text-indigo-500" />
                Sleep Trend (Last 2 Weeks)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[250px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="sleepGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#94a3b8' }} />
                    <YAxis domain={[0, 12]} tick={{ fontSize: 11, fill: '#94a3b8' }} />
                    <Tooltip />
                    <Area 
                      type="monotone" 
                      dataKey="hours" 
                      stroke="#6366f1" 
                      strokeWidth={2}
                      fill="url(#sleepGradient)" 
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Recent Sleep History */}
        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg">Recent Sleep History</CardTitle>
          </CardHeader>
          <CardContent>
            {sleepLogs.length === 0 ? (
              <p className="text-sm text-slate-500 text-center py-4">No sleep data recorded yet</p>
            ) : (
              <div className="space-y-2">
                {sleepLogs.slice(0, 7).map((log) => (
                  <div key={log.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
                    <div className="flex items-center gap-4">
                      <div>
                        <p className="font-medium text-slate-800">{moment(log.date).format('ddd, MMM D')}</p>
                        <p className="text-xs text-slate-500">{log.bedtime} → {log.wake_time}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <p className="text-lg font-bold text-indigo-600">{log.total_hours}h</p>
                      </div>
                      <Badge className={cn("capitalize", getQualityColor(log.quality))}>
                        {log.quality}
                      </Badge>
                      {log.morning_glucose && (
                        <div className="text-right">
                          <p className="text-sm font-medium text-slate-700">{log.morning_glucose}</p>
                          <p className="text-xs text-slate-400">mg/dL</p>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}