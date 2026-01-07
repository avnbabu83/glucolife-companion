import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Moon, Save } from 'lucide-react';
import moment from 'moment';

export default function SleepLogger({ onSubmit, lastSleepLog }) {
  const [bedtime, setBedtime] = useState('22:00');
  const [wakeTime, setWakeTime] = useState('06:00');
  const [quality, setQuality] = useState('good');
  const [interruptions, setInterruptions] = useState(0);
  const [morningGlucose, setMorningGlucose] = useState('');
  const [bedtimeGlucose, setBedtimeGlucose] = useState('');
  const [notes, setNotes] = useState('');

  const calculateHours = () => {
    const bed = moment(bedtime, 'HH:mm');
    let wake = moment(wakeTime, 'HH:mm');
    if (wake.isBefore(bed)) {
      wake.add(1, 'day');
    }
    return wake.diff(bed, 'hours', true).toFixed(1);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit({
      date: moment().format('YYYY-MM-DD'),
      bedtime,
      wake_time: wakeTime,
      total_hours: parseFloat(calculateHours()),
      quality,
      interruptions: parseInt(interruptions),
      morning_glucose: morningGlucose ? parseFloat(morningGlucose) : null,
      bedtime_glucose: bedtimeGlucose ? parseFloat(bedtimeGlucose) : null,
      notes
    });
  };

  const qualityColors = {
    excellent: 'text-emerald-600',
    good: 'text-blue-600',
    fair: 'text-amber-600',
    poor: 'text-rose-600'
  };

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg font-semibold flex items-center gap-2">
          <Moon className="w-5 h-5 text-indigo-500" />
          Log Sleep
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-sm text-slate-600">Bedtime</Label>
              <Input
                type="time"
                value={bedtime}
                onChange={(e) => setBedtime(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-sm text-slate-600">Wake Time</Label>
              <Input
                type="time"
                value={wakeTime}
                onChange={(e) => setWakeTime(e.target.value)}
                className="mt-1"
              />
            </div>
          </div>
          
          <div className="p-4 bg-indigo-50 rounded-xl text-center">
            <p className="text-3xl font-bold text-indigo-600">{calculateHours()}</p>
            <p className="text-sm text-indigo-500">hours of sleep</p>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-sm text-slate-600">Sleep Quality</Label>
              <Select value={quality} onValueChange={setQuality}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="excellent">😴 Excellent</SelectItem>
                  <SelectItem value="good">🙂 Good</SelectItem>
                  <SelectItem value="fair">😐 Fair</SelectItem>
                  <SelectItem value="poor">😫 Poor</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-sm text-slate-600">Wake-ups</Label>
              <Input
                type="number"
                min="0"
                value={interruptions}
                onChange={(e) => setInterruptions(e.target.value)}
                className="mt-1"
              />
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-sm text-slate-600">Bedtime Glucose</Label>
              <Input
                type="number"
                value={bedtimeGlucose}
                onChange={(e) => setBedtimeGlucose(e.target.value)}
                placeholder="mg/dL"
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-sm text-slate-600">Morning Glucose</Label>
              <Input
                type="number"
                value={morningGlucose}
                onChange={(e) => setMorningGlucose(e.target.value)}
                placeholder="mg/dL"
                className="mt-1"
              />
            </div>
          </div>
          
          <div>
            <Label className="text-sm text-slate-600">Notes</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="How did you sleep?"
              className="mt-1 h-20"
            />
          </div>
          
          <Button type="submit" className="w-full bg-indigo-600 hover:bg-indigo-700">
            <Save className="w-4 h-4 mr-2" />
            Save Sleep Log
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}