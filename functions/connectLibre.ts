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
      return Response.json({ error: 'Email and password required' }, { status: 400 });
    }

    // Authenticate with LibreView
    const authResponse = await fetch('https://api.libreview.io/llu/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'product': 'llu.android',
        'version': '4.7.0'
      },
      body: JSON.stringify({
        email: email,
        password: password
      })
    });

    if (!authResponse.ok) {
      const errorData = await authResponse.json();
      return Response.json({ 
        error: 'LibreView authentication failed',
        details: errorData 
      }, { status: authResponse.status });
    }

    const authData = await authResponse.json();
    
    if (!authData.data?.authTicket?.token) {
      return Response.json({ 
        error: 'Invalid response from LibreView' 
      }, { status: 500 });
    }

    // Store the access token in user profile
    const profiles = await base44.entities.UserProfile.filter({ created_by: user.email });
    const profile = profiles[0];

    if (profile) {
      await base44.entities.UserProfile.update(profile.id, {
        libre_access_token: authData.data.authTicket.token,
        libre_connected_at: new Date().toISOString(),
        cgm_device: 'libre2'
      });
    }

    return Response.json({
      success: true,
      message: 'Successfully connected to LibreView',
      user: authData.data.user
    });

  } catch (error) {
    console.error('Error connecting to Libre:', error);
    return Response.json({ 
      error: error.message 
    }, { status: 500 });
  }
});