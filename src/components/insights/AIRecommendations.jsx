import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Loader2, Lightbulb, AlertTriangle, TrendingUp, Utensils } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { cn } from "@/lib/utils";

export default function AIRecommendations({ 
  glucoseReadings = [], 
  mealHistory = [], 
  userProfile,
  exerciseLogs = []
}) {
  const [insights, setInsights] = useState(null);
  const [loading, setLoading] = useState(false);

  const generateInsights = async () => {
    setLoading(true);
    try {
      const sleep = await base44.entities.SleepLog.list('-date', 7);
      const activity = await base44.entities.ActivityData.list('-date', 7);
      const stressLogs = await base44.entities.StressLog.list('-date', 7);

      // Calculate glucose statistics
      const avgGlucose = glucoseReadings.length > 0 
        ? Math.round(glucoseReadings.reduce((sum, r) => sum + r.reading, 0) / glucoseReadings.length)
        : null;
      
      const timeInRange = glucoseReadings.length > 0
        ? Math.round((glucoseReadings.filter(r => 
            r.reading >= (userProfile?.target_glucose_min || 70) && 
            r.reading <= (userProfile?.target_glucose_max || 140)
          ).length / glucoseReadings.length) * 100)
        : null;

      const prompt = `Analyze this comprehensive diabetes and health data to provide highly personalized, actionable recommendations:

User Profile:
- Diabetes Type: ${userProfile?.diabetes_type || 'type2'}
- Age: ${userProfile?.age}, Weight: ${userProfile?.weight}kg, Height: ${userProfile?.height}cm
- BMI: ${userProfile?.weight && userProfile?.height ? (userProfile.weight / Math.pow(userProfile.height/100, 2)).toFixed(1) : 'N/A'}
- Activity Level: ${userProfile?.activity_level || 'moderate'}
- Dietary Preference: ${userProfile?.dietary_preference || 'omnivore'}
- Target Glucose Range: ${userProfile?.target_glucose_min || 70}-${userProfile?.target_glucose_max || 140} mg/dL
- Current Average Glucose: ${avgGlucose || 'N/A'} mg/dL
- Time in Range: ${timeInRange || 'N/A'}%

Recent Glucose Readings (last 7 days):
${glucoseReadings.slice(0, 20).map(r => `- ${r.reading} mg/dL at ${r.reading_time} (${r.context || 'random'}) - ${r.trend || 'stable'}`).join('\n')}

Recent Meals (with glucose context):
${mealHistory.slice(0, 10).map(m => `- ${m.meal_name} (${m.meal_type}): ${m.carbs}g carbs, ${m.calories} cal, GI: ${m.glycemic_index} - ${m.is_completed ? 'Logged' : 'Planned'}`).join('\n')}

Recent Exercise:
${exerciseLogs.slice(0, 7).map(e => `- ${e.exercise_name}: ${e.actual_duration}min, pre-glucose: ${e.pre_exercise_glucose || 'N/A'}, post-glucose: ${e.post_exercise_glucose || 'N/A'}, felt: ${e.how_felt || 'N/A'}`).join('\n')}

Sleep Data (last 7 days):
${sleep.map(s => `- ${s.date}: ${s.total_hours}hrs (${s.quality}), deep: ${s.deep_sleep_minutes || 'N/A'}min, morning glucose: ${s.morning_glucose || 'N/A'} mg/dL`).join('\n')}

Activity Data (last 7 days):
${activity.map(a => `- ${a.date}: ${a.steps || 0} steps, ${a.active_minutes || 0}min active, ${a.calories_burned || 0} cal, avg HR: ${a.heart_rate_avg || 'N/A'} bpm`).join('\n')}

Stress Levels (last 7 days):
${stressLogs.map(s => `- ${s.date}: Stress Level ${s.stress_level}/5${s.notes ? ` - "${s.notes}"` : ''}`).join('\n')}

CRITICAL ANALYSIS REQUIRED:
1. Identify specific glucose patterns (spikes, drops, trends at certain times)
2. Correlate meals with glucose responses - which foods cause spikes?
3. Analyze sleep quality impact on glucose control
4. Exercise effectiveness - pre/post glucose changes
5. Activity level vs glucose stability
6. Heart rate patterns during activities
7. STRESS CORRELATION: Analyze if high stress days correlate with glucose fluctuations - provide specific examples
8. Overall lifestyle balance and diabetes management effectiveness

Provide SPECIFIC, DATA-DRIVEN recommendations based on their actual readings, not generic advice. Reference specific glucose values, meal timings, and patterns you observe.`;

      const result = await base44.integrations.Core.InvokeLLM({
        prompt,
        response_json_schema: {
          type: "object",
          properties: {
            patterns: {
              type: "array",
              items: { type: "string" },
              description: "Key patterns in glucose, sleep, activity, and lifestyle"
            },
            diet_recommendations: {
              type: "array",
              items: { type: "string" }
            },
            timing_suggestions: {
              type: "array",
              items: { type: "string" }
            },
            foods_to_include: {
              type: "array",
              items: { type: "string" }
            },
            foods_to_avoid: {
              type: "array",
              items: { type: "string" }
            },
            exercise_tips: {
              type: "array",
              items: { type: "string" }
            },
            alert: {
              type: "string"
            }
          }
        }
      });

      setInsights(result);
    } catch (error) {
      console.error('Error generating insights:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="border-0 shadow-sm bg-gradient-to-br from-violet-50 to-purple-50">
      <CardHeader>
        <CardTitle className="text-lg font-semibold flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-violet-600" />
          Health Insights
        </CardTitle>
      </CardHeader>
      <CardContent>
        {!insights ? (
          <div className="text-center py-6">
            <Lightbulb className="w-12 h-12 text-violet-300 mx-auto mb-4" />
            <p className="text-slate-600 mb-4">
              Get personalized recommendations based on your glucose patterns and meals
            </p>
            <Button 
              onClick={generateInsights}
              disabled={loading}
              className="bg-violet-600 hover:bg-violet-700"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Analyzing...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 mr-2" />
                  Generate Insights
                </>
              )}
            </Button>
          </div>
        ) : (
          <div className="space-y-6">
            {insights.alert && (
              <div className="p-4 bg-amber-100 rounded-xl flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5" />
                <p className="text-sm text-amber-800">{insights.alert}</p>
              </div>
            )}
            
            {insights.patterns?.length > 0 && (
              <div>
                <h4 className="font-semibold text-slate-700 flex items-center gap-2 mb-3">
                  <TrendingUp className="w-4 h-4 text-violet-600" />
                  Patterns Observed
                </h4>
                <ul className="space-y-2">
                  {insights.patterns.map((pattern, idx) => (
                    <li key={idx} className="text-sm text-slate-600 flex items-start gap-2">
                      <span className="text-violet-500">•</span>
                      {pattern}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            
            {insights.diet_recommendations?.length > 0 && (
              <div>
                <h4 className="font-semibold text-slate-700 flex items-center gap-2 mb-3">
                  <Utensils className="w-4 h-4 text-emerald-600" />
                  Diet Recommendations
                </h4>
                <ul className="space-y-2">
                  {insights.diet_recommendations.map((rec, idx) => (
                    <li key={idx} className="text-sm text-slate-600 flex items-start gap-2">
                      <span className="text-emerald-500">•</span>
                      {rec}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            
            <div className="grid grid-cols-2 gap-4">
              {insights.foods_to_include?.length > 0 && (
                <div className="p-3 bg-emerald-100 rounded-xl">
                  <h5 className="text-sm font-semibold text-emerald-800 mb-2">✓ Include</h5>
                  <div className="flex flex-wrap gap-1">
                    {insights.foods_to_include.map((food, idx) => (
                      <Badge key={idx} className="bg-emerald-200 text-emerald-800 text-xs">
                        {food}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
              
              {insights.foods_to_avoid?.length > 0 && (
                <div className="p-3 bg-rose-100 rounded-xl">
                  <h5 className="text-sm font-semibold text-rose-800 mb-2">✗ Limit</h5>
                  <div className="flex flex-wrap gap-1">
                    {insights.foods_to_avoid.map((food, idx) => (
                      <Badge key={idx} className="bg-rose-200 text-rose-800 text-xs">
                        {food}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
            
            <Button 
              variant="outline" 
              className="w-full"
              onClick={generateInsights}
              disabled={loading}
            >
              <Sparkles className="w-4 h-4 mr-2" />
              Refresh Insights
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}