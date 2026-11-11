import React, { useState, useEffect } from 'react';
import api from '@/api/client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TrendingUp, TrendingDown, X, Sparkles } from 'lucide-react';
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
      const readings = await api.entities.GlucoseReading.list('-date', 100);
      return readings.filter(r => moment(r.date).isAfter(moment().subtract(7, 'days')));
    },
  });

  // Fetch recent meals
  const { data: recentMeals = [] } = useQuery({
    queryKey: ['recentMealsForNotification'],
    queryFn: async () => {
      const meals = await api.entities.MealPlan.list('-date', 100);
      return meals.filter(m => 
        moment(m.date).isAfter(moment().subtract(7, 'days')) && m.is_completed
      );
    },
  });

  // Fetch recent exercise logs
  const { data: recentExercise = [] } = useQuery({
    queryKey: ['recentExerciseForNotification'],
    queryFn: async () => {
      const logs = await api.entities.ExerciseLog.list('-date', 50);
      return logs.filter(l => 
        moment(l.date).isAfter(moment().subtract(7, 'days')) && l.status === 'completed'
      );
    },
  });

  useEffect(() => {
    if (!dismissed && glucoseReadings.length > 0 && recentMeals.length > 0 && !analyzing) {
      analyzeTrend();
    }
  }, [dismissed, glucoseReadings, recentMeals, recentExercise]);

  const analyzeTrend = async () => {
    setAnalyzing(true);
    try {
      // The server computes the 3-day vs previous-4-day averages and returns them with the message
      // (422 insufficient_data when there are fewer than 5 readings in either window).
      const result = await api.ai.run('daily-trend');
      setNotification(result);

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