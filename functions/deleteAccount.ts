import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Delete all user data across all entities
    await Promise.all([
      base44.entities.UserProfile.delete({ created_by: user.email }),
      base44.entities.GlucoseReading.delete({ created_by: user.email }),
      base44.entities.MealPlan.delete({ created_by: user.email }),
      base44.entities.Medication.delete({ created_by: user.email }),
      base44.entities.MedicationLog.delete({ created_by: user.email }),
      base44.entities.ExercisePlan.delete({ created_by: user.email }),
      base44.entities.ExerciseLog.delete({ created_by: user.email }),
      base44.entities.SleepLog.delete({ created_by: user.email }),
      base44.entities.ActivityData.delete({ created_by: user.email })
    ]);

    // Delete the user account
    await base44.asServiceRole.entities.User.delete({ email: user.email });

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