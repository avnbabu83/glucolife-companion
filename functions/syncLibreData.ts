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

    // Get user's profile to check if they have stored their Libre sharing code
    const profiles = await base44.entities.UserProfile.filter({ created_by: user.email });
    const profile = profiles[0];

    if (!profile?.libre_sharing_code) {
      return Response.json({ 
        error: 'Please connect your LibreView account first',
        needsAuth: true 
      }, { status: 401 });
    }

    // Fetch glucose data using LibreView Data Share API
    const apiUrl = `https://www.libreview.com/sharing/api/glucose/${profile.libre_sharing_code}`;
    console.log('Fetching from:', apiUrl);
    
    const response = await fetch(apiUrl, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'GlucoGuide/1.0'
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('LibreView API error:', response.status, errorText);
      return Response.json({ 
        error: `Failed to fetch from LibreView (Status: ${response.status})`,
        details: errorText,
        url: apiUrl
      }, { status: response.status });
    }

    const data = await response.json();
    console.log('LibreView API response:', JSON.stringify(data, null, 2));
    
    // Extract glucose readings from LibreView Data Share API response
    const readings = [];
    
    // Try multiple possible response formats
    // Format 1: {current: {value, timestamp}, history: [...]}
    if (data.current) {
      const timestamp = new Date(data.current.timestamp);
      readings.push({
        reading: Math.round(data.current.value),
        reading_time: timestamp.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' }),
        date: timestamp.toISOString().split('T')[0],
        context: 'random',
        source: profile.cgm_device || 'libre2',
        trend: data.current.trend || 'stable'
      });
    }

    if (data.history && Array.isArray(data.history)) {
      data.history.forEach(point => {
        const timestamp = new Date(point.timestamp);
        readings.push({
          reading: Math.round(point.value),
          reading_time: timestamp.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' }),
          date: timestamp.toISOString().split('T')[0],
          context: 'random',
          source: profile.cgm_device || 'libre2'
        });
      });
    }

    // Format 2: {data: {connection: {glucoseMeasurement: {...}}}}
    if (data.data?.connection?.glucoseMeasurement) {
      const gm = data.data.connection.glucoseMeasurement;
      const timestamp = new Date(gm.Timestamp || gm.timestamp);
      readings.push({
        reading: Math.round(gm.ValueInMgPerDl || gm.Value),
        reading_time: timestamp.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' }),
        date: timestamp.toISOString().split('T')[0],
        context: 'random',
        source: profile.cgm_device || 'libre2',
        trend: gm.TrendArrow || 'stable'
      });
    }

    // Format 3: Array of readings directly
    if (Array.isArray(data)) {
      data.forEach(point => {
        const timestamp = new Date(point.timestamp || point.Timestamp);
        readings.push({
          reading: Math.round(point.value || point.ValueInMgPerDl || point.Value),
          reading_time: timestamp.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' }),
          date: timestamp.toISOString().split('T')[0],
          context: 'random',
          source: profile.cgm_device || 'libre2'
        });
      });
    }

    console.log(`Parsed ${readings.length} readings from API response`);

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
      message: `Synced ${newReadings.length} new glucose readings`,
      debug: {
        apiResponseKeys: Object.keys(data),
        readingsParsed: readings.length,
        sampledReading: readings[0] || null
      }
    });

  } catch (error) {
    console.error('Error syncing Libre data:', error);
    return Response.json({ 
      error: error.message,
      stack: error.stack 
    }, { status: 500 });
  }
});