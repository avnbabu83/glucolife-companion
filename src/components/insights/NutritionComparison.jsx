import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useQuery } from '@tanstack/react-query';
import moment from 'moment';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { AlertCircle, CheckCircle, TrendingUp, Sparkles, Loader2, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export default function NutritionComparison({ dateRange = 7 }) {
  const [analyzing, setAnalyzing] = useState(false);
  const [insights, setInsights] = useState(null);
  const [selectedDate, setSelectedDate] = useState(moment().format('YYYY-MM-DD'));

  const startDate = moment().subtract(dateRange, 'days').format('YYYY-MM-DD');
  
  const { data: mealPlans = [] } = useQuery({
    queryKey: ['mealPlansForComparison', startDate],
    queryFn: async () => {
      const plans = await base44.entities.MealPlan.list('-date', 200);
      return plans.filter(p => moment(p.date).isSameOrAfter(moment(startDate)));
    },
  });

  const { data: profile } = useQuery({
    queryKey: ['userProfile'],
    queryFn: () => base44.entities.UserProfile.list(),
  });

  const userProfile = profile?.[0];

  // Filter meals for selected date only
  const recentMeals = mealPlans.filter(m => m.date === selectedDate);
  
  // ALL meals represent the plan (both completed and incomplete)
  const allPlannedMeals = recentMeals;
  // Only completed meals represent what was actually eaten
  const eatenMeals = recentMeals.filter(m => m.is_completed);

  // Calculate nutrition totals
  const calculateTotals = (meals) => ({
    calories: meals.reduce((sum, m) => sum + (m.calories || 0), 0),
    carbs: meals.reduce((sum, m) => sum + (m.carbs || 0), 0),
    protein: meals.reduce((sum, m) => sum + (m.protein || 0), 0),
    fat: meals.reduce((sum, m) => sum + (m.fat || 0), 0),
    fiber: meals.reduce((sum, m) => sum + (m.fiber || 0), 0)
  });

  const plannedTotals = calculateTotals(allPlannedMeals);
  const eatenTotals = calculateTotals(eatenMeals);

  // No averaging needed - showing single day totals
  const plannedDailyAvg = {
    calories: Math.round(plannedTotals.calories),
    carbs: Math.round(plannedTotals.carbs),
    protein: Math.round(plannedTotals.protein),
    fat: Math.round(plannedTotals.fat),
    fiber: Math.round(plannedTotals.fiber)
  };

  const eatenDailyAvg = {
    calories: Math.round(eatenTotals.calories),
    carbs: Math.round(eatenTotals.carbs),
    protein: Math.round(eatenTotals.protein),
    fat: Math.round(eatenTotals.fat),
    fiber: Math.round(eatenTotals.fiber)
  };

  const comparisonData = [
    {
      name: 'Calories',
      Planned: plannedDailyAvg.calories,
      Actual: eatenDailyAvg.calories,
    },
    {
      name: 'Carbs (g)',
      Planned: plannedDailyAvg.carbs,
      Actual: eatenDailyAvg.carbs,
    },
    {
      name: 'Protein (g)',
      Planned: plannedDailyAvg.protein,
      Actual: eatenDailyAvg.protein,
    },
    {
      name: 'Fat (g)',
      Planned: plannedDailyAvg.fat,
      Actual: eatenDailyAvg.fat,
    },
    {
      name: 'Fiber (g)',
      Planned: plannedDailyAvg.fiber,
      Actual: eatenDailyAvg.fiber,
    },
  ];

  const analyzeAdherence = async () => {
    setAnalyzing(true);
    try {
      const result = await base44.integrations.Core.InvokeLLM({
        prompt: `Analyze nutrition adherence for a person with ${userProfile?.diabetes_type || 'type 2'} diabetes:
        
        Planned Daily Average (${allPlannedMeals.length} meals over ${daysWithPlannedMeals} days):
        - Calories: ${plannedDailyAvg.calories}
        - Carbs: ${plannedDailyAvg.carbs}g
        - Protein: ${plannedDailyAvg.protein}g
        - Fat: ${plannedDailyAvg.fat}g
        - Fiber: ${plannedDailyAvg.fiber}g
        
        Actual Daily Average (${eatenMeals.length} meals over ${daysWithEatenMeals} days):
        - Calories: ${eatenDailyAvg.calories}
        - Carbs: ${eatenDailyAvg.carbs}g
        - Protein: ${eatenDailyAvg.protein}g
        - Fat: ${eatenDailyAvg.fat}g
        - Fiber: ${eatenDailyAvg.fiber}g
        
        Provide:
        1. Adherence percentage
        2. Key differences and their impact on diabetes management
        3. Specific actionable recommendations`,
        response_json_schema: {
          type: "object",
          properties: {
            adherence_percentage: { type: "number" },
            key_differences: { type: "array", items: { type: "string" } },
            recommendations: { type: "array", items: { type: "string" } },
            overall_assessment: { type: "string" }
          }
        }
      });
      setInsights(result);
    } catch (error) {
      toast.error('Failed to analyze adherence');
    } finally {
      setAnalyzing(false);
    }
  };

  const adherenceRate = eatenMeals.length > 0 && allPlannedMeals.length > 0
    ? Math.round((eatenMeals.length / allPlannedMeals.length) * 100)
    : 0;

  const goToPrevDay = () => {
    setSelectedDate(moment(selectedDate).subtract(1, 'day').format('YYYY-MM-DD'));
    setInsights(null);
  };

  const goToNextDay = () => {
    if (moment(selectedDate).isBefore(moment(), 'day')) {
      setSelectedDate(moment(selectedDate).add(1, 'day').format('YYYY-MM-DD'));
      setInsights(null);
    }
  };

  const isToday = moment(selectedDate).isSame(moment(), 'day');

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader>
        <div className="flex items-center justify-between mb-3">
          <CardTitle className="text-lg">Nutrition: Planned vs Actual</CardTitle>
          <Button 
            onClick={analyzeAdherence}
            disabled={analyzing || eatenMeals.length === 0}
            variant="outline"
            size="sm"
          >
            {analyzing ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Sparkles className="w-4 h-4 mr-2" />
            )}
            Analyze
          </Button>
        </div>
        
        {/* Date Navigation */}
        <div className="flex items-center justify-between bg-slate-50 rounded-lg p-2">
          <Button 
            variant="ghost" 
            size="sm"
            onClick={goToPrevDay}
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <div className="text-center">
            <p className="font-semibold text-slate-800">
              {isToday ? 'Today' : moment(selectedDate).format('MMM D, YYYY')}
            </p>
            <p className="text-xs text-slate-500">{moment(selectedDate).format('dddd')}</p>
          </div>
          <Button 
            variant="ghost" 
            size="sm"
            onClick={goToNextDay}
            disabled={isToday}
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Adherence Overview */}
        <div className="grid grid-cols-3 gap-4">
          <div className="p-4 bg-blue-50 rounded-xl text-center">
            <p className="text-sm text-blue-600 mb-1">Planned Meals</p>
            <p className="text-2xl font-bold text-blue-700">{allPlannedMeals.length}</p>
          </div>
          <div className="p-4 bg-emerald-50 rounded-xl text-center">
            <p className="text-sm text-emerald-600 mb-1">Meals Logged</p>
            <p className="text-2xl font-bold text-emerald-700">{eatenMeals.length}</p>
          </div>
          <div className="p-4 bg-violet-50 rounded-xl text-center">
            <p className="text-sm text-violet-600 mb-1">Adherence</p>
            <p className="text-2xl font-bold text-violet-700">{adherenceRate}%</p>
          </div>
        </div>

        {/* Comparison Chart */}
        {eatenMeals.length > 0 && (
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={comparisonData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Legend />
                <Bar dataKey="Planned" fill="#3b82f6" radius={[8, 8, 0, 0]} />
                <Bar dataKey="Actual" fill="#10b981" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* AI Insights */}
        {insights && (
          <div className="space-y-4">
            <div className={cn(
              "p-4 rounded-xl",
              insights.adherence_percentage >= 70 ? "bg-emerald-50" : "bg-amber-50"
            )}>
              <div className="flex items-start gap-3">
                {insights.adherence_percentage >= 70 ? (
                  <CheckCircle className="w-5 h-5 text-emerald-600 mt-0.5" />
                ) : (
                  <AlertCircle className="w-5 h-5 text-amber-600 mt-0.5" />
                )}
                <div>
                  <h4 className={cn(
                    "font-semibold",
                    insights.adherence_percentage >= 70 ? "text-emerald-800" : "text-amber-800"
                  )}>
                    {insights.adherence_percentage}% Adherence to Plan
                  </h4>
                  <p className={cn(
                    "text-sm mt-1",
                    insights.adherence_percentage >= 70 ? "text-emerald-700" : "text-amber-700"
                  )}>
                    {insights.overall_assessment}
                  </p>
                </div>
              </div>
            </div>

            {insights.key_differences?.length > 0 && (
              <div className="p-4 bg-blue-50 rounded-xl">
                <h4 className="font-semibold text-blue-800 mb-2 flex items-center gap-2">
                  <TrendingUp className="w-4 h-4" />
                  Key Differences
                </h4>
                <ul className="space-y-1">
                  {insights.key_differences.map((diff, idx) => (
                    <li key={idx} className="text-sm text-blue-700">• {diff}</li>
                  ))}
                </ul>
              </div>
            )}

            {insights.recommendations?.length > 0 && (
              <div className="p-4 bg-violet-50 rounded-xl">
                <h4 className="font-semibold text-violet-800 mb-2">Recommendations</h4>
                <ul className="space-y-1">
                  {insights.recommendations.map((rec, idx) => (
                    <li key={idx} className="text-sm text-violet-700">✓ {rec}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {eatenMeals.length === 0 && (
          <div className="p-6 bg-slate-50 rounded-xl text-center">
            <p className="text-slate-500 mb-2">No meals logged yet</p>
            <p className="text-sm text-slate-400">Start logging your meals to see nutrition comparison</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}