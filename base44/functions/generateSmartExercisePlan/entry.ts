import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get user profile
    const profiles = await base44.entities.UserProfile.filter({ created_by: user.email });
    const profile = profiles[0];

    if (!profile) {
      return Response.json({ error: 'User profile not found' }, { status: 404 });
    }

    // Get recent glucose readings
    const recentReadings = await base44.asServiceRole.entities.GlucoseReading.list('-created_date', 200);
    const userReadings = recentReadings.filter(r => r.created_by === user.email);

    // Get exercise logs with glucose data
    const exerciseLogs = await base44.asServiceRole.entities.ExerciseLog.list('-created_date', 50);
    const userLogs = exerciseLogs.filter(l => l.created_by === user.email);

    // Analyze exercise impact on glucose
    let analysisContext = '';
    
    if (userReadings.length > 0) {
      const avgGlucose = Math.round(userReadings.reduce((sum, r) => sum + r.reading, 0) / userReadings.length);
      const morningReadings = userReadings.filter(r => {
        const hour = parseInt(r.reading_time?.split(':')[0] || '0');
        return hour >= 6 && hour < 12;
      });
      const eveningReadings = userReadings.filter(r => {
        const hour = parseInt(r.reading_time?.split(':')[0] || '0');
        return hour >= 17 && hour < 22;
      });
      
      analysisContext += `\n\nGLUCOSE PATTERN ANALYSIS:
- Overall average: ${avgGlucose} mg/dL
- Morning average: ${morningReadings.length > 0 ? Math.round(morningReadings.reduce((s,r) => s + r.reading, 0) / morningReadings.length) : 'N/A'} mg/dL
- Evening average: ${eveningReadings.length > 0 ? Math.round(eveningReadings.reduce((s,r) => s + r.reading, 0) / eveningReadings.length) : 'N/A'} mg/dL`;
    }

    const logsWithGlucose = userLogs.filter(l => l.pre_exercise_glucose && l.post_exercise_glucose);
    if (logsWithGlucose.length > 0) {
      analysisContext += `\n\nEXERCISE IMPACT ON GLUCOSE:`;
      logsWithGlucose.slice(0, 10).forEach(log => {
        const change = log.post_exercise_glucose - log.pre_exercise_glucose;
        analysisContext += `\n- ${log.exercise_name} (${log.actual_duration}min): ${change > 0 ? '+' : ''}${change} mg/dL change`;
      });
    }

    // Generate AI exercise plan
    const result = await base44.integrations.Core.InvokeLLM({
      prompt: `You are a diabetes exercise physiologist. Create a personalized weekly exercise plan that helps stabilize glucose levels.

USER PROFILE:
- Diabetes Type: ${profile.diabetes_type}
- Activity Level: ${profile.activity_level}
- Age: ${profile.age || 'N/A'}
- Target Glucose: ${profile.target_glucose_min}-${profile.target_glucose_max} mg/dL
- Wake Time: ${profile.wake_time}

${analysisContext}

EXERCISE PRINCIPLES FOR DIABETES:
1. Regular exercise improves insulin sensitivity
2. Best times: 30-60 minutes after meals to help lower post-meal spikes
3. Morning exercise on empty stomach requires caution (risk of lows)
4. Mix cardio and resistance training for best glucose control
5. Consistency is more important than intensity

REQUIREMENTS:
- Create 5-7 exercises for the week
- Vary intensity and types
- Schedule based on user's wake time and typical glucose patterns
- If morning glucose is high, recommend morning exercise
- If evening glucose is high, recommend post-dinner walks
- Include specific diabetes precautions for each exercise
- Duration: 20-45 minutes per session
- Include rest days

For each exercise:
- name: Exercise name
- exercise_type: walking, jogging, cycling, swimming, yoga, strength_training, hiit, stretching, dance, other
- duration_minutes: 20-45
- intensity: low, moderate, high
- scheduled_days: Array of days ["Mon", "Tue", etc]
- scheduled_time: HH:MM format
- calories_burned: Estimate
- precautions: Specific diabetes safety tips`,
      response_json_schema: {
        type: "object",
        properties: {
          exercises: {
            type: "array",
            items: {
              type: "object",
              properties: {
                name: { type: "string" },
                exercise_type: { type: "string" },
                duration_minutes: { type: "number" },
                intensity: { type: "string" },
                scheduled_days: { type: "array", items: { type: "string" } },
                scheduled_time: { type: "string" },
                calories_burned: { type: "number" },
                precautions: { type: "string" }
              }
            }
          },
          insights: {
            type: "string",
            description: "How this plan addresses user's glucose patterns"
          }
        }
      }
    });

    return Response.json({
      success: true,
      exercises: result.exercises,
      insights: result.insights,
      glucoseDataPoints: userReadings.length,
      exerciseDataPoints: logsWithGlucose.length
    });

  } catch (error) {
    console.error('Error generating smart exercise plan:', error);
    return Response.json({ 
      error: error.message 
    }, { status: 500 });
  }
});