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

    // Try to authenticate with LibreLinkUp
    const loginResponse = await fetch('https://api-us.libreview.io/llu/auth/login', {
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

    if (!loginResponse.ok) {
      const errorText = await loginResponse.text();
      return Response.json({ 
        error: 'Failed to authenticate with LibreLinkUp',
        details: errorText 
      }, { status: 401 });
    }

    const authData = await loginResponse.json();
    
    if (!authData.data?.authTicket?.token) {
      return Response.json({ 
        error: 'No auth token received from LibreLinkUp' 
      }, { status: 500 });
    }

    // Store credentials in user profile (encrypted at rest by Base44)
    const profiles = await base44.entities.UserProfile.filter({ created_by: user.email });
    
    if (profiles.length > 0) {
      await base44.entities.UserProfile.update(profiles[0].id, {
        libre_email: email,
        libre_password: password, // Store encrypted
        libre_auth_token: authData.data.authTicket.token,
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