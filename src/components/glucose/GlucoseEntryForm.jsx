import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Activity, Plus } from 'lucide-react';
import moment from 'moment';

export default function GlucoseEntryForm({ onSubmit, cgmDevice }) {
  const [reading, setReading] = useState('');
  const [context, setContext] = useState('random');
  const [notes, setNotes] = useState('');
  const [trend, setTrend] = useState('stable');

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit({
      reading: parseFloat(reading),
      reading_time: moment().format('HH:mm'),
      date: moment().format('YYYY-MM-DD'),
      context,
      notes,
      trend,
      source: 'manual'
    });
    setReading('');
    setNotes('');
    setContext('random');
  };

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg font-semibold flex items-center gap-2">
          <Activity className="w-5 h-5 text-emerald-500" />
          Log Glucose Reading
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-sm text-slate-600">Reading (mg/dL)</Label>
              <Input
                type="number"
                value={reading}
                onChange={(e) => setReading(e.target.value)}
                placeholder="120"
                className="mt-1"
                required
              />
            </div>
            <div>
              <Label className="text-sm text-slate-600">Context</Label>
              <Select value={context} onValueChange={setContext}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="fasting">Fasting</SelectItem>
                  <SelectItem value="pre_meal">Before Meal</SelectItem>
                  <SelectItem value="post_meal">After Meal</SelectItem>
                  <SelectItem value="before_exercise">Before Exercise</SelectItem>
                  <SelectItem value="after_exercise">After Exercise</SelectItem>
                  <SelectItem value="bedtime">Bedtime</SelectItem>
                  <SelectItem value="random">Random</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          
          <div>
            <Label className="text-sm text-slate-600">Trend</Label>
            <Select value={trend} onValueChange={setTrend}>
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="rising_fast">Rising Fast ↑↑</SelectItem>
                <SelectItem value="rising">Rising ↑</SelectItem>
                <SelectItem value="stable">Stable →</SelectItem>
                <SelectItem value="falling">Falling ↓</SelectItem>
                <SelectItem value="falling_fast">Falling Fast ↓↓</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          <div>
            <Label className="text-sm text-slate-600">Notes (optional)</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any additional notes..."
              className="mt-1 h-20"
            />
          </div>
          
          <Button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-700">
            <Plus className="w-4 h-4 mr-2" />
            Log Reading
          </Button>
        </form>
        
        {cgmDevice && cgmDevice !== 'none' && (
          <div className="mt-4 p-3 bg-blue-50 rounded-lg">
            <p className="text-sm text-blue-700">
              📡 Connected to {cgmDevice.replace('_', ' ').toUpperCase()}. Readings will sync automatically.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}