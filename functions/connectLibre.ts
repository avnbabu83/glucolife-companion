import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { sharingCode } = await req.json();

    if (!sharingCode) {
      return Response.json({ error: 'Sharing code required' }, { status: 400 });
    }

    // Validate the sharing code format (XXXX-XX-XX)
    const codePattern = /^[A-Z0-9]{4}-[A-Z0-9]{2}-[A-Z0-9]{2}$/i;
    if (!codePattern.test(sharingCode)) {
      return Response.json({ 
        error: 'Invalid sharing code format. Use format: XXXX-XX-XX' 
      }, { status: 400 });
    }

    // Store the sharing code in user profile
    const profiles = await base44.entities.UserProfile.filter({ created_by: user.email });
    const profile = profiles[0];

    if (profile) {
      await base44.entities.UserProfile.update(profile.id, {
        libre_sharing_code: sharingCode.toUpperCase(),
        libre_connected_at: new Date().toISOString(),
        cgm_device: 'libre2'
      });
    }

    return Response.json({
      success: true,
      message: 'Successfully saved LibreView sharing code'
    });

  } catch (error) {
    console.error('Error connecting to Libre:', error);
    return Response.json({ 
      error: error.message 
    }, { status: 500 });
  }
});