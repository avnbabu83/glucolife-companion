import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Smile, Meh, Frown, HeartPulse } from 'lucide-react';
import { cn } from "@/lib/utils";
import moment from 'moment';

const stressLevels = [
  { level: 1, emoji: '😊', label: 'Very Low', icon: Smile, color: 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200' },
  { level: 2, emoji: '🙂', label: 'Low', icon: Smile, color: 'bg-green-100 text-green-700 hover:bg-green-200' },
  { level: 3, emoji: '😐', label: 'Moderate', icon: Meh, color: 'bg-yellow-100 text-yellow-700 hover:bg-yellow-200' },
  { level: 4, emoji: '😟', label: 'High', icon: Frown, color: 'bg-orange-100 text-orange-700 hover:bg-orange-200' },
  { level: 5, emoji: '😰', label: 'Very High', icon: Frown, color: 'bg-red-100 text-red-700 hover:bg-red-200' }
];

export default function DailyStressLogger({ onSubmit, onDismiss }) {
  const [selectedLevel, setSelectedLevel] = useState(null);
  const [notes, setNotes] = useState('');

  const handleSubmit = () => {
    if (selectedLevel === null) return;
    
    onSubmit({
      date: moment().format('YYYY-MM-DD'),
      stress_level: selectedLevel,
      notes: notes.trim() || undefined
    });
  };

  return (
    <Card className="border-2 border-rose-200 shadow-lg bg-gradient-to-br from-rose-50 to-pink-50">
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <HeartPulse className="w-5 h-5 text-rose-600" />
          How was your day today?
        </CardTitle>
        <p className="text-sm text-slate-600 mt-1">
          Track your stress levels to understand their impact on your glucose
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-5 gap-2">
          {stressLevels.map((stress) => (
            <button
              key={stress.level}
              onClick={() => setSelectedLevel(stress.level)}
              className={cn(
                "flex flex-col items-center p-3 rounded-xl transition-all border-2",
                selectedLevel === stress.level 
                  ? "border-rose-500 ring-2 ring-rose-200" 
                  : "border-transparent",
                stress.color
              )}
            >
              <span className="text-3xl mb-1">{stress.emoji}</span>
              <span className="text-xs font-medium">{stress.label}</span>
            </button>
          ))}
        </div>

        {selectedLevel !== null && (
          <div className="space-y-2">
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional: What contributed to your stress today? (e.g., work deadline, lack of sleep, family issues)"
              className="h-20 bg-white"
            />
          </div>
        )}

        <div className="flex gap-2">
          <Button 
            onClick={handleSubmit}
            disabled={selectedLevel === null}
            className="flex-1 bg-rose-600 hover:bg-rose-700"
          >
            Save
          </Button>
          {onDismiss && (
            <Button 
              onClick={onDismiss}
              variant="outline"
              className="flex-1"
            >
              Skip Today
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}