import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    // Get all users
    const users = await base44.asServiceRole.entities.User.list();
    
    for (const user of users) {
      try {
        // Get user profile
        const profiles = await base44.asServiceRole.entities.UserProfile.filter({ 
          created_by: user.email 
        });
        
        if (profiles.length === 0) continue;
        const profile = profiles[0];
        
        // Get last 7 days of data
        const glucose = await base44.asServiceRole.entities.GlucoseReading.filter({ 
          created_by: user.email 
        });
        const meals = await base44.asServiceRole.entities.MealPlan.filter({ 
          created_by: user.email,
          is_completed: true
        });
        const sleep = await base44.asServiceRole.entities.SleepLog.filter({ 
          created_by: user.email 
        });
        
        // Generate insights
        const result = await base44.asServiceRole.integrations.Core.InvokeLLM({
          prompt: `Generate weekly diabetes insights for user:
          
          Profile: ${profile.diabetes_type}, ${profile.dietary_preference}
          Glucose readings (last 50): ${glucose.slice(0, 50).map(r => `${r.reading}mg/dL`).join(', ')}
          Meals logged: ${meals.length}
          Sleep quality: ${sleep.length > 0 ? sleep[0].quality : 'N/A'}
          
          Provide brief weekly summary with:
          - Overall glucose control
          - Key achievements
          - Areas to improve
          - Top 3 action items`,
          response_json_schema: {
            type: "object",
            properties: {
              summary: { type: "string" },
              achievements: { type: "array", items: { type: "string" } },
              improvements: { type: "array", items: { type: "string" } },
              action_items: { type: "array", items: { type: "string" } }
            }
          }
        });
        
        // Send email with insights
        await base44.asServiceRole.integrations.Core.SendEmail({
          to: user.email,
          from_name: "DiabetEasy",
          subject: "Your Weekly Diabetes Insights",
          body: `Hi ${user.full_name || 'there'},

Here are your diabetes insights for this week:

${result.summary}

🎉 Achievements:
${result.achievements?.map(a => `• ${a}`).join('\n') || 'Keep logging your data!'}

💡 Areas to Improve:
${result.improvements?.map(i => `• ${i}`).join('\n') || 'You\'re doing great!'}

✅ Action Items:
${result.action_items?.map((a, i) => `${i + 1}. ${a}`).join('\n') || 'Keep up the good work!'}

Stay healthy,
DiabetEasy Team`
        });
        
      } catch (userError) {
        console.error(`Error processing user ${user.email}:`, userError);
      }
    }
    
    return Response.json({ 
      success: true, 
      message: `Generated insights for ${users.length} users` 
    });
    
  } catch (error) {
    console.error('Error generating weekly insights:', error);
    return Response.json({ 
      error: error.message 
    }, { status: 500 });
  }
});