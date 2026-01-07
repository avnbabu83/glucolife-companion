import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Pill, Clock, Check, Plus, Syringe, Tablet } from 'lucide-react';
import { cn } from "@/lib/utils";

export default function MedicationList({ medications = [], todayLogs = [], onTakeMedication, onAddNew }) {
  const getMedicationIcon = (type) => {
    switch (type) {
      case 'insulin': return Syringe;
      case 'oral': return Tablet;
      default: return Pill;
    }
  };

  const isTaken = (medId, time) => {
    return todayLogs.some(log => 
      log.medication_id === medId && 
      log.scheduled_time === time && 
      log.status === 'taken'
    );
  };

  const frequencyLabels = {
    once_daily: 'Once daily',
    twice_daily: 'Twice daily',
    three_times_daily: 'Three times daily',
    with_meals: 'With meals',
    before_meals: 'Before meals',
    after_meals: 'After meals',
    bedtime: 'At bedtime',
    as_needed: 'As needed'
  };

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="pb-3 flex flex-row items-center justify-between">
        <CardTitle className="text-lg font-semibold flex items-center gap-2">
          <Pill className="w-5 h-5 text-blue-500" />
          Medications
        </CardTitle>
        <Button size="sm" variant="outline" onClick={onAddNew}>
          <Plus className="w-4 h-4 mr-1" />
          Add
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {medications.length === 0 ? (
          <p className="text-sm text-slate-500 text-center py-4">No medications added yet</p>
        ) : (
          medications.filter(m => m.is_active !== false).map((med) => {
            const Icon = getMedicationIcon(med.medication_type);
            return (
              <div key={med.id} className="p-4 bg-slate-50 rounded-xl">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-blue-100 rounded-lg">
                      <Icon className="w-4 h-4 text-blue-600" />
                    </div>
                    <div>
                      <h4 className="font-semibold text-slate-800">{med.name}</h4>
                      <p className="text-sm text-slate-500">{med.dosage}</p>
                    </div>
                  </div>
                  <Badge variant="outline" className="text-xs">
                    {frequencyLabels[med.frequency] || med.frequency}
                  </Badge>
                </div>
                
                {med.times && med.times.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-3">
                    {med.times.map((time, idx) => {
                      const taken = isTaken(med.id, time);
                      return (
                        <Button
                          key={idx}
                          size="sm"
                          variant={taken ? "default" : "outline"}
                          className={cn(
                            "text-xs",
                            taken && "bg-emerald-600 hover:bg-emerald-600"
                          )}
                          onClick={() => !taken && onTakeMedication?.(med, time)}
                          disabled={taken}
                        >
                          <Clock className="w-3 h-3 mr-1" />
                          {time}
                          {taken && <Check className="w-3 h-3 ml-1" />}
                        </Button>
                      );
                    })}
                  </div>
                )}
                
                {med.with_food && (
                  <p className="text-xs text-amber-600 mt-2">⚠️ Take with food</p>
                )}
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}