import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Apple, Plus } from 'lucide-react';
import moment from 'moment';

export default function QuickFoodLog({ onSubmit }) {
  const [foodName, setFoodName] = useState('');
  const [mealType, setMealType] = useState('snack');
  const [carbs, setCarbs] = useState('');
  const [notes, setNotes] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    const now = moment();
    onSubmit({
      date: now.format('YYYY-MM-DD'),
      meal_type: mealType,
      scheduled_time: now.format('HH:mm'),
      meal_name: foodName,
      description: notes,
      carbs: carbs ? parseFloat(carbs) : 0,
      is_completed: true
    });
    setFoodName('');
    setCarbs('');
    setNotes('');
  };

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg font-semibold flex items-center gap-2">
          <Apple className="w-5 h-5 text-emerald-500" />
          Quick Food Log
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label className="text-sm text-slate-600">What did you eat? *</Label>
            <Input
              value={foodName}
              onChange={(e) => setFoodName(e.target.value)}
              placeholder="e.g., Chicken salad, Apple"
              className="mt-1"
              required
            />
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-sm text-slate-600">Meal Type</Label>
              <Select value={mealType} onValueChange={setMealType}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="breakfast">Breakfast</SelectItem>
                  <SelectItem value="morning_snack">Morning Snack</SelectItem>
                  <SelectItem value="lunch">Lunch</SelectItem>
                  <SelectItem value="afternoon_snack">Afternoon Snack</SelectItem>
                  <SelectItem value="dinner">Dinner</SelectItem>
                  <SelectItem value="evening_snack">Evening Snack</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-sm text-slate-600">Carbs (g)</Label>
              <Input
                type="number"
                value={carbs}
                onChange={(e) => setCarbs(e.target.value)}
                placeholder="30"
                className="mt-1"
              />
            </div>
          </div>
          
          <div>
            <Label className="text-sm text-slate-600">Notes (optional)</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Portion size, how you felt, etc..."
              className="mt-1 h-20"
            />
          </div>
          
          <Button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-700">
            <Plus className="w-4 h-4 mr-2" />
            Log Food
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}