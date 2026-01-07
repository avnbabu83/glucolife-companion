import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useQuery } from '@tanstack/react-query';
import moment from 'moment';
import { Sparkles, Loader2, TrendingUp, AlertCircle, CheckCircle } from 'lucide-react';
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export default function GlucoseTrendAnalysis({ daysToAnalyze = 14 }) {
  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState(null);

  const startDate = moment().subtract(daysToAnalyze, 'days').format('YYYY-MM-DD');

  const { data: glucoseReadings = [] } = useQuery({
    queryKey: ['glucoseForAnalysis', startDate],
    queryFn: async () => {
      const readings = await base44.entities.GlucoseReading.list('-date', 500);
      return readings.filter(r => moment(r.date).isAfter(moment(startDate)));
    },
  });

  const { data: meals = [] } = useQuery({
    queryKey: ['mealsForAnalysis', startDate],
    queryFn: async () => {
      const allMeals = await base44.entities.MealPlan.list('-date', 200);
      return allMeals.filter(m => m.is_completed && moment(m.date).isAfter(moment(startDate)));
    },
  });

  const { data: profile } = useQuery({
    queryKey: ['userProfile'],
    queryFn: () => base44.entities.UserProfile.list(),
  });

  const userProfile = profile?.[0];
  const targetMin = userProfile?.target_glucose_min || 70;
  const targetMax = userProfile?.target_glucose_max || 140;

  const analyzeTrends = async () => {
    if (glucoseReadings.length < 10) {
      toast.error('Need at least 10 glucose readings for analysis');
      return;
    }

    setAnalyzing(true);
    try {
      // Calculate stats
      const avgGlucose = Math.round(glucoseReadings.reduce((sum, r) => sum + r.reading, 0) / glucoseReadings.length);
      const highReadings = glucoseReadings.filter(r => r.reading > targetMax).length;
      const lowReadings = glucoseReadings.filter(r => r.reading < targetMin).length;
      const timeInRange = Math.round((glucoseReadings.filter(r => r.reading >= targetMin && r.reading <= targetMax).length / glucoseReadings.length) * 100);

      // Calculate nutrition stats
      const avgCarbs = meals.length > 0 ? Math.round(meals.reduce((sum, m) => sum + (m.carbs || 0), 0) / meals.length) : 0;
      const avgProtein = meals.length > 0 ? Math.round(meals.reduce((sum, m) => sum + (m.protein || 0), 0) / meals.length) : 0;
      const avgFiber = meals.length > 0 ? Math.round(meals.reduce((sum, m) => sum + (m.fiber || 0), 0) / meals.length) : 0;

      const result = await base44.integrations.Core.InvokeLLM({
        prompt: `Analyze glucose trends and dietary patterns for a person with ${userProfile?.diabetes_type || 'type 2'} diabetes:

        Glucose Data (${daysToAnalyze} days, ${glucoseReadings.length} readings):
        - Average: ${avgGlucose} mg/dL
        - Time in range (${targetMin}-${targetMax}): ${timeInRange}%
        - High readings: ${highReadings} (${Math.round((highReadings / glucoseReadings.length) * 100)}%)
        - Low readings: ${lowReadings} (${Math.round((lowReadings / glucoseReadings.length) * 100)}%)
        
        Dietary Data (${meals.length} logged meals):
        - Average carbs per meal: ${avgCarbs}g
        - Average protein per meal: ${avgProtein}g
        - Average fiber per meal: ${avgFiber}g
        
        Provide:
        1. Pattern analysis (identify trends and correlations)
        2. Dietary change recommendations (be specific about what to adjust)
        3. Meal timing suggestions
        4. Priority actions for immediate improvement`,
        response_json_schema: {
          type: "object",
          properties: {
            overall_control: { 
              type: "string",
              enum: ["excellent", "good", "needs_improvement", "poor"]
            },
            patterns_identified: { 
              type: "array", 
              items: { type: "string" } 
            },
            dietary_recommendations: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  change: { type: "string" },
                  reason: { type: "string" },
                  priority: { type: "string", enum: ["high", "medium", "low"] }
                }
              }
            },
            meal_timing_suggestions: { 
              type: "array", 
              items: { type: "string" } 
            },
            priority_actions: { 
              type: "array", 
              items: { type: "string" } 
            }
          }
        }
      });

      setAnalysis({
        ...result,
        stats: {
          avgGlucose,
          timeInRange,
          highReadings,
          lowReadings,
          totalReadings: glucoseReadings.length,
          avgCarbs,
          avgProtein,
          avgFiber,
          mealsLogged: meals.length
        }
      });
    } catch (error) {
      toast.error('Failed to analyze trends');
    } finally {
      setAnalyzing(false);
    }
  };

  const getControlColor = (control) => {
    switch (control) {
      case 'excellent': return 'emerald';
      case 'good': return 'blue';
      case 'needs_improvement': return 'amber';
      case 'poor': return 'rose';
      default: return 'slate';
    }
  };

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">Glucose Trend Analysis</CardTitle>
          <Button 
            onClick={analyzeTrends}
            disabled={analyzing || glucoseReadings.length < 10}
            className="bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700"
            size="sm"
          >
            {analyzing ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Sparkles className="w-4 h-4 mr-2" />
            )}
            Analyze Trends
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Stats Overview */}
        {glucoseReadings.length > 0 && (
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 bg-slate-50 rounded-xl text-center">
              <p className="text-xs text-slate-500">Glucose Readings</p>
              <p className="text-xl font-bold text-slate-700">{glucoseReadings.length}</p>
            </div>
            <div className="p-3 bg-slate-50 rounded-xl text-center">
              <p className="text-xs text-slate-500">Meals Logged</p>
              <p className="text-xl font-bold text-slate-700">{meals.length}</p>
            </div>
          </div>
        )}

        {/* Analysis Results */}
        {analysis && (
          <div className="space-y-4">
            {/* Overall Control */}
            <div className={cn(
              "p-4 rounded-xl",
              `bg-${getControlColor(analysis.overall_control)}-50`
            )}>
              <div className="flex items-start gap-3">
                {analysis.overall_control === 'excellent' || analysis.overall_control === 'good' ? (
                  <CheckCircle className={`w-5 h-5 text-${getControlColor(analysis.overall_control)}-600 mt-0.5`} />
                ) : (
                  <AlertCircle className={`w-5 h-5 text-${getControlColor(analysis.overall_control)}-600 mt-0.5`} />
                )}
                <div>
                  <h4 className={`font-semibold text-${getControlColor(analysis.overall_control)}-800 capitalize`}>
                    {analysis.overall_control.replace('_', ' ')} Control
                  </h4>
                  <div className="grid grid-cols-2 gap-2 mt-2 text-sm">
                    <div>
                      <p className={`text-${getControlColor(analysis.overall_control)}-600`}>Avg Glucose</p>
                      <p className={`font-semibold text-${getControlColor(analysis.overall_control)}-700`}>{analysis.stats.avgGlucose} mg/dL</p>
                    </div>
                    <div>
                      <p className={`text-${getControlColor(analysis.overall_control)}-600`}>Time in Range</p>
                      <p className={`font-semibold text-${getControlColor(analysis.overall_control)}-700`}>{analysis.stats.timeInRange}%</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Patterns Identified */}
            {analysis.patterns_identified?.length > 0 && (
              <div className="p-4 bg-blue-50 rounded-xl">
                <h4 className="font-semibold text-blue-800 mb-2 flex items-center gap-2">
                  <TrendingUp className="w-4 h-4" />
                  Patterns Identified
                </h4>
                <ul className="space-y-1.5">
                  {analysis.patterns_identified.map((pattern, idx) => (
                    <li key={idx} className="text-sm text-blue-700">📊 {pattern}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Dietary Recommendations */}
            {analysis.dietary_recommendations?.length > 0 && (
              <div className="space-y-3">
                <h4 className="font-semibold text-slate-800">Dietary Changes Needed</h4>
                {analysis.dietary_recommendations.map((rec, idx) => (
                  <div 
                    key={idx}
                    className={cn(
                      "p-4 rounded-xl border-l-4",
                      rec.priority === 'high' && "bg-rose-50 border-rose-500",
                      rec.priority === 'medium' && "bg-amber-50 border-amber-500",
                      rec.priority === 'low' && "bg-blue-50 border-blue-500"
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1">
                        <p className="font-semibold text-slate-800">{rec.change}</p>
                        <p className="text-sm text-slate-600 mt-1">{rec.reason}</p>
                      </div>
                      <span className={cn(
                        "text-xs font-medium px-2 py-1 rounded-full",
                        rec.priority === 'high' && "bg-rose-200 text-rose-700",
                        rec.priority === 'medium' && "bg-amber-200 text-amber-700",
                        rec.priority === 'low' && "bg-blue-200 text-blue-700"
                      )}>
                        {rec.priority}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Meal Timing */}
            {analysis.meal_timing_suggestions?.length > 0 && (
              <div className="p-4 bg-violet-50 rounded-xl">
                <h4 className="font-semibold text-violet-800 mb-2">Meal Timing Suggestions</h4>
                <ul className="space-y-1.5">
                  {analysis.meal_timing_suggestions.map((suggestion, idx) => (
                    <li key={idx} className="text-sm text-violet-700">⏰ {suggestion}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Priority Actions */}
            {analysis.priority_actions?.length > 0 && (
              <div className="p-4 bg-emerald-50 rounded-xl">
                <h4 className="font-semibold text-emerald-800 mb-2">Start Here - Priority Actions</h4>
                <ol className="space-y-2">
                  {analysis.priority_actions.map((action, idx) => (
                    <li key={idx} className="text-sm text-emerald-700 flex items-start gap-2">
                      <span className="font-bold text-emerald-600">{idx + 1}.</span>
                      <span>{action}</span>
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </div>
        )}

        {glucoseReadings.length < 10 && (
          <div className="p-6 bg-slate-50 rounded-xl text-center">
            <p className="text-slate-500 mb-2">Need more data for analysis</p>
            <p className="text-sm text-slate-400">Log at least 10 glucose readings to see trend analysis</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}