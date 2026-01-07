import React from 'react';
import { Card } from "@/components/ui/card";
import { TrendingUp, TrendingDown, Minus, Activity, Utensils, Pill, Moon } from 'lucide-react';
import { cn } from "@/lib/utils";

export default function QuickStats({ latestGlucose, mealsToday, medicationsTaken, sleepHours, targetMin = 70, targetMax = 140 }) {
  const getGlucoseStatus = () => {
    if (!latestGlucose) return { status: 'unknown', color: 'text-slate-400', bg: 'bg-slate-50' };
    if (latestGlucose < targetMin) return { status: 'Low', color: 'text-amber-600', bg: 'bg-amber-50' };
    if (latestGlucose > targetMax) return { status: 'High', color: 'text-rose-600', bg: 'bg-rose-50' };
    return { status: 'In Range', color: 'text-emerald-600', bg: 'bg-emerald-50' };
  };

  const glucoseStatus = getGlucoseStatus();

  const stats = [
    {
      label: 'Current Glucose',
      value: latestGlucose ? `${latestGlucose}` : '--',
      unit: 'mg/dL',
      icon: Activity,
      color: glucoseStatus.color,
      bg: glucoseStatus.bg,
      subtitle: glucoseStatus.status
    },
    {
      label: 'Meals Today',
      value: mealsToday || 0,
      unit: 'completed',
      icon: Utensils,
      color: 'text-violet-600',
      bg: 'bg-violet-50',
      subtitle: 'of planned meals'
    },
    {
      label: 'Medications',
      value: medicationsTaken || 0,
      unit: 'taken',
      icon: Pill,
      color: 'text-blue-600',
      bg: 'bg-blue-50',
      subtitle: 'on schedule'
    },
    {
      label: 'Sleep',
      value: sleepHours || '--',
      unit: 'hours',
      icon: Moon,
      color: 'text-indigo-600',
      bg: 'bg-indigo-50',
      subtitle: 'last night'
    }
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {stats.map((stat, index) => (
        <Card key={index} className={cn("p-5 border-0 shadow-sm", stat.bg)}>
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">{stat.label}</p>
              <div className="flex items-baseline gap-1.5 mt-2">
                <span className={cn("text-3xl font-bold", stat.color)}>{stat.value}</span>
                <span className="text-sm text-slate-500">{stat.unit}</span>
              </div>
              <p className="text-xs text-slate-500 mt-1">{stat.subtitle}</p>
            </div>
            <div className={cn("p-2.5 rounded-xl", stat.bg)}>
              <stat.icon className={cn("w-5 h-5", stat.color)} />
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}