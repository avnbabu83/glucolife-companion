import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { days = 3, targetCalories = 1800 } = await req.json();

    // Get user profile
    const profiles = await base44.entities.UserProfile.filter({ created_by: user.email });
    const profile = profiles[0];

    if (!profile) {
      return Response.json({ error: 'User profile not found' }, { status: 404 });
    }

    // Get recent glucose readings (last 7 days)
    const recentReadings = await base44.asServiceRole.entities.GlucoseReading.list('-created_date', 200);
    const userReadings = recentReadings.filter(r => r.created_by === user.email);

    // Get recent meals with glucose data
    const recentMeals = await base44.asServiceRole.entities.MealPlan.list('-created_date', 50);
    const userMeals = recentMeals.filter(m => m.created_by === user.email);

    // Analyze glucose patterns
    const mealsWithGlucose = userMeals.filter(m => m.pre_meal_glucose && m.post_meal_glucose);
    
    let analysisContext = '';
    if (userReadings.length > 0) {
      const avgGlucose = Math.round(userReadings.reduce((sum, r) => sum + r.reading, 0) / userReadings.length);
      const highReadings = userReadings.filter(r => r.reading > (profile.target_glucose_max || 140)).length;
      const lowReadings = userReadings.filter(r => r.reading < (profile.target_glucose_min || 70)).length;
      
      analysisContext += `\n\nGLUCOSE PATTERN ANALYSIS:
- Average glucose: ${avgGlucose} mg/dL
- High readings: ${highReadings} out of ${userReadings.length} (${Math.round(highReadings/userReadings.length*100)}%)
- Low readings: ${lowReadings} out of ${userReadings.length}
- Target range: ${profile.target_glucose_min}-${profile.target_glucose_max} mg/dL`;
    }

    if (mealsWithGlucose.length > 0) {
      analysisContext += `\n\nMEAL IMPACT ANALYSIS:`;
      mealsWithGlucose.slice(0, 10).forEach(meal => {
        const spike = meal.post_meal_glucose - meal.pre_meal_glucose;
        analysisContext += `\n- ${meal.meal_name}: ${spike > 0 ? '+' : ''}${spike} mg/dL spike (${meal.carbs}g carbs, GI: ${meal.glycemic_index})`;
      });
    }

    // Generate AI meal plan with glucose insights
    const result = await base44.integrations.Core.InvokeLLM({
      prompt: `You are a diabetes nutrition expert. Generate a ${days}-day meal plan optimized for glucose control.

USER PROFILE:
- Diabetes Type: ${profile.diabetes_type}
- Dietary Preference: ${profile.dietary_preference}
- Target Calories: ${targetCalories} per day
- Activity Level: ${profile.activity_level}
- Target Glucose Range: ${profile.target_glucose_min}-${profile.target_glucose_max} mg/dL
${profile.allergies?.length > 0 ? `- Allergies: ${profile.allergies.join(', ')}` : ''}

${analysisContext}

CRITICAL REQUIREMENTS:
1. Based on the glucose pattern analysis above, design meals that will help stabilize blood sugar
2. If high readings are common, focus on lower GI foods and reduce carbs per meal
3. If spikes after certain meals are noted, suggest alternatives with similar taste but better glucose impact
4. Distribute carbs evenly throughout the day
5. Include fiber-rich foods to slow glucose absorption
6. Provide meals for: breakfast, morning_snack, lunch, afternoon_snack, dinner, evening_snack
7. Include specific scheduled times based on user's wake time (${profile.wake_time}) and sleep time (${profile.sleep_time})

For each meal, provide:
- meal_name: Descriptive name
- description: How this meal helps with glucose control
- ingredients: Array of ingredients
- calories, carbs (g), protein (g), fat (g), fiber (g)
- glycemic_index: "low", "medium", or "high"
- scheduled_time: Time in HH:MM format

Return ${days} days of complete meal plans.`,
      response_json_schema: {
        type: "object",
        properties: {
          days: {
            type: "array",
            items: {
              type: "object",
              properties: {
                day: { type: "number" },
                meals: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      meal_type: { type: "string" },
                      scheduled_time: { type: "string" },
                      meal_name: { type: "string" },
                      description: { type: "string" },
                      ingredients: { type: "array", items: { type: "string" } },
                      calories: { type: "number" },
                      carbs: { type: "number" },
                      protein: { type: "number" },
                      fat: { type: "number" },
                      fiber: { type: "number" },
                      glycemic_index: { type: "string" }
                    }
                  }
                }
              }
            }
          },
          insights: { 
            type: "string",
            description: "Explanation of how this plan addresses the user's glucose patterns"
          }
        }
      }
    });

    return Response.json({
      success: true,
      mealPlan: result.days,
      insights: result.insights,
      glucoseDataPoints: userReadings.length,
      mealDataPoints: mealsWithGlucose.length
    });

  } catch (error) {
    console.error('Error generating smart meal plan:', error);
    return Response.json({ 
      error: error.message 
    }, { status: 500 });
  }
});