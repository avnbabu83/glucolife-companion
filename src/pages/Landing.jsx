import React from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Activity, Heart, TrendingDown, Brain, Apple, Dumbbell, Moon, Users, Target, Shield } from 'lucide-react';
import { base44 } from '@/api/base44Client';

export default function Landing() {
  const handleGetStarted = () => {
    base44.auth.redirectToLogin('/Home');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-teal-50">
      {/* Hero Section */}
      <div className="relative overflow-hidden">
        <div className="max-w-6xl mx-auto px-4 py-12 md:py-20">
          <div className="text-center space-y-6">
            <div className="flex items-center justify-center gap-3 mb-6">
              <div className="relative w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-400 via-teal-500 to-cyan-600 flex items-center justify-center shadow-xl">
                <div className="absolute inset-0 bg-gradient-to-br from-emerald-300 to-transparent opacity-30 rounded-2xl"></div>
                <svg className="w-10 h-10 text-white relative z-10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z" />
                  <path d="M12 16v-4" strokeWidth="3" />
                  <circle cx="12" cy="18" r="0.5" fill="currentColor" strokeWidth="0" />
                </svg>
              </div>
              <h1 className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-emerald-600 to-teal-600 bg-clip-text text-transparent">DiabetEasy</h1>
            </div>
            
            <h2 className="text-3xl md:text-4xl font-bold text-slate-800 max-w-3xl mx-auto leading-tight">
              Your AI-Powered Diabetes Management Companion
            </h2>
            
            <p className="text-xl text-slate-600 max-w-2xl mx-auto">
              Take control of your diabetes with personalized meal plans, smart glucose tracking, 
              and AI-driven insights tailored to your unique health profile.
            </p>
            
            <div className="flex flex-col sm:flex-row gap-4 justify-center pt-6">
              <Button 
                size="lg" 
                className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-lg px-8 py-6"
                onClick={handleGetStarted}
              >
                Get Started Free
              </Button>
              <Button 
                size="lg" 
                variant="outline"
                className="text-lg px-8 py-6"
                onClick={() => document.getElementById('about').scrollIntoView({ behavior: 'smooth' })}
              >
                Learn More
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Features Section */}
      <div className="bg-white py-16">
        <div className="max-w-6xl mx-auto px-4">
          <h3 className="text-3xl font-bold text-center text-slate-800 mb-12">Everything You Need to Manage Diabetes</h3>
          
          <div className="grid md:grid-cols-3 gap-8">
            <Card className="border-0 shadow-lg hover:shadow-xl transition-shadow">
              <CardContent className="p-6">
                <div className="w-12 h-12 rounded-xl bg-emerald-100 flex items-center justify-center mb-4">
                  <Activity className="w-6 h-6 text-emerald-600" />
                </div>
                <h4 className="text-xl font-bold text-slate-800 mb-2">Real-Time CGM Integration</h4>
                <p className="text-slate-600">
                  Connect your Freestyle Libre, Dexcom, or other CGM devices for automatic glucose monitoring 
                  and instant insights on your levels.
                </p>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-lg hover:shadow-xl transition-shadow">
              <CardContent className="p-6">
                <div className="w-12 h-12 rounded-xl bg-violet-100 flex items-center justify-center mb-4">
                  <Apple className="w-6 h-6 text-violet-600" />
                </div>
                <h4 className="text-xl font-bold text-slate-800 mb-2">Personalized Meal Plans</h4>
                <p className="text-slate-600">
                  AI-generated meal plans tailored to your dietary preferences, diabetes type, 
                  and nutritional needs. Track what you eat and see its impact on glucose.
                </p>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-lg hover:shadow-xl transition-shadow">
              <CardContent className="p-6">
                <div className="w-12 h-12 rounded-xl bg-blue-100 flex items-center justify-center mb-4">
                  <Brain className="w-6 h-6 text-blue-600" />
                </div>
                <h4 className="text-xl font-bold text-slate-800 mb-2">AI Health Insights</h4>
                <p className="text-slate-600">
                  Get intelligent recommendations based on your glucose patterns, activity, sleep, 
                  and eating habits. Learn what works best for your body.
                </p>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-lg hover:shadow-xl transition-shadow">
              <CardContent className="p-6">
                <div className="w-12 h-12 rounded-xl bg-orange-100 flex items-center justify-center mb-4">
                  <Dumbbell className="w-6 h-6 text-orange-600" />
                </div>
                <h4 className="text-xl font-bold text-slate-800 mb-2">Exercise Tracking</h4>
                <p className="text-slate-600">
                  Log workouts manually or sync with Fitbit and Apple Health. 
                  See how exercise affects your glucose and get diabetes-safe recommendations.
                </p>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-lg hover:shadow-xl transition-shadow">
              <CardContent className="p-6">
                <div className="w-12 h-12 rounded-xl bg-indigo-100 flex items-center justify-center mb-4">
                  <Moon className="w-6 h-6 text-indigo-600" />
                </div>
                <h4 className="text-xl font-bold text-slate-800 mb-2">Sleep & Wellness</h4>
                <p className="text-slate-600">
                  Track sleep quality and see how it impacts your morning glucose. 
                  Get insights on how rest affects your diabetes management.
                </p>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-lg hover:shadow-xl transition-shadow">
              <CardContent className="p-6">
                <div className="w-12 h-12 rounded-xl bg-rose-100 flex items-center justify-center mb-4">
                  <Heart className="w-6 h-6 text-rose-600" />
                </div>
                <h4 className="text-xl font-bold text-slate-800 mb-2">Medication Reminders</h4>
                <p className="text-slate-600">
                  Never miss a dose with smart medication reminders. Track adherence and 
                  see how medications correlate with your glucose control.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* Mission Section */}
      <div id="about" className="py-16">
        <div className="max-w-4xl mx-auto px-4">
          <div className="text-center mb-12">
            <h3 className="text-3xl font-bold text-slate-800 mb-4">Our Mission</h3>
            <p className="text-xl text-slate-600">
              Empowering people with diabetes to live healthier, more confident lives through intelligent technology
            </p>
          </div>

          <Card className="border-0 shadow-xl bg-gradient-to-br from-emerald-50 to-teal-50">
            <CardContent className="p-8 md:p-12 space-y-6">
              <div className="flex items-start gap-4">
                <Target className="w-8 h-8 text-emerald-600 flex-shrink-0 mt-1" />
                <div>
                  <h4 className="text-xl font-bold text-slate-800 mb-2">Personalized Care</h4>
                  <p className="text-slate-600">
                    We believe that diabetes management is not one-size-fits-all. DiabetEasy uses advanced AI to 
                    understand your unique patterns and provide personalized recommendations that actually work for your body.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-4">
                <Users className="w-8 h-8 text-emerald-600 flex-shrink-0 mt-1" />
                <div>
                  <h4 className="text-xl font-bold text-slate-800 mb-2">Community-Driven</h4>
                  <p className="text-slate-600">
                    Built by people who understand the challenges of living with diabetes. We're constantly improving 
                    based on feedback from our community to create the most helpful tools possible.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-4">
                <Shield className="w-8 h-8 text-emerald-600 flex-shrink-0 mt-1" />
                <div>
                  <h4 className="text-xl font-bold text-slate-800 mb-2">Privacy First</h4>
                  <p className="text-slate-600">
                    Your health data is deeply personal. We use industry-leading security practices to keep your 
                    information safe and private. You're always in control of your data.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* CTA Section */}
      <div className="bg-gradient-to-r from-emerald-600 to-teal-600 py-16">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <h3 className="text-3xl md:text-4xl font-bold text-white mb-4">
            Ready to Take Control of Your Diabetes?
          </h3>
          <p className="text-xl text-emerald-100 mb-8">
            Join thousands of people managing their diabetes smarter with DiabetEasy
          </p>
          <Button 
            size="lg" 
            className="bg-white text-emerald-600 hover:bg-emerald-50 text-lg px-8 py-6"
            onClick={handleGetStarted}
          >
            Start Your Journey Today
          </Button>
        </div>
      </div>

      {/* Footer */}
      <div className="bg-slate-900 py-8">
        <div className="max-w-6xl mx-auto px-4 text-center text-slate-400">
          <p>© 2026 DiabetEasy. Your partner in diabetes management.</p>
          <p className="text-sm mt-2">Always consult with your healthcare provider about your diabetes management plan.</p>
        </div>
      </div>
    </div>
  );
}