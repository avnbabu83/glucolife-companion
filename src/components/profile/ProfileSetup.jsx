import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { User, Save, X, Plus } from 'lucide-react';
import { detectUserCurrency, formatCurrency } from '@/components/utils/currencyDetector';

export default function ProfileSetup({ profile, onSave, isLoading }) {
  const [formData, setFormData] = useState({
    diabetes_type: profile?.diabetes_type || '',
    dietary_preference: profile?.dietary_preference || '',
    gender: profile?.gender || '',
    age: profile?.age || '',
    weight: profile?.weight || '',
    height: profile?.height || '',
    activity_level: profile?.activity_level || '',
    wake_time: profile?.wake_time || '',
    sleep_time: profile?.sleep_time || '',
    target_glucose_min: profile?.target_glucose_min || '',
    target_glucose_max: profile?.target_glucose_max || '',
    cgm_device: profile?.cgm_device || 'none',
    allergies: profile?.allergies || [],
    health_conditions: profile?.health_conditions || [],
    weekly_food_budget: profile?.weekly_food_budget || ''
  });
  
  const [newAllergy, setNewAllergy] = useState('');
  const [newCondition, setNewCondition] = useState('');
  const [userCurrency, setUserCurrency] = useState({ symbol: '$', code: 'USD', name: 'Dollars' });
  
  useEffect(() => {
    detectUserCurrency().then(setUserCurrency);
  }, []);

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const addAllergy = () => {
    if (newAllergy.trim()) {
      setFormData(prev => ({
        ...prev,
        allergies: [...prev.allergies, newAllergy.trim()]
      }));
      setNewAllergy('');
    }
  };

  const removeAllergy = (index) => {
    setFormData(prev => ({
      ...prev,
      allergies: prev.allergies.filter((_, i) => i !== index)
    }));
  };

  const addCondition = () => {
    if (newCondition.trim()) {
      setFormData(prev => ({
        ...prev,
        health_conditions: [...prev.health_conditions, newCondition.trim()]
      }));
      setNewCondition('');
    }
  };

  const removeCondition = (index) => {
    setFormData(prev => ({
      ...prev,
      health_conditions: prev.health_conditions.filter((_, i) => i !== index)
    }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(formData);
  };

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader>
        <CardTitle className="text-xl font-semibold flex items-center gap-2">
          <User className="w-5 h-5 text-slate-500" />
          Health Profile
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Diabetes Info */}
          <div className="space-y-4">
            <h3 className="font-semibold text-slate-700">Diabetes Information</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>Diabetes Type *</Label>
                <Select value={formData.diabetes_type} onValueChange={(v) => handleChange('diabetes_type', v)}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="type1">Type 1</SelectItem>
                    <SelectItem value="type2">Type 2</SelectItem>
                    <SelectItem value="prediabetes">Prediabetes</SelectItem>
                    <SelectItem value="gestational">Gestational</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>CGM Device</Label>
                <Select value={formData.cgm_device} onValueChange={(v) => handleChange('cgm_device', v)}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Select device" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None / Manual</SelectItem>
                    <SelectItem value="libre2">Freestyle Libre 2</SelectItem>
                    <SelectItem value="libre3">Freestyle Libre 3</SelectItem>
                    <SelectItem value="dexcom_g6">Dexcom G6</SelectItem>
                    <SelectItem value="dexcom_g7">Dexcom G7</SelectItem>
                    <SelectItem value="medtronic">Medtronic Guardian</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Target Min (mg/dL)</Label>
                <Input
                  type="number"
                  value={formData.target_glucose_min}
                  onChange={(e) => handleChange('target_glucose_min', parseInt(e.target.value))}
                  className="mt-1"
                />
              </div>
              <div>
                <Label>Target Max (mg/dL)</Label>
                <Input
                  type="number"
                  value={formData.target_glucose_max}
                  onChange={(e) => handleChange('target_glucose_max', parseInt(e.target.value))}
                  className="mt-1"
                />
              </div>
            </div>
          </div>

          {/* Dietary Preference */}
          <div className="space-y-4">
            <h3 className="font-semibold text-slate-700">Diet & Lifestyle</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>Dietary Preference *</Label>
                <Select value={formData.dietary_preference} onValueChange={(v) => handleChange('dietary_preference', v)}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Select preference" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="omnivore">Omnivore</SelectItem>
                    <SelectItem value="vegetarian">Vegetarian</SelectItem>
                    <SelectItem value="indian_vegetarian">Indian Vegetarian</SelectItem>
                    <SelectItem value="vegan">Vegan</SelectItem>
                    <SelectItem value="pescetarian">Pescetarian</SelectItem>
                    <SelectItem value="keto">Keto</SelectItem>
                    <SelectItem value="mediterranean">Mediterranean</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Activity Level</Label>
                <Select value={formData.activity_level} onValueChange={(v) => handleChange('activity_level', v)}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Select level" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sedentary">Sedentary</SelectItem>
                    <SelectItem value="lightly_active">Lightly Active</SelectItem>
                    <SelectItem value="moderately_active">Moderately Active</SelectItem>
                    <SelectItem value="very_active">Very Active</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Physical Stats */}
          <div className="space-y-4">
            <h3 className="font-semibold text-slate-700">Physical Information</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <Label>Gender</Label>
                <Select value={formData.gender} onValueChange={(v) => handleChange('gender', v)}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="male">Male</SelectItem>
                    <SelectItem value="female">Female</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                    <SelectItem value="prefer_not_to_say">Prefer not to say</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Age</Label>
                <Input
                  type="number"
                  value={formData.age}
                  onChange={(e) => handleChange('age', parseInt(e.target.value))}
                  className="mt-1"
                />
              </div>
              <div>
                <Label>Weight (kg)</Label>
                <Input
                  type="number"
                  value={formData.weight}
                  onChange={(e) => handleChange('weight', parseFloat(e.target.value))}
                  className="mt-1"
                />
              </div>
              <div>
                <Label>Height (cm)</Label>
                <Input
                  type="number"
                  value={formData.height}
                  onChange={(e) => handleChange('height', parseFloat(e.target.value))}
                  className="mt-1"
                />
              </div>
            </div>
          </div>

          {/* Schedule */}
          <div className="space-y-4">
            <h3 className="font-semibold text-slate-700">Daily Schedule</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Wake Time</Label>
                <Input
                  type="time"
                  value={formData.wake_time}
                  onChange={(e) => handleChange('wake_time', e.target.value)}
                  className="mt-1"
                />
              </div>
              <div>
                <Label>Sleep Time</Label>
                <Input
                  type="time"
                  value={formData.sleep_time}
                  onChange={(e) => handleChange('sleep_time', e.target.value)}
                  className="mt-1"
                />
              </div>
            </div>
          </div>

          {/* Allergies */}
          <div className="space-y-4">
            <h3 className="font-semibold text-slate-700">Food Allergies</h3>
            <div className="flex gap-2">
              <Input
                value={newAllergy}
                onChange={(e) => setNewAllergy(e.target.value)}
                placeholder="Add allergy"
                onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addAllergy())}
              />
              <Button type="button" variant="outline" onClick={addAllergy}>
                <Plus className="w-4 h-4" />
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              {formData.allergies.map((allergy, index) => (
                <Badge key={index} variant="secondary" className="px-3 py-1">
                  {allergy}
                  <button type="button" onClick={() => removeAllergy(index)} className="ml-2">
                    <X className="w-3 h-3" />
                  </button>
                </Badge>
              ))}
            </div>
          </div>

          {/* Health Conditions */}
          <div className="space-y-4">
            <h3 className="font-semibold text-slate-700">Other Health Conditions</h3>
            <div className="flex gap-2">
              <Input
                value={newCondition}
                onChange={(e) => setNewCondition(e.target.value)}
                placeholder="Add condition"
                onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addCondition())}
              />
              <Button type="button" variant="outline" onClick={addCondition}>
                <Plus className="w-4 h-4" />
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              {formData.health_conditions.map((condition, index) => (
                <Badge key={index} variant="secondary" className="px-3 py-1">
                  {condition}
                  <button type="button" onClick={() => removeCondition(index)} className="ml-2">
                    <X className="w-3 h-3" />
                  </button>
                </Badge>
              ))}
            </div>
          </div>

          {/* Weekly Food Budget */}
          <div className="space-y-4">
            <h3 className="font-semibold text-slate-700">Budget (Optional)</h3>
            <div>
              <Label>Weekly Food Budget ({userCurrency.code})</Label>
              <div className="flex gap-2 mt-1">
                <span className="flex items-center justify-center min-w-12 h-10 px-2 border border-slate-200 rounded-lg bg-slate-50 text-slate-600 text-sm">
                  {userCurrency.symbol}
                </span>
                <Input
                  type="number"
                  value={formData.weekly_food_budget || ''}
                  onChange={(e) => handleChange('weekly_food_budget', parseInt(e.target.value) || null)}
                  placeholder={userCurrency.code === 'INR' ? 'e.g., 2000' : userCurrency.code === 'CAD' ? 'e.g., 150' : 'e.g., 100'}
                  className="flex-1"
                />
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Get affordable meal recommendations in {userCurrency.name} within your weekly budget
              </p>
            </div>
          </div>

          <Button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-700" disabled={isLoading}>
            <Save className="w-4 h-4 mr-2" />
            {isLoading ? 'Saving...' : 'Save Profile'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}