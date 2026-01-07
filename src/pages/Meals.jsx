import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import moment from 'moment';
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { 
  CalendarDays, 
  ChevronLeft, 
  ChevronRight,
  Plus,
  Sparkles
} from 'lucide-react';

import MealCard from '@/components/meals/MealCard';
import MealPlanGenerator from '@/components/meals/MealPlanGenerator';

export default function Meals() {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [showGenerator, setShowGenerator] = useState(false);
  const [selectedMeal, setSelectedMeal] = useState(null);
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

  const createMealsMutation = useMutation({
    mutationFn: (meals) => base44.entities.MealPlan.bulkCreate(meals),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['meals'] });
      setShowGenerator(false);
    },
  });

  const handleCompleteMeal = (meal) => {
    updateMealMutation.mutate({
      id: meal.id,
      data: { is_completed: !meal.is_completed }
    });
  };

  const handlePlanGenerated = async (mealPlans) => {
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
          <Button 
            onClick={() => setShowGenerator(!showGenerator)}
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            <Sparkles className="w-4 h-4 mr-2" />
            Generate Plan
          </Button>
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
          <div className="grid grid-cols-4 gap-4 bg-white rounded-xl p-4 shadow-sm">
            <div className="text-center">
              <p className="text-2xl font-bold text-slate-800">
                {meals.reduce((sum, m) => sum + (m.calories || 0), 0)}
              </p>
              <p className="text-xs text-slate-500">Total Calories</p>
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
              />
            ))
          )}
        </div>

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