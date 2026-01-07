import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { email, password } = await req.json();
    
    if (!email || !password) {
      return Response.json({ error: 'LibreLinkUp email and password are required' }, { status: 400 });
    }

    // Try multiple regional endpoints
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
    let lastError = null;
    
    // First attempt - try default endpoints
    for (const endpoint of endpoints) {
      try {
        const response = await fetch(`${endpoint}/llu/auth/login`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'Product': 'llu.android',
            'Version': '4.7.0'
          },
          body: JSON.stringify({
            email: email,
            password: password
          })
        });
        
        if (response.ok) {
          authData = await response.json();
          console.log(`Response from ${endpoint}:`, JSON.stringify(authData, null, 2));
          
          // Check if we need to redirect to a specific region
          if (authData.data?.redirect && authData.data?.region) {
            const regionEndpoint = regionMap[authData.data.region];
            if (regionEndpoint) {
              console.log(`Redirecting to region: ${authData.data.region} (${regionEndpoint})`);
              const redirectResponse = await fetch(`${regionEndpoint}/llu/auth/login`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Accept': 'application/json',
                  'Product': 'llu.android',
                  'Version': '4.16.0'
                },
                body: JSON.stringify({
                  email: email,
                  password: password
                })
              });
              
              if (redirectResponse.ok) {
                authData = await redirectResponse.json();
                console.log(`Auth data from regional endpoint:`, JSON.stringify(authData, null, 2));
              }
            }
          }
          break;
        } else {
          lastError = await response.text();
        }
      } catch (err) {
        lastError = err.message;
        continue;
      }
    }
    
    if (!authData) {
      return Response.json({ 
        error: 'Failed to authenticate with LibreLinkUp on all regional endpoints',
        details: lastError 
      }, { status: 401 });
    }

    console.log('Final auth data:', JSON.stringify(authData, null, 2));
    
    // Try multiple possible token locations
    const token = authData.data?.authTicket?.token || 
                  authData.authTicket?.token || 
                  authData.ticket?.token ||
                  authData.token;
    
    // Get user ID for Account-Id header (required as of late 2025)
    const userId = authData.data?.user?.id || authData.user?.id;
    
    if (!token) {
      return Response.json({ 
        error: 'No auth token received from LibreLinkUp',
        responseStructure: Object.keys(authData),
        dataKeys: authData.data ? Object.keys(authData.data) : null
      }, { status: 500 });
    }

    // Store credentials in user profile (encrypted at rest by Base44)
    const profiles = await base44.entities.UserProfile.filter({ created_by: user.email });
    
    if (profiles.length > 0) {
      await base44.entities.UserProfile.update(profiles[0].id, {
        libre_email: email,
        libre_password: password,
        libre_auth_token: token,
        libre_user_id: userId,
        libre_connected_at: new Date().toISOString(),
        cgm_device: 'libre2'
      });
    }

    return Response.json({ 
      success: true,
      message: 'LibreLinkUp connected successfully',
      patientName: authData.data?.user?.firstName
    });
  } catch (error) {
    console.error('Error connecting LibreLinkUp:', error);
    return Response.json({ 
      error: 'Failed to connect LibreLinkUp',
      details: error.message 
    }, { status: 500 });
  }
});