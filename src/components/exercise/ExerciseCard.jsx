import React from 'react';
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  Dumbbell, 
  Clock, 
  Flame, 
  Check, 
  AlertTriangle,
  Bike,
  Waves,
  Heart,
  Footprints,
  Music,
  Activity
} from 'lucide-react';
import { cn } from "@/lib/utils";

export default function ExerciseCard({ exercise, isCompleted, onComplete }) {
  const isFromAnalyzer = exercise.source === 'lifestyle_analyzer';
  const exerciseIcons = {
    walking: Footprints,
    jogging: Footprints,
    cycling: Bike,
    swimming: Waves,
    yoga: Activity,
    strength_training: Dumbbell,
    hiit: Heart,
    stretching: Activity,
    dance: Music,
    other: Dumbbell
  };

  const intensityColors = {
    low: 'bg-emerald-100 text-emerald-700',
    moderate: 'bg-amber-100 text-amber-700',
    high: 'bg-rose-100 text-rose-700'
  };

  const Icon = exerciseIcons[exercise.exercise_type] || Dumbbell;

  return (
    <Card className={cn(
      "p-4 border-0 shadow-sm transition-all hover:shadow-md",
      isCompleted && "opacity-60",
      isFromAnalyzer && "border-2 border-violet-300 bg-violet-50/30"
    )}>
      <div className="flex items-start gap-4">
        <div className={cn(
          "p-3 rounded-xl",
          isCompleted ? "bg-emerald-100" : "bg-violet-100"
        )}>
          <Icon className={cn(
            "w-6 h-6",
            isCompleted ? "text-emerald-600" : "text-violet-600"
          )} />
        </div>
        
        <div className="flex-1">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <h3 className={cn(
                  "font-semibold text-slate-800",
                  isCompleted && "line-through"
                )}>
                  {exercise.name}
                </h3>
                {isFromAnalyzer && (
                  <Badge className="bg-violet-200 text-violet-800 text-xs">
                    From Analyzer
                  </Badge>
                )}
              </div>
              <p className="text-sm text-slate-500 capitalize">
                {exercise.exercise_type?.replace('_', ' ')}
              </p>
            </div>
            <Badge className={cn("text-xs", intensityColors[exercise.intensity])}>
              {exercise.intensity}
            </Badge>
          </div>
          
          <div className="flex items-center gap-4 mt-3 text-sm text-slate-500">
            <span className="flex items-center gap-1">
              <Clock className="w-3.5 h-3.5" />
              {exercise.duration_minutes} min
            </span>
            {exercise.calories_burned && (
              <span className="flex items-center gap-1">
                <Flame className="w-3.5 h-3.5 text-orange-500" />
                {exercise.calories_burned} kcal
              </span>
            )}
            {exercise.scheduled_time && (
              <span className="flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" />
                {exercise.scheduled_time}
              </span>
            )}
          </div>
          
          {exercise.scheduled_days && exercise.scheduled_days.length > 0 && (
            <div className="flex gap-1 mt-3">
              {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => (
                <span
                  key={day}
                  className={cn(
                    "text-xs px-2 py-1 rounded-md",
                    exercise.scheduled_days.includes(day)
                      ? "bg-violet-100 text-violet-700"
                      : "bg-slate-100 text-slate-400"
                  )}
                >
                  {day}
                </span>
              ))}
            </div>
          )}
          
          {exercise.precautions && (
            <div className="mt-3 p-2 bg-amber-50 rounded-lg flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5" />
              <p className="text-xs text-amber-700">{exercise.precautions}</p>
            </div>
          )}
          
          <Button 
            size="sm" 
            className={cn(
              "mt-4 w-full",
              isCompleted 
                ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-100" 
                : "bg-violet-600 hover:bg-violet-700"
            )}
            onClick={() => onComplete?.(exercise)}
            disabled={isCompleted}
          >
            <Check className="w-4 h-4 mr-1" />
            {isCompleted ? 'Completed' : 'Mark Complete'}
          </Button>
        </div>
      </div>
    </Card>
  );
}