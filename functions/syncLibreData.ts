import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get user's profile to check LibreLinkUp credentials
    const profiles = await base44.entities.UserProfile.filter({ created_by: user.email });
    const profile = profiles[0];
    
    if (!profile?.libre_email || !profile?.libre_password) {
      return Response.json({ 
        needsAuth: true,
        error: 'Please connect your LibreLinkUp account first' 
      }, { status: 400 });
    }

    // Authenticate with LibreLinkUp - handle regional redirects
    console.log('Authenticating with LibreLinkUp...');
    
    const regionMap = {
      'us': 'https://api-us.libreview.io',
      'eu': 'https://api-eu.libreview.io',
      'de': 'https://api-de.libreview.io',
      'fr': 'https://api-fr.libreview.io',
      'jp': 'https://api-jp.libreview.io',
      'ap': 'https://api-ap.libreview.io',
      'au': 'https://api-au.libreview.io',
      'ca': 'https://api-ca.libreview.io',
      'global': 'https://api.libreview.io'
    };
    
    const endpoints = [
      'https://api-us.libreview.io',
      'https://api.libreview.io',
      'https://api-eu.libreview.io'
    ];
    
    let authData = null;
    let token = null;
    let userId = null;
    let successEndpoint = null;
    
    for (const endpoint of endpoints) {
      try {
        const loginResponse = await fetch(`${endpoint}/llu/auth/login`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'Product': 'llu.android',
            'Version': '4.16.0'
          },
          body: JSON.stringify({
            email: profile.libre_email,
            password: profile.libre_password
          })
        });

        if (loginResponse.ok) {
          authData = await loginResponse.json();
          
          // Check if we need to redirect to a specific region
          if (authData.data?.redirect && authData.data?.region) {
            const regionEndpoint = regionMap[authData.data.region];
            if (regionEndpoint) {
              console.log(`Redirecting to region: ${authData.data.region}`);
              const redirectResponse = await fetch(`${regionEndpoint}/llu/auth/login`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Accept': 'application/json',
                  'Product': 'llu.android',
                  'Version': '4.7.0'
                },
                body: JSON.stringify({
                  email: profile.libre_email,
                  password: profile.libre_password
                })
              });
              
              if (redirectResponse.ok) {
                authData = await redirectResponse.json();
                successEndpoint = regionEndpoint;
              }
            }
          } else {
            successEndpoint = endpoint;
          }
          
          token = authData.data?.authTicket?.token || authData.authTicket?.token;
          userId = authData.data?.user?.id || authData.user?.id;
          
          if (token) {
            console.log(`Authenticated successfully with ${successEndpoint}`);
            break;
          }
        }
      } catch (err) {
        continue;
      }
    }
    
    // Use stored token if no fresh auth
    if (!token && profile.libre_auth_token) {
      console.log('Using stored auth token from profile');
      token = profile.libre_auth_token;
      userId = profile.libre_user_id;
      successEndpoint = 'https://api-ca.libreview.io';
    }
    
    if (!token) {
      return Response.json({ 
        error: 'Failed to authenticate with LibreLinkUp. Please reconnect.' 
      }, { status: 401 });
    }

    // Generate Account-Id header (SHA-256 of user ID) if we have userId
    let accountIdHeader = {};
    if (userId) {
      const encoder = new TextEncoder();
      const data = encoder.encode(userId);
      const hashBuffer = await crypto.subtle.digest('SHA-256', data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const accountId = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
      accountIdHeader = { 'Account-Id': accountId };
    }

    // Make sure we have a valid endpoint
    if (!successEndpoint) {
      successEndpoint = 'https://api-ca.libreview.io'; // Default to detected region
    }

    // Fetch connections (patients)
    console.log(`Fetching connections from ${successEndpoint}...`);
    const connectionsResponse = await fetch(`${successEndpoint}/llu/connections`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json',
        'Product': 'llu.android',
        'Version': '4.7.0',
        ...accountIdHeader
      }
    });

    if (!connectionsResponse.ok) {
      const errorText = await connectionsResponse.text();
      console.error(`Failed to fetch connections (${connectionsResponse.status}):`, errorText);
      return Response.json({ 
        error: 'Failed to fetch connections',
        status: connectionsResponse.status,
        details: errorText,
        endpoint: successEndpoint
      }, { status: connectionsResponse.status });
    }

    const data = await connectionsResponse.json();
    console.log('LibreLinkUp response:', JSON.stringify(data, null, 2));
    
    // Extract glucose readings from connections
    let readings = [];
    
    if (data.data && Array.isArray(data.data)) {
      // Get the first connection (patient)
      const connection = data.data[0];
      
      if (connection?.glucoseMeasurement) {
        readings.push({
          value: connection.glucoseMeasurement.Value,
          timestamp: connection.glucoseMeasurement.Timestamp,
          trend: connection.glucoseMeasurement.TrendArrow
        });
      }
      
      // Also get graph data if available
      if (connection?.glucoseItem?.Value) {
        readings.push({
          value: connection.glucoseItem.Value,
          timestamp: connection.glucoseItem.Timestamp
        });
      }
      
      // Get historical graph data
      if (connection?.graphData && Array.isArray(connection.graphData)) {
        readings = readings.concat(connection.graphData.map(r => ({
          value: r.Value,
          timestamp: r.Timestamp
        })));
      }
    }

    console.log(`Found ${readings.length} readings`);

    if (readings.length === 0) {
      return Response.json({ 
        success: true,
        synced: 0,
        message: 'No glucose readings found. Make sure you have an active connection.',
        connections: data.data?.length || 0
      });
    }

    // Get existing readings to avoid duplicates
    const existingReadings = await base44.entities.GlucoseReading.filter({ 
      created_by: user.email 
    });

    // Create a set of existing timestamps for quick lookup
    const existingTimestamps = new Set(
      existingReadings.map(r => `${r.date}_${r.reading_time}`)
    );

    // Process and store new readings
    const newReadings = [];
    
    for (const reading of readings) {
      // Extract timestamp
      let timestamp;
      if (reading.timestamp) {
        timestamp = new Date(reading.timestamp);
      } else if (reading.Timestamp) {
        timestamp = new Date(reading.Timestamp);
      } else {
        continue;
      }

      // Extract glucose value
      let glucoseValue;
      if (reading.value !== undefined) {
        glucoseValue = reading.value;
      } else if (reading.Value !== undefined) {
        glucoseValue = reading.Value;
      } else {
        continue;
      }

      const date = timestamp.toISOString().split('T')[0];
      const time = timestamp.toTimeString().split(' ')[0].substring(0, 5);
      const key = `${date}_${time}`;

      // Skip if already exists
      if (existingTimestamps.has(key)) {
        continue;
      }

      // Map LibreLinkUp trend arrows
      let trend = 'stable';
      const trendValue = reading.trend || reading.TrendArrow;
      if (trendValue) {
        const trendMap = {
          1: 'rising_fast', 'SINGLE_UP': 'rising_fast',
          2: 'rising', 'FORTY_FIVE_UP': 'rising',
          3: 'stable', 'FLAT': 'stable',
          4: 'falling', 'FORTY_FIVE_DOWN': 'falling',
          5: 'falling_fast', 'SINGLE_DOWN': 'falling_fast'
        };
        trend = trendMap[trendValue] || 'stable';
      }

      newReadings.push({
        reading: glucoseValue,
        reading_time: time,
        date: date,
        context: 'random',
        source: profile.cgm_device || 'libre2',
        trend: trend
      });
    }

    console.log(`Inserting ${newReadings.length} new readings`);

    if (newReadings.length > 0) {
      await base44.entities.GlucoseReading.bulkCreate(newReadings);
    }

    return Response.json({
      success: true,
      synced: newReadings.length,
      total: readings.length,
      message: newReadings.length > 0 
        ? `Synced ${newReadings.length} new glucose readings` 
        : 'All readings are already synced'
    });

  } catch (error) {
    console.error('Error syncing Libre data:', error);
    return Response.json({ 
      error: error.message,
      stack: error.stack 
    }, { status: 500 });
  }
});