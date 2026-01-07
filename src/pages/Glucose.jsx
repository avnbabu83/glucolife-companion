import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import moment from 'moment';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { 
  Activity, 
  TrendingUp, 
  TrendingDown, 
  Minus,
  CalendarDays,
  BarChart3
} from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Area, ComposedChart, BarChart, Bar } from 'recharts';

import GlucoseEntryForm from '@/components/glucose/GlucoseEntryForm';
import CGMIntegration from '@/components/cgm/CGMIntegration';

export default function Glucose() {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const queryClient = useQueryClient();
  const dateStr = moment(selectedDate).format('YYYY-MM-DD');

  const { data: profile } = useQuery({
    queryKey: ['userProfile'],
    queryFn: () => base44.entities.UserProfile.list(),
  });

  const { data: readings = [] } = useQuery({
    queryKey: ['glucoseReadings', dateStr],
    queryFn: () => base44.entities.GlucoseReading.filter({ date: dateStr }),
  });

  const { data: weekReadings = [] } = useQuery({
    queryKey: ['weekGlucose'],
    queryFn: async () => {
      const allReadings = await base44.entities.GlucoseReading.list('-created_date', 100);
      return allReadings.filter(r => 
        moment(r.date).isAfter(moment().subtract(7, 'days'))
      );
    },
  });

  const createReadingMutation = useMutation({
    mutationFn: (data) => base44.entities.GlucoseReading.create(data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['glucoseReadings'] }),
  });

  const updateProfileMutation = useMutation({
    mutationFn: async (cgmDevice) => {
      const existingProfile = profile?.[0];
      if (existingProfile) {
        return base44.entities.UserProfile.update(existingProfile.id, { cgm_device: cgmDevice });
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['userProfile'] }),
  });

  const userProfile = profile?.[0];
  const targetMin = userProfile?.target_glucose_min || 70;
  const targetMax = userProfile?.target_glucose_max || 140;

  const sortedReadings = [...readings].sort((a, b) => 
    moment(b.reading_time, 'HH:mm').diff(moment(a.reading_time, 'HH:mm'))
  );

  const chartData = [...readings]
    .sort((a, b) => moment(a.reading_time, 'HH:mm').diff(moment(b.reading_time, 'HH:mm')))
    .map(r => ({
      time: r.reading_time,
      glucose: r.reading,
      context: r.context
    }));

  // Calculate stats
  const stats = {
    average: readings.length > 0 
      ? Math.round(readings.reduce((sum, r) => sum + r.reading, 0) / readings.length)
      : null,
    min: readings.length > 0 ? Math.min(...readings.map(r => r.reading)) : null,
    max: readings.length > 0 ? Math.max(...readings.map(r => r.reading)) : null,
    inRange: readings.filter(r => r.reading >= targetMin && r.reading <= targetMax).length,
    total: readings.length
  };

  // Weekly averages for bar chart
  const weeklyData = [];
  for (let i = 6; i >= 0; i--) {
    const day = moment().subtract(i, 'days');
    const dayReadings = weekReadings.filter(r => moment(r.date).isSame(day, 'day'));
    const avg = dayReadings.length > 0 
      ? Math.round(dayReadings.reduce((sum, r) => sum + r.reading, 0) / dayReadings.length)
      : null;
    weeklyData.push({
      day: day.format('ddd'),
      average: avg,
      readings: dayReadings.length
    });
  }

  const getTrendIcon = (trend) => {
    switch (trend) {
      case 'rising_fast':
      case 'rising': return <TrendingUp className="w-4 h-4 text-rose-500" />;
      case 'falling_fast':
      case 'falling': return <TrendingDown className="w-4 h-4 text-blue-500" />;
      default: return <Minus className="w-4 h-4 text-slate-400" />;
    }
  };

  const getReadingColor = (reading) => {
    if (reading < targetMin) return 'text-amber-600';
    if (reading > targetMax) return 'text-rose-600';
    return 'text-emerald-600';
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-slate-800">Glucose Tracking</h1>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline">
                <CalendarDays className="w-4 h-4 mr-2" />
                {moment(selectedDate).format('MMM D')}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={(date) => date && setSelectedDate(date)}
                initialFocus
              />
            </PopoverContent>
          </Popover>
        </div>

        <Tabs defaultValue="today" className="space-y-6">
          <TabsList className="bg-white shadow-sm">
            <TabsTrigger value="today">Today</TabsTrigger>
            <TabsTrigger value="week">Week</TabsTrigger>
            <TabsTrigger value="cgm">CGM</TabsTrigger>
          </TabsList>

          <TabsContent value="today" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Left Column - Chart and Stats */}
              <div className="lg:col-span-2 space-y-6">
                {/* Stats Cards */}
                <div className="grid grid-cols-4 gap-4">
                  <Card className="border-0 shadow-sm">
                    <CardContent className="p-4 text-center">
                      <p className="text-xs text-slate-500 uppercase">Average</p>
                      <p className={`text-2xl font-bold ${getReadingColor(stats.average)}`}>
                        {stats.average || '--'}
                      </p>
                    </CardContent>
                  </Card>
                  <Card className="border-0 shadow-sm">
                    <CardContent className="p-4 text-center">
                      <p className="text-xs text-slate-500 uppercase">Low</p>
                      <p className="text-2xl font-bold text-amber-600">{stats.min || '--'}</p>
                    </CardContent>
                  </Card>
                  <Card className="border-0 shadow-sm">
                    <CardContent className="p-4 text-center">
                      <p className="text-xs text-slate-500 uppercase">High</p>
                      <p className="text-2xl font-bold text-rose-600">{stats.max || '--'}</p>
                    </CardContent>
                  </Card>
                  <Card className="border-0 shadow-sm">
                    <CardContent className="p-4 text-center">
                      <p className="text-xs text-slate-500 uppercase">In Range</p>
                      <p className="text-2xl font-bold text-emerald-600">
                        {stats.total > 0 ? Math.round((stats.inRange / stats.total) * 100) : '--'}%
                      </p>
                    </CardContent>
                  </Card>
                </div>

                {/* Chart */}
                <Card className="border-0 shadow-sm">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Activity className="w-5 h-5 text-emerald-500" />
                      Glucose Trend
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {chartData.length === 0 ? (
                      <div className="h-[250px] flex items-center justify-center text-slate-400">
                        No readings for this day
                      </div>
                    ) : (
                      <div className="h-[250px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                            <defs>
                              <linearGradient id="glucoseGradient2" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#10b981" stopOpacity={0.2}/>
                                <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                              </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                            <XAxis dataKey="time" tick={{ fontSize: 11, fill: '#94a3b8' }} />
                            <YAxis domain={[40, 250]} tick={{ fontSize: 11, fill: '#94a3b8' }} />
                            <Tooltip />
                            <ReferenceLine y={targetMin} stroke="#fbbf24" strokeDasharray="5 5" />
                            <ReferenceLine y={targetMax} stroke="#fbbf24" strokeDasharray="5 5" />
                            <Area type="monotone" dataKey="glucose" fill="url(#glucoseGradient2)" stroke="none" />
                            <Line type="monotone" dataKey="glucose" stroke="#10b981" strokeWidth={2.5} dot={{ fill: '#10b981', r: 4 }} />
                          </ComposedChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Readings List */}
                <Card className="border-0 shadow-sm">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg">Today's Readings</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {sortedReadings.length === 0 ? (
                      <p className="text-sm text-slate-500 text-center py-4">No readings yet today</p>
                    ) : (
                      <div className="space-y-2">
                        {sortedReadings.map((reading) => (
                          <div key={reading.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
                            <div className="flex items-center gap-3">
                              <span className={`text-xl font-bold ${getReadingColor(reading.reading)}`}>
                                {reading.reading}
                              </span>
                              <span className="text-sm text-slate-500">mg/dL</span>
                              {getTrendIcon(reading.trend)}
                            </div>
                            <div className="text-right">
                              <p className="font-medium text-slate-700">{reading.reading_time}</p>
                              <Badge variant="outline" className="text-xs capitalize">
                                {reading.context?.replace('_', ' ') || 'random'}
                              </Badge>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Right Column - Entry Form */}
              <div>
                <GlucoseEntryForm 
                  onSubmit={(data) => createReadingMutation.mutate(data)}
                  cgmDevice={userProfile?.cgm_device}
                />
              </div>
            </div>
          </TabsContent>

          <TabsContent value="week" className="space-y-6">
            <Card className="border-0 shadow-sm">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <BarChart3 className="w-5 h-5 text-violet-500" />
                  7-Day Average
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={weeklyData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis dataKey="day" tick={{ fontSize: 12, fill: '#94a3b8' }} />
                      <YAxis domain={[0, 200]} tick={{ fontSize: 11, fill: '#94a3b8' }} />
                      <Tooltip />
                      <ReferenceLine y={targetMin} stroke="#fbbf24" strokeDasharray="5 5" />
                      <ReferenceLine y={targetMax} stroke="#fbbf24" strokeDasharray="5 5" />
                      <Bar dataKey="average" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="cgm">
            <CGMIntegration 
              currentDevice={userProfile?.cgm_device}
              onDeviceChange={(device) => updateProfileMutation.mutate(device)}
              latestReadings={sortedReadings.slice(0, 5)}
            />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}