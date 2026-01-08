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
  const [previewMeals, setPreviewMeals] = useState(null);
  const [selectedDays, setSelectedDays] = useState(7);
  const [calorieTarget, setCalorieTarget] = useState(1800);

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const dietaryDetails = userProfile?.dietary_preference === 'indian_vegetarian'
        ? 'Indian vegetarian meals with dal, sabzi, roti, rice. Use spices like turmeric, cumin.'
        : userProfile?.dietary_preference === 'vegetarian'
        ? 'Vegetarian meals with variety of vegetables, legumes, whole grains.'
        : userProfile?.dietary_preference === 'vegan'
        ? 'Vegan meals with plant-based proteins, no dairy or eggs.'
        : userProfile?.dietary_preference === 'keto'
        ? 'Keto-friendly meals with high fat, very low carb, moderate protein.'
        : 'Balanced meals with lean proteins, whole grains, and vegetables.';

      const result = await base44.integrations.Core.InvokeLLM({
        prompt: `Generate a ${selectedDays}-day meal plan for someone with ${userProfile?.diabetes_type || 'type 2'} diabetes.
        
        Requirements:
        - Daily calorie target: ${calorieTarget} kcal
        - Dietary preference: ${userProfile?.dietary_preference || 'balanced'} (${dietaryDetails})
        - Focus on low glycemic index foods
        - 3 main meals + 2-3 snacks per day
        - Each meal should have detailed nutrition (calories, carbs, protein, fat, fiber)
        - Include specific meal times
        - Make meals realistic and easy to prepare
        
        Return exactly ${selectedDays} days of meal plans.`,
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
                        meal_type: { type: "string", enum: ["breakfast", "morning_snack", "lunch", "afternoon_snack", "dinner", "evening_snack"] },
                        scheduled_time: { type: "string" },
                        meal_name: { type: "string" },
                        description: { type: "string" },
                        ingredients: { type: "array", items: { type: "string" } },
                        calories: { type: "number" },
                        carbs: { type: "number" },
                        protein: { type: "number" },
                        fat: { type: "number" },
                        fiber: { type: "number" },
                        glycemic_index: { type: "string", enum: ["low", "medium", "high"] }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      });

      if (result.meal_plans) {
        setPreviewMeals(result.meal_plans);
      }
    } catch (error) {
      console.error('Error generating meal plan:', error);
    } finally {
      setGenerating(false);
    }
  };

  const acceptMealPlan = async () => {
    if (!previewMeals) return;
    onPlanGenerated(previewMeals);
    setPreviewMeals(null);
  };

  return (
    <Card className="border-0 shadow-sm bg-gradient-to-br from-emerald-50 to-teal-50">
      <CardHeader>
        <CardTitle className="text-lg font-semibold flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-emerald-600" />
          Meal Plan Generator
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label className="text-sm text-slate-600">Days to Plan</Label>
            <Select value={selectedDays.toString()} onValueChange={(v) => setSelectedDays(parseInt(v))}>
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
          onClick={handleGenerate}
          disabled={generating}
          className="w-full bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700"
        >
          {generating ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Generating...
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4 mr-2" />
              Generate Meal Plan
            </>
          )}
        </Button>

        {/* Preview Generated Meals */}
        {previewMeals && (
          <div className="mt-6 p-4 bg-emerald-50 rounded-xl border-2 border-emerald-500">
            <h4 className="font-semibold text-emerald-800 mb-4 flex items-center gap-2">
              <Sparkles className="w-5 h-5" />
              {selectedDays}-Day Meal Plan Preview
            </h4>
            <div className="space-y-4 max-h-96 overflow-y-auto">
              {previewMeals.map((day, dayIdx) => (
                <div key={dayIdx} className="bg-white p-3 rounded-lg">
                  <p className="font-semibold text-slate-700 mb-2">Day {day.day}</p>
                  <div className="space-y-2">
                    {day.meals.map((meal, mealIdx) => (
                      <div key={mealIdx} className="text-sm p-2 bg-slate-50 rounded">
                        <p className="font-medium text-slate-800">{meal.meal_name}</p>
                        <p className="text-xs text-slate-500 capitalize">{meal.meal_type} • {meal.calories} cal • {meal.carbs}g carbs</p>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div className="space-y-2 mt-4">
              <Button onClick={acceptMealPlan} className="w-full bg-emerald-600 hover:bg-emerald-700">
                Accept & Replace All
              </Button>
              <div className="flex gap-2">
                <Button onClick={handleGenerate} variant="outline" className="flex-1" disabled={generating}>
                  {generating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
                  Generate New
                </Button>
                <Button onClick={() => setPreviewMeals(null)} variant="outline" className="flex-1">
                  Cancel
                </Button>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}