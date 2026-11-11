import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Loader2, Lightbulb, AlertTriangle, TrendingUp, Utensils } from 'lucide-react';
import api, { aiErrorMessage } from '@/api/client';
import { toast } from "sonner";

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
      // The server builds the context (profile, 7-day glucose, meals, exercise, sleep, activity, stress).
      const result = await api.ai.run('recommendations');
      setInsights(result);
    } catch (error) {
      toast.error(aiErrorMessage(error, 'Failed to generate insights'));
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