import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import moment from 'moment';
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Activity, 
  TrendingUp, 
  TrendingDown, 
  Minus,
  RefreshCw,
  Clock,
  AlertCircle,
  CheckCircle,
  ArrowUp,
  ArrowDown,
  Bell,
  Plus
} from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Area, ComposedChart } from 'recharts';
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import GlucoseActionCard from '../components/cgm/GlucoseActionCard';
import QuickFoodLog from '../components/logging/QuickFoodLog';
import QuickWorkoutLog from '../components/logging/QuickWorkoutLog';
import GlucoseEntryForm from '../components/glucose/GlucoseEntryForm';

export default function CGMDashboard() {
  const [syncing, setSyncing] = useState(false);
  const queryClient = useQueryClient();

  const { data: profile } = useQuery({
    queryKey: ['userProfile'],
    queryFn: () => base44.entities.UserProfile.list(),
  });

  const { data: readings = [], refetch } = useQuery({
    queryKey: ['allGlucoseReadings'],
    queryFn: () => base44.entities.GlucoseReading.list('-created_date', 288), // 24h of readings every 5min
  });

  const createMealMutation = useMutation({
    mutationFn: (data) => base44.entities.MealPlan.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['meals'] });
      toast.success('Food logged');
    },
  });

  const createExerciseMutation = useMutation({
    mutationFn: (data) => base44.entities.ExerciseLog.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['exerciseLogs'] });
      toast.success('Workout logged');
    },
  });

  const createGlucoseMutation = useMutation({
    mutationFn: (data) => base44.entities.GlucoseReading.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['allGlucoseReadings'] });
      toast.success('Glucose reading logged');
    },
  });

  const userProfile = profile?.[0];
  const targetMin = userProfile?.target_glucose_min || 70;
  const targetMax = userProfile?.target_glucose_max || 140;
  const cgmConnected = userProfile?.cgm_device && userProfile.cgm_device !== 'none';

  // Filter last 24 hours based on actual reading time
  const last24h = readings.filter(r => {
    const readingTime = moment(r.date + ' ' + r.reading_time);
    return readingTime.isAfter(moment().subtract(24, 'hours'));
  });

  // Latest reading
  const latestReading = readings[0];

  // Check for data gaps
  const now = moment();
  const lastReadingTime = latestReading ? moment(latestReading.date + ' ' + latestReading.reading_time) : null;
  const hoursSinceLastReading = lastReadingTime ? now.diff(lastReadingTime, 'hours', true) : null;
  const hasRecentData = hoursSinceLastReading !== null && hoursSinceLastReading < 3;
  const dataGapHours = hoursSinceLastReading ? Math.round(hoursSinceLastReading) : null;

  // Calculate stats
  const stats = {
    current: latestReading?.reading || null,
    trend: latestReading?.trend || 'stable',
    average: last24h.length > 0 
      ? Math.round(last24h.reduce((sum, r) => sum + r.reading, 0) / last24h.length)
      : null,
    inRange: last24h.filter(r => r.reading >= targetMin && r.reading <= targetMax).length,
    high: last24h.filter(r => r.reading > targetMax).length,
    low: last24h.filter(r => r.reading < targetMin).length,
    total: last24h.length,
    timeInRange: last24h.length > 0 
      ? Math.round((last24h.filter(r => r.reading >= targetMin && r.reading <= targetMax).length / last24h.length) * 100)
      : 0,
    hasGaps: !hasRecentData || last24h.length < 12, // Less than 12 readings in 24h means big gaps
    gapHours: dataGapHours
  };

  // Chart data - use reading_time and date for accurate timestamps
  const chartData = last24h
    .sort((a, b) => moment(a.date + ' ' + a.reading_time).diff(moment(b.date + ' ' + b.reading_time)))
    .map(r => ({
      time: moment(r.date + ' ' + r.reading_time).format('HH:mm'),
      glucose: r.reading,
      trend: r.trend
    }));

  const getTrendIcon = (trend) => {
    switch (trend) {
      case 'rising_fast': return <ArrowUp className="w-5 h-5 text-rose-600" />;
      case 'rising': return <TrendingUp className="w-5 h-5 text-orange-500" />;
      case 'falling_fast': return <ArrowDown className="w-5 h-5 text-blue-600" />;
      case 'falling': return <TrendingDown className="w-5 h-5 text-blue-500" />;
      default: return <Minus className="w-5 h-5 text-slate-400" />;
    }
  };

  const getTrendText = (trend) => {
    const trendMap = {
      'rising_fast': 'Rising Fast',
      'rising': 'Rising',
      'stable': 'Stable',
      'falling': 'Falling',
      'falling_fast': 'Falling Fast'
    };
    return trendMap[trend] || 'Stable';
  };

  const getGlucoseColor = (reading) => {
    if (reading < targetMin) return 'text-amber-600';
    if (reading > targetMax) return 'text-rose-600';
    return 'text-emerald-600';
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      const response = await base44.functions.invoke('syncLibreData', {});
      if (response.data.success) {
        toast.success(`Synced ${response.data.synced} new readings`);
        refetch();
      } else {
        toast.error(response.data.error || 'Sync failed');
      }
    } catch (error) {
      toast.error('Failed to sync data');
    } finally {
      setSyncing(false);
    }
  };

  if (!cgmConnected) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
        <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold text-slate-800">Glucose Monitoring</h1>
          </div>

          <Card className="border-0 shadow-sm">
            <CardContent className="p-8 text-center">
              <Activity className="w-16 h-16 text-slate-300 mx-auto mb-4" />
              <h2 className="text-2xl font-bold text-slate-800 mb-2">No CGM Connected</h2>
              <p className="text-slate-500 mb-6">
                Connect your Freestyle Libre or Dexcom device to see real-time glucose monitoring, or log readings manually below
              </p>
              <Button onClick={() => window.location.href = '/Profile?tab=cgm'}>
                Connect CGM Device
              </Button>
            </CardContent>
          </Card>

          {/* Manual Glucose Entry */}
          <Card className="border-0 shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Plus className="w-5 h-5 text-emerald-600" />
                Manual Glucose Entry
              </CardTitle>
            </CardHeader>
            <CardContent>
              <GlucoseEntryForm onSubmit={(data) => createGlucoseMutation.mutate(data)} />
            </CardContent>
          </Card>

          {/* Recent Manual Readings */}
          {readings.length > 0 && (
            <Card className="border-0 shadow-sm">
              <CardHeader>
                <CardTitle className="text-lg">Recent Readings</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {readings.slice(0, 10).map((reading) => (
                    <div key={reading.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
                      <div className="flex items-center gap-3">
                        <span className={cn("text-xl font-bold", getGlucoseColor(reading.reading))}>
                          {reading.reading}
                        </span>
                        <span className="text-sm text-slate-500">mg/dL</span>
                        <Badge variant="outline" className="text-xs capitalize">
                          {reading.context?.replace('_', ' ') || reading.source}
                        </Badge>
                      </div>
                      <div className="text-right">
                        <p className="text-sm text-slate-600">{moment(reading.date + ' ' + reading.reading_time).format('MMM D, h:mm A')}</p>
                        <p className="text-xs text-slate-400">{moment(reading.date + ' ' + reading.reading_time).fromNow()}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">CGM Dashboard</h1>
            <p className="text-sm text-slate-500">Real-time glucose monitoring</p>
          </div>
          <Button onClick={handleSync} disabled={syncing} variant="outline">
            {syncing ? (
              <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4 mr-2" />
            )}
            Sync Now
          </Button>
        </div>

        {/* Action Recommendations */}
        <GlucoseActionCard 
          reading={latestReading?.reading}
          trend={latestReading?.trend}
          targetMin={targetMin}
          targetMax={targetMax}
        />

        {/* Current Reading - Big Card */}
        {latestReading && (() => {
          const reading = latestReading.reading;
          const isLow = reading < targetMin;
          const isHigh = reading > targetMax;
          const isCriticalLow = reading < targetMin - 20;
          const isCriticalHigh = reading > targetMax + 50;
          
          let gradientClass, textClass;
          if (isCriticalLow || isCriticalHigh) {
            gradientClass = "from-rose-600 to-red-600";
            textClass = "text-rose-100";
          } else if (isLow) {
            gradientClass = "from-amber-500 to-orange-500";
            textClass = "text-amber-100";
          } else if (isHigh) {
            gradientClass = "from-orange-500 to-rose-500";
            textClass = "text-orange-100";
          } else {
            gradientClass = "from-emerald-500 to-teal-500";
            textClass = "text-emerald-100";
          }
          
          return (
            <Card className={`border-0 shadow-lg bg-gradient-to-br ${gradientClass}`}>
              <CardContent className="p-8">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6">
                  <div className="text-center sm:text-left">
                  <p className={`${textClass} text-sm mb-2`}>Current Glucose</p>
                <div className="flex items-center justify-center sm:justify-start gap-4">
                  <div>
                    <span className="text-6xl font-bold text-white">
                      {latestReading.reading}
                    </span>
                    <span className="text-2xl text-emerald-100 ml-2">mg/dL</span>
                  </div>
                  <div className="text-white">
                    {getTrendIcon(latestReading.trend)}
                    <p className="text-sm mt-1">{getTrendText(latestReading.trend)}</p>
                  </div>
                </div>
                <p className={`${textClass} text-sm mt-2`}>
                  {moment(latestReading.date + ' ' + latestReading.reading_time).format('MMM D, h:mm A')}
                </p>
                </div>
                <div className="flex sm:flex-col gap-4 sm:gap-3 justify-center">
                  <div className="text-center px-4 py-3 bg-white/20 rounded-xl backdrop-blur-sm">
                    <p className={`text-xs ${textClass}`}>Target</p>
                    <p className="text-lg font-bold text-white">{targetMin}-{targetMax}</p>
                    <p className={`text-xs ${textClass}`}>mg/dL</p>
                  </div>
                  <div className="text-center px-4 py-3 bg-white/20 rounded-xl backdrop-blur-sm">
                    <p className={`text-xs ${textClass}`}>24h Avg</p>
                    <p className="text-lg font-bold text-white">{stats.average || '--'}</p>
                    <p className={`text-xs ${textClass}`}>mg/dL</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
          );
        })()}

        {/* Time in Range Stats */}
        <div className="grid grid-cols-4 gap-4">
          <Card className="border-0 shadow-sm">
            <CardContent className="p-4 text-center">
              <CheckCircle className="w-6 h-6 text-emerald-600 mx-auto mb-2" />
              <p className="text-2xl font-bold text-emerald-600">{stats.timeInRange}%</p>
              <p className="text-xs text-slate-500">In Range</p>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-sm">
            <CardContent className="p-4 text-center">
              <TrendingUp className="w-6 h-6 text-rose-600 mx-auto mb-2" />
              <p className="text-2xl font-bold text-rose-600">
                {stats.total > 0 ? Math.round((stats.high / stats.total) * 100) : 0}%
              </p>
              <p className="text-xs text-slate-500">High</p>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-sm">
            <CardContent className="p-4 text-center">
              <TrendingDown className="w-6 h-6 text-amber-600 mx-auto mb-2" />
              <p className="text-2xl font-bold text-amber-600">
                {stats.total > 0 ? Math.round((stats.low / stats.total) * 100) : 0}%
              </p>
              <p className="text-xs text-slate-500">Low</p>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-sm">
            <CardContent className="p-4 text-center">
              <Activity className="w-6 h-6 text-blue-600 mx-auto mb-2" />
              <p className="text-2xl font-bold text-blue-600">{stats.total}</p>
              <p className="text-xs text-slate-500">Readings</p>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="chart" className="space-y-6">
          <TabsList className="bg-white shadow-sm grid grid-cols-3 sm:grid-cols-5 w-full">
            <TabsTrigger value="chart">Chart</TabsTrigger>
            <TabsTrigger value="insights">Insights</TabsTrigger>
            <TabsTrigger value="manual">Manual</TabsTrigger>
            <TabsTrigger value="log">Log</TabsTrigger>
            <TabsTrigger value="reminders">Alerts</TabsTrigger>
          </TabsList>

          <TabsContent value="chart">
            {/* Glucose Chart */}
            <Card className="border-0 shadow-sm">
              <CardHeader>
                <CardTitle className="text-lg">24-Hour Glucose Trend</CardTitle>
              </CardHeader>
              <CardContent>
                {chartData.length === 0 ? (
                  <div className="h-[350px] flex items-center justify-center text-slate-400">
                    No readings in the last 24 hours
                  </div>
                ) : (
                  <div className="h-[350px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                        <defs>
                          <linearGradient id="glucoseGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                            <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                        <XAxis 
                          dataKey="time" 
                          tick={{ fontSize: 11, fill: '#94a3b8' }}
                          interval={Math.floor(chartData.length / 12)}
                        />
                        <YAxis domain={[40, 300]} tick={{ fontSize: 11, fill: '#94a3b8' }} />
                        <Tooltip />
                        <ReferenceLine y={targetMin} stroke="#fbbf24" strokeDasharray="5 5" label={{ value: 'Low', fontSize: 10 }} />
                        <ReferenceLine y={targetMax} stroke="#fbbf24" strokeDasharray="5 5" label={{ value: 'High', fontSize: 10 }} />
                        <Area type="monotone" dataKey="glucose" fill="url(#glucoseGradient)" stroke="none" />
                        <Line type="monotone" dataKey="glucose" stroke="#10b981" strokeWidth={2.5} dot={false} />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Recent Readings */}
            <Card className="border-0 shadow-sm">
              <CardHeader>
                <CardTitle className="text-lg">Recent Readings</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {readings.slice(0, 10).map((reading) => (
                    <div key={reading.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
                      <div className="flex items-center gap-3">
                        <span className={cn("text-xl font-bold", getGlucoseColor(reading.reading))}>
                          {reading.reading}
                        </span>
                        <span className="text-sm text-slate-500">mg/dL</span>
                        {getTrendIcon(reading.trend)}
                      </div>
                      <div className="text-right">
                        <p className="text-sm text-slate-600">{moment(reading.date + ' ' + reading.reading_time).format('MMM D, h:mm A')}</p>
                        <p className="text-xs text-slate-400">{moment(reading.date + ' ' + reading.reading_time).fromNow()}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="manual">
            <Card className="border-0 shadow-sm">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Plus className="w-5 h-5 text-emerald-600" />
                  Log Glucose Reading
                </CardTitle>
              </CardHeader>
              <CardContent>
                <GlucoseEntryForm onSubmit={(data) => createGlucoseMutation.mutate(data)} />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="log">
            <div className="grid md:grid-cols-2 gap-6">
              <QuickFoodLog onSubmit={(data) => createMealMutation.mutate(data)} />
              <QuickWorkoutLog onSubmit={(data) => createExerciseMutation.mutate(data)} />
            </div>
            <Card className="border-0 shadow-sm mt-6 bg-blue-50">
              <CardContent className="p-4">
                <p className="text-sm text-blue-800">
                  💡 <strong>Tip:</strong> Log your food and exercise to see how they affect your glucose levels. 
                  The AI will analyze patterns and provide personalized recommendations.
                </p>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="insights">
            <div className="grid gap-6">
              <Card className="border-0 shadow-sm">
                <CardHeader>
                  <CardTitle className="text-lg">Pattern Analysis</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Data Gap Warning */}
                  {stats.hasGaps && (
                    <div className="p-4 bg-orange-50 rounded-xl border-2 border-orange-200">
                      <div className="flex items-start gap-3">
                        <AlertCircle className="w-5 h-5 text-orange-600 mt-0.5" />
                        <div>
                          <h4 className="font-semibold text-orange-800">Limited Data Available</h4>
                          <p className="text-sm text-orange-700 mt-1">
                            {stats.gapHours && stats.gapHours > 3 ? (
                              <>No CGM data for the past {stats.gapHours} hours. Sync your device or log readings manually for accurate insights.</>
                            ) : (
                              <>Only {stats.total} readings in the last 24 hours. More frequent monitoring is recommended for better insights.</>
                            )}
                          </p>
                          {stats.total < 6 && (
                            <div className="mt-3 space-y-1 text-sm text-orange-700">
                              <p className="font-medium">To improve insights, please track:</p>
                              <ul className="list-disc ml-4 space-y-1">
                                <li>Fasting glucose (morning)</li>
                                <li>Pre-meal readings (before each meal)</li>
                                <li>Post-meal readings (2 hours after eating)</li>
                                <li>Bedtime glucose</li>
                              </ul>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Show insights only if we have sufficient data */}
                  {stats.total >= 6 ? (
                    <>
                      <div className="p-4 bg-emerald-50 rounded-xl">
                        <div className="flex items-start gap-3">
                          <CheckCircle className="w-5 h-5 text-emerald-600 mt-0.5" />
                          <div>
                            <h4 className="font-semibold text-emerald-800">
                              {stats.timeInRange >= 70 ? 'Excellent Control' : 'Good Progress'}
                            </h4>
                            <p className="text-sm text-emerald-700 mt-1">
                              You're spending {stats.timeInRange}% of time in target range 
                              {stats.hasGaps && ' (based on available data)'}. 
                              {stats.timeInRange >= 70 
                                ? ' Great job maintaining stable glucose levels!' 
                                : ' Keep monitoring and following your plan.'}
                            </p>
                          </div>
                        </div>
                      </div>

                      {stats.high > stats.total * 0.25 && (
                        <div className="p-4 bg-rose-50 rounded-xl">
                          <div className="flex items-start gap-3">
                            <AlertCircle className="w-5 h-5 text-rose-600 mt-0.5" />
                            <div>
                              <h4 className="font-semibold text-rose-800">High Readings Alert</h4>
                              <p className="text-sm text-rose-700 mt-1">
                                {Math.round((stats.high / stats.total) * 100)}% of readings are above target. 
                                Consider reviewing your meal plan and medication timing.
                              </p>
                            </div>
                          </div>
                        </div>
                      )}

                      {stats.low > stats.total * 0.1 && (
                        <div className="p-4 bg-amber-50 rounded-xl">
                          <div className="flex items-start gap-3">
                            <AlertCircle className="w-5 h-5 text-amber-600 mt-0.5" />
                            <div>
                              <h4 className="font-semibold text-amber-800">Low Readings Alert</h4>
                              <p className="text-sm text-amber-700 mt-1">
                                {Math.round((stats.low / stats.total) * 100)}% of readings are below target. 
                                Keep fast-acting glucose nearby and adjust medication as needed.
                              </p>
                            </div>
                          </div>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="p-4 bg-blue-50 rounded-xl">
                      <div className="flex items-start gap-3">
                        <AlertCircle className="w-5 h-5 text-blue-600 mt-0.5" />
                        <div>
                          <h4 className="font-semibold text-blue-800">Need More Data</h4>
                          <p className="text-sm text-blue-700 mt-1">
                            We need more glucose readings to provide personalized insights. 
                            Try to log at least 6-8 readings per day for meaningful patterns.
                          </p>
                          <Button 
                            size="sm" 
                            variant="outline" 
                            className="mt-3"
                            onClick={() => window.location.href = '/Glucose'}
                          >
                            Log Glucose Reading
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="reminders">
            <Card className="border-0 shadow-sm">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Bell className="w-5 h-5 text-blue-500" />
                  Push Notification Reminders
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="p-4 bg-blue-50 rounded-xl">
                  <h4 className="font-semibold text-blue-800 mb-2">📱 Set Up Reminders</h4>
                  <p className="text-sm text-blue-700 mb-3">
                    To enable push notifications on your iOS device:
                  </p>
                  <ol className="list-decimal ml-4 space-y-2 text-sm text-blue-700">
                    <li>Go to iOS Settings → DiabetEasy</li>
                    <li>Enable "Allow Notifications"</li>
                    <li>Enable "Time Sensitive Notifications" for critical alerts</li>
                    <li>Return to the app to set your reminder schedule</li>
                  </ol>
                </div>

                <div className="space-y-3">
                  <div className="p-4 bg-violet-50 rounded-xl">
                    <h4 className="font-semibold text-violet-800 flex items-center gap-2">
                      <Clock className="w-4 h-4" />
                      Medication Reminders
                    </h4>
                    <p className="text-sm text-violet-700 mt-2">
                      Set in Medications section. Get notified at your scheduled medication times.
                    </p>
                    <Button size="sm" variant="outline" className="mt-3" onClick={() => window.location.href = '/Medications'}>
                      Configure Medications
                    </Button>
                  </div>

                  <div className="p-4 bg-emerald-50 rounded-xl">
                    <h4 className="font-semibold text-emerald-800 flex items-center gap-2">
                      <Clock className="w-4 h-4" />
                      Meal Reminders
                    </h4>
                    <p className="text-sm text-emerald-700 mt-2">
                      Get reminders for scheduled meals based on your meal plan times.
                    </p>
                    <Button size="sm" variant="outline" className="mt-3" onClick={() => window.location.href = '/Meals'}>
                      View Meal Plan
                    </Button>
                  </div>

                  <div className="p-4 bg-orange-50 rounded-xl">
                    <h4 className="font-semibold text-orange-800 flex items-center gap-2">
                      <Clock className="w-4 h-4" />
                      Exercise Reminders
                    </h4>
                    <p className="text-sm text-orange-700 mt-2">
                      Get reminded when it's time for your scheduled workouts.
                    </p>
                    <Button size="sm" variant="outline" className="mt-3" onClick={() => window.location.href = '/Exercise'}>
                      View Exercise Plan
                    </Button>
                  </div>

                  <div className="p-4 bg-indigo-50 rounded-xl">
                    <h4 className="font-semibold text-indigo-800 flex items-center gap-2">
                      <Clock className="w-4 h-4" />
                      Sleep Reminders
                    </h4>
                    <p className="text-sm text-indigo-700 mt-2">
                      Get reminded at your target bedtime ({userProfile?.sleep_time || '22:00'}) to maintain healthy sleep.
                    </p>
                    <Button size="sm" variant="outline" className="mt-3" onClick={() => window.location.href = '/Sleep'}>
                      View Sleep Log
                    </Button>
                  </div>
                </div>

                <div className="p-4 bg-amber-50 rounded-xl">
                  <h4 className="font-semibold text-amber-800">🚨 Critical Alerts</h4>
                  <p className="text-sm text-amber-700 mt-2">
                    When CGM detects glucose levels outside your target range, you'll receive 
                    time-sensitive notifications to take immediate action.
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}