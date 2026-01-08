import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import moment from 'moment';
import { Button } from "@/components/ui/button";
import { Link, useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { 
  Activity, 
  Utensils, 
  Pill, 
  Moon, 
  Dumbbell, 
  Settings,
  ArrowRight,
  Plus
} from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";

import QuickStats from '@/components/dashboard/QuickStats';
import UpcomingReminders from '@/components/dashboard/UpcomingReminders';
import GlucoseChart from '@/components/dashboard/GlucoseChart';
import AIRecommendations from '@/components/insights/AIRecommendations';
import QuickFoodLog from '@/components/logging/QuickFoodLog';
import QuickWorkoutLog from '@/components/logging/QuickWorkoutLog';
import NutritionComparison from '@/components/insights/NutritionComparison';
import GlucoseTrendAnalysis from '@/components/insights/GlucoseTrendAnalysis';
import LifestyleRoutineAnalyzer from '@/components/insights/LifestyleRoutineAnalyzer';
import PrivacyConsent from '@/components/privacy/PrivacyConsent';

export default function Home() {
  const [user, setUser] = useState(null);
  const [showFoodLog, setShowFoodLog] = useState(false);
  const [showWorkoutLog, setShowWorkoutLog] = useState(false);
  const [showConsent, setShowConsent] = useState(false);
  const queryClient = useQueryClient();
  const today = moment().format('YYYY-MM-DD');
  const navigate = useNavigate();

  useEffect(() => {
    const loadUser = async () => {
      const isAuthenticated = await base44.auth.isAuthenticated();
      if (!isAuthenticated) {
        navigate(createPageUrl('MainHome'));
        return;
      }
      try {
        const userData = await base44.auth.me();
        setUser(userData);
      } catch (error) {
        navigate(createPageUrl('MainHome'));
      }
    };
    loadUser();
  }, [navigate]);

  const { data: profile, isLoading: profileLoading } = useQuery({
    queryKey: ['userProfile'],
    queryFn: () => base44.entities.UserProfile.list(),
  });

  // Redirect to onboarding if no profile
  useEffect(() => {
    if (!profileLoading && (!profile || profile.length === 0)) {
      navigate(createPageUrl('Onboarding'));
    } else if (!profileLoading && profile?.[0] && !profile[0].consent_given_at) {
      setShowConsent(true);
    }
  }, [profile, profileLoading, navigate]);

  const { data: todayMeals = [] } = useQuery({
    queryKey: ['todayMeals', today],
    queryFn: () => base44.entities.MealPlan.filter({ date: today }),
  });

  const { data: todayGlucose = [] } = useQuery({
    queryKey: ['todayGlucose', today],
    queryFn: () => base44.entities.GlucoseReading.filter({ date: today }),
  });

  const { data: medications = [] } = useQuery({
    queryKey: ['medications'],
    queryFn: () => base44.entities.Medication.filter({ is_active: true }),
  });

  const { data: todayMedLogs = [] } = useQuery({
    queryKey: ['todayMedLogs', today],
    queryFn: () => base44.entities.MedicationLog.filter({ date: today }),
  });

  const { data: exercises = [] } = useQuery({
    queryKey: ['exercises'],
    queryFn: () => base44.entities.ExercisePlan.filter({ is_active: true }),
  });

  const { data: sleepLogs = [] } = useQuery({
    queryKey: ['sleepLogs'],
    queryFn: () => base44.entities.SleepLog.list('-date', 1),
  });

  const updateMealMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.MealPlan.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['todayMeals'] });
      toast.success('Food logged successfully!');
      setShowFoodLog(false);
    },
  });

  const createMealMutation = useMutation({
    mutationFn: (data) => base44.entities.MealPlan.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['todayMeals'] });
      toast.success('Food logged successfully!');
      setShowFoodLog(false);
    },
  });

  const createExerciseMutation = useMutation({
    mutationFn: (data) => base44.entities.ExerciseLog.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['exerciseLogs'] });
      toast.success('Workout logged successfully!');
      setShowWorkoutLog(false);
    },
  });

  const handleFoodSubmit = (data) => {
    if (data.id) {
      // Update existing meal
      updateMealMutation.mutate({ id: data.id, data });
    } else {
      // Create new meal
      createMealMutation.mutate(data);
    }
  };

  const userProfile = profile?.[0];
  
  // Show loading while checking profile
  if (profileLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-600">Loading...</p>
        </div>
      </div>
    );
  }
  
  const latestGlucose = todayGlucose.sort((a, b) => 
    moment(b.reading_time, 'HH:mm').diff(moment(a.reading_time, 'HH:mm'))
  )[0]?.reading;
  
  const completedMeals = todayMeals.filter(m => m.is_completed).length;
  const takenMeds = todayMedLogs.filter(l => l.status === 'taken').length;
  const lastSleepHours = sleepLogs[0]?.total_hours;

  const currentDayExercises = exercises.filter(e => 
    e.scheduled_days?.includes(moment().format('ddd'))
  );

  const quickActions = [
    { label: 'Log Glucose', icon: Activity, href: createPageUrl('Glucose'), color: 'bg-emerald-500' },
    { label: 'Meal Plan', icon: Utensils, href: createPageUrl('Meals'), color: 'bg-violet-500' },
    { label: 'Medications', icon: Pill, href: createPageUrl('Medications'), color: 'bg-blue-500' },
    { label: 'Exercise', icon: Dumbbell, href: createPageUrl('Exercise'), color: 'bg-rose-500' },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">
              {moment().format('h:mm A') < '12:00' ? 'Good Morning' : 
               moment().format('h:mm A') < '17:00' ? 'Good Afternoon' : 'Good Evening'}
              {user?.full_name && `, ${user.full_name.split(' ')[0]}`}
            </h1>
            <p className="text-slate-500 mt-1">{moment().format('dddd, MMMM D')}</p>
          </div>
          <Button 
            variant="outline" 
            onClick={() => base44.auth.logout()}
            className="text-slate-600 hover:text-slate-800"
          >
            Sign Out
          </Button>
        </div>

        {/* Quick Log Buttons */}
        <div className="grid grid-cols-2 gap-3">
          <Button 
            onClick={() => setShowFoodLog(true)}
            className="h-auto py-4 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 flex items-center justify-center gap-2"
          >
            <Utensils className="w-5 h-5" />
            <span className="font-semibold">Log Food</span>
          </Button>
          <Button 
            onClick={() => setShowWorkoutLog(true)}
            className="h-auto py-4 bg-gradient-to-r from-violet-500 to-purple-500 hover:from-violet-600 hover:to-purple-600 flex items-center justify-center gap-2"
          >
            <Dumbbell className="w-5 h-5" />
            <span className="font-semibold">Log Workout</span>
          </Button>
        </div>



        {/* Quick Stats */}
        <QuickStats 
          latestGlucose={latestGlucose}
          mealsToday={completedMeals}
          medicationsTaken={takenMeds}
          sleepHours={lastSleepHours}
          targetMin={userProfile?.target_glucose_min}
          targetMax={userProfile?.target_glucose_max}
        />

        {/* Quick Actions */}
        <div className="grid grid-cols-4 gap-3">
          {quickActions.map((action, idx) => (
            <Link key={idx} to={action.href}>
              <div className="flex flex-col items-center p-4 bg-white rounded-xl shadow-sm hover:shadow-md transition-all cursor-pointer">
                <div className={`${action.color} p-3 rounded-xl mb-2`}>
                  <action.icon className="w-5 h-5 text-white" />
                </div>
                <span className="text-xs font-medium text-slate-600 text-center">{action.label}</span>
              </div>
            </Link>
          ))}
        </div>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column */}
          <div className="lg:col-span-2 space-y-6">
            <GlucoseChart 
              readings={todayGlucose}
              targetMin={userProfile?.target_glucose_min || 70}
              targetMax={userProfile?.target_glucose_max || 140}
            />

            <NutritionComparison dateRange={7} />

            <GlucoseTrendAnalysis daysToAnalyze={14} />

            <UpcomingReminders 
              meals={todayMeals.filter(m => !m.is_completed)}
              medications={medications}
              exercises={currentDayExercises}
            />
          </div>

          {/* Right Column */}
          <div className="space-y-6">
            <LifestyleRoutineAnalyzer />

            <AIRecommendations 
              glucoseReadings={todayGlucose}
              mealHistory={todayMeals}
              userProfile={userProfile}
            />

            {/* Sleep Summary */}
            {sleepLogs[0] && (
              <div className="p-4 bg-indigo-50 rounded-xl">
                <div className="flex items-center gap-3">
                  <Moon className="w-5 h-5 text-indigo-600" />
                  <div>
                    <p className="text-sm font-medium text-indigo-800">Last Night's Sleep</p>
                    <p className="text-2xl font-bold text-indigo-600">{sleepLogs[0].total_hours} hours</p>
                    <p className="text-xs text-indigo-500 capitalize">{sleepLogs[0].quality} quality</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Privacy Consent */}
        <PrivacyConsent 
          open={showConsent}
          onComplete={() => setShowConsent(false)}
        />

        {/* Quick Log Dialogs */}
        <Dialog open={showFoodLog} onOpenChange={setShowFoodLog}>
          <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Log Food</DialogTitle>
            </DialogHeader>
            <QuickFoodLog 
              onSubmit={handleFoodSubmit}
              todayMeals={todayMeals}
            />
          </DialogContent>
        </Dialog>

        <Dialog open={showWorkoutLog} onOpenChange={setShowWorkoutLog}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Log Workout</DialogTitle>
            </DialogHeader>
            <QuickWorkoutLog onSubmit={(data) => createExerciseMutation.mutate(data)} />
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}