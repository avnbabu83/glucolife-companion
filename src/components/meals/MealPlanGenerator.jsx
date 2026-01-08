import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sparkles, Loader2, Calendar, Info } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import moment from 'moment';
import { calculateDailyCalories, getCalorieDistribution } from '@/components/utils/calorieCalculator';

export default function MealPlanGenerator({ userProfile, onPlanGenerated }) {
  const [generating, setGenerating] = useState(false);
  const [previewMeals, setPreviewMeals] = useState(null);
  const [selectedDays, setSelectedDays] = useState(7);
  
  // Calculate personalized calorie target
  const personalizedCalories = calculateDailyCalories(userProfile);
  const [calorieTarget, setCalorieTarget] = useState(personalizedCalories);
  
  // Fetch recent glucose data for personalized recommendations
  const { data: recentGlucose = [] } = useQuery({
    queryKey: ['recentGlucoseForMeals'],
    queryFn: async () => {
      const readings = await base44.entities.GlucoseReading.list('-date', 50);
      return readings.filter(r => moment(r.date).isAfter(moment().subtract(7, 'days')));
    },
  });

  // Update calorie target when profile changes
  useEffect(() => {
    setCalorieTarget(personalizedCalories);
  }, [personalizedCalories]);

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

      // Analyze recent glucose trends
      const avgGlucose = recentGlucose.length > 0 
        ? Math.round(recentGlucose.reduce((sum, r) => sum + r.reading, 0) / recentGlucose.length)
        : null;
      
      const highReadings = recentGlucose.filter(r => r.reading > (userProfile?.target_glucose_max || 140)).length;
      const lowReadings = recentGlucose.filter(r => r.reading < (userProfile?.target_glucose_min || 70)).length;
      
      const glucoseInsight = avgGlucose 
        ? `\n\nRecent Glucose Analysis (last 7 days):
        - Average: ${avgGlucose} mg/dL
        - High readings: ${highReadings} occurrences
        - Low readings: ${lowReadings} occurrences
        - ${highReadings > 5 ? 'IMPORTANT: Reduce carbs and focus on very low GI foods' : ''}
        - ${lowReadings > 3 ? 'IMPORTANT: Include more complex carbs for sustained energy' : ''}`
        : '';

      const macroDistribution = getCalorieDistribution(calorieTarget);

      const result = await base44.integrations.Core.InvokeLLM({
        prompt: `Generate a ${selectedDays}-day meal plan for someone with ${userProfile?.diabetes_type || 'type 2'} diabetes.
        
        User Profile:
        - Age: ${userProfile?.age || 'N/A'}, Weight: ${userProfile?.weight || 'N/A'}kg, Height: ${userProfile?.height || 'N/A'}cm
        - Activity Level: ${userProfile?.activity_level || 'moderate'}
        - Daily calorie target: ${calorieTarget} kcal (personalized based on their BMR and activity)
        - Target macros: ${macroDistribution.carbs_grams}g carbs, ${macroDistribution.protein_grams}g protein, ${macroDistribution.fat_grams}g fat, ${macroDistribution.fiber_grams}g fiber
        - Dietary preference: ${userProfile?.dietary_preference || 'balanced'} (${dietaryDetails})
        - Glucose target: ${userProfile?.target_glucose_min || 70}-${userProfile?.target_glucose_max || 140} mg/dL${glucoseInsight}
        
        Requirements:
        - Focus on low glycemic index foods
        - 3 main meals + 2-3 snacks per day
        - Each meal should have detailed nutrition (calories, carbs, protein, fat, fiber)
        - IMPORTANT: Include specific portion sizes in cups, grams, or pieces (e.g., "1 cup cooked rice", "4 oz chicken breast", "1/2 cup berries")
        - Include specific meal times based on their schedule (wake: ${userProfile?.wake_time || '7:00 AM'}, sleep: ${userProfile?.sleep_time || '10:00 PM'})
        - Make meals realistic and easy to prepare
        - Portions should be diabetes-friendly and appropriate for blood sugar control
        - Adapt recommendations based on recent glucose trends
        
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
                        portion_size: { type: "string" },
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
        {userProfile && personalizedCalories !== 1800 && (
          <div className="p-3 bg-blue-50 rounded-lg flex items-start gap-2">
            <Info className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
            <div className="text-xs text-blue-700">
              <p className="font-medium">Personalized for you</p>
              <p>Based on your age ({userProfile.age}), weight ({userProfile.weight}kg), and {userProfile.activity_level} activity level</p>
            </div>
          </div>
        )}
        
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
              placeholder={personalizedCalories.toString()}
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
            <h4 className="font-semibold text-emerald-800 mb-2 flex items-center gap-2">
              <Sparkles className="w-5 h-5" />
              {selectedDays}-Day Meal Plan Preview
            </h4>
            <div className="p-3 bg-amber-50 rounded-lg border border-amber-200 mb-4">
              <p className="text-xs text-amber-800">
                ⚠️ <strong>Note:</strong> Accepting this plan will replace all incomplete meals for the selected dates, including any lifestyle analyzer suggestions. Completed/logged meals will be preserved.
              </p>
            </div>
            <div className="space-y-4 max-h-96 overflow-y-auto">
              {previewMeals.map((day, dayIdx) => (
                <div key={dayIdx} className="bg-white p-3 rounded-lg">
                  <p className="font-semibold text-slate-700 mb-2">Day {day.day}</p>
                  <div className="space-y-2">
                    {day.meals.map((meal, mealIdx) => (
                      <div key={mealIdx} className="text-sm p-2 bg-slate-50 rounded">
                        <p className="font-medium text-slate-800">{meal.meal_name}</p>
                        {meal.portion_size && (
                          <p className="text-xs text-emerald-600 font-medium">Portion: {meal.portion_size}</p>
                        )}
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