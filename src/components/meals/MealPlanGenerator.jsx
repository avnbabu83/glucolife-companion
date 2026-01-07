import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sparkles, Loader2, Calendar } from 'lucide-react';
import { base44 } from '@/api/base44Client';

export default function MealPlanGenerator({ userProfile, onPlanGenerated }) {
  const [generating, setGenerating] = useState(false);
  const [days, setDays] = useState(7);
  const [calorieTarget, setCalorieTarget] = useState(1800);

  const generateMealPlan = async () => {
    setGenerating(true);
    try {
      const prompt = `Generate a ${days}-day diabetes-friendly meal plan for a person with the following profile:
      - Diabetes Type: ${userProfile?.diabetes_type || 'type2'}
      - Dietary Preference: ${userProfile?.dietary_preference || 'omnivore'}
      - Target Calories: ${calorieTarget} per day
      - Allergies: ${userProfile?.allergies?.join(', ') || 'None'}
      - Activity Level: ${userProfile?.activity_level || 'moderately_active'}
      
      For each meal, provide:
      - meal_type (breakfast, morning_snack, lunch, afternoon_snack, dinner, evening_snack)
      - meal_name
      - description
      - ingredients (array)
      - calories
      - carbs (in grams)
      - protein (in grams)
      - fat (in grams)
      - fiber (in grams)
      - glycemic_index (low, medium, or high)
      - scheduled_time (in HH:MM format)
      
      Focus on low glycemic index foods, balanced macros, and ${userProfile?.dietary_preference === 'indian_vegetarian' ? 'traditional Indian vegetarian dishes' : userProfile?.dietary_preference === 'vegetarian' ? 'vegetarian options' : userProfile?.dietary_preference === 'pescetarian' ? 'seafood and vegetarian options' : 'balanced options'}.`;

      const result = await base44.integrations.Core.InvokeLLM({
        prompt,
        response_json_schema: {
          type: "object",
          properties: {
            meal_plans: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  day: { type: "number" },
                  meals: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        meal_type: { type: "string" },
                        meal_name: { type: "string" },
                        description: { type: "string" },
                        ingredients: { type: "array", items: { type: "string" } },
                        calories: { type: "number" },
                        carbs: { type: "number" },
                        protein: { type: "number" },
                        fat: { type: "number" },
                        fiber: { type: "number" },
                        glycemic_index: { type: "string" },
                        scheduled_time: { type: "string" }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      });

      onPlanGenerated?.(result.meal_plans);
    } catch (error) {
      console.error('Error generating meal plan:', error);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <Card className="border-0 shadow-sm bg-gradient-to-br from-emerald-50 to-teal-50">
      <CardHeader>
        <CardTitle className="text-lg font-semibold flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-emerald-600" />
          AI Meal Plan Generator
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label className="text-sm text-slate-600">Days to Plan</Label>
            <Select value={days.toString()} onValueChange={(v) => setDays(parseInt(v))}>
              <SelectTrigger className="mt-1 bg-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">1 Day</SelectItem>
                <SelectItem value="3">3 Days</SelectItem>
                <SelectItem value="7">1 Week</SelectItem>
                <SelectItem value="14">2 Weeks</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-sm text-slate-600">Daily Calories</Label>
            <Input 
              type="number" 
              value={calorieTarget}
              onChange={(e) => setCalorieTarget(parseInt(e.target.value))}
              className="mt-1 bg-white"
            />
          </div>
        </div>
        
        <Button 
          className="w-full bg-emerald-600 hover:bg-emerald-700"
          onClick={generateMealPlan}
          disabled={generating}
        >
          {generating ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Generating Plan...
            </>
          ) : (
            <>
              <Calendar className="w-4 h-4 mr-2" />
              Generate {days}-Day Meal Plan
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}