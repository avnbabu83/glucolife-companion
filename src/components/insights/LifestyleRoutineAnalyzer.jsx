import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sparkles, Loader2, Clock, Utensils, Dumbbell, AlertCircle, CheckCircle } from 'lucide-react';
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import moment from 'moment';

export default function LifestyleRoutineAnalyzer() {
  const [routine, setRoutine] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState(null);
  const [merging, setMerging] = useState(false);
  const queryClient = useQueryClient();

  const { data: profile } = useQuery({
    queryKey: ['userProfile'],
    queryFn: () => base44.entities.UserProfile.list(),
  });

  const userProfile = profile?.[0];

  // Load saved routine on mount
  React.useEffect(() => {
    if (userProfile?.daily_routine) {
      setRoutine(userProfile.daily_routine);
    }
  }, [userProfile]);

  const mergeMutation = useMutation({
    mutationFn: async ({ meals, exercises }) => {
      const mealPromises = meals.map(m => base44.entities.MealPlan.create(m));
      const exercisePromises = exercises.map(e => base44.entities.ExercisePlan.create(e));
      await Promise.all([...mealPromises, ...exercisePromises]);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['meals'] });
      queryClient.invalidateQueries({ queryKey: ['exercises'] });
      toast.success('Recommendations merged into your plans!');
    }
  });

  const [showMergePreview, setShowMergePreview] = useState(false);
  const [mergePreview, setMergePreview] = useState({ meals: [], exercises: [] });

  const generateMergePreview = () => {
    if (!analysis) return;
    
    const meals = [];
    const exercises = [];

    // Convert meal recommendations to meal plans
    if (analysis.meal_recommendations?.length > 0) {
      analysis.meal_recommendations.forEach((rec, idx) => {
        const date = moment().add(idx, 'days').format('YYYY-MM-DD');
        meals.push({
          date,
          meal_type: rec.meal?.toLowerCase() || 'breakfast',
          scheduled_time: rec.suggested_time || '07:00',
          meal_name: rec.meal_ideas?.[0] || `${rec.meal}`,
          description: rec.reasoning,
          calories: 400,
          carbs: 50,
          protein: 20,
          fat: 15,
          fiber: 5,
          glycemic_index: 'low',
          is_completed: false,
          source: 'lifestyle_analyzer'
        });
      });
    }

    // Convert exercise opportunities to exercise plans
    if (analysis.exercise_opportunities?.length > 0) {
      analysis.exercise_opportunities.forEach(opp => {
        exercises.push({
          name: opp.activity,
          exercise_type: 'walking',
          duration_minutes: parseInt(opp.duration) || 30,
          intensity: 'moderate',
          scheduled_days: ['Mon', 'Wed', 'Fri'],
          scheduled_time: '07:00',
          calories_burned: 150,
          notes: opp.how_to_fit,
          precautions: 'Check glucose before and after exercise',
          is_active: true,
          source: 'lifestyle_analyzer'
        });
      });
    }

    setMergePreview({ meals, exercises });
    setShowMergePreview(true);
  };

  const confirmMerge = async () => {
    setMerging(true);
    try {
      await mergeMutation.mutateAsync(mergePreview);
      setShowMergePreview(false);
    } catch (error) {
      toast.error('Failed to merge recommendations');
    } finally {
      setMerging(false);
    }
  };

  const exampleRoutine = `I wake up around 5:30 and catch a train to work by 6:45, so no exercise and no breakfast. I walk for 1 km to work from train station and I do a desk job with minimal walking or in office walking from desk to desk or meeting rooms. Around lunch I usually have a subway veggie salad and walk 10 mins each way from office to subway. 1km walk to station in the evening and 2km walk home from station and potentially gym/tennis 2-3 times a week on weekends or evening.`;

  const analyzeRoutine = async () => {
    if (!routine.trim()) {
      toast.error('Please describe your daily routine');
      return;
    }

    // Save routine to profile
    if (userProfile) {
      await base44.entities.UserProfile.update(userProfile.id, { daily_routine: routine });
    }

    setAnalyzing(true);
    try {
      const result = await base44.integrations.Core.InvokeLLM({
        prompt: `Analyze this daily routine for someone with diabetes and provide detailed, actionable recommendations:

        "${routine}"
        
        Provide:
        1. Schedule breakdown (extract times, activities, and meals)
        2. Risk factors for diabetes management
        3. Specific meal timing recommendations
        4. Exercise opportunities within their schedule
        5. Priority changes that fit their lifestyle
        
        Be practical and considerate of their constraints (work schedule, commute, etc).`,
        response_json_schema: {
          type: "object",
          properties: {
            schedule_breakdown: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  time: { type: "string" },
                  activity: { type: "string" },
                  category: { type: "string", enum: ["meal", "exercise", "work", "commute", "rest"] }
                }
              }
            },
            risk_factors: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  risk: { type: "string" },
                  severity: { type: "string", enum: ["high", "medium", "low"] },
                  impact: { type: "string" }
                }
              }
            },
            meal_recommendations: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  meal: { type: "string" },
                  suggested_time: { type: "string" },
                  reasoning: { type: "string" },
                  meal_ideas: { type: "array", items: { type: "string" } }
                }
              }
            },
            exercise_opportunities: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  when: { type: "string" },
                  activity: { type: "string" },
                  duration: { type: "string" },
                  how_to_fit: { type: "string" }
                }
              }
            },
            priority_changes: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  change: { type: "string" },
                  why: { type: "string" },
                  how: { type: "string" },
                  priority: { type: "number" }
                }
              }
            }
          }
        }
      });

      setAnalysis(result);
    } catch (error) {
      toast.error('Failed to analyze routine');
    } finally {
      setAnalyzing(false);
    }
  };

  const categoryIcons = {
    meal: Utensils,
    exercise: Dumbbell,
    work: Clock,
    commute: Clock,
    rest: Clock
  };

  const categoryColors = {
    meal: 'emerald',
    exercise: 'violet',
    work: 'blue',
    commute: 'slate',
    rest: 'indigo'
  };

  return (
    <>
      <Card className="border-0 shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg">Lifestyle Routine Analyzer</CardTitle>
          <p className="text-sm text-slate-500 mt-1">
            Describe your daily routine in your own words, and get personalized diabetes management recommendations
          </p>
        </CardHeader>
        <CardContent className="space-y-6">
        <div>
          <Label>Describe Your Daily Routine</Label>
          <Textarea
            value={routine}
            onChange={(e) => setRoutine(e.target.value)}
            placeholder={exampleRoutine}
            className="mt-2 h-32 resize-none"
          />
          <p className="text-xs text-slate-400 mt-2">
            Include wake time, meals, commute, work, exercise, and any other regular activities
          </p>
        </div>

        <Button 
          onClick={analyzeRoutine}
          disabled={analyzing || !routine.trim()}
          className="w-full bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700"
        >
          {analyzing ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Analyzing Your Routine...
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4 mr-2" />
              Analyze My Routine
            </>
          )}
        </Button>

        {analysis && (
          <div className="space-y-6 pt-4 border-t">
            {/* Merge Button */}
            <Button 
              onClick={generateMergePreview}
              className="w-full bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700"
            >
              <CheckCircle className="w-4 h-4 mr-2" />
              Preview & Merge Recommendations
            </Button>
            {/* Schedule Breakdown */}
            {analysis.schedule_breakdown?.length > 0 && (
              <div>
                <h4 className="font-semibold text-slate-800 mb-3 flex items-center gap-2">
                  <Clock className="w-4 h-4" />
                  Your Daily Schedule
                </h4>
                <div className="space-y-2">
                  {analysis.schedule_breakdown.map((item, idx) => {
                    const Icon = categoryIcons[item.category];
                    const color = categoryColors[item.category];
                    return (
                      <div key={idx} className={`p-3 rounded-xl bg-${color}-50 flex items-center gap-3`}>
                        <Icon className={`w-4 h-4 text-${color}-600 flex-shrink-0`} />
                        <div className="flex-1">
                          <p className="text-sm font-medium text-slate-800">{item.activity}</p>
                          <p className="text-xs text-slate-500">{item.time}</p>
                        </div>
                        <Badge variant="outline" className="text-xs capitalize">{item.category}</Badge>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Risk Factors */}
            {analysis.risk_factors?.length > 0 && (
              <div>
                <h4 className="font-semibold text-slate-800 mb-3 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-amber-600" />
                  Diabetes Risk Factors in Your Routine
                </h4>
                <div className="space-y-3">
                  {analysis.risk_factors.map((risk, idx) => (
                    <div 
                      key={idx}
                      className={cn(
                        "p-4 rounded-xl border-l-4",
                        risk.severity === 'high' && "bg-rose-50 border-rose-500",
                        risk.severity === 'medium' && "bg-amber-50 border-amber-500",
                        risk.severity === 'low' && "bg-blue-50 border-blue-500"
                      )}
                    >
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <p className="font-semibold text-slate-800">{risk.risk}</p>
                        <Badge 
                          className={cn(
                            risk.severity === 'high' && "bg-rose-200 text-rose-700",
                            risk.severity === 'medium' && "bg-amber-200 text-amber-700",
                            risk.severity === 'low' && "bg-blue-200 text-blue-700"
                          )}
                        >
                          {risk.severity}
                        </Badge>
                      </div>
                      <p className="text-sm text-slate-600">{risk.impact}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Meal Recommendations */}
            {analysis.meal_recommendations?.length > 0 && (
              <div>
                <h4 className="font-semibold text-slate-800 mb-3 flex items-center gap-2">
                  <Utensils className="w-4 h-4 text-emerald-600" />
                  Meal Timing & Ideas
                </h4>
                <div className="space-y-4">
                  {analysis.meal_recommendations.map((meal, idx) => (
                    <div key={idx} className="p-4 bg-emerald-50 rounded-xl">
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <p className="font-semibold text-emerald-800">{meal.meal}</p>
                          <p className="text-sm text-emerald-600">Suggested: {meal.suggested_time}</p>
                        </div>
                      </div>
                      <p className="text-sm text-emerald-700 mb-3">{meal.reasoning}</p>
                      {meal.meal_ideas?.length > 0 && (
                        <div>
                          <p className="text-xs font-medium text-emerald-800 mb-1">Quick Ideas:</p>
                          <ul className="space-y-1">
                            {meal.meal_ideas.map((idea, i) => (
                              <li key={i} className="text-xs text-emerald-700">• {idea}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Exercise Opportunities */}
            {analysis.exercise_opportunities?.length > 0 && (
              <div>
                <h4 className="font-semibold text-slate-800 mb-3 flex items-center gap-2">
                  <Dumbbell className="w-4 h-4 text-violet-600" />
                  Exercise Opportunities
                </h4>
                <div className="space-y-3">
                  {analysis.exercise_opportunities.map((opp, idx) => (
                    <div key={idx} className="p-4 bg-violet-50 rounded-xl">
                      <div className="flex items-start justify-between mb-2">
                        <p className="font-semibold text-violet-800">{opp.activity}</p>
                        <Badge className="bg-violet-200 text-violet-700">{opp.duration}</Badge>
                      </div>
                      <p className="text-sm text-violet-600 mb-1">When: {opp.when}</p>
                      <p className="text-sm text-violet-700">{opp.how_to_fit}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Priority Changes */}
            {analysis.priority_changes?.length > 0 && (
              <div>
                <h4 className="font-semibold text-slate-800 mb-3">Priority Changes to Make</h4>
                <div className="space-y-3">
                  {analysis.priority_changes
                    .sort((a, b) => a.priority - b.priority)
                    .map((change, idx) => (
                      <div key={idx} className="p-4 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl border border-blue-200">
                        <div className="flex items-start gap-3">
                          <div className="w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0">
                            {change.priority}
                          </div>
                          <div className="flex-1">
                            <p className="font-semibold text-slate-800 mb-1">{change.change}</p>
                            <p className="text-sm text-slate-600 mb-2">Why: {change.why}</p>
                            <p className="text-sm text-blue-700 bg-white/60 p-2 rounded">💡 {change.how}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>

    {/* Merge Preview Dialog */}
    <Dialog open={showMergePreview} onOpenChange={setShowMergePreview}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Preview Recommendations to Merge</DialogTitle>
          <p className="text-sm text-slate-500">
            Review what will be added to your meal and exercise plans. These will appear with a special indicator.
          </p>
        </DialogHeader>

        <div className="space-y-6 pt-4">
          {mergePreview.meals.length > 0 && (
            <div>
              <h4 className="font-semibold text-slate-800 mb-3 flex items-center gap-2">
                <Utensils className="w-4 h-4 text-emerald-600" />
                Meals to Add ({mergePreview.meals.length})
              </h4>
              <div className="space-y-2">
                {mergePreview.meals.map((meal, idx) => (
                  <div key={idx} className="p-3 bg-emerald-50 rounded-xl border-2 border-emerald-300">
                    <div className="flex items-center justify-between mb-1">
                      <p className="font-semibold text-emerald-800">{meal.meal_name}</p>
                      <Badge className="bg-emerald-200 text-emerald-800 text-xs">
                        From Analyzer
                      </Badge>
                    </div>
                    <p className="text-xs text-emerald-700 mb-1">
                      {meal.date} • {meal.scheduled_time} • {meal.meal_type}
                    </p>
                    <p className="text-xs text-slate-600">{meal.description}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {mergePreview.exercises.length > 0 && (
            <div>
              <h4 className="font-semibold text-slate-800 mb-3 flex items-center gap-2">
                <Dumbbell className="w-4 h-4 text-violet-600" />
                Exercises to Add ({mergePreview.exercises.length})
              </h4>
              <div className="space-y-2">
                {mergePreview.exercises.map((exercise, idx) => (
                  <div key={idx} className="p-3 bg-violet-50 rounded-xl border-2 border-violet-300">
                    <div className="flex items-center justify-between mb-1">
                      <p className="font-semibold text-violet-800">{exercise.name}</p>
                      <Badge className="bg-violet-200 text-violet-800 text-xs">
                        From Analyzer
                      </Badge>
                    </div>
                    <p className="text-xs text-violet-700 mb-1">
                      {exercise.duration_minutes} min • {exercise.intensity} • {exercise.scheduled_days.join(', ')}
                    </p>
                    <p className="text-xs text-slate-600">{exercise.notes}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex gap-3 pt-4 border-t">
            <Button 
              variant="outline"
              onClick={() => setShowMergePreview(false)}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button 
              onClick={confirmMerge}
              disabled={merging}
              className="flex-1 bg-emerald-600 hover:bg-emerald-700"
            >
              {merging ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Merging...
                </>
              ) : (
                <>
                  <CheckCircle className="w-4 h-4 mr-2" />
                  Confirm & Merge
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
    </>
  );
}