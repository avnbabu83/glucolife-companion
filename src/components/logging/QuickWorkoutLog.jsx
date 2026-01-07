import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dumbbell, Plus } from 'lucide-react';
import moment from 'moment';

export default function QuickWorkoutLog({ onSubmit }) {
  const [workoutName, setWorkoutName] = useState('');
  const [exerciseType, setExerciseType] = useState('walking');
  const [duration, setDuration] = useState('');
  const [howFelt, setHowFelt] = useState('good');
  const [notes, setNotes] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit({
      exercise_name: workoutName,
      date: moment().format('YYYY-MM-DD'),
      actual_duration: duration ? parseInt(duration) : 0,
      status: 'completed',
      how_felt: howFelt,
      notes
    });
    setWorkoutName('');
    setDuration('');
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
            <Label className="text-sm text-slate-600">Workout *</Label>
            <Input
              value={workoutName}
              onChange={(e) => setWorkoutName(e.target.value)}
              placeholder="e.g., Morning walk, Yoga session"
              className="mt-1"
              required
            />
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
                  <SelectItem value="cycling">Cycling</SelectItem>
                  <SelectItem value="swimming">Swimming</SelectItem>
                  <SelectItem value="yoga">Yoga</SelectItem>
                  <SelectItem value="strength_training">Strength</SelectItem>
                  <SelectItem value="hiit">HIIT</SelectItem>
                  <SelectItem value="stretching">Stretching</SelectItem>
                  <SelectItem value="dance">Dance</SelectItem>
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