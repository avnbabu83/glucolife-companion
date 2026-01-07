import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Delete all user data using service role (bypasses RLS)
    const entities = [
      'UserProfile', 'GlucoseReading', 'MealPlan', 'Medication', 
      'MedicationLog', 'ExercisePlan', 'ExerciseLog', 'SleepLog', 'ActivityData'
    ];

    for (const entityName of entities) {
      const records = await base44.asServiceRole.entities[entityName].filter({ created_by: user.email });
      for (const record of records) {
        await base44.asServiceRole.entities[entityName].delete(record.id);
      }
    }

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