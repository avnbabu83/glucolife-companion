import React from 'react';
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Check, Clock, Flame, Wheat, Drumstick, Droplets, Trash2 } from 'lucide-react';
import { cn } from "@/lib/utils";

export default function MealCard({ meal, onComplete, onViewDetails, onDelete }) {
  const isFromAnalyzer = meal.source === 'lifestyle_analyzer';
  const mealTypeColors = {
    breakfast: 'bg-amber-50 text-amber-700 border-amber-200',
    morning_snack: 'bg-orange-50 text-orange-700 border-orange-200',
    lunch: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    afternoon_snack: 'bg-teal-50 text-teal-700 border-teal-200',
    dinner: 'bg-violet-50 text-violet-700 border-violet-200',
    evening_snack: 'bg-indigo-50 text-indigo-700 border-indigo-200'
  };

  const giColors = {
    low: 'bg-emerald-100 text-emerald-700',
    medium: 'bg-amber-100 text-amber-700',
    high: 'bg-rose-100 text-rose-700'
  };

  return (
    <Card 
      className={cn(
        "p-4 border-0 shadow-sm transition-all hover:shadow-md cursor-pointer",
        meal.is_completed && "opacity-60",
        isFromAnalyzer && "border-2 border-emerald-300 bg-emerald-50/30"
      )}
      onClick={() => onViewDetails?.(meal)}
    >
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Badge variant="outline" className={cn("text-xs", mealTypeColors[meal.meal_type])}>
              {meal.meal_type?.replace('_', ' ')}
            </Badge>
            {isFromAnalyzer && (
              <Badge className="bg-emerald-200 text-emerald-800 text-xs">
                From Analyzer
              </Badge>
            )}
          </div>
          <h3 className={cn(
            "font-semibold text-slate-800",
            meal.is_completed && "line-through"
          )}>
            {meal.meal_name}
          </h3>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-slate-500 flex items-center gap-1">
            <Clock className="w-3.5 h-3.5" />
            {meal.scheduled_time}
          </span>
        </div>
      </div>
      
      {meal.description && (
        <p className="text-sm text-slate-500 mb-3 line-clamp-2">{meal.description}</p>
      )}
      
      <div className="flex flex-wrap gap-2 mb-3">
        {meal.glycemic_index && (
          <Badge className={cn("text-xs", giColors[meal.glycemic_index])}>
            GI: {meal.glycemic_index}
          </Badge>
        )}
      </div>
      
      <div className="grid grid-cols-4 gap-2 text-center mb-4">
        <div className="p-2 rounded-lg bg-slate-50">
          <Flame className="w-3.5 h-3.5 text-orange-500 mx-auto mb-1" />
          <p className="text-xs font-semibold text-slate-700">{meal.calories || '--'}</p>
          <p className="text-[10px] text-slate-400">kcal</p>
        </div>
        <div className="p-2 rounded-lg bg-slate-50">
          <Wheat className="w-3.5 h-3.5 text-amber-500 mx-auto mb-1" />
          <p className="text-xs font-semibold text-slate-700">{meal.carbs || '--'}g</p>
          <p className="text-[10px] text-slate-400">carbs</p>
        </div>
        <div className="p-2 rounded-lg bg-slate-50">
          <Drumstick className="w-3.5 h-3.5 text-rose-500 mx-auto mb-1" />
          <p className="text-xs font-semibold text-slate-700">{meal.protein || '--'}g</p>
          <p className="text-[10px] text-slate-400">protein</p>
        </div>
        <div className="p-2 rounded-lg bg-slate-50">
          <Droplets className="w-3.5 h-3.5 text-blue-500 mx-auto mb-1" />
          <p className="text-xs font-semibold text-slate-700">{meal.fat || '--'}g</p>
          <p className="text-[10px] text-slate-400">fat</p>
        </div>
      </div>
      
      <div className="flex gap-2">
        <Button 
          size="sm" 
          variant={meal.is_completed ? "outline" : "default"}
          className={cn(
            "flex-1",
            !meal.is_completed && "bg-emerald-600 hover:bg-emerald-700"
          )}
          onClick={(e) => {
            e.stopPropagation();
            onComplete?.(meal);
          }}
        >
          <Check className="w-4 h-4 mr-1" />
          {meal.is_completed ? 'Completed' : 'Mark Complete'}
        </Button>
        {onDelete && (
          <Button 
            size="sm" 
            variant="ghost"
            className="text-rose-600 hover:text-rose-700 hover:bg-rose-50"
            onClick={(e) => {
              e.stopPropagation();
              if (confirm('Delete this meal entry?')) {
                onDelete(meal);
              }
            }}
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        )}
      </div>
    </Card>
  );
}