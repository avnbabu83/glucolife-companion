import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const clientId = Deno.env.get('LIBRE_CLIENT_ID');
    const clientSecret = Deno.env.get('LIBRE_CLIENT_SECRET');

    if (!clientId || !clientSecret) {
      return Response.json({ 
        error: 'LibreView API credentials not configured. Please set LIBRE_CLIENT_ID and LIBRE_CLIENT_SECRET in dashboard settings.' 
      }, { status: 500 });
    }

    // Get user's profile to check if they have stored their Libre credentials
    const profiles = await base44.entities.UserProfile.filter({ created_by: user.email });
    const profile = profiles[0];

    if (!profile?.libre_access_token) {
      return Response.json({ 
        error: 'Please connect your LibreView account first',
        needsAuth: true 
      }, { status: 401 });
    }

    // Fetch glucose data from LibreView API
    const response = await fetch('https://api.libreview.io/llu/connections', {
      headers: {
        'Authorization': `Bearer ${profile.libre_access_token}`,
        'Content-Type': 'application/json',
        'product': 'llu.android',
        'version': '4.7.0'
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('LibreView API error:', errorText);
      return Response.json({ 
        error: 'Failed to fetch data from LibreView',
        details: errorText 
      }, { status: response.status });
    }

    const data = await response.json();
    
    // Extract glucose readings
    const readings = [];
    if (data.data && data.data[0]?.glucoseMeasurement) {
      const measurements = data.data[0].glucoseMeasurement.ValueInMgPerDl;
      const timestamp = data.data[0].glucoseMeasurement.Timestamp;
      
      readings.push({
        reading: measurements,
        reading_time: new Date(timestamp).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' }),
        date: new Date(timestamp).toISOString().split('T')[0],
        context: 'random',
        source: profile.cgm_device || 'libre2',
        trend: data.data[0].glucoseMeasurement.TrendArrow || 'stable'
      });
    }

    // Get graph data for historical readings (last 24 hours)
    if (data.data && data.data[0]?.graphData) {
      const graphData = data.data[0].graphData;
      graphData.forEach(point => {
        if (point.ValueInMgPerDl) {
          const timestamp = new Date(point.Timestamp);
          readings.push({
            reading: point.ValueInMgPerDl,
            reading_time: timestamp.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' }),
            date: timestamp.toISOString().split('T')[0],
            context: 'random',
            source: profile.cgm_device || 'libre2'
          });
        }
      });
    }

    // Store readings in database (avoid duplicates by checking time)
    const today = new Date().toISOString().split('T')[0];
    const existingReadings = await base44.entities.GlucoseReading.filter({ 
      date: today,
      created_by: user.email 
    });

    const newReadings = readings.filter(r => {
      return !existingReadings.some(er => 
        er.reading_time === r.reading_time && er.date === r.date
      );
    });

    if (newReadings.length > 0) {
      await base44.entities.GlucoseReading.bulkCreate(newReadings);
    }

    return Response.json({
      success: true,
      synced: newReadings.length,
      total: readings.length,
      message: `Synced ${newReadings.length} new glucose readings`
    });

  } catch (error) {
    console.error('Error syncing Libre data:', error);
    return Response.json({ 
      error: error.message,
      stack: error.stack 
    }, { status: 500 });
  }
});