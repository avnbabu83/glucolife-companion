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
    const endpoints = [
      'https://api-us.libreview.io',
      'https://api.libreview.io',
      'https://api-eu.libreview.io'
    ];
    
    let loginResponse = null;
    let lastError = null;
    
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
          loginResponse = response;
          console.log(`Successfully authenticated with ${endpoint}`);
          break;
        } else {
          lastError = await response.text();
        }
      } catch (err) {
        lastError = err.message;
        continue;
      }
    }
    
    if (!loginResponse || !loginResponse.ok) {
      return Response.json({ 
        error: 'Failed to authenticate with LibreLinkUp on all regional endpoints',
        details: lastError 
      }, { status: 401 });
    }

    const authData = await loginResponse.json();
    console.log('LibreLinkUp auth response:', JSON.stringify(authData, null, 2));
    
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