import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sparkles, Loader2, Info } from 'lucide-react';
import api, { aiErrorMessage } from '@/api/client';
import { toast } from "sonner";
import { calculateDailyCalories } from '@/components/utils/calorieCalculator';
import { detectUserCurrency, formatCurrency } from '@/components/utils/currencyDetector';

export default function MealPlanGenerator({ userProfile, onPlanGenerated }) {
  const [generating, setGenerating] = useState(false);
  const [previewMeals, setPreviewMeals] = useState(null);
  const [selectedDays, setSelectedDays] = useState(7);
  const [userCurrency, setUserCurrency] = useState({ symbol: '$', code: 'USD', name: 'Dollars' });
  
  // Calculate personalized calorie target
  const personalizedCalories = calculateDailyCalories(userProfile);
  const [calorieTarget, setCalorieTarget] = useState(personalizedCalories);
  
  // Detect user's currency on mount
  useEffect(() => {
    detectUserCurrency().then(setUserCurrency);
  }, []);
  
  // Update calorie target when profile changes
  useEffect(() => {
    setCalorieTarget(personalizedCalories);
  }, [personalizedCalories]);

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      // The server reads the profile, recent glucose and meal responses; the budget currency is optional.
      const target = Math.min(5000, Math.max(800, Number(calorieTarget) || 1800));
      const currency = /^[A-Z]{3}$/.test(userCurrency?.code || '') ? userCurrency.code : undefined;
      const result = await api.ai.run('meal-plan', {
        days: selectedDays,
        targetCalories: target,
        ...(currency ? { currency } : {}),
      });

      if (result?.mealPlan) {
        setPreviewMeals(result.mealPlan);
      }
    } catch (error) {
      toast.error(aiErrorMessage(error, 'Failed to generate meal plan'));
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
        {userProfile?.weekly_food_budget && (
          <div className="p-3 bg-green-50 rounded-lg flex items-start gap-2">
            <Info className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
            <div className="text-xs text-green-700">
              <p className="font-medium">Budget-Friendly Meals</p>
              <p>Weekly budget: {formatCurrency(userProfile.weekly_food_budget, userCurrency)} ({formatCurrency((userProfile.weekly_food_budget / 7).toFixed(2), userCurrency)}/day)</p>
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