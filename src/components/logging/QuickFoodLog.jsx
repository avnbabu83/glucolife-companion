import React, { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Utensils, CheckCircle2 } from 'lucide-react';
import moment from 'moment';

export default function QuickFoodLog({ onSubmit, todayMeals = [] }) {
  const [followedPlan, setFollowedPlan] = useState(false);
  const [selectedMealId, setSelectedMealId] = useState('');
  const [foodName, setFoodName] = useState('');
  const [mealType, setMealType] = useState('lunch');
  const [carbs, setCarbs] = useState('');
  const [protein, setProtein] = useState('');
  const [calories, setCalories] = useState('');
  const [notes, setNotes] = useState('');

  // Get incomplete meals from today
  const incompleteMeals = todayMeals.filter(m => !m.is_completed);

  useEffect(() => {
    if (followedPlan && selectedMealId) {
      const meal = todayMeals.find(m => m.id === selectedMealId);
      if (meal) {
        setFoodName(meal.meal_name);
        setMealType(meal.meal_type);
        setCarbs(meal.carbs?.toString() || '');
        setProtein(meal.protein?.toString() || '');
        setCalories(meal.calories?.toString() || '');
        setNotes(meal.description || '');
      }
    } else if (!followedPlan) {
      setFoodName('');
      setCarbs('');
      setProtein('');
      setCalories('');
      setNotes('');
    }
  }, [followedPlan, selectedMealId, todayMeals]);

  const handleSubmit = (e) => {
    e.preventDefault();
    const today = moment().format('YYYY-MM-DD');
    const now = moment().format('HH:mm');
    
    if (followedPlan && selectedMealId) {
      // Update existing meal to mark as completed
      const meal = todayMeals.find(m => m.id === selectedMealId);
      onSubmit({
        id: meal.id,
        meal_name: foodName,
        carbs: parseInt(carbs) || meal.carbs || 0,
        protein: parseInt(protein) || meal.protein || 0,
        calories: parseInt(calories) || meal.calories || 0,
        notes: notes || meal.notes || '',
        is_completed: true
      });
    } else {
      // Create new meal entry
      onSubmit({
        date: today,
        meal_type: mealType,
        scheduled_time: now,
        meal_name: foodName,
        carbs: parseInt(carbs) || 0,
        protein: parseInt(protein) || 0,
        calories: parseInt(calories) || 0,
        notes,
        is_completed: true
      });
    }

    setFollowedPlan(false);
    setSelectedMealId('');
    setFoodName('');
    setMealType('lunch');
    setCarbs('');
    setProtein('');
    setCalories('');
    setNotes('');
  };

  return (
    <div className="space-y-4">
      {incompleteMeals.length > 0 && (
        <div className="p-3 bg-blue-50 rounded-xl border border-blue-200">
          <div className="flex items-start gap-3">
            <Checkbox
              checked={followedPlan}
              onCheckedChange={setFollowedPlan}
              id="followed-plan"
            />
            <div className="flex-1">
              <label htmlFor="followed-plan" className="text-sm font-medium text-blue-800 cursor-pointer">
                Did you follow today's meal plan?
              </label>
              <p className="text-xs text-blue-600 mt-1">
                Check this to pre-fill from your planned meals
              </p>
            </div>
          </div>

          {followedPlan && (
            <div className="mt-3">
              <Label>Select Meal</Label>
              <Select value={selectedMealId} onValueChange={setSelectedMealId}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Choose a meal..." />
                </SelectTrigger>
                <SelectContent>
                  {incompleteMeals.map(meal => (
                    <SelectItem key={meal.id} value={meal.id}>
                      <div className="flex items-center gap-2">
                        <span className="capitalize">{meal.meal_type.replace('_', ' ')}</span>
                        <span className="text-slate-500">- {meal.meal_name}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <Label>What did you eat? *</Label>
          <Input
            value={foodName}
            onChange={(e) => setFoodName(e.target.value)}
            placeholder="e.g., Grilled chicken salad"
            className="mt-1"
            required
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>Meal Type</Label>
            <Select value={mealType} onValueChange={setMealType} disabled={followedPlan && selectedMealId}>
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="breakfast">Breakfast</SelectItem>
                <SelectItem value="morning_snack">Morning Snack</SelectItem>
                <SelectItem value="lunch">Lunch</SelectItem>
                <SelectItem value="afternoon_snack">Afternoon Snack</SelectItem>
                <SelectItem value="dinner">Dinner</SelectItem>
                <SelectItem value="evening_snack">Evening Snack</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Carbs (g)</Label>
            <Input
              type="number"
              value={carbs}
              onChange={(e) => setCarbs(e.target.value)}
              placeholder="0"
              className="mt-1"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>Protein (g)</Label>
            <Input
              type="number"
              value={protein}
              onChange={(e) => setProtein(e.target.value)}
              placeholder="0"
              className="mt-1"
            />
          </div>

          <div>
            <Label>Calories</Label>
            <Input
              type="number"
              value={calories}
              onChange={(e) => setCalories(e.target.value)}
              placeholder="0"
              className="mt-1"
            />
          </div>
        </div>

        <div>
          <Label>Notes (optional)</Label>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Any additional details..."
            className="mt-1 h-20"
          />
        </div>

        <Button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-700" disabled={!foodName}>
          {followedPlan && selectedMealId ? (
            <>
              <CheckCircle2 className="w-4 h-4 mr-2" />
              Mark as Completed
            </>
          ) : (
            <>
              <Utensils className="w-4 h-4 mr-2" />
              Log Food
            </>
          )}
        </Button>
      </form>
    </div>
  );
}