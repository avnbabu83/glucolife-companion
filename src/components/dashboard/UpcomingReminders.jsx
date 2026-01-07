import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Clock, Utensils, Pill, Dumbbell, Check } from 'lucide-react';
import { cn } from "@/lib/utils";
import moment from 'moment';

export default function UpcomingReminders({ meals = [], medications = [], exercises = [], onComplete }) {
  const now = moment();
  
  const allReminders = [
    ...meals.map(m => ({
      type: 'meal',
      icon: Utensils,
      color: 'text-emerald-600',
      bg: 'bg-emerald-50',
      title: m.meal_name,
      subtitle: m.meal_type?.replace('_', ' '),
      time: m.scheduled_time,
      id: m.id,
      data: m
    })),
    ...medications.map(m => ({
      type: 'medication',
      icon: Pill,
      color: 'text-blue-600',
      bg: 'bg-blue-50',
      title: m.name,
      subtitle: m.dosage,
      time: m.times?.[0] || '08:00',
      id: m.id,
      data: m
    })),
    ...exercises.map(e => ({
      type: 'exercise',
      icon: Dumbbell,
      color: 'text-violet-600',
      bg: 'bg-violet-50',
      title: e.name,
      subtitle: `${e.duration_minutes} mins`,
      time: e.scheduled_time || '07:00',
      id: e.id,
      data: e
    }))
  ].sort((a, b) => {
    const timeA = moment(a.time, 'HH:mm');
    const timeB = moment(b.time, 'HH:mm');
    return timeA.diff(timeB);
  });

  const upcomingReminders = allReminders.filter(r => {
    const reminderTime = moment(r.time, 'HH:mm');
    return reminderTime.isAfter(now.clone().subtract(30, 'minutes'));
  }).slice(0, 5);

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg font-semibold flex items-center gap-2">
          <Clock className="w-5 h-5 text-slate-400" />
          Upcoming Today
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {upcomingReminders.length === 0 ? (
          <p className="text-sm text-slate-500 text-center py-6">No upcoming reminders today</p>
        ) : (
          upcomingReminders.map((reminder, index) => (
            <div 
              key={`${reminder.type}-${reminder.id}-${index}`}
              className={cn(
                "flex items-center gap-4 p-3 rounded-xl transition-all hover:shadow-sm",
                reminder.bg
              )}
            >
              <div className={cn("p-2 rounded-lg bg-white/80")}>
                <reminder.icon className={cn("w-4 h-4", reminder.color)} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-slate-800 truncate">{reminder.title}</p>
                <p className="text-xs text-slate-500 capitalize">{reminder.subtitle}</p>
              </div>
              <div className="text-right">
                <p className={cn("text-sm font-semibold", reminder.color)}>{reminder.time}</p>
              </div>
              {onComplete && (
                <Button 
                  size="sm" 
                  variant="ghost"
                  className="h-8 w-8 p-0"
                  onClick={() => onComplete(reminder.type, reminder.id)}
                >
                  <Check className="w-4 h-4" />
                </Button>
              )}
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}