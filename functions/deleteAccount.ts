import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Fetch and delete all user data across all entities
    const [profiles, glucose, meals, medications, medLogs, exercisePlans, exerciseLogs, sleepLogs, activityData] = await Promise.all([
      base44.entities.UserProfile.filter({ created_by: user.email }),
      base44.entities.GlucoseReading.filter({ created_by: user.email }),
      base44.entities.MealPlan.filter({ created_by: user.email }),
      base44.entities.Medication.filter({ created_by: user.email }),
      base44.entities.MedicationLog.filter({ created_by: user.email }),
      base44.entities.ExercisePlan.filter({ created_by: user.email }),
      base44.entities.ExerciseLog.filter({ created_by: user.email }),
      base44.entities.SleepLog.filter({ created_by: user.email }),
      base44.entities.ActivityData.filter({ created_by: user.email })
    ]);

    // Delete all records by ID
    await Promise.all([
      ...profiles.map(p => base44.entities.UserProfile.delete(p.id)),
      ...glucose.map(g => base44.entities.GlucoseReading.delete(g.id)),
      ...meals.map(m => base44.entities.MealPlan.delete(m.id)),
      ...medications.map(m => base44.entities.Medication.delete(m.id)),
      ...medLogs.map(m => base44.entities.MedicationLog.delete(m.id)),
      ...exercisePlans.map(e => base44.entities.ExercisePlan.delete(e.id)),
      ...exerciseLogs.map(e => base44.entities.ExerciseLog.delete(e.id)),
      ...sleepLogs.map(s => base44.entities.SleepLog.delete(s.id)),
      ...activityData.map(a => base44.entities.ActivityData.delete(a.id))
    ]);

    // Delete the user account using service role
    await base44.asServiceRole.entities.User.delete(user.id);

    return Response.json({
      success: true,
      message: 'Account and all data permanently deleted'
    });

  } catch (error) {
    console.error('Error deleting account:', error);
    return Response.json({ 
      error: error.message
    }, { status: 500 });
  }
});