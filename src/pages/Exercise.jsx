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
  Smartphone
} from 'lucide-react';
import { cn } from "@/lib/utils";

import ExerciseCard from '@/components/exercise/ExerciseCard';

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
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['exercises'] }),
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

  const generateExercisePlan = async () => {
    setGenerating(true);
    try {
      const result = await base44.integrations.Core.InvokeLLM({
        prompt: `Create a diabetes-friendly weekly exercise plan for someone with:
        - Diabetes Type: ${userProfile?.diabetes_type || 'type2'}
        - Activity Level: ${userProfile?.activity_level || 'moderately_active'}
        - Age: ${userProfile?.age || 'adult'}
        
        Provide 5-7 exercises suitable for diabetics, with variety across the week.
        Include precautions for blood sugar management during exercise.
        Consider exercises that help with insulin sensitivity.`,
        response_json_schema: {
          type: "object",
          properties: {
            exercises: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  exercise_type: { type: "string" },
                  duration_minutes: { type: "number" },
                  intensity: { type: "string" },
                  scheduled_days: { type: "array", items: { type: "string" } },
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
        const exercisesToCreate = result.exercises.map(e => ({
          ...e,
          is_active: true
        }));
        bulkCreateExercisesMutation.mutate(exercisesToCreate);
      }
    } catch (error) {
      console.error('Error generating exercise plan:', error);
    } finally {
      setGenerating(false);
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

  const todaysExercises = exercises.filter(e => 
    e.is_active !== false && e.scheduled_days?.includes(currentDay)
  );

  const completedToday = todayLogs.filter(l => l.status === 'completed');
  const weeklyMinutes = weekLogs
    .filter(l => l.status === 'completed')
    .reduce((sum, l) => sum + (l.actual_duration || 0), 0);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="text-2xl font-bold text-slate-800">Exercise Plan</h1>
          <div className="flex gap-2 flex-wrap">
            <Button 
              variant="outline"
              onClick={() => setShowHealthDialog(true)}
            >
              <Smartphone className="w-4 h-4 mr-2" />
              Connect Health App
            </Button>
            <Button 
              variant="outline"
              onClick={generateExercisePlan}
              disabled={generating}
            >
              {generating ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4 mr-2" />
              )}
              AI Generate
            </Button>
            <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
              <DialogTrigger asChild>
                <Button className="bg-violet-600 hover:bg-violet-700">
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
                    <Input
                      value={newExercise.name}
                      onChange={(e) => setNewExercise(prev => ({ ...prev, name: e.target.value }))}
                      placeholder="e.g., Morning Walk"
                      className="mt-1"
                    />
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
        </div>

        <Tabs defaultValue="today" className="space-y-6">
          <TabsList className="bg-white shadow-sm">
            <TabsTrigger value="today">Today</TabsTrigger>
            <TabsTrigger value="week">Weekly Plan</TabsTrigger>
          </TabsList>

          <TabsContent value="today" className="space-y-6">
            {/* Stats */}
            <div className="grid grid-cols-3 gap-4">
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
              const dayExercises = exercises.filter(e => 
                e.is_active !== false && e.scheduled_days?.includes(day)
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