// Buildlogg — Resend Webhook Handler (Cloudflare Pages Function)
// Receives email events from Resend (opens, clicks, bounces, complaints)
// and stores them in the email_events table in Supabase.
//
// Setup:
//   1. Run ~/lead-triage/data/email_events_schema.sql in Supabase SQL Editor
//   2. Deploy this function: it will be available at https://buildlogg.com/api/resend-webhook
//   3. In Resend Dashboard → Webhooks → Add webhook:
//      URL: https://buildlogg.com/api/resend-webhook
//      Events: email.delivered, email.opened, email.clicked, email.bounced, email.complained
//   4. Set env vars in Cloudflare Pages dashboard:
//      OUTREACH_SUPABASE_URL  — lead-triage Supabase project URL
//      OUTREACH_SUPABASE_KEY  — service role key
//      RESEND_WEBHOOK_SECRET  — (optional) webhook signing secret for verification

// Env vars are accessed via context.env inside handlers (Cloudflare Pages Functions)
// These are resolved lazily inside each handler to avoid top-level env access

async function insertEvent(event, SUPABASE_URL, SUPABASE_KEY) {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return { error: 'Supabase not configured' };
  }

  const emailId = event.data?.email_id || event.data?.id || '';
  const leadEmail = event.data?.to?.[0] || event.data?.to || '';
  const eventType = (event.type || '').replace('email.', '') || 'unknown';
  const url = event.data?.click?.url || null;
  const userAgent = event.data?.user_agent || null;
  const ipAddress = event.data?.ip_address || event.data?.sender_ip || null;

  const resp = await fetch(`${SUPABASE_URL}/rest/v1/email_events`, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal',
    },
    body: JSON.stringify({
      email_id: emailId,
      lead_email: typeof leadEmail === 'string' ? leadEmail.toLowerCase() : '',
      event_type: eventType,
      url: url,
      user_agent: userAgent,
      ip_address: ipAddress,
      raw_payload: event,
    }),
  });

  if (!resp.ok) {
    const text = await resp.text();
    return { error: `Supabase insert failed: ${resp.status} ${text}` };
  }

  return { success: true };
}

// Update cold_email_state based on bounce/complaint
async function updateLeadState(leadEmail, eventType, SUPABASE_URL, SUPABASE_KEY) {
  if (!leadEmail) return;
  const email = leadEmail.toLowerCase();

  let newStatus = null;
  if (eventType === 'bounced') newStatus = 'bounced';
  else if (eventType === 'complained') newStatus = 'unsubscribed';

  if (!newStatus) return;

  // Update cold_email_state
  await fetch(`${SUPABASE_URL}/rest/v1/cold_email_state?email=eq.${encodeURIComponent(email)}`, {
    method: 'PATCH',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal',
    },
    body: JSON.stringify({ status: newStatus, updated_at: new Date().toISOString() }),
  });

  // Also add to suppressions on complaint
  if (eventType === 'complained') {
    await fetch(`${SUPABASE_URL}/rest/v1/email_suppressions`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify({
        email: email,
        reason: 'complained (spam report)',
      }),
    });
  }
}

export async function onRequestPost(context) {
  const { request } = context;
  const SUPABASE_URL = context.env.OUTREACH_SUPABASE_URL || '';
  const SUPABASE_KEY = context.env.OUTREACH_SUPABASE_KEY || '';
  const WEBHOOK_SECRET = context.env.RESEND_WEBHOOK_SECRET || '';

  try {
    // Optional: verify webhook signature
    if (WEBHOOK_SECRET) {
      const signature = request.headers.get('svix-signature') || '';
      // Resend uses Svix for webhook signing. Full verification requires
      // the svix library. For now, just check the header exists.
      if (!signature) {
        return new Response(JSON.stringify({ error: 'Missing signature' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      // TODO: implement full Svix signature verification
    }

    const body = await request.text();
    const events = JSON.parse(body);

    // Resend sends an array of events
    const eventList = Array.isArray(events) ? events : [events];

    const results = [];
    for (const event of eventList) {
      const leadEmail = event.data?.to?.[0] || event.data?.to || '';
      const eventType = (event.type || '').replace('email.', '') || 'unknown';

      const result = await insertEvent(event, SUPABASE_URL, SUPABASE_KEY);
      results.push({ event: eventType, email: leadEmail, ...result });

      // Update lead state on bounce/complaint
      if (eventType === 'bounced' || eventType === 'complained') {
        await updateLeadState(leadEmail, eventType, SUPABASE_URL, SUPABASE_KEY);
      }
    }

    return new Response(JSON.stringify({ received: results.length, results }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

// Health check on GET
export async function onRequestGet(context) {
  const SUPABASE_URL = context.env.OUTREACH_SUPABASE_URL || '';
  const SUPABASE_KEY = context.env.OUTREACH_SUPABASE_KEY || '';
  return new Response(JSON.stringify({
    status: 'ok',
    endpoint: 'resend-webhook',
    configured: !!(SUPABASE_URL && SUPABASE_KEY),
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
