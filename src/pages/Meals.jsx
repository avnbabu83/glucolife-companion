import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import moment from 'moment';
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { 
  CalendarDays, 
  ChevronLeft, 
  ChevronRight,
  Plus,
  Sparkles,
  Utensils,
  Download,
  Trash2
} from 'lucide-react';

import MealCard from '@/components/meals/MealCard';
import MealPlanGenerator from '@/components/meals/MealPlanGenerator';
import QuickFoodLog from '@/components/logging/QuickFoodLog';

export default function Meals() {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [showGenerator, setShowGenerator] = useState(false);
  const [selectedMeal, setSelectedMeal] = useState(null);
  const [showFoodLog, setShowFoodLog] = useState(false);
  const queryClient = useQueryClient();

  const dateStr = moment(selectedDate).format('YYYY-MM-DD');

  const { data: profile } = useQuery({
    queryKey: ['userProfile'],
    queryFn: () => base44.entities.UserProfile.list(),
  });

  const { data: meals = [], isLoading } = useQuery({
    queryKey: ['meals', dateStr],
    queryFn: () => base44.entities.MealPlan.filter({ date: dateStr }),
  });

  const updateMealMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.MealPlan.update(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['meals'] }),
  });

  const deleteMealMutation = useMutation({
    mutationFn: (id) => base44.entities.MealPlan.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['meals'] }),
  });

  const createMealsMutation = useMutation({
    mutationFn: (meals) => base44.entities.MealPlan.bulkCreate(meals),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['meals'] });
      setShowGenerator(false);
    },
  });

  const createMealMutation = useMutation({
    mutationFn: (data) => base44.entities.MealPlan.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['meals'] });
      toast.success('Food logged successfully!');
      setShowFoodLog(false);
    },
  });

  const clearUnloggedMutation = useMutation({
    mutationFn: async () => {
      const unloggedMeals = meals.filter(m => !m.is_completed);
      await Promise.all(unloggedMeals.map(m => base44.entities.MealPlan.delete(m.id)));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['meals'] });
      toast.success('Cleared unlogged meals');
    },
  });

  const handleCompleteMeal = (meal) => {
    updateMealMutation.mutate({
      id: meal.id,
      data: { is_completed: !meal.is_completed }
    });
  };

  const handlePlanGenerated = async (mealPlans) => {
    // Collect all dates that will be affected by the new plan
    const datesToClear = [];
    mealPlans.forEach((day, dayIndex) => {
      const date = moment(selectedDate).add(dayIndex, 'days').format('YYYY-MM-DD');
      datesToClear.push(date);
    });

    // Delete existing incomplete meals for these dates
    const existingMealsQuery = await base44.entities.MealPlan.list('-date', 500);
    const mealsToDelete = existingMealsQuery.filter(m => 
      datesToClear.includes(m.date) && !m.is_completed
    );
    
    // Delete old incomplete meals
    await Promise.all(mealsToDelete.map(m => base44.entities.MealPlan.delete(m.id)));

    // Create new meals
    const allMeals = [];
    mealPlans.forEach((day, dayIndex) => {
      const date = moment(selectedDate).add(dayIndex, 'days').format('YYYY-MM-DD');
      day.meals.forEach(meal => {
        allMeals.push({
          ...meal,
          date,
          is_completed: false
        });
      });
    });
    createMealsMutation.mutate(allMeals);
  };

  const handleFoodSubmit = (data) => {
    if (data.id) {
      updateMealMutation.mutate({ id: data.id, data });
    } else {
      createMealMutation.mutate(data);
    }
  };

  const exportMealPlan = () => {
    const csvContent = [
      ['Date', 'Meal Type', 'Meal Name', 'Calories', 'Carbs (g)', 'Protein (g)', 'Fat (g)', 'Fiber (g)', 'Status'],
      ...meals.map(m => [
        m.date,
        m.meal_type,
        m.meal_name,
        m.calories || 0,
        m.carbs || 0,
        m.protein || 0,
        m.fat || 0,
        m.fiber || 0,
        m.is_completed ? 'Completed' : 'Pending'
      ])
    ].map(row => row.join(',')).join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `meal-plan-${dateStr}.csv`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    a.remove();
    toast.success('Meal plan exported!');
  };

  const goToPreviousDay = () => {
    setSelectedDate(prev => moment(prev).subtract(1, 'day').toDate());
  };

  const goToNextDay = () => {
    setSelectedDate(prev => moment(prev).add(1, 'day').toDate());
  };

  const mealOrder = ['breakfast', 'morning_snack', 'lunch', 'afternoon_snack', 'dinner', 'evening_snack'];
  const sortedMeals = [...meals].sort((a, b) => 
    mealOrder.indexOf(a.meal_type) - mealOrder.indexOf(b.meal_type)
  );

  const userProfile = profile?.[0];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-slate-800">Meal Plan</h1>
          <div className="flex gap-2">
            {meals.filter(m => !m.is_completed).length > 0 && (
              <Button 
                onClick={() => {
                  if (confirm('Clear all unlogged meals for this day?')) {
                    clearUnloggedMutation.mutate();
                  }
                }}
                variant="outline"
                size="sm"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Clear Unlogged
              </Button>
            )}
            {meals.length > 0 && (
              <Button 
                onClick={exportMealPlan}
                variant="outline"
                size="sm"
              >
                <Download className="w-4 h-4" />
              </Button>
            )}
            <Button 
              onClick={() => setShowFoodLog(true)}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              <Utensils className="w-4 h-4 mr-2" />
              Log Food
            </Button>
            <Button 
              onClick={() => setShowGenerator(!showGenerator)}
              variant="outline"
            >
              <Sparkles className="w-4 h-4 mr-2" />
              Generate
            </Button>
          </div>
        </div>

        {/* AI Generator */}
        {showGenerator && (
          <MealPlanGenerator 
            userProfile={userProfile}
            onPlanGenerated={handlePlanGenerated}
          />
        )}

        {/* Date Navigation */}
        <div className="flex items-center justify-between bg-white rounded-xl p-4 shadow-sm">
          <Button variant="ghost" size="icon" onClick={goToPreviousDay}>
            <ChevronLeft className="w-5 h-5" />
          </Button>
          
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="ghost" className="font-semibold text-lg">
                <CalendarDays className="w-5 h-5 mr-2" />
                {moment(selectedDate).format('ddd, MMMM D')}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="center">
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={(date) => date && setSelectedDate(date)}
                initialFocus
              />
            </PopoverContent>
          </Popover>
          
          <Button variant="ghost" size="icon" onClick={goToNextDay}>
            <ChevronRight className="w-5 h-5" />
          </Button>
        </div>

        {/* Summary */}
        {meals.length > 0 && (
          <div className="bg-white rounded-xl p-4 shadow-sm">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="text-center">
                <p className="text-2xl font-bold text-slate-800">
                  {meals.reduce((sum, m) => sum + (m.calories || 0), 0)}
                </p>
                <p className="text-xs text-slate-500">Calories</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-amber-600">
                  {meals.reduce((sum, m) => sum + (m.carbs || 0), 0)}g
                </p>
                <p className="text-xs text-slate-500">Carbs</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-rose-600">
                  {meals.reduce((sum, m) => sum + (m.protein || 0), 0)}g
                </p>
                <p className="text-xs text-slate-500">Protein</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-blue-600">
                  {meals.reduce((sum, m) => sum + (m.fat || 0), 0)}g
                </p>
                <p className="text-xs text-slate-500">Fat</p>
              </div>
            </div>
          </div>
        )}

        {/* Meals List */}
        <div className="space-y-4">
          {isLoading ? (
            <div className="text-center py-12 text-slate-500">Loading meals...</div>
          ) : sortedMeals.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-slate-500 mb-4">No meals planned for this day</p>
              <Button 
                onClick={() => setShowGenerator(true)}
                variant="outline"
              >
                <Plus className="w-4 h-4 mr-2" />
                Generate Meal Plan
              </Button>
            </div>
          ) : (
            sortedMeals.map(meal => (
              <MealCard 
                key={meal.id}
                meal={meal}
                onComplete={handleCompleteMeal}
                onViewDetails={setSelectedMeal}
                onDelete={(m) => deleteMealMutation.mutate(m.id)}
              />
            ))
          )}
        </div>

        {/* Food Log Dialog */}
        <Dialog open={showFoodLog} onOpenChange={setShowFoodLog}>
          <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Log Food</DialogTitle>
            </DialogHeader>
            <QuickFoodLog 
              onSubmit={handleFoodSubmit}
              todayMeals={meals}
            />
          </DialogContent>
        </Dialog>

        {/* Meal Detail Dialog */}
        <Dialog open={!!selectedMeal} onOpenChange={() => setSelectedMeal(null)}>
          <DialogContent className="max-w-md">
            {selectedMeal && (
              <>
                <DialogHeader>
                  <DialogTitle>{selectedMeal.meal_name}</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <p className="text-slate-600">{selectedMeal.description}</p>

                  {selectedMeal.ingredients?.length > 0 && (
                    <div>
                      <h4 className="font-semibold text-slate-700 mb-2">Ingredients</h4>
                      <ul className="text-sm text-slate-600 space-y-1">
                        {selectedMeal.ingredients.map((ing, idx) => (
                          <li key={idx}>• {ing}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-4 pt-4 border-t">
                    <div>
                      <p className="text-sm text-slate-500">Calories</p>
                      <p className="font-semibold">{selectedMeal.calories} kcal</p>
                    </div>
                    <div>
                      <p className="text-sm text-slate-500">Glycemic Index</p>
                      <p className="font-semibold capitalize">{selectedMeal.glycemic_index}</p>
                    </div>
                    <div>
                      <p className="text-sm text-slate-500">Fiber</p>
                      <p className="font-semibold">{selectedMeal.fiber}g</p>
                    </div>
                    <div>
                      <p className="text-sm text-slate-500">Scheduled</p>
                      <p className="font-semibold">{selectedMeal.scheduled_time}</p>
                    </div>
                  </div>
                </div>
              </>
            )}
          </DialogContent>
        </Dialog>
        </div>
        </div>
        );
        }