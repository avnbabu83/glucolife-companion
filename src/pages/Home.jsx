import React, { useState, useEffect } from 'react';
import { api, getAccessToken } from '@/api/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import moment from 'moment';
import { Button } from "@/components/ui/button";
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { 
  Activity, 
  Utensils, 
  Pill, 
  Moon, 
  Dumbbell,
  Target,
  Bell,
  Sparkles,
  ChevronRight
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
import DailyGlucoseTrendNotification from '@/components/insights/DailyGlucoseTrendNotification';
import DailyJournal from '@/components/logging/DailyJournal';
import DailyStressLogger from '@/components/logging/DailyStressLogger';

// One frosted bento tile: tells one thing and opens its detail card when tapped.
function BentoTile({ className = '', label, icon: Icon, onClick, children }) {
  return (
    <button type="button" onClick={onClick} className={`bento-tile text-left p-4 flex flex-col ${className}`}>
      <span className="flex items-center justify-between text-xs font-medium text-slate-500 w-full">
        <span className="flex items-center gap-1.5">
          {Icon && <Icon className="w-4 h-4" aria-hidden="true" />}
          {label}
        </span>
        <ChevronRight className="w-4 h-4" aria-hidden="true" />
      </span>
      <div className="mt-3 flex-1 w-full">{children}</div>
    </button>
  );
}

export default function Home() {
  const [user, setUser] = useState(null);
  const [showFoodLog, setShowFoodLog] = useState(false);
  const [showWorkoutLog, setShowWorkoutLog] = useState(false);
  const [showConsent, setShowConsent] = useState(false);
  const queryClient = useQueryClient();
  const today = moment().format('YYYY-MM-DD');
  const navigate = useNavigate();
  const location = useLocation();
  // Which bento tile is expanded into its full-height detail card.
  const [detail, setDetail] = useState(null);

  useEffect(() => {
    const loadUser = async () => {
      if (!getAccessToken()) {
        navigate(createPageUrl('MainHome'));
        return;
      }
      try {
        const userData = await api.auth.me();
        setUser(userData);
      } catch (error) {
        navigate(createPageUrl('MainHome'));
      }
    };
    loadUser();
  }, [navigate]);

  const { data: profile, isLoading: profileLoading } = useQuery({
    queryKey: ['userProfile'],
    queryFn: () => api.entities.UserProfile.list(),
  });

  // Redirect to onboarding if no profile
  useEffect(() => {
    if (!profileLoading && (!profile || profile.length === 0)) {
      navigate(createPageUrl('Onboarding'));
    } else if (!profileLoading && profile?.[0] && !profile[0].consent_given_at) {
      setShowConsent(true);
    }
  }, [profile, profileLoading, navigate]);

  // The Insights tab links to #insights on this page.
  useEffect(() => {
    if (!profileLoading && location.hash === '#insights') {
      document.getElementById('insights')?.scrollIntoView({ block: 'start' });
    }
  }, [location.hash, profileLoading]);

  const { data: todayMeals = [] } = useQuery({
    queryKey: ['todayMeals', today],
    queryFn: () => api.entities.MealPlan.filter({ date: today }),
  });

  const { data: todayGlucose = [] } = useQuery({
    queryKey: ['todayGlucose', today],
    queryFn: () => api.entities.GlucoseReading.filter({ date: today }),
  });

  const { data: medications = [] } = useQuery({
    queryKey: ['medications'],
    queryFn: () => api.entities.Medication.filter({ is_active: true }),
  });

  const { data: todayMedLogs = [] } = useQuery({
    queryKey: ['todayMedLogs', today],
    // MedicationLog is not one of the API's tables yet (open question), so no dose logs are loaded.
    queryFn: async () => [],
  });

  const { data: exercises = [] } = useQuery({
    queryKey: ['exercises'],
    // is_active lives in the row's extra object, which the API cannot filter on.
    queryFn: async () => (await api.entities.ExercisePlan.list()).filter((e) => e.is_active !== false),
  });

  const { data: sleepLogs = [] } = useQuery({
    queryKey: ['sleepLogs'],
    queryFn: () => api.entities.SleepLog.list('-date', 1),
  });

  const { data: todayStressLog = [] } = useQuery({
    queryKey: ['todayStressLog', today],
    queryFn: () => api.entities.StressLog.filter({ date: today }),
  });

  const updateMealMutation = useMutation({
    mutationFn: ({ id, data }) => api.entities.MealPlan.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['todayMeals'] });
      toast.success('Food logged successfully!');
      setShowFoodLog(false);
    },
  });

  const createMealMutation = useMutation({
    mutationFn: (data) => api.entities.MealPlan.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['todayMeals'] });
      toast.success('Food logged successfully!');
      setShowFoodLog(false);
    },
  });

  const createExerciseMutation = useMutation({
    mutationFn: (data) => api.entities.ExerciseLog.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['exerciseLogs'] });
      toast.success('Workout logged successfully!');
      setShowWorkoutLog(false);
    },
  });

  const createStressLogMutation = useMutation({
    mutationFn: (data) => api.entities.StressLog.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['todayStressLog'] });
      toast.success('Stress level saved!');
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

  // Bento tile summaries, derived only from the data already loaded above.
  const targetMin = userProfile?.target_glucose_min || 70;
  const targetMax = userProfile?.target_glucose_max || 140;
  const dayReadings = [...todayGlucose]
    .filter((r) => r.reading != null && r.reading_time)
    .sort((a, b) => String(a.reading_time).localeCompare(String(b.reading_time)));
  const inRangeCount = dayReadings.filter((r) => r.reading >= targetMin && r.reading <= targetMax).length;
  const timeInRange = dayReadings.length ? Math.round((inRangeCount / dayReadings.length) * 100) : null;
  const sparkPoints = dayReadings.map((r) => {
    const [h, m] = String(r.reading_time).split(':').map(Number);
    const x = (((h || 0) * 60 + (m || 0)) / 1440) * 300;
    const y = 58 - ((Math.min(Math.max(r.reading, 40), 300) - 40) / 260) * 54;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  const nextMeal = todayMeals
    .filter((m) => !m.is_completed)
    .sort((a, b) => String(a.scheduled_time || '').localeCompare(String(b.scheduled_time || '')))[0];

  const details = {
    glucose: {
      title: "Today's glucose",
      body: <GlucoseChart readings={todayGlucose} targetMin={targetMin} targetMax={targetMax} />,
    },
    range: {
      title: 'Today at a glance',
      body: (
        <QuickStats
          latestGlucose={latestGlucose}
          mealsToday={completedMeals}
          medicationsTaken={takenMeds}
          sleepHours={lastSleepHours}
          targetMin={userProfile?.target_glucose_min}
          targetMax={userProfile?.target_glucose_max}
        />
      ),
    },
    meal: {
      title: 'Coming up today',
      body: (
        <UpcomingReminders
          meals={todayMeals.filter(m => !m.is_completed)}
          medications={medications}
          exercises={currentDayExercises}
        />
      ),
    },
    sleep: {
      title: "Last night's sleep",
      body: sleepLogs[0] ? (
        <div className="space-y-1">
          <p className="tile-number text-4xl text-slate-900">{sleepLogs[0].total_hours} hours</p>
          <p className="text-sm text-slate-500 capitalize">{sleepLogs[0].quality} quality</p>
        </div>
      ) : (
        <p className="text-sm text-slate-500">No sleep logged yet.</p>
      ),
    },
    plans: {
      title: 'Plans and medications',
      body: (
        <div className="grid grid-cols-2 gap-3">
          {quickActions.map((action, idx) => (
            <Link key={idx} to={action.href} className="bento-tile flex flex-col items-center p-4">
              <div className={`${action.color} p-3 rounded-2xl mb-2`}>
                <action.icon className="w-5 h-5 text-white" />
              </div>
              <span className="text-xs font-medium text-slate-600 text-center">{action.label}</span>
            </Link>
          ))}
        </div>
      ),
    },
    insight: {
      title: 'Insight',
      body: (
        <AIRecommendations
          glucoseReadings={todayGlucose}
          mealHistory={todayMeals}
          userProfile={userProfile}
        />
      ),
    },
  };

  return (
    <div className="min-h-screen">
      <div className="max-w-3xl mx-auto px-4 py-6 space-y-5">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-display font-bold text-slate-900">
              {moment().format('h:mm A') < '12:00' ? 'Good Morning' : 
               moment().format('h:mm A') < '17:00' ? 'Good Afternoon' : 'Good Evening'}
              {user?.full_name && `, ${user.full_name.split(' ')[0]}`}
            </h1>
            <p className="text-slate-500 mt-1">{moment().format('dddd, MMMM D')}</p>
          </div>
          <Button 
            variant="outline" 
            onClick={() => api.auth.logout().finally(() => navigate('/sign-in'))}
            size="sm"
            className="text-slate-600 hover:text-slate-800"
          >
            Sign Out
          </Button>
        </div>

        {/* Three main actions as pills */}
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => setShowFoodLog(true)} className="gap-2">
            <Utensils className="w-4 h-4" /> Log Food
          </Button>
          <Button onClick={() => setShowWorkoutLog(true)} className="gap-2 bg-teal-500 hover:bg-teal-600">
            <Dumbbell className="w-4 h-4" /> Log Workout
          </Button>
          <Button asChild variant="outline" className="gap-2">
            <Link to={createPageUrl('Glucose')}><Activity className="w-4 h-4" /> Log Glucose</Link>
          </Button>
        </div>

        {/* Daily Glucose Trend Notification */}
        <DailyGlucoseTrendNotification />

        {/* Bento grid: tap any tile to open its detail card */}
        <div className="bento-grid grid grid-cols-2 gap-3">
          <BentoTile className="col-span-2" label="Glucose now" icon={Activity} onClick={() => setDetail('glucose')}>
            <div className="flex items-end justify-between gap-4">
              <p className="tile-number text-4xl text-slate-900">
                {latestGlucose ?? '--'}<span className="text-sm font-sans font-medium text-slate-500 ml-1">mg/dL</span>
              </p>
              <span className="text-xs text-slate-500">Target {targetMin}-{targetMax}</span>
            </div>
            <svg viewBox="0 0 300 60" className="w-full h-14 mt-3" role="img" aria-label="Glucose over the last 24 hours" preserveAspectRatio="none">
              <rect x="0" y={58 - ((targetMax - 40) / 260) * 54} width="300" height={((targetMax - targetMin) / 260) * 54} fill="#0E8F82" opacity="0.1" />
              {dayReadings.length > 1 ? (
                <polyline points={sparkPoints} fill="none" stroke="#2F52C9" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
              ) : (
                <text x="150" y="34" textAnchor="middle" fontSize="11" fill="#64748b">No readings yet today</text>
              )}
            </svg>
          </BentoTile>

          <BentoTile className="aspect-square" label="Time in range" icon={Target} onClick={() => setDetail('range')}>
            <p className="tile-number text-4xl text-teal-600">{timeInRange == null ? '--' : `${timeInRange}%`}</p>
            <p className="text-xs text-slate-500 mt-1">{dayReadings.length} readings today</p>
          </BentoTile>

          <BentoTile className="row-span-2" label="Sleep" icon={Moon} onClick={() => setDetail('sleep')}>
            <p className="tile-number text-4xl text-slate-900">{lastSleepHours ?? '--'}<span className="text-sm font-sans font-medium text-slate-500 ml-1">h</span></p>
            <p className="text-xs text-slate-500 mt-1 capitalize">{sleepLogs[0]?.quality ? `${sleepLogs[0].quality} quality` : 'Last night'}</p>
          </BentoTile>

          <BentoTile className="aspect-square" label="Next meal" icon={Bell} onClick={() => setDetail('meal')}>
            <p className="font-display font-bold text-slate-900 leading-snug line-clamp-2">{nextMeal?.meal_name || 'All done'}</p>
            <p className="text-xs text-slate-500 mt-1">{nextMeal?.scheduled_time || `${completedMeals} eaten today`}</p>
          </BentoTile>

          <BentoTile className="aspect-square" label="Plans" icon={Pill} onClick={() => setDetail('plans')}>
            <p className="tile-number text-4xl text-slate-900">{medications.length}</p>
            <p className="text-xs text-slate-500 mt-1">active medications</p>
          </BentoTile>

          <BentoTile className="aspect-square" label="Insight" icon={Sparkles} onClick={() => setDetail('insight')}>
            <p className="font-display font-bold text-emerald-600 leading-snug">Personal tips</p>
            <p className="text-xs text-slate-500 mt-1">From today's data</p>
          </BentoTile>
        </div>

        {/* Daily Stress Logger - show if not logged today */}
        {todayStressLog.length === 0 && (
          <DailyStressLogger 
            onSubmit={(data) => createStressLogMutation.mutate(data)}
          />
        )}

        <DailyJournal 
          onLogMeal={() => setShowFoodLog(true)}
          onLogExercise={() => setShowWorkoutLog(true)}
        />

        {/* Insights tab lands here */}
        <section id="insights" className="space-y-5 scroll-mt-20" aria-labelledby="insights-heading">
          <h2 id="insights-heading" className="text-xl font-display font-bold text-slate-900">Insights</h2>
          <GlucoseTrendAnalysis daysToAnalyze={14} />
          <NutritionComparison dateRange={7} />
          <LifestyleRoutineAnalyzer />
        </section>

        {/* Full-height detail card for the tapped tile */}
        <Dialog open={!!detail} onOpenChange={(open) => !open && setDetail(null)}>
          <DialogContent className="max-w-lg h-[92vh] overflow-y-auto rounded-3xl bg-white/90 backdrop-blur-xl">
            <DialogHeader>
              <DialogTitle className="font-display">{detail ? details[detail].title : ''}</DialogTitle>
            </DialogHeader>
            {detail && details[detail].body}
          </DialogContent>
        </Dialog>

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