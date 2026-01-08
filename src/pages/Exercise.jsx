import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import moment from 'moment';
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { 
  Dumbbell, 
  Plus, 
  Sparkles,
  Loader2,
  Calendar,
  Flame,
  Clock,
  AlertTriangle,
  Smartphone,
  Download,
  Trash2,
  FileText
} from 'lucide-react';
import { cn } from "@/lib/utils";
import { toast } from "sonner";

import ExerciseCard from '@/components/exercise/ExerciseCard';
import WearableIntegration from '@/components/wearables/WearableIntegration';

export default function Exercise() {
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [showHealthDialog, setShowHealthDialog] = useState(false);
  const [newExercise, setNewExercise] = useState({
    name: '',
    exercise_type: 'walking',
    duration_minutes: 30,
    intensity: 'moderate',
    scheduled_days: [],
    scheduled_time: '07:00',
    calories_burned: 0,
    notes: '',
    precautions: '',
    is_active: true
  });
  const queryClient = useQueryClient();
  const today = moment().format('YYYY-MM-DD');
  const currentDay = moment().format('ddd');

  const { data: profile } = useQuery({
    queryKey: ['userProfile'],
    queryFn: () => base44.entities.UserProfile.list(),
  });

  const { data: exercises = [] } = useQuery({
    queryKey: ['exercises'],
    queryFn: () => base44.entities.ExercisePlan.list(),
  });

  const { data: todayLogs = [] } = useQuery({
    queryKey: ['exerciseLogs', today],
    queryFn: () => base44.entities.ExerciseLog.filter({ date: today }),
  });

  const { data: weekLogs = [] } = useQuery({
    queryKey: ['weekExerciseLogs'],
    queryFn: async () => {
      const logs = await base44.entities.ExerciseLog.list('-date', 50);
      return logs.filter(l => moment(l.date).isAfter(moment().subtract(7, 'days')));
    },
  });

  const createExerciseMutation = useMutation({
    mutationFn: (data) => base44.entities.ExercisePlan.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['exercises'] });
      setShowAddDialog(false);
      resetForm();
    },
  });

  const createLogMutation = useMutation({
    mutationFn: (data) => base44.entities.ExerciseLog.create(data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['exerciseLogs'] }),
  });

  const bulkCreateExercisesMutation = useMutation({
    mutationFn: (data) => base44.entities.ExercisePlan.bulkCreate(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['exercises'] });
      toast.success('Exercise plan created successfully!');
    },
  });

  const updateProfileMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.UserProfile.update(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['userProfile'] }),
  });

  const deleteExerciseMutation = useMutation({
    mutationFn: (id) => base44.entities.ExercisePlan.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['exercises'] }),
  });

  const clearUnloggedMutation = useMutation({
    mutationFn: async () => {
      await Promise.all(exercises.map(e => base44.entities.ExercisePlan.delete(e.id)));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['exercises'] });
      toast.success('Cleared all exercises');
    },
  });

  const resetForm = () => {
    setNewExercise({
      name: '',
      exercise_type: 'walking',
      duration_minutes: 30,
      intensity: 'moderate',
      scheduled_days: [],
      scheduled_time: '07:00',
      calories_burned: 0,
      notes: '',
      precautions: '',
      is_active: true
    });
  };

  const userProfile = profile?.[0];

  const handleCompleteExercise = (exercise) => {
    createLogMutation.mutate({
      exercise_plan_id: exercise.id,
      exercise_name: exercise.name,
      date: today,
      actual_duration: exercise.duration_minutes,
      status: 'completed'
    });
  };

  const [previewExercises, setPreviewExercises] = useState(null);
  const [considerWeather, setConsiderWeather] = useState(false);
  const [weatherData, setWeatherData] = useState(null);

  const generateExercisePlan = async () => {
    setGenerating(true);
    try {
      let weatherInfo = '';
      if (considerWeather) {
        try {
          // Check location consent
          if (!userProfile?.consent_location) {
            toast.error('Please enable location consent in your profile settings');
            setConsiderWeather(false);
            return;
          }

          // Get user's actual location
          const position = await new Promise((resolve, reject) => {
            if (!navigator.geolocation) {
              reject(new Error('Geolocation not supported'));
              return;
            }
            navigator.geolocation.getCurrentPosition(resolve, reject, {
              timeout: 10000,
              enableHighAccuracy: true
            });
          });

          const { latitude, longitude } = position.coords;
          
          const weather = await base44.integrations.Core.InvokeLLM({
            prompt: `Get current weather for coordinates ${latitude}, ${longitude}. Return temperature in Fahrenheit, current conditions, and if it's suitable for outdoor exercise.`,
            add_context_from_internet: true,
            response_json_schema: {
              type: "object",
              properties: {
                temperature: { type: "number" },
                conditions: { type: "string" },
                suitable_for_outdoor: { type: "boolean" },
                recommendation: { type: "string" },
                location: { type: "string" }
              }
            }
          });
          setWeatherData(weather);
          weatherInfo = `\n\nCurrent Weather (${weather.location || 'Your Location'}):
          - Temperature: ${weather.temperature}°F
          - Conditions: ${weather.conditions}
          - Outdoor Exercise: ${weather.suitable_for_outdoor ? 'Suitable' : 'Not recommended'}
          - Weather Note: ${weather.recommendation}
          
          ${weather.suitable_for_outdoor ? 'Prioritize outdoor exercises.' : 'Focus on indoor exercises.'}`;
        } catch (error) {
          console.error('Weather fetch failed:', error);
          if (error.code === 1) {
            toast.error('Location permission denied. Please enable location access in your browser.');
          } else {
            toast.error('Failed to get weather data');
          }
          setConsiderWeather(false);
        }
      }

      const result = await base44.integrations.Core.InvokeLLM({
        prompt: `Create a diabetes-friendly weekly exercise plan for someone with:
        - Diabetes Type: ${userProfile?.diabetes_type || 'type2'}
        - Activity Level: ${userProfile?.activity_level || 'moderately_active'}
        - Age: ${userProfile?.age || 'adult'}${weatherInfo}
        
        Provide 5-7 exercises suitable for diabetics, with variety across the week.
        Focus on low-impact exercises like walking, swimming, yoga, cycling, and stretching.
        Include precautions for blood sugar management during exercise.
        Consider exercises that help with insulin sensitivity.
        Make exercises realistic and easy to follow.`,
        response_json_schema: {
          type: "object",
          properties: {
            exercises: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  exercise_type: { type: "string", enum: ["walking", "jogging", "cycling", "swimming", "yoga", "pilates", "strength_training", "stretching", "other"] },
                  duration_minutes: { type: "number" },
                  intensity: { type: "string", enum: ["low", "moderate", "high"] },
                  scheduled_days: { type: "array", items: { type: "string", enum: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] } },
                  scheduled_time: { type: "string" },
                  calories_burned: { type: "number" },
                  precautions: { type: "string" }
                }
              }
            }
          }
        }
      });

      if (result.exercises) {
        setPreviewExercises(result.exercises);
      }
    } catch (error) {
      console.error('Error generating exercise plan:', error);
    } finally {
      setGenerating(false);
    }
  };

  const [isAccepting, setIsAccepting] = useState(false);

  const acceptExercises = async () => {
    if (!previewExercises || isAccepting) return;
    
    setIsAccepting(true);
    try {
      // Delete existing exercises
      const existingIds = exercises.map(e => e.id);
      if (existingIds.length > 0) {
        await Promise.all(existingIds.map(id => base44.entities.ExercisePlan.delete(id)));
      }
      
      // Small delay to ensure deletions are processed
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Invalidate to refresh the list
      await queryClient.invalidateQueries({ queryKey: ['exercises'] });
      
      // Wait a bit more for the UI to reflect the deletion
      await new Promise(resolve => setTimeout(resolve, 200));
      
      // Create new exercises
      const exercisesToCreate = previewExercises.map(e => ({
        name: e.name,
        exercise_type: e.exercise_type,
        duration_minutes: e.duration_minutes,
        intensity: e.intensity,
        scheduled_days: e.scheduled_days || [],
        scheduled_time: e.scheduled_time || '07:00',
        calories_burned: e.calories_burned || 0,
        precautions: e.precautions || '',
        is_active: true
      }));
      
      // Use the mutation
      bulkCreateExercisesMutation.mutate(exercisesToCreate);
      setPreviewExercises(null);
    } catch (error) {
      console.error('Error accepting exercises:', error);
      toast.error('Failed to update exercise plan: ' + (error.message || 'Unknown error'));
    } finally {
      setIsAccepting(false);
    }
  };

  const toggleDay = (day) => {
    setNewExercise(prev => ({
      ...prev,
      scheduled_days: prev.scheduled_days.includes(day)
        ? prev.scheduled_days.filter(d => d !== day)
        : [...prev.scheduled_days, day]
    }));
  };

  const exportExercisePlanCSV = () => {
    const csvContent = [
      ['Exercise Name', 'Type', 'Duration (min)', 'Intensity', 'Days', 'Time', 'Calories', 'Precautions'],
      ...exercises.map(e => [
        e.name,
        e.exercise_type,
        e.duration_minutes,
        e.intensity,
        e.scheduled_days?.join('/') || '',
        e.scheduled_time,
        e.calories_burned || 0,
        e.precautions || ''
      ])
    ].map(row => row.join(',')).join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `exercise-plan-${moment().format('YYYY-MM-DD')}.csv`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    a.remove();
    toast.success('Exercise plan exported to CSV');
  };

  const exportExercisePlanPDF = async () => {
    try {
      const { jsPDF } = await import('jspdf');
      const doc = new jsPDF();

      // Title
      doc.setFontSize(20);
      doc.text('Exercise Plan Report', 20, 20);

      // Stats
      doc.setFontSize(10);
      doc.text(`Generated: ${moment().format('MMMM D, YYYY')}`, 20, 30);
      doc.text(`Total Exercises: ${exercises.length}`, 20, 37);
      doc.text(`Completed Today: ${completedToday.length}`, 20, 43);
      doc.text(`Weekly Minutes: ${weeklyMinutes}`, 20, 49);

      // Table headers
      doc.setFontSize(9);
      doc.text('Exercise', 20, 65);
      doc.text('Type', 80, 65);
      doc.text('Duration', 120, 65);
      doc.text('Days', 150, 65);

      // Exercises
      let y = 75;
      exercises.forEach((ex) => {
        if (y > 270) {
          doc.addPage();
          y = 20;
        }
        doc.setFontSize(8);
        doc.text(ex.name.substring(0, 30), 20, y);
        doc.text(ex.exercise_type.replace('_', ' '), 80, y);
        doc.text(`${ex.duration_minutes} min`, 120, y);
        doc.text(ex.scheduled_days?.join(', ').substring(0, 20) || '', 150, y);
        y += 7;
      });

      doc.save(`exercise-plan-${moment().format('YYYY-MM-DD')}.pdf`);
      toast.success('Report exported to PDF');
    } catch (error) {
      toast.error('Failed to export PDF');
    }
  };

  const todaysExercises = exercises.filter(e => {
    if (e.is_active === false || !e.scheduled_days) return false;
    // Handle both abbreviated (Mon, Tue) and full names (Monday, Tuesday)
    const dayMap = {
      'Mon': ['Mon', 'Monday'],
      'Tue': ['Tue', 'Tuesday'],
      'Wed': ['Wed', 'Wednesday'],
      'Thu': ['Thu', 'Thursday'],
      'Fri': ['Fri', 'Friday'],
      'Sat': ['Sat', 'Saturday'],
      'Sun': ['Sun', 'Sunday']
    };
    const matchingDays = dayMap[currentDay] || [currentDay];
    return e.scheduled_days.some(d => matchingDays.includes(d));
  });

  const completedToday = todayLogs.filter(l => l.status === 'completed');
  const weeklyMinutes = weekLogs
    .filter(l => l.status === 'completed')
    .reduce((sum, l) => sum + (l.actual_duration || 0), 0);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        {/* Header */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold text-slate-800">Exercise Plan</h1>
            {exercises.length > 0 && (
              <div className="flex gap-2">
                <Button 
                  variant="outline"
                  size="sm"
                  onClick={exportExercisePlanCSV}
                >
                  <FileText className="w-4 h-4" />
                </Button>
                <Button 
                  variant="outline"
                  size="sm"
                  onClick={exportExercisePlanPDF}
                >
                  <Download className="w-4 h-4" />
                </Button>
              </div>
            )}
          </div>

          <div className="flex gap-2 flex-wrap">
            <Button 
              variant="outline"
              onClick={() => setShowHealthDialog(true)}
              className="flex-1 sm:flex-none"
            >
              <Smartphone className="w-4 h-4 mr-2" />
              Health App
            </Button>
            <Button 
              variant="outline"
              onClick={generateExercisePlan}
              disabled={generating}
              className="flex-1 sm:flex-none"
            >
              {generating ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4 mr-2" />
              )}
              Generate
            </Button>
          </div>

          {exercises.length > 0 && (
            <Button 
              onClick={() => {
                if (confirm('Clear all exercises from your plan?')) {
                  clearUnloggedMutation.mutate();
                }
              }}
              variant="outline"
              size="sm"
              className="w-full"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Clear All Exercises
            </Button>
          )}

          <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
            <DialogTrigger asChild>
              <Button className="bg-violet-600 hover:bg-violet-700 w-full">
                <Plus className="w-4 h-4 mr-2" />
                Add Exercise
              </Button>
            </DialogTrigger>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle>Add Exercise</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label>Exercise Name *</Label>
                    <div className="flex gap-2 mt-1">
                      <Input
                        value={newExercise.name}
                        onChange={(e) => setNewExercise(prev => ({ ...prev, name: e.target.value }))}
                        placeholder="e.g., 30 min brisk walk or gym session"
                        className="flex-1"
                      />
                      <Button 
                        type="button" 
                        variant="outline"
                        onClick={async () => {
                          if (!newExercise.name.trim()) return;
                          setGenerating(true);
                          try {
                            const result = await base44.integrations.Core.InvokeLLM({
                              prompt: `Analyze this workout description and provide realistic estimates: "${newExercise.name}"`,
                              response_json_schema: {
                                type: "object",
                                properties: {
                                  exercise_type: { type: "string" },
                                  duration_minutes: { type: "number" },
                                  calories_burned: { type: "number" },
                                  intensity: { type: "string" }
                                }
                              }
                            });
                            setNewExercise(prev => ({
                              ...prev,
                              exercise_type: result.exercise_type || prev.exercise_type,
                              duration_minutes: result.duration_minutes || prev.duration_minutes,
                              calories_burned: result.calories_burned || prev.calories_burned,
                              intensity: result.intensity || prev.intensity
                            }));
                          } catch (error) {
                            console.error('AI generation failed:', error);
                          } finally {
                            setGenerating(false);
                          }
                        }}
                        disabled={generating || !newExercise.name.trim()}
                      >
                        {generating ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Sparkles className="w-4 h-4" />
                        )}
                      </Button>
                    </div>
                    <p className="text-xs text-slate-500 mt-1">Click ✨ to auto-generate workout details</p>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Type</Label>
                      <Select 
                        value={newExercise.exercise_type} 
                        onValueChange={(v) => setNewExercise(prev => ({ ...prev, exercise_type: v }))}
                      >
                        <SelectTrigger className="mt-1">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="walking">Walking</SelectItem>
                          <SelectItem value="jogging">Jogging</SelectItem>
                          <SelectItem value="cycling">Cycling</SelectItem>
                          <SelectItem value="swimming">Swimming</SelectItem>
                          <SelectItem value="yoga">Yoga</SelectItem>
                          <SelectItem value="strength_training">Strength Training</SelectItem>
                          <SelectItem value="hiit">HIIT</SelectItem>
                          <SelectItem value="stretching">Stretching</SelectItem>
                          <SelectItem value="dance">Dance</SelectItem>
                          <SelectItem value="other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Intensity</Label>
                      <Select 
                        value={newExercise.intensity} 
                        onValueChange={(v) => setNewExercise(prev => ({ ...prev, intensity: v }))}
                      >
                        <SelectTrigger className="mt-1">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="low">Low</SelectItem>
                          <SelectItem value="moderate">Moderate</SelectItem>
                          <SelectItem value="high">High</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Duration (min)</Label>
                      <Input
                        type="number"
                        value={newExercise.duration_minutes}
                        onChange={(e) => setNewExercise(prev => ({ ...prev, duration_minutes: parseInt(e.target.value) }))}
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label>Time</Label>
                      <Input
                        type="time"
                        value={newExercise.scheduled_time}
                        onChange={(e) => setNewExercise(prev => ({ ...prev, scheduled_time: e.target.value }))}
                        className="mt-1"
                      />
                    </div>
                  </div>
                  
                  <div>
                    <Label>Scheduled Days</Label>
                    <div className="grid grid-cols-7 gap-1.5 mt-2">
                      {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => (
                        <button
                          key={day}
                          type="button"
                          onClick={() => toggleDay(day)}
                          className={cn(
                            "px-2 py-1.5 rounded-lg text-xs font-medium transition-colors",
                            newExercise.scheduled_days.includes(day)
                              ? "bg-violet-600 text-white"
                              : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                          )}
                        >
                          {day}
                        </button>
                      ))}
                    </div>
                  </div>
                  
                  <div>
                    <Label>Diabetes Precautions</Label>
                    <Textarea
                      value={newExercise.precautions}
                      onChange={(e) => setNewExercise(prev => ({ ...prev, precautions: e.target.value }))}
                      placeholder="e.g., Check glucose before and after, keep snacks nearby"
                      className="mt-1 h-20"
                    />
                  </div>
                  
                  <Button 
                    className="w-full bg-violet-600 hover:bg-violet-700"
                    onClick={() => createExerciseMutation.mutate(newExercise)}
                    disabled={!newExercise.name}
                  >
                    Add Exercise
                  </Button>
                </div>
              </DialogContent>
          </Dialog>
        </div>

        {/* Weather Toggle */}
        <Card className="border-0 shadow-sm bg-blue-50">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-blue-800">Consider Local Weather</p>
                <p className="text-sm text-blue-600">Get exercise recommendations based on current weather conditions</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input 
                  type="checkbox" 
                  checked={considerWeather}
                  onChange={(e) => setConsiderWeather(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
              </label>
            </div>
          </CardContent>
        </Card>

        {/* Preview Generated Exercises */}
        {previewExercises && (
          <Card className="border-2 border-violet-500 shadow-lg">
            <CardHeader className="bg-violet-50">
              <CardTitle className="text-lg flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-violet-600" />
                Generated Exercise Plan
                {weatherData && (
                  <span className="text-xs font-normal text-violet-600 ml-auto">
                    🌤️ Weather considered
                  </span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 pt-6">
              {weatherData && (
                <div className="p-3 bg-blue-50 rounded-lg mb-3">
                  <p className="text-sm text-blue-800">
                    <strong>Current Weather:</strong> {weatherData.temperature}°F, {weatherData.conditions}
                  </p>
                  <p className="text-xs text-blue-600 mt-1">{weatherData.recommendation}</p>
                </div>
              )}
              {previewExercises.map((ex, idx) => (
                <div key={idx} className="p-4 bg-slate-50 rounded-xl">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <p className="font-semibold text-slate-800">{ex.name}</p>
                      <p className="text-sm text-slate-600 capitalize">{ex.exercise_type} • {ex.duration_minutes} min • {ex.intensity}</p>
                    </div>
                  </div>
                  <p className="text-xs text-slate-500 mb-2">Days: {ex.scheduled_days?.join(', ')}</p>
                  <p className="text-xs text-amber-700 bg-amber-50 p-2 rounded">⚠️ {ex.precautions}</p>
                </div>
              ))}
              <div className="space-y-2 pt-4">
                <Button 
                  onClick={acceptExercises} 
                  className="w-full bg-emerald-600 hover:bg-emerald-700"
                  disabled={isAccepting}
                >
                  {isAccepting ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Updating...
                    </>
                  ) : (
                    'Accept & Replace All'
                  )}
                </Button>
                <div className="flex gap-2">
                  <Button onClick={generateExercisePlan} variant="outline" className="flex-1" disabled={generating || isAccepting}>
                    {generating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
                    Generate New
                  </Button>
                  <Button onClick={() => setPreviewExercises(null)} variant="outline" className="flex-1" disabled={isAccepting}>
                    Cancel
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <Tabs defaultValue="today" className="space-y-6">
          <TabsList className="bg-white shadow-sm">
            <TabsTrigger value="today">Today</TabsTrigger>
            <TabsTrigger value="week">Weekly Plan</TabsTrigger>
            <TabsTrigger value="wearables">Wearables</TabsTrigger>
          </TabsList>

          <TabsContent value="wearables">
            <WearableIntegration 
              connectedDevice={userProfile?.wearable_device}
              onDeviceChange={(device) => {
                if (userProfile) {
                  updateProfileMutation.mutate({ 
                    id: userProfile.id, 
                    data: { wearable_device: device } 
                  });
                }
              }}
              latestData={{
                sleep_hours: userProfile?.last_sleep_hours,
                heart_rate: userProfile?.last_heart_rate,
                steps: userProfile?.last_steps,
                calories: userProfile?.last_calories
              }}
            />
          </TabsContent>

          <TabsContent value="today" className="space-y-6">
            {/* Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <Card className="border-0 shadow-sm bg-violet-50">
                <CardContent className="p-4 text-center">
                  <Dumbbell className="w-6 h-6 text-violet-600 mx-auto mb-2" />
                  <p className="text-2xl font-bold text-violet-600">{completedToday.length}/{todaysExercises.length}</p>
                  <p className="text-xs text-violet-500">Today's Exercises</p>
                </CardContent>
              </Card>
              <Card className="border-0 shadow-sm bg-orange-50">
                <CardContent className="p-4 text-center">
                  <Flame className="w-6 h-6 text-orange-600 mx-auto mb-2" />
                  <p className="text-2xl font-bold text-orange-600">
                    {completedToday.reduce((sum, l) => {
                      const ex = exercises.find(e => e.id === l.exercise_plan_id);
                      return sum + (ex?.calories_burned || 0);
                    }, 0)}
                  </p>
                  <p className="text-xs text-orange-500">Calories Burned</p>
                </CardContent>
              </Card>
              <Card className="border-0 shadow-sm bg-emerald-50">
                <CardContent className="p-4 text-center">
                  <Clock className="w-6 h-6 text-emerald-600 mx-auto mb-2" />
                  <p className="text-2xl font-bold text-emerald-600">{weeklyMinutes}</p>
                  <p className="text-xs text-emerald-500">Weekly Minutes</p>
                </CardContent>
              </Card>
            </div>

            {/* Today's Exercises */}
            <div className="space-y-4">
              <h2 className="font-semibold text-lg text-slate-700">
                {moment().format('dddd')}'s Workout
              </h2>
              {todaysExercises.length === 0 ? (
                <Card className="border-0 shadow-sm">
                  <CardContent className="py-12 text-center">
                    <Dumbbell className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                    <p className="text-slate-500 mb-4">No exercises scheduled for today</p>
                    <Button variant="outline" onClick={() => setShowAddDialog(true)}>
                      <Plus className="w-4 h-4 mr-2" />
                      Add Exercise
                    </Button>
                  </CardContent>
                </Card>
              ) : (
                todaysExercises.map(exercise => (
                  <ExerciseCard
                    key={exercise.id}
                    exercise={exercise}
                    isCompleted={completedToday.some(l => l.exercise_plan_id === exercise.id)}
                    onComplete={handleCompleteExercise}
                  />
                ))
              )}
            </div>

            {/* Diabetes Exercise Tips */}
            <Card className="border-0 shadow-sm bg-amber-50">
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5" />
                  <div>
                    <h4 className="font-semibold text-amber-800">Exercise Safety Tips</h4>
                    <ul className="text-sm text-amber-700 mt-2 space-y-1">
                      <li>• Check blood sugar before and after exercise</li>
                      <li>• Keep fast-acting glucose nearby</li>
                      <li>• Stay hydrated during workouts</li>
                      <li>• Avoid exercise if glucose is above 250 mg/dL with ketones</li>
                    </ul>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="week" className="space-y-4">
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => {
              // Handle both abbreviated (Mon, Tue) and full names (Monday, Tuesday)
              const dayMap = {
                'Mon': ['Mon', 'Monday'],
                'Tue': ['Tue', 'Tuesday'],
                'Wed': ['Wed', 'Wednesday'],
                'Thu': ['Thu', 'Thursday'],
                'Fri': ['Fri', 'Friday'],
                'Sat': ['Sat', 'Saturday'],
                'Sun': ['Sun', 'Sunday']
              };
              const matchingDays = dayMap[day] || [day];
              const dayExercises = exercises.filter(e => 
                e.is_active !== false && e.scheduled_days?.some(d => matchingDays.includes(d))
              );
              const isToday = day === currentDay;
              
              return (
                <Card key={day} className={cn(
                  "border-0 shadow-sm",
                  isToday && "ring-2 ring-violet-500"
                )}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Calendar className="w-5 h-5 text-slate-400" />
                      {day}
                      {isToday && <Badge className="bg-violet-600">Today</Badge>}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {dayExercises.length === 0 ? (
                      <p className="text-sm text-slate-500">Rest day</p>
                    ) : (
                      <div className="space-y-2">
                        {dayExercises.map(ex => (
                          <div key={ex.id} className="flex items-center justify-between p-2 bg-slate-50 rounded-lg">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-slate-700">{ex.name}</span>
                              <Badge variant="outline" className="text-xs capitalize">
                                {ex.exercise_type?.replace('_', ' ')}
                              </Badge>
                            </div>
                            <span className="text-sm text-slate-500">{ex.duration_minutes} min</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </TabsContent>
        </Tabs>

        {/* Apple Health Connection Dialog */}
        <Dialog open={showHealthDialog} onOpenChange={setShowHealthDialog}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Connect Apple Health</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="p-4 bg-blue-50 rounded-xl">
                <div className="flex items-start gap-3">
                  <Smartphone className="w-5 h-5 text-blue-600 mt-0.5" />
                  <div>
                    <p className="font-medium text-blue-800">Sync Your Workouts</p>
                    <p className="text-sm text-blue-600 mt-1">
                      Connect with Apple Health to automatically import your exercise data, 
                      calories burned, and activity minutes.
                    </p>
                  </div>
                </div>
              </div>
              
              <div className="p-4 bg-amber-50 rounded-xl">
                <p className="text-sm text-amber-700">
                  <strong>Note:</strong> This feature requires backend functions to be enabled. 
                  Currently, exercise data can be logged manually. Contact support to enable Apple Health integration.
                </p>
              </div>
              
              <Button className="w-full" variant="outline" onClick={() => setShowHealthDialog(false)}>
                Close
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}