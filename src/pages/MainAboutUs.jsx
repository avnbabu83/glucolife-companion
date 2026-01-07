import React, { useEffect, useState } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Target, Users, Shield, Heart, Sparkles } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { Link, useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';

export default function MainAboutUs() {
  const navigate = useNavigate();
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    const checkAuth = async () => {
      const isAuth = await base44.auth.isAuthenticated();
      if (isAuth) {
        // User is logged in, redirect to Home
        navigate(createPageUrl('Home'));
      } else {
        setIsChecking(false);
      }
    };
    checkAuth();
  }, [navigate]);

  const handleSignUp = () => {
    base44.auth.redirectToLogin('/Home');
  };

  if (isChecking) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-600">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-teal-50">
      {/* Navigation */}
      <nav className="bg-white/80 backdrop-blur-sm border-b border-slate-200 sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link to={createPageUrl('MainHome')} className="flex items-center gap-3">
            <div className="relative w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-400 via-teal-500 to-cyan-600 flex items-center justify-center shadow-lg">
              <svg className="w-6 h-6 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z" />
                <path d="M12 16v-4" strokeWidth="3" />
                <circle cx="12" cy="18" r="0.5" fill="currentColor" strokeWidth="0" />
              </svg>
            </div>
            <span className="text-2xl font-bold bg-gradient-to-r from-emerald-600 to-teal-600 bg-clip-text text-transparent">DiabetEasy</span>
          </Link>
          <div className="flex items-center gap-4">
            <Link to={createPageUrl('MainHome')}>
              <Button variant="ghost">Home</Button>
            </Link>
            <Button onClick={handleSignUp} className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700">
              Sign Up
            </Button>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <div className="py-16 md:py-24">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <h1 className="text-4xl md:text-5xl font-bold text-slate-800 mb-6">
            Our Mission
          </h1>
          <p className="text-xl md:text-2xl text-slate-600">
            Empowering people with diabetes to live healthier, more confident lives through intelligent technology
          </p>
        </div>
      </div>

      {/* Values Section */}
      <div className="bg-white py-16">
        <div className="max-w-5xl mx-auto px-4">
          <Card className="border-0 shadow-xl bg-gradient-to-br from-emerald-50 to-teal-50">
            <CardContent className="p-8 md:p-12 space-y-8">
              <div className="flex items-start gap-4">
                <Target className="w-10 h-10 text-emerald-600 flex-shrink-0 mt-1" />
                <div>
                  <h2 className="text-2xl font-bold text-slate-800 mb-3">Personalized Care</h2>
                  <p className="text-lg text-slate-600">
                    We believe that diabetes management is not one-size-fits-all. DiabetEasy uses advanced AI to 
                    understand your unique patterns and provide personalized recommendations that actually work for your body.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-4">
                <Users className="w-10 h-10 text-emerald-600 flex-shrink-0 mt-1" />
                <div>
                  <h2 className="text-2xl font-bold text-slate-800 mb-3">Community-Driven</h2>
                  <p className="text-lg text-slate-600">
                    Built by people who understand the challenges of living with diabetes. We're constantly improving 
                    based on feedback from our community to create the most helpful tools possible.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-4">
                <Shield className="w-10 h-10 text-emerald-600 flex-shrink-0 mt-1" />
                <div>
                  <h2 className="text-2xl font-bold text-slate-800 mb-3">Privacy First</h2>
                  <p className="text-lg text-slate-600">
                    Your health data is deeply personal. We use industry-leading security practices to keep your 
                    information safe and private. You're always in control of your data.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-4">
                <Sparkles className="w-10 h-10 text-emerald-600 flex-shrink-0 mt-1" />
                <div>
                  <h2 className="text-2xl font-bold text-slate-800 mb-3">AI-Powered Intelligence</h2>
                  <p className="text-lg text-slate-600">
                    Our advanced AI analyzes your glucose patterns, meals, exercise, and sleep to provide actionable 
                    insights that help you make better decisions about your health every day.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-4">
                <Heart className="w-10 h-10 text-emerald-600 flex-shrink-0 mt-1" />
                <div>
                  <h2 className="text-2xl font-bold text-slate-800 mb-3">Built with Care</h2>
                  <p className="text-lg text-slate-600">
                    Every feature is designed with empathy and understanding of what it's like to manage diabetes daily. 
                    We're here to make your journey easier, not more complicated.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Story Section */}
      <div className="py-16">
        <div className="max-w-4xl mx-auto px-4">
          <h2 className="text-3xl md:text-4xl font-bold text-slate-800 mb-6 text-center">Why DiabetEasy?</h2>
          <div className="prose prose-lg max-w-none text-slate-600 space-y-4">
            <p className="text-lg">
              Living with diabetes requires constant vigilance—monitoring glucose levels, planning meals, 
              tracking medications, staying active, and managing stress. It can be overwhelming.
            </p>
            <p className="text-lg">
              That's why we created DiabetEasy. We wanted to build a tool that doesn't just track numbers, 
              but actually helps you understand your body and make better decisions. A companion that learns 
              from your patterns and provides guidance tailored to you.
            </p>
            <p className="text-lg">
              Whether you're newly diagnosed or have been managing diabetes for years, DiabetEasy is here 
              to make your journey easier, more informed, and more empowered.
            </p>
          </div>
        </div>
      </div>

      {/* CTA Section */}
      <div className="bg-gradient-to-r from-emerald-600 to-teal-600 py-16">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
            Ready to Get Started?
          </h2>
          <p className="text-xl text-emerald-100 mb-8">
            Join our community and start managing your diabetes with confidence
          </p>
          <Button 
            size="lg" 
            className="bg-white text-emerald-600 hover:bg-emerald-50 text-lg px-8 py-6"
            onClick={handleSignUp}
          >
            Sign Up Now
          </Button>
        </div>
      </div>

      {/* Creator Section */}
      <div className="py-12 bg-slate-50">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <p className="text-sm text-slate-500 mb-1">Created by</p>
          <h3 className="text-lg font-semibold text-slate-700">Naresh Babu Amperayani</h3>
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