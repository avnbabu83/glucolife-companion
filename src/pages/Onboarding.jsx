import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useMutation } from '@tanstack/react-query';
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, ArrowLeft, CheckCircle, Activity } from 'lucide-react';
import { createPageUrl } from '@/utils';

export default function Onboarding() {
  const [step, setStep] = useState(1);
  const navigate = useNavigate();
  const [profileData, setProfileData] = useState({
    diabetes_type: '',
    dietary_preference: '',
    age: '',
    weight: '',
    height: '',
    activity_level: '',
    wake_time: '06:00',
    sleep_time: '22:00',
    target_glucose_min: 70,
    target_glucose_max: 140,
    cgm_device: 'none',
    allergies: [],
    health_conditions: []
  });

  const createProfileMutation = useMutation({
    mutationFn: (data) => base44.entities.UserProfile.create(data),
    onSuccess: () => {
      navigate(createPageUrl('Home'));
    },
  });

  const handleNext = () => {
    if (step < 3) setStep(step + 1);
    else handleComplete();
  };

  const handleBack = () => {
    if (step > 1) setStep(step - 1);
  };

  const handleComplete = () => {
    createProfileMutation.mutate(profileData);
  };

  const canProceed = () => {
    if (step === 1) return profileData.diabetes_type && profileData.dietary_preference;
    if (step === 2) return true;
    if (step === 3) return true;
    return false;
  };

  const progress = (step / 3) * 100;

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-teal-50 to-cyan-50 flex items-center justify-center p-4">
      <Card className="max-w-2xl w-full border-0 shadow-xl">
        <CardContent className="p-8">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gradient-to-br from-emerald-500 to-teal-500 mb-4">
              <Activity className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-3xl font-bold text-slate-800 mb-2">Welcome to GlucoGuide</h1>
            <p className="text-slate-600">Let's set up your personalized diabetes management plan</p>
          </div>

          {/* Progress */}
          <div className="mb-8">
            <div className="flex justify-between mb-2">
              <span className="text-sm font-medium text-slate-600">Step {step} of 3</span>
              <span className="text-sm font-medium text-emerald-600">{Math.round(progress)}%</span>
            </div>
            <Progress value={progress} className="h-2" />
          </div>

          {/* Step 1: Basic Info */}
          {step === 1 && (
            <div className="space-y-6 animate-in fade-in slide-in-from-right duration-300">
              <div>
                <h2 className="text-xl font-semibold text-slate-800 mb-4">Basic Information</h2>
                
                <div className="space-y-4">
                  <div>
                    <Label className="text-base font-medium">Diabetes Type *</Label>
                    <Select value={profileData.diabetes_type} onValueChange={(v) => setProfileData(prev => ({ ...prev, diabetes_type: v }))}>
                      <SelectTrigger className="mt-2 h-12">
                        <SelectValue placeholder="Select your diabetes type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="type1">Type 1 Diabetes</SelectItem>
                        <SelectItem value="type2">Type 2 Diabetes</SelectItem>
                        <SelectItem value="prediabetes">Prediabetes</SelectItem>
                        <SelectItem value="gestational">Gestational Diabetes</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label className="text-base font-medium">Dietary Preference *</Label>
                    <Select value={profileData.dietary_preference} onValueChange={(v) => setProfileData(prev => ({ ...prev, dietary_preference: v }))}>
                      <SelectTrigger className="mt-2 h-12">
                        <SelectValue placeholder="Select your dietary preference" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="omnivore">Omnivore (All foods)</SelectItem>
                        <SelectItem value="vegetarian">Vegetarian</SelectItem>
                        <SelectItem value="indian_vegetarian">Indian Vegetarian</SelectItem>
                        <SelectItem value="vegan">Vegan (Plant-based)</SelectItem>
                        <SelectItem value="pescetarian">Pescetarian (Fish & Vegetarian)</SelectItem>
                        <SelectItem value="keto">Keto (Low-carb)</SelectItem>
                        <SelectItem value="mediterranean">Mediterranean</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Step 2: Physical Details */}
          {step === 2 && (
            <div className="space-y-6 animate-in fade-in slide-in-from-right duration-300">
              <div>
                <h2 className="text-xl font-semibold text-slate-800 mb-4">Physical Details</h2>
                
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <Label>Age</Label>
                    <Input
                      type="number"
                      value={profileData.age}
                      onChange={(e) => setProfileData(prev => ({ ...prev, age: parseInt(e.target.value) }))}
                      placeholder="45"
                      className="mt-2 h-12"
                    />
                  </div>
                  <div>
                    <Label>Weight (kg)</Label>
                    <Input
                      type="number"
                      value={profileData.weight}
                      onChange={(e) => setProfileData(prev => ({ ...prev, weight: parseFloat(e.target.value) }))}
                      placeholder="70"
                      className="mt-2 h-12"
                    />
                  </div>
                  <div>
                    <Label>Height (cm)</Label>
                    <Input
                      type="number"
                      value={profileData.height}
                      onChange={(e) => setProfileData(prev => ({ ...prev, height: parseFloat(e.target.value) }))}
                      placeholder="170"
                      className="mt-2 h-12"
                    />
                  </div>
                </div>

                <div className="mt-4">
                  <Label className="text-base font-medium">Activity Level</Label>
                  <Select value={profileData.activity_level} onValueChange={(v) => setProfileData(prev => ({ ...prev, activity_level: v }))}>
                    <SelectTrigger className="mt-2 h-12">
                      <SelectValue placeholder="Select your activity level" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="sedentary">Sedentary (Little to no exercise)</SelectItem>
                      <SelectItem value="lightly_active">Lightly Active (1-3 days/week)</SelectItem>
                      <SelectItem value="moderately_active">Moderately Active (3-5 days/week)</SelectItem>
                      <SelectItem value="very_active">Very Active (6-7 days/week)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          )}

          {/* Step 3: Goals & Schedule */}
          {step === 3 && (
            <div className="space-y-6 animate-in fade-in slide-in-from-right duration-300">
              <div>
                <h2 className="text-xl font-semibold text-slate-800 mb-4">Goals & Schedule</h2>
                
                <div className="space-y-4">
                  <div>
                    <Label className="text-base font-medium">Target Glucose Range (mg/dL)</Label>
                    <div className="grid grid-cols-2 gap-4 mt-2">
                      <div>
                        <Label className="text-sm text-slate-500">Minimum</Label>
                        <Input
                          type="number"
                          value={profileData.target_glucose_min}
                          onChange={(e) => setProfileData(prev => ({ ...prev, target_glucose_min: parseInt(e.target.value) }))}
                          className="mt-1 h-12"
                        />
                      </div>
                      <div>
                        <Label className="text-sm text-slate-500">Maximum</Label>
                        <Input
                          type="number"
                          value={profileData.target_glucose_max}
                          onChange={(e) => setProfileData(prev => ({ ...prev, target_glucose_max: parseInt(e.target.value) }))}
                          className="mt-1 h-12"
                        />
                      </div>
                    </div>
                  </div>

                  <div>
                    <Label className="text-base font-medium">Daily Schedule</Label>
                    <div className="grid grid-cols-2 gap-4 mt-2">
                      <div>
                        <Label className="text-sm text-slate-500">Wake Time</Label>
                        <Input
                          type="time"
                          value={profileData.wake_time}
                          onChange={(e) => setProfileData(prev => ({ ...prev, wake_time: e.target.value }))}
                          className="mt-1 h-12"
                        />
                      </div>
                      <div>
                        <Label className="text-sm text-slate-500">Sleep Time</Label>
                        <Input
                          type="time"
                          value={profileData.sleep_time}
                          onChange={(e) => setProfileData(prev => ({ ...prev, sleep_time: e.target.value }))}
                          className="mt-1 h-12"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="p-4 bg-emerald-50 rounded-xl">
                    <div className="flex items-start gap-3">
                      <CheckCircle className="w-5 h-5 text-emerald-600 mt-0.5" />
                      <div>
                        <p className="font-medium text-emerald-800">You're all set!</p>
                        <p className="text-sm text-emerald-600 mt-1">
                          Click Continue to start your personalized diabetes management journey
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Navigation */}
          <div className="flex justify-between mt-8 pt-6 border-t">
            <Button
              variant="outline"
              onClick={handleBack}
              disabled={step === 1}
              className="h-12 px-6"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
            <Button
              onClick={handleNext}
              disabled={!canProceed() || createProfileMutation.isPending}
              className="h-12 px-6 bg-emerald-600 hover:bg-emerald-700"
            >
              {step === 3 ? (
                createProfileMutation.isPending ? 'Creating...' : 'Complete Setup'
              ) : (
                <>
                  Continue
                  <ArrowRight className="w-4 h-4 ml-2" />
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}