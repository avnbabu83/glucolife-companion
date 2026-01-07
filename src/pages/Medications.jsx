import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import moment from 'moment';
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { 
  Pill, 
  Plus, 
  Clock, 
  Check, 
  Calendar,
  AlertTriangle,
  History
} from 'lucide-react';
import { cn } from "@/lib/utils";

import MedicationList from '@/components/medication/MedicationList';

export default function Medications() {
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [newMedication, setNewMedication] = useState({
    name: '',
    dosage: '',
    frequency: 'once_daily',
    times: ['08:00'],
    medication_type: 'oral',
    with_food: false,
    notes: '',
    is_active: true
  });
  const queryClient = useQueryClient();
  const today = moment().format('YYYY-MM-DD');

  const { data: medications = [] } = useQuery({
    queryKey: ['medications'],
    queryFn: () => base44.entities.Medication.list(),
  });

  const { data: todayLogs = [] } = useQuery({
    queryKey: ['medicationLogs', today],
    queryFn: () => base44.entities.MedicationLog.filter({ date: today }),
  });

  const { data: recentLogs = [] } = useQuery({
    queryKey: ['recentMedicationLogs'],
    queryFn: () => base44.entities.MedicationLog.list('-created_date', 50),
  });

  const createMedicationMutation = useMutation({
    mutationFn: (data) => base44.entities.Medication.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['medications'] });
      setShowAddDialog(false);
      resetForm();
    },
  });

  const createLogMutation = useMutation({
    mutationFn: (data) => base44.entities.MedicationLog.create(data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['medicationLogs'] }),
  });

  const resetForm = () => {
    setNewMedication({
      name: '',
      dosage: '',
      frequency: 'once_daily',
      times: ['08:00'],
      medication_type: 'oral',
      with_food: false,
      notes: '',
      is_active: true
    });
  };

  const handleTakeMedication = (med, time) => {
    createLogMutation.mutate({
      medication_id: med.id,
      medication_name: med.name,
      scheduled_time: time,
      taken_time: moment().format('HH:mm'),
      date: today,
      status: 'taken'
    });
  };

  const addTimeSlot = () => {
    setNewMedication(prev => ({
      ...prev,
      times: [...prev.times, '12:00']
    }));
  };

  const updateTimeSlot = (index, value) => {
    setNewMedication(prev => ({
      ...prev,
      times: prev.times.map((t, i) => i === index ? value : t)
    }));
  };

  const removeTimeSlot = (index) => {
    setNewMedication(prev => ({
      ...prev,
      times: prev.times.filter((_, i) => i !== index)
    }));
  };

  // Calculate adherence
  const activeMeds = medications.filter(m => m.is_active !== false);
  const totalDoses = activeMeds.reduce((sum, m) => sum + (m.times?.length || 1), 0);
  const takenDoses = todayLogs.filter(l => l.status === 'taken').length;
  const adherenceRate = totalDoses > 0 ? Math.round((takenDoses / totalDoses) * 100) : 100;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-slate-800">Medications</h1>
          <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
            <DialogTrigger asChild>
              <Button className="bg-blue-600 hover:bg-blue-700">
                <Plus className="w-4 h-4 mr-2" />
                Add Medication
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Add New Medication</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>Medication Name *</Label>
                  <Input
                    value={newMedication.name}
                    onChange={(e) => setNewMedication(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="e.g., Metformin"
                    className="mt-1"
                  />
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Dosage *</Label>
                    <Input
                      value={newMedication.dosage}
                      onChange={(e) => setNewMedication(prev => ({ ...prev, dosage: e.target.value }))}
                      placeholder="e.g., 500mg"
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label>Type</Label>
                    <Select 
                      value={newMedication.medication_type} 
                      onValueChange={(v) => setNewMedication(prev => ({ ...prev, medication_type: v }))}
                    >
                      <SelectTrigger className="mt-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="insulin">Insulin</SelectItem>
                        <SelectItem value="oral">Oral</SelectItem>
                        <SelectItem value="injectable">Injectable</SelectItem>
                        <SelectItem value="supplement">Supplement</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                
                <div>
                  <Label>Frequency</Label>
                  <Select 
                    value={newMedication.frequency} 
                    onValueChange={(v) => setNewMedication(prev => ({ ...prev, frequency: v }))}
                  >
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="once_daily">Once Daily</SelectItem>
                      <SelectItem value="twice_daily">Twice Daily</SelectItem>
                      <SelectItem value="three_times_daily">Three Times Daily</SelectItem>
                      <SelectItem value="with_meals">With Meals</SelectItem>
                      <SelectItem value="before_meals">Before Meals</SelectItem>
                      <SelectItem value="after_meals">After Meals</SelectItem>
                      <SelectItem value="bedtime">At Bedtime</SelectItem>
                      <SelectItem value="as_needed">As Needed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <Label>Reminder Times</Label>
                    <Button type="button" variant="ghost" size="sm" onClick={addTimeSlot}>
                      <Plus className="w-4 h-4 mr-1" />
                      Add Time
                    </Button>
                  </div>
                  <div className="space-y-2">
                    {newMedication.times.map((time, idx) => (
                      <div key={idx} className="flex gap-2">
                        <Input
                          type="time"
                          value={time}
                          onChange={(e) => updateTimeSlot(idx, e.target.value)}
                          className="flex-1"
                        />
                        {newMedication.times.length > 1 && (
                          <Button 
                            type="button" 
                            variant="ghost" 
                            size="icon"
                            onClick={() => removeTimeSlot(idx)}
                          >
                            ×
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
                
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="with_food"
                    checked={newMedication.with_food}
                    onCheckedChange={(checked) => setNewMedication(prev => ({ ...prev, with_food: checked }))}
                  />
                  <Label htmlFor="with_food" className="text-sm">Take with food</Label>
                </div>
                
                <div>
                  <Label>Notes</Label>
                  <Input
                    value={newMedication.notes}
                    onChange={(e) => setNewMedication(prev => ({ ...prev, notes: e.target.value }))}
                    placeholder="Any special instructions..."
                    className="mt-1"
                  />
                </div>
                
                <Button 
                  className="w-full bg-blue-600 hover:bg-blue-700"
                  onClick={() => createMedicationMutation.mutate(newMedication)}
                  disabled={!newMedication.name || !newMedication.dosage}
                >
                  Add Medication
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <Tabs defaultValue="today" className="space-y-6">
          <TabsList className="bg-white shadow-sm">
            <TabsTrigger value="today">Today</TabsTrigger>
            <TabsTrigger value="all">All Medications</TabsTrigger>
            <TabsTrigger value="history">History</TabsTrigger>
          </TabsList>

          <TabsContent value="today" className="space-y-6">
            {/* Adherence Card */}
            <Card className={cn(
              "border-0 shadow-sm",
              adherenceRate >= 80 ? "bg-emerald-50" : adherenceRate >= 50 ? "bg-amber-50" : "bg-rose-50"
            )}>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-600">Today's Adherence</p>
                    <p className={cn(
                      "text-4xl font-bold",
                      adherenceRate >= 80 ? "text-emerald-600" : adherenceRate >= 50 ? "text-amber-600" : "text-rose-600"
                    )}>
                      {adherenceRate}%
                    </p>
                    <p className="text-sm text-slate-500 mt-1">
                      {takenDoses} of {totalDoses} doses taken
                    </p>
                  </div>
                  <div className={cn(
                    "p-4 rounded-full",
                    adherenceRate >= 80 ? "bg-emerald-100" : adherenceRate >= 50 ? "bg-amber-100" : "bg-rose-100"
                  )}>
                    <Pill className={cn(
                      "w-8 h-8",
                      adherenceRate >= 80 ? "text-emerald-600" : adherenceRate >= 50 ? "text-amber-600" : "text-rose-600"
                    )} />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Today's Schedule */}
            <MedicationList 
              medications={activeMeds}
              todayLogs={todayLogs}
              onTakeMedication={handleTakeMedication}
              onAddNew={() => setShowAddDialog(true)}
            />
          </TabsContent>

          <TabsContent value="all" className="space-y-4">
            {medications.length === 0 ? (
              <Card className="border-0 shadow-sm">
                <CardContent className="py-12 text-center">
                  <Pill className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                  <p className="text-slate-500 mb-4">No medications added yet</p>
                  <Button onClick={() => setShowAddDialog(true)}>
                    <Plus className="w-4 h-4 mr-2" />
                    Add First Medication
                  </Button>
                </CardContent>
              </Card>
            ) : (
              medications.map((med) => (
                <Card key={med.id} className={cn(
                  "border-0 shadow-sm",
                  med.is_active === false && "opacity-50"
                )}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="font-semibold text-slate-800">{med.name}</h3>
                        <p className="text-sm text-slate-500">{med.dosage} • {med.frequency?.replace('_', ' ')}</p>
                        {med.notes && (
                          <p className="text-xs text-slate-400 mt-1">{med.notes}</p>
                        )}
                      </div>
                      <Badge variant={med.is_active !== false ? "default" : "secondary"}>
                        {med.is_active !== false ? "Active" : "Inactive"}
                      </Badge>
                    </div>
                    {med.times?.length > 0 && (
                      <div className="flex gap-2 mt-3">
                        {med.times.map((time, idx) => (
                          <Badge key={idx} variant="outline" className="text-xs">
                            <Clock className="w-3 h-3 mr-1" />
                            {time}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>

          <TabsContent value="history" className="space-y-4">
            <Card className="border-0 shadow-sm">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <History className="w-5 h-5 text-slate-500" />
                  Medication History
                </CardTitle>
              </CardHeader>
              <CardContent>
                {recentLogs.length === 0 ? (
                  <p className="text-sm text-slate-500 text-center py-4">No history yet</p>
                ) : (
                  <div className="space-y-2">
                    {recentLogs.slice(0, 20).map((log) => (
                      <div key={log.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                        <div className="flex items-center gap-3">
                          <div className={cn(
                            "p-2 rounded-full",
                            log.status === 'taken' ? "bg-emerald-100" : 
                            log.status === 'skipped' ? "bg-rose-100" : "bg-amber-100"
                          )}>
                            {log.status === 'taken' ? (
                              <Check className="w-4 h-4 text-emerald-600" />
                            ) : (
                              <AlertTriangle className="w-4 h-4 text-amber-600" />
                            )}
                          </div>
                          <div>
                            <p className="font-medium text-slate-800">{log.medication_name}</p>
                            <p className="text-xs text-slate-500">{log.date} at {log.taken_time || log.scheduled_time}</p>
                          </div>
                        </div>
                        <Badge variant={log.status === 'taken' ? 'default' : 'secondary'} className="capitalize">
                          {log.status}
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}