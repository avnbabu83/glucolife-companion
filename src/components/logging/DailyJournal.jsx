import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { 
  BookOpen, 
  Camera, 
  Sparkles, 
  Loader2, 
  X,
  Utensils,
  Dumbbell,
  TrendingUp,
  Lightbulb
} from 'lucide-react';
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import moment from 'moment';

export default function DailyJournal({ onLogMeal, onLogExercise }) {
  const [journalText, setJournalText] = useState('');
  const [uploadedImage, setUploadedImage] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [summary, setSummary] = useState(null);

  const { data: profile } = useQuery({
    queryKey: ['userProfile'],
    queryFn: () => base44.entities.UserProfile.list(),
  });

  const today = moment().format('YYYY-MM-DD');

  const { data: todayGlucose = [] } = useQuery({
    queryKey: ['glucoseReadings', today],
    queryFn: () => base44.entities.GlucoseReading.filter({ date: today }),
  });

  const userProfile = profile?.[0];

  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      setImagePreview(reader.result);
    };
    reader.readAsDataURL(file);

    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      setUploadedImage(file_url);
      toast.success('Photo uploaded');
    } catch (error) {
      toast.error('Failed to upload photo');
    }
  };

  const clearImage = () => {
    setUploadedImage(null);
    setImagePreview(null);
  };

  const analyzeDaySummary = async () => {
    if (!journalText.trim() && !uploadedImage) {
      toast.error('Please write something or upload a photo');
      return;
    }

    setAnalyzing(true);
    try {
      // Build glucose context
      let glucoseContext = '';
      if (todayGlucose.length > 0) {
        const readings = todayGlucose
          .sort((a, b) => a.reading_time.localeCompare(b.reading_time))
          .map(r => `${r.reading_time}: ${r.reading} mg/dL${r.context ? ` (${r.context})` : ''}`)
          .join('\n');
        
        const avgGlucose = Math.round(todayGlucose.reduce((sum, r) => sum + r.reading, 0) / todayGlucose.length);
        const targetMin = userProfile?.target_glucose_min || 70;
        const targetMax = userProfile?.target_glucose_max || 180;
        
        glucoseContext = `\n\nACTUAL GLUCOSE READINGS TODAY:
${readings}
Average: ${avgGlucose} mg/dL (Target: ${targetMin}-${targetMax} mg/dL)

CRITICAL: Use these actual readings to provide SPECIFIC feedback about what happened after meals/activities they mention, not generic "can help" statements. Reference actual times and values.`;
      }

      const result = await base44.integrations.Core.InvokeLLM({
        prompt: `Analyze this daily health journal entry for someone with ${userProfile?.diabetes_type || 'type 2'} diabetes:

"${journalText}"

${uploadedImage ? 'Also analyze the attached photo for any food items or activities.' : ''}${glucoseContext}

Provide:
1. A brief personalized summary of their day (2-3 sentences)
2. Key events: meals, exercises, activities mentioned
3. ${todayGlucose.length > 0 ? 'ACTUAL glucose impact based on their readings - reference specific times and values from their data. Show what ACTUALLY happened, not what "can" happen.' : 'Potential impact on glucose levels'}
4. 2-3 specific actionable tips for better diabetes management
5. If meals/exercises are mentioned, suggest if they should log them with details

Be encouraging, conversational, and focus on diabetes-friendly insights. ${todayGlucose.length > 0 ? 'ALWAYS reference their actual glucose data when discussing impact.' : ''}`,
        file_urls: uploadedImage ? [uploadedImage] : undefined,
        response_json_schema: {
          type: "object",
          properties: {
            summary: { type: "string" },
            meals_mentioned: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  description: { type: "string" },
                  meal_type: { type: "string" },
                  should_log: { type: "boolean" }
                }
              }
            },
            exercises_mentioned: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  description: { type: "string" },
                  duration_estimate: { type: "number" },
                  should_log: { type: "boolean" }
                }
              }
            },
            glucose_impact: { type: "string" },
            tips: { type: "array", items: { type: "string" } }
          }
        }
      });

      setSummary(result);
      toast.success('Day analyzed!');
    } catch (error) {
      toast.error('Failed to analyze');
    } finally {
      setAnalyzing(false);
    }
  };

  const clearJournal = () => {
    setJournalText('');
    setUploadedImage(null);
    setImagePreview(null);
    setSummary(null);
  };

  return (
    <Card className="border-0 shadow-sm bg-gradient-to-br from-blue-50 to-indigo-50">
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <BookOpen className="w-5 h-5 text-indigo-600" />
          Quick Daily Log
        </CardTitle>
        <p className="text-sm text-slate-600 mt-1">
          📝 Summarize your day's meals, activities, and feelings here. AI will help you create detailed log entries all at once.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Journal Input */}
        <div>
          <Textarea
            value={journalText}
            onChange={(e) => setJournalText(e.target.value)}
            placeholder="e.g., Skipped breakfast today but had a big lunch. Walked for about an hour with colleagues, usual 3km evening walk, light salad for dinner, and gym for 1.5 hours..."
            className="min-h-[120px] bg-white"
            disabled={analyzing}
          />
        </div>

        {/* Photo Upload */}
        <div className="flex gap-2">
          {imagePreview ? (
            <div className="relative">
              <img 
                src={imagePreview} 
                alt="Journal" 
                className="h-24 w-24 object-cover rounded-lg"
              />
              <Button
                type="button"
                variant="destructive"
                size="icon"
                className="absolute -top-2 -right-2 h-6 w-6"
                onClick={clearImage}
              >
                <X className="w-3 h-3" />
              </Button>
            </div>
          ) : (
            <label className="flex items-center justify-center h-24 w-24 border-2 border-dashed border-slate-300 rounded-lg cursor-pointer hover:border-indigo-500 hover:bg-indigo-50 transition-all">
              <Camera className="w-6 h-6 text-slate-400" />
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleImageUpload}
                disabled={analyzing}
              />
            </label>
          )}
        </div>

        <div className="flex gap-2">
          <Button 
            onClick={analyzeDaySummary}
            disabled={analyzing || (!journalText.trim() && !uploadedImage)}
            className="flex-1 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700"
          >
            {analyzing ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Analyzing...
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4 mr-2" />
                Analyze My Day
              </>
            )}
          </Button>
          {(journalText || uploadedImage || summary) && (
            <Button 
              onClick={clearJournal}
              variant="outline"
              disabled={analyzing}
            >
              Clear
            </Button>
          )}
        </div>

        {/* AI Summary */}
        {summary && (
          <div className="space-y-4 pt-4 border-t">
            {/* Summary */}
            <div className="p-4 bg-white rounded-xl">
              <h4 className="font-semibold text-slate-800 mb-2">Your Day Summary</h4>
              <p className="text-sm text-slate-600">{summary.summary}</p>
            </div>

            {/* Glucose Impact */}
            {summary.glucose_impact && (
              <div className="p-4 bg-blue-50 rounded-xl">
                <h4 className="font-semibold text-blue-800 mb-2 flex items-center gap-2">
                  <TrendingUp className="w-4 h-4" />
                  Glucose Impact
                </h4>
                <p className="text-sm text-blue-700">{summary.glucose_impact}</p>
              </div>
            )}

            {/* Smart Suggestions */}
            {(summary.meals_mentioned?.length > 0 || summary.exercises_mentioned?.length > 0) && (
              <div className="p-4 bg-emerald-50 rounded-xl space-y-3">
                <h4 className="font-semibold text-emerald-800">Smart Suggestions</h4>
                
                {summary.meals_mentioned?.filter(m => m.should_log).map((meal, idx) => (
                  <div key={idx} className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2 flex-1">
                      <Utensils className="w-4 h-4 text-emerald-600 mt-0.5" />
                      <div>
                        <p className="text-sm text-emerald-700">{meal.description}</p>
                        <Badge className="bg-emerald-200 text-emerald-800 text-xs mt-1">
                          {meal.meal_type}
                        </Badge>
                      </div>
                    </div>
                    <Button 
                      size="sm" 
                      variant="outline"
                      onClick={() => onLogMeal?.()}
                      className="text-xs"
                    >
                      Log Details
                    </Button>
                  </div>
                ))}

                {summary.exercises_mentioned?.filter(e => e.should_log).map((exercise, idx) => (
                  <div key={idx} className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2 flex-1">
                      <Dumbbell className="w-4 h-4 text-emerald-600 mt-0.5" />
                      <div>
                        <p className="text-sm text-emerald-700">{exercise.description}</p>
                        <Badge className="bg-emerald-200 text-emerald-800 text-xs mt-1">
                          ~{exercise.duration_estimate} min
                        </Badge>
                      </div>
                    </div>
                    <Button 
                      size="sm" 
                      variant="outline"
                      onClick={() => onLogExercise?.()}
                      className="text-xs"
                    >
                      Log Details
                    </Button>
                  </div>
                ))}
              </div>
            )}

            {/* Tips */}
            {summary.tips?.length > 0 && (
              <div className="p-4 bg-violet-50 rounded-xl">
                <h4 className="font-semibold text-violet-800 mb-2 flex items-center gap-2">
                  <Lightbulb className="w-4 h-4" />
                  Tips for You
                </h4>
                <ul className="space-y-1">
                  {summary.tips.map((tip, idx) => (
                    <li key={idx} className="text-sm text-violet-700">✓ {tip}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}