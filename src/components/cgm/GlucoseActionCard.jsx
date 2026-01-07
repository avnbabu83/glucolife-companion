import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  AlertTriangle, 
  Activity, 
  Apple, 
  Coffee,
  Droplet,
  Clock,
  TrendingUp,
  TrendingDown
} from 'lucide-react';
import { cn } from "@/lib/utils";

export default function GlucoseActionCard({ reading, trend, targetMin, targetMax }) {
  if (!reading) return null;

  const isHigh = reading > targetMax;
  const isLow = reading < targetMin;
  const isRising = trend === 'rising' || trend === 'rising_fast';
  const isFalling = trend === 'falling' || trend === 'falling_fast';
  const isCritical = reading > targetMax + 50 || reading < targetMin - 20;

  // Determine action based on reading and trend
  let action = null;

  if (isLow || (reading < targetMin + 20 && isFalling)) {
    action = {
      severity: isCritical ? 'critical' : 'warning',
      icon: AlertTriangle,
      title: isCritical ? '🚨 Low Glucose - Act Now' : '⚠️ Glucose Trending Low',
      color: 'amber',
      actions: [
        {
          icon: Apple,
          label: '15g Fast Carbs',
          description: '4 glucose tablets or 1/2 cup juice',
          primary: true
        },
        {
          icon: Coffee,
          label: 'Quick Snack',
          description: 'Crackers, fruit, or granola bar',
          primary: false
        },
        {
          icon: Clock,
          label: 'Recheck in 15 min',
          description: 'Monitor your levels closely',
          primary: false
        }
      ],
      advice: isFalling 
        ? 'Your glucose is falling. Have fast-acting carbs now and avoid exercise.'
        : 'Your glucose is low. Have a quick snack and rest for 15 minutes.'
    };
  } else if (isHigh || (reading > targetMax - 20 && isRising)) {
    // Calculate suggested activity duration based on how high
    const excessGlucose = reading - targetMax;
    const activityMinutes = Math.min(30, Math.max(10, Math.round(excessGlucose / 10) * 5));

    action = {
      severity: isCritical ? 'critical' : 'warning',
      icon: TrendingUp,
      title: isCritical ? '🚨 High Glucose - Take Action' : '📈 Glucose Trending High',
      color: 'rose',
      actions: [
        {
          icon: Activity,
          label: `Walk for ${activityMinutes} min`,
          description: 'Light activity to lower glucose',
          primary: true
        },
        {
          icon: Droplet,
          label: 'Drink Water',
          description: 'Stay hydrated to help flush glucose',
          primary: false
        },
        {
          icon: Clock,
          label: 'Check Medication',
          description: 'Ensure you took your meds on time',
          primary: false
        }
      ],
      advice: isRising
        ? `Your glucose is rising. A ${activityMinutes}-minute walk can help bring it down.`
        : `Your glucose is elevated. Light activity and hydration can help.`
    };
  } else if (isRising) {
    action = {
      severity: 'info',
      icon: TrendingUp,
      title: '📊 Glucose Rising',
      color: 'blue',
      actions: [
        {
          icon: Activity,
          label: 'Stay Active',
          description: 'Take a 10-minute walk after your meal',
          primary: false
        },
        {
          icon: Clock,
          label: 'Monitor',
          description: 'Keep an eye on the trend',
          primary: false
        }
      ],
      advice: 'Your glucose is rising but still in range. Stay active and monitor.'
    };
  } else if (isFalling) {
    action = {
      severity: 'info',
      icon: TrendingDown,
      title: '📉 Glucose Falling',
      color: 'blue',
      actions: [
        {
          icon: Apple,
          label: 'Light Snack',
          description: 'Consider a small snack to stabilize',
          primary: false
        },
        {
          icon: Clock,
          label: 'Monitor',
          description: 'Watch for continued drop',
          primary: false
        }
      ],
      advice: 'Your glucose is falling but still in range. Have a light snack if needed.'
    };
  }

  if (!action) return null;

  const severityStyles = {
    critical: 'bg-gradient-to-r from-rose-500 to-red-500 text-white',
    warning: action.color === 'amber' 
      ? 'bg-gradient-to-r from-amber-400 to-amber-500 text-white'
      : 'bg-gradient-to-r from-rose-400 to-rose-500 text-white',
    info: 'bg-gradient-to-r from-blue-500 to-blue-600 text-white'
  };

  return (
    <Card className={cn("border-0 shadow-lg", severityStyles[action.severity])}>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg font-bold flex items-center gap-2">
          <action.icon className="w-5 h-5" />
          {action.title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm opacity-90">
          {action.advice}
        </p>

        <div className="grid gap-3">
          {action.actions.map((item, idx) => (
            <div
              key={idx}
              className={cn(
                "p-4 rounded-xl flex items-start gap-3",
                item.primary 
                  ? "bg-white/20 backdrop-blur-sm border-2 border-white/40"
                  : "bg-white/10 backdrop-blur-sm"
              )}
            >
              <item.icon className="w-5 h-5 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">{item.label}</p>
                <p className="text-sm opacity-80">{item.description}</p>
              </div>
            </div>
          ))}
        </div>

        {action.severity === 'critical' && (
          <div className="p-3 bg-white/20 rounded-lg text-sm font-medium">
            💡 If symptoms persist, contact your healthcare provider immediately.
          </div>
        )}
      </CardContent>
    </Card>
  );
}