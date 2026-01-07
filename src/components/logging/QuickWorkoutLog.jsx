import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dumbbell, Plus, Sparkles } from 'lucide-react';
import { toast } from "sonner";
import moment from 'moment';

export default function QuickWorkoutLog({ onSubmit }) {
  const [workoutName, setWorkoutName] = useState('');
  const [exerciseType, setExerciseType] = useState('walking');
  const [duration, setDuration] = useState('');
  const [caloriesBurned, setCaloriesBurned] = useState('');
  const [howFelt, setHowFelt] = useState('good');
  const [notes, setNotes] = useState('');
  const [generating, setGenerating] = useState(false);

  const generateWorkoutDetails = async () => {
    if (!workoutName.trim()) {
      toast.error('Please describe your workout first');
      return;
    }

    setGenerating(true);
    try {
      const result = await base44.integrations.Core.InvokeLLM({
        prompt: `Analyze the following workout description and provide realistic estimates: "${workoutName}"
        
        Consider typical durations and calorie burn for this activity. If the description includes duration, use that. Otherwise suggest a typical duration.`,
        response_json_schema: {
          type: "object",
          properties: {
            exercise_type: { 
              type: "string",
              enum: ["walking", "jogging", "running", "cycling", "swimming", "yoga", "pilates", "strength_training", "weight_lifting", "hiit", "stretching", "dance", "aerobics", "tennis", "badminton", "basketball", "football", "golf", "rowing", "elliptical", "stair_climbing", "boxing", "martial_arts", "gym_workout", "other"]
            },
            duration_minutes: { type: "number" },
            calories_burned: { type: "number" },
            intensity: { type: "string", enum: ["low", "moderate", "high"] }
          }
        }
      });

      if (result.exercise_type) setExerciseType(result.exercise_type);
      if (result.duration_minutes) setDuration(result.duration_minutes.toString());
      if (result.calories_burned) setCaloriesBurned(result.calories_burned.toString());
      toast.success('Workout details generated!');
    } catch (error) {
      toast.error('Failed to generate workout details');
    } finally {
      setGenerating(false);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit({
      exercise_name: workoutName,
      date: moment().format('YYYY-DD-DD'),
      actual_duration: duration ? parseInt(duration) : 0,
      status: 'completed',
      how_felt: howFelt,
      notes: notes + (caloriesBurned ? `\nCalories burned: ${caloriesBurned}` : '')
    });
    setWorkoutName('');
    setDuration('');
    setCaloriesBurned('');
    setNotes('');
  };

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg font-semibold flex items-center gap-2">
          <Dumbbell className="w-5 h-5 text-violet-500" />
          Quick Workout Log
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label className="text-sm text-slate-600">What did you do? *</Label>
            <div className="flex gap-2 mt-1">
              <Input
                value={workoutName}
                onChange={(e) => setWorkoutName(e.target.value)}
                placeholder="e.g., 30 min tennis, gym workout, morning jog"
                className="flex-1"
                required
              />
              <Button 
                type="button" 
                variant="outline"
                onClick={generateWorkoutDetails}
                disabled={generating || !workoutName.trim()}
              >
                {generating ? (
                  <Sparkles className="w-4 h-4 animate-pulse" />
                ) : (
                  <Sparkles className="w-4 h-4" />
                )}
              </Button>
            </div>
            <p className="text-xs text-slate-500 mt-1">Click ✨ to auto-generate details</p>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-sm text-slate-600">Type</Label>
              <Select value={exerciseType} onValueChange={setExerciseType}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="walking">Walking</SelectItem>
                  <SelectItem value="jogging">Jogging</SelectItem>
                  <SelectItem value="running">Running</SelectItem>
                  <SelectItem value="cycling">Cycling</SelectItem>
                  <SelectItem value="swimming">Swimming</SelectItem>
                  <SelectItem value="yoga">Yoga</SelectItem>
                  <SelectItem value="pilates">Pilates</SelectItem>
                  <SelectItem value="strength_training">Strength Training</SelectItem>
                  <SelectItem value="weight_lifting">Weight Lifting</SelectItem>
                  <SelectItem value="gym_workout">Gym Workout</SelectItem>
                  <SelectItem value="hiit">HIIT</SelectItem>
                  <SelectItem value="stretching">Stretching</SelectItem>
                  <SelectItem value="dance">Dance</SelectItem>
                  <SelectItem value="aerobics">Aerobics</SelectItem>
                  <SelectItem value="tennis">Tennis</SelectItem>
                  <SelectItem value="badminton">Badminton</SelectItem>
                  <SelectItem value="basketball">Basketball</SelectItem>
                  <SelectItem value="football">Football</SelectItem>
                  <SelectItem value="golf">Golf</SelectItem>
                  <SelectItem value="rowing">Rowing</SelectItem>
                  <SelectItem value="elliptical">Elliptical</SelectItem>
                  <SelectItem value="stair_climbing">Stair Climbing</SelectItem>
                  <SelectItem value="boxing">Boxing</SelectItem>
                  <SelectItem value="martial_arts">Martial Arts</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-sm text-slate-600">Minutes *</Label>
              <Input
                type="number"
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
                placeholder="30"
                className="mt-1"
                required
              />
            </div>
          </div>

          <div>
            <Label className="text-sm text-slate-600">Calories Burned (estimated)</Label>
            <Input
              type="number"
              value={caloriesBurned}
              onChange={(e) => setCaloriesBurned(e.target.value)}
              placeholder="Auto-filled by AI"
              className="mt-1"
            />
          </div>
          
          <div>
            <Label className="text-sm text-slate-600">How did you feel?</Label>
            <Select value={howFelt} onValueChange={setHowFelt}>
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="great">Great 💪</SelectItem>
                <SelectItem value="good">Good 👍</SelectItem>
                <SelectItem value="okay">Okay 😐</SelectItem>
                <SelectItem value="tired">Tired 😓</SelectItem>
                <SelectItem value="unwell">Unwell 🤒</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          <div>
            <Label className="text-sm text-slate-600">Notes (optional)</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="How you felt, glucose before/after, etc..."
              className="mt-1 h-20"
            />
          </div>
          
          <Button type="submit" className="w-full bg-violet-600 hover:bg-violet-700">
            <Plus className="w-4 h-4 mr-2" />
            Log Workout
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}