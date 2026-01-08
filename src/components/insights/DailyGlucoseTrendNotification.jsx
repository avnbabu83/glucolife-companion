import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TrendingUp, TrendingDown, Activity, X, Sparkles } from 'lucide-react';
import { cn } from "@/lib/utils";
import moment from 'moment';

export default function DailyGlucoseTrendNotification() {
  const [dismissed, setDismissed] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [notification, setNotification] = useState(null);

  // Check if notification was already shown today
  useEffect(() => {
    const lastShown = localStorage.getItem('lastGlucoseNotification');
    const today = moment().format('YYYY-MM-DD');
    if (lastShown === today) {
      setDismissed(true);
    }
  }, []);

  // Fetch recent glucose data
  const { data: glucoseReadings = [] } = useQuery({
    queryKey: ['recentGlucoseForNotification'],
    queryFn: async () => {
      const readings = await base44.entities.GlucoseReading.list('-date', 100);
      return readings.filter(r => moment(r.date).isAfter(moment().subtract(7, 'days')));
    },
  });

  // Fetch recent meals
  const { data: recentMeals = [] } = useQuery({
    queryKey: ['recentMealsForNotification'],
    queryFn: async () => {
      const meals = await base44.entities.MealPlan.list('-date', 100);
      return meals.filter(m => 
        moment(m.date).isAfter(moment().subtract(7, 'days')) && m.is_completed
      );
    },
  });

  // Fetch recent exercise logs
  const { data: recentExercise = [] } = useQuery({
    queryKey: ['recentExerciseForNotification'],
    queryFn: async () => {
      const logs = await base44.entities.ExerciseLog.list('-date', 50);
      return logs.filter(l => 
        moment(l.date).isAfter(moment().subtract(7, 'days')) && l.status === 'completed'
      );
    },
  });

  // Fetch user profile
  const { data: profile } = useQuery({
    queryKey: ['userProfile'],
    queryFn: () => base44.entities.UserProfile.list(),
  });

  const userProfile = profile?.[0];

  useEffect(() => {
    if (!dismissed && glucoseReadings.length > 0 && recentMeals.length > 0 && !analyzing) {
      analyzeTrend();
    }
  }, [dismissed, glucoseReadings, recentMeals, recentExercise]);

  const analyzeTrend = async () => {
    setAnalyzing(true);
    try {
      // Calculate average glucose for last 3 days vs previous 4 days
      const last3Days = glucoseReadings.filter(r => 
        moment(r.date).isAfter(moment().subtract(3, 'days'))
      );
      const previous4Days = glucoseReadings.filter(r => 
        moment(r.date).isBetween(moment().subtract(7, 'days'), moment().subtract(3, 'days'), null, '[]')
      );

      if (last3Days.length < 5 || previous4Days.length < 5) {
        setDismissed(true);
        return;
      }

      const avgLast3 = last3Days.reduce((sum, r) => sum + r.reading, 0) / last3Days.length;
      const avgPrevious4 = previous4Days.reduce((sum, r) => sum + r.reading, 0) / previous4Days.length;

      const trend = avgLast3 - avgPrevious4;
      const trendPercentage = ((trend / avgPrevious4) * 100).toFixed(1);

      // Get meal and exercise summary
      const mealSummary = `${recentMeals.length} meals logged with avg ${Math.round(recentMeals.reduce((sum, m) => sum + (m.carbs || 0), 0) / recentMeals.length)}g carbs/meal`;
      const exerciseSummary = `${recentExercise.length} workouts completed`;

      const result = await base44.integrations.Core.InvokeLLM({
        prompt: `Analyze glucose trends for a person with ${userProfile?.diabetes_type || 'type 2'} diabetes:

        Recent Glucose Trend (last 7 days):
        - Last 3 days average: ${Math.round(avgLast3)} mg/dL
        - Previous 4 days average: ${Math.round(avgPrevious4)} mg/dL
        - Change: ${trend > 0 ? '+' : ''}${Math.round(trend)} mg/dL (${trendPercentage}%)
        
        Recent Habits:
        - ${mealSummary}
        - ${exerciseSummary}
        - Target range: ${userProfile?.target_glucose_min || 70}-${userProfile?.target_glucose_max || 140} mg/dL

        Provide:
        1. Is this trend positive (improving control) or concerning?
        2. Brief message about what's working or needs adjustment
        3. One specific actionable tip

        Keep it encouraging and conversational.`,
        response_json_schema: {
          type: "object",
          properties: {
            is_positive: { type: "boolean" },
            message: { type: "string" },
            tip: { type: "string" }
          }
        }
      });

      setNotification({
        ...result,
        trend,
        trendPercentage,
        avgLast3: Math.round(avgLast3),
        avgPrevious4: Math.round(avgPrevious4)
      });

      // Mark as shown today
      localStorage.setItem('lastGlucoseNotification', moment().format('YYYY-MM-DD'));
    } catch (error) {
      console.error('Failed to analyze trend:', error);
      setDismissed(true);
    } finally {
      setAnalyzing(false);
    }
  };

  if (dismissed || !notification || analyzing) {
    return null;
  }

  return (
    <Card className={cn(
      "border-2 shadow-lg animate-in slide-in-from-top",
      notification.is_positive 
        ? "border-emerald-500 bg-emerald-50" 
        : "border-amber-500 bg-amber-50"
    )}>
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className={cn(
            "p-2 rounded-xl",
            notification.is_positive ? "bg-emerald-100" : "bg-amber-100"
          )}>
            {notification.is_positive ? (
              <TrendingDown className="w-5 h-5 text-emerald-600" />
            ) : (
              <TrendingUp className="w-5 h-5 text-amber-600" />
            )}
          </div>
          
          <div className="flex-1">
            <div className="flex items-start justify-between mb-2">
              <div>
                <h4 className={cn(
                  "font-semibold flex items-center gap-2",
                  notification.is_positive ? "text-emerald-800" : "text-amber-800"
                )}>
                  <Sparkles className="w-4 h-4" />
                  Daily Glucose Insight
                </h4>
                <p className="text-xs text-slate-500 mt-1">
                  Last 3 days: {notification.avgLast3} mg/dL • 
                  Previous 4 days: {notification.avgPrevious4} mg/dL • 
                  {notification.trend > 0 ? '+' : ''}{Math.round(notification.trend)} mg/dL ({notification.trendPercentage}%)
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={() => setDismissed(true)}
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
            
            <p className={cn(
              "text-sm mb-2",
              notification.is_positive ? "text-emerald-700" : "text-amber-700"
            )}>
              {notification.message}
            </p>
            
            <div className={cn(
              "p-2 rounded-lg text-xs",
              notification.is_positive ? "bg-emerald-100" : "bg-amber-100"
            )}>
              <p className={cn(
                "font-medium",
                notification.is_positive ? "text-emerald-800" : "text-amber-800"
              )}>
                💡 {notification.tip}
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}