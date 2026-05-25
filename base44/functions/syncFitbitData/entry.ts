import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get Fitbit access token from app connector
    const accessToken = await base44.asServiceRole.connectors.getAccessToken('fitbit');
    
    if (!accessToken) {
      return Response.json({ 
        needsAuth: true,
        error: 'Please connect your Fitbit account first' 
      }, { status: 400 });
    }

    const today = new Date().toISOString().split('T')[0];

    // Fetch sleep data
    const sleepResponse = await fetch(`https://api.fitbit.com/1.2/user/-/sleep/date/${today}.json`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });

    // Fetch activity data (steps, calories)
    const activityResponse = await fetch(`https://api.fitbit.com/1/user/-/activities/date/${today}.json`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });

    // Fetch heart rate data
    const heartRateResponse = await fetch(`https://api.fitbit.com/1/user/-/activities/heart/date/${today}/1d.json`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });

    if (!sleepResponse.ok || !activityResponse.ok || !heartRateResponse.ok) {
      return Response.json({ 
        error: 'Failed to fetch data from Fitbit',
        sleepStatus: sleepResponse.status,
        activityStatus: activityResponse.status,
        heartRateStatus: heartRateResponse.status
      }, { status: 500 });
    }

    const sleepData = await sleepResponse.json();
    const activityData = await activityResponse.json();
    const heartRateData = await heartRateResponse.json();

    let synced = 0;

    // Process sleep data
    if (sleepData.sleep && sleepData.sleep.length > 0) {
      const mainSleep = sleepData.sleep.find(s => s.isMainSleep) || sleepData.sleep[0];
      
      // Check if we already have this sleep log
      const existingSleepLogs = await base44.entities.SleepLog.filter({ 
        created_by: user.email,
        date: today
      });

      if (existingSleepLogs.length === 0) {
        const totalMinutes = mainSleep.duration / 60000; // Convert ms to minutes
        const totalHours = totalMinutes / 60;

        await base44.entities.SleepLog.create({
          date: today,
          bedtime: mainSleep.startTime.split('T')[1].substring(0, 5),
          wake_time: mainSleep.endTime.split('T')[1].substring(0, 5),
          total_hours: parseFloat(totalHours.toFixed(1)),
          quality: mainSleep.efficiency >= 90 ? 'excellent' : 
                   mainSleep.efficiency >= 80 ? 'good' :
                   mainSleep.efficiency >= 70 ? 'fair' : 'poor',
          deep_sleep_minutes: mainSleep.levels?.summary?.deep?.minutes || 0,
          rem_sleep_minutes: mainSleep.levels?.summary?.rem?.minutes || 0,
          light_sleep_minutes: mainSleep.levels?.summary?.light?.minutes || 0,
          interruptions: mainSleep.levels?.summary?.wake?.count || 0,
          source: 'fitbit'
        });
        synced++;
      }

      // Update user profile with latest sleep
      const profiles = await base44.entities.UserProfile.filter({ created_by: user.email });
      if (profiles.length > 0) {
        await base44.entities.UserProfile.update(profiles[0].id, {
          last_sleep_hours: parseFloat((totalMinutes / 60).toFixed(1))
        });
      }
    }

    // Process activity data
    const steps = activityData.summary?.steps || 0;
    const calories = activityData.summary?.caloriesOut || 0;
    const activeMinutes = activityData.summary?.veryActiveMinutes + activityData.summary?.fairlyActiveMinutes || 0;

    // Check if we already have activity data for today
    const existingActivityData = await base44.entities.ActivityData.filter({
      created_by: user.email,
      date: today
    });

    const heartRateAvg = heartRateData['activities-heart']?.[0]?.value?.restingHeartRate || 0;
    const heartRateResting = heartRateData['activities-heart']?.[0]?.value?.restingHeartRate || 0;

    if (existingActivityData.length === 0) {
      await base44.entities.ActivityData.create({
        date: today,
        steps: steps,
        calories_burned: calories,
        active_minutes: activeMinutes,
        heart_rate_avg: heartRateAvg,
        heart_rate_resting: heartRateResting,
        source: 'fitbit'
      });
      synced++;
    } else {
      // Update existing activity data
      await base44.entities.ActivityData.update(existingActivityData[0].id, {
        steps: steps,
        calories_burned: calories,
        active_minutes: activeMinutes,
        heart_rate_avg: heartRateAvg,
        heart_rate_resting: heartRateResting
      });
      synced++;
    }

    // Update user profile with latest stats
    const profiles = await base44.entities.UserProfile.filter({ created_by: user.email });
    if (profiles.length > 0) {
      await base44.entities.UserProfile.update(profiles[0].id, {
        last_steps: steps,
        last_calories: calories,
        last_heart_rate: heartRateAvg
      });
    }

    return Response.json({
      success: true,
      synced: synced,
      data: {
        sleep: sleepData.sleep?.length || 0,
        steps: steps,
        calories: calories,
        heartRate: heartRateAvg
      }
    });

  } catch (error) {
    console.error('Error syncing Fitbit data:', error);
    return Response.json({ 
      error: error.message,
      stack: error.stack 
    }, { status: 500 });
  }
});