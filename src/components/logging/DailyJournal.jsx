import React, { useState } from 'react';
import api, { aiErrorMessage } from '@/api/client';
import { resizeImage } from '@/api/image';
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
import { toast } from "sonner";

export default function DailyJournal({ onLogMeal, onLogExercise }) {
  const [journalText, setJournalText] = useState('');
  const [uploadedImage, setUploadedImage] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [summary, setSummary] = useState(null);


  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      setImagePreview(reader.result);
    };
    reader.readAsDataURL(file);

    try {
      const { file_key } = await api.uploads.upload(await resizeImage(file));
      setUploadedImage(file_key);
      toast.success('Photo uploaded');
    } catch (error) {
      toast.error('Photo upload failed');
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
      // The server adds today's glucose readings and the profile; uploadedImage holds the file_key.
      const result = await api.ai.run('journal-summary', {
        text: journalText.slice(0, 4000),
        ...(uploadedImage ? { file_keys: [uploadedImage] } : {}),
      });

      setSummary(result);
      toast.success('Day analyzed!');
    } catch (error) {
      toast.error(aiErrorMessage(error, 'Failed to analyze'));
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
                accept="image/jpeg,image/png,image/webp"
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