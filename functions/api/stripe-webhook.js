// Buildlogg — Stripe Webhook Handler (Cloudflare Pages Function)
// POST /api/stripe-webhook
// Verifies webhook signature using Web Crypto API (no Stripe SDK needed — works in Workers)
//
// Env vars:
//   STRIPE_WEBHOOK_SECRET     — whsec_... from Stripe Dashboard
//   STRIPE_SECRET_KEY         — sk_... for API calls
//   SUPABASE_URL              — Supabase project URL
//   SUPABASE_SERVICE_ROLE_KEY — bypasses RLS

async function supabaseQuery(url, key, table, query, method = 'GET', body = null) {
  const headers = { 'apikey': key, 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' };
  if (method === 'PATCH') headers['Prefer'] = 'return=minimal';
  const fullUrl = `${url}/rest/v1/${table}${query}`;
  const options = { method, headers };
  if (body) options.body = JSON.stringify(body);
  const resp = await fetch(fullUrl, options);
  if (method === 'GET') return resp.json();
  return resp;
}

// Verify Stripe webhook signature using Web Crypto API
async function verifySignature(payload, signatureHeader, secret) {
  const parts = signatureHeader.split(',');
  const timestamp = parts.find(p => p.startsWith('t='))?.split('=')[1];
  const v1Signature = parts.find(p => p.startsWith('v1='))?.split('=')[1];
  if (!timestamp || !v1Signature) return false;

  // Check timestamp freshness (5 min tolerance)
  const age = Math.floor(Date.now() / 1000) - parseInt(timestamp);
  if (age > 300) return false;

  // Compute HMAC-SHA256
  const signedPayload = `${timestamp}.${payload}`;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sigBuffer = await crypto.subtle.sign('HMAC', key, encoder.encode(signedPayload));
  const computedSignature = Array.from(new Uint8Array(sigBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');

  return computedSignature === v1Signature;
}

export async function onRequestPost(context) {
  const { request, env } = context;

  const WEBHOOK_SECRET = env.STRIPE_WEBHOOK_SECRET;
  const SUPABASE_URL = env.SUPABASE_URL;
  const SUPABASE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;

  if (!WEBHOOK_SECRET || !SUPABASE_URL || !SUPABASE_KEY) {
    return new Response('Server not configured', { status: 500 });
  }

  const payload = await request.text();
  const signature = request.headers.get('Stripe-Signature');

  if (!signature) {
    return new Response('Missing signature', { status: 400 });
  }

  // Verify signature
  const isValid = await verifySignature(payload, signature, WEBHOOK_SECRET);
  if (!isValid) {
    return new Response('Invalid signature', { status: 400 });
  }

  // Parse event
  let event;
  try {
    event = JSON.parse(payload);
  } catch {
    return new Response('Invalid JSON', { status: 400 });
  }

  // Handle checkout.session.completed
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;

    // ── Subscription checkout — update profile, not job ──
    if (session.mode === 'subscription') {
      const userId = session.metadata?.user_id || session.client_reference_id;
      if (userId) {
        try {
          await supabaseQuery(SUPABASE_URL, SUPABASE_KEY, 'profiles',
            `?id=eq.${userId}`, 'PATCH',
            { subscription_status: 'active', stripe_customer_id: session.customer });
          console.log('[stripe-webhook] Subscription activated for user:', userId);
        } catch (err) {
          console.error('[stripe-webhook] Subscription profile update failed:', err);
        }
      }
      return new Response('OK', { status: 200 });
    }

    // ── One-time payment checkout — existing job payment logic ──
    const sessionId = session.id;
    const metadata = session.metadata || {};
    const merchantId = metadata.merchant_id;
    const jobId = metadata.job_id || null;
    const type = metadata.type || 'deposit';
    const amountPaid = session.amount_total ? session.amount_total / 100 : 0;

    try {
      // 1. Look up checkout_sessions by stripe_session_id
      const sessions = await supabaseQuery(SUPABASE_URL, SUPABASE_KEY, 'checkout_sessions',
        `?stripe_session_id=eq.${sessionId}&select=*`);

      if (!sessions || sessions.length === 0) {
        console.warn('[stripe-webhook] No checkout_sessions record for session:', sessionId);
        return new Response('OK', { status: 200 });
      }

      const checkoutRecord = sessions[0];

      // 2. Idempotency check
      if (checkoutRecord.status === 'paid') {
        return new Response('OK (already processed)', { status: 200 });
      }

      // 3. If job_id is set, update the job + create payment record FIRST
      //    (before marking checkout_sessions as paid, so a failed payment INSERT
      //    doesn't poison the idempotency check on webhook retry)
      if (jobId) {
        // Look up current job status to decide the status transition
        const jobs = await supabaseQuery(SUPABASE_URL, SUPABASE_KEY, 'jobs',
          `?id=eq.${jobId}&select=status`);

        const currentStatus = jobs && jobs.length > 0 ? jobs[0].status : null;
        const now = new Date().toISOString();
        const jobPatch = { deposit_status: 'paid', deposit_paid_at: now, updated_at: now };

        // Update job.status based on payment type:
        // - deposit on a 'quoted' job → 'booked' (matches manual handleRecordDeposit)
        // - full payment → 'paid' with actual_end (matches manual handleMarkPaid)
        if (type === 'deposit' && currentStatus === 'quoted') {
          jobPatch.status = 'booked';
        } else if (type === 'full') {
          jobPatch.status = 'paid';
          jobPatch.actual_end = now;
        }

        await supabaseQuery(SUPABASE_URL, SUPABASE_KEY, 'jobs',
          `?id=eq.${jobId}`, 'PATCH', jobPatch);

        // Create payment record — no _sync_status (column DEFAULT 'synced' is correct
        // for server-side inserts; initialSync will set it to 'synced' on pull)
        await supabaseQuery(SUPABASE_URL, SUPABASE_KEY, 'payments', '', 'POST', {
          job_id: jobId,
          type: type === 'deposit' ? 'deposit' : 'full',
          method: 'card',
          amount: amountPaid,
          recorded_at: now,
          created_at: now,
        });
      }

      // BU-5: If no job_id but a booking_request_id exists, mark the booking deposit as paid.
      if (!jobId && checkoutRecord.booking_request_id) {
        await supabaseQuery(SUPABASE_URL, SUPABASE_KEY, 'booking_requests',
          `?id=eq.${checkoutRecord.booking_request_id}`, 'PATCH',
          { status: 'deposit_paid', deposit_amount: amountPaid });
      }

      // 4. Mark checkout_sessions as paid (AFTER job + payment updates succeed)
      await supabaseQuery(SUPABASE_URL, SUPABASE_KEY, 'checkout_sessions',
        `?id=eq.${checkoutRecord.id}`, 'PATCH',
        { status: 'paid', paid_at: new Date().toISOString() }
      );

      console.log('[stripe-webhook] Payment processed:', sessionId, 'amount:', amountPaid);
      return new Response('OK', { status: 200 });

    } catch (err) {
      console.error('[stripe-webhook] Processing error:', err);
      return new Response('OK (error logged)', { status: 200 });
    }
  }

  // ── Subscription lifecycle events ──
  if (event.type === 'customer.subscription.updated') {
    const sub = event.data.object;
    const userId = sub.metadata?.user_id;
    if (userId) {
      try {
        const status = sub.status; // active, trialing, past_due, canceled, unpaid
        const endsAt = sub.current_period_end
          ? new Date(sub.current_period_end * 1000).toISOString()
          : null;
        const patch = {};
        if (status === 'active' || status === 'trialing') {
          patch.subscription_status = status;
        } else if (status === 'canceled') {
          patch.subscription_status = 'canceled';
        } else if (status === 'unpaid' || status === 'past_due') {
          patch.subscription_status = 'expired';
        }
        if (endsAt) patch.subscription_ends_at = endsAt;
        if (Object.keys(patch).length > 0) {
          await supabaseQuery(SUPABASE_URL, SUPABASE_KEY, 'profiles',
            `?id=eq.${userId}`, 'PATCH', patch);
          console.log('[stripe-webhook] Subscription updated:', userId, status);
        }
      } catch (err) {
        console.error('[stripe-webhook] Subscription update failed:', err);
      }
    }
    return new Response('OK', { status: 200 });
  }

  if (event.type === 'customer.subscription.deleted') {
    const sub = event.data.object;
    const userId = sub.metadata?.user_id;
    if (userId) {
      try {
        await supabaseQuery(SUPABASE_URL, SUPABASE_KEY, 'profiles',
          `?id=eq.${userId}`, 'PATCH',
          { subscription_status: 'canceled' });
        console.log('[stripe-webhook] Subscription canceled:', userId);
      } catch (err) {
        console.error('[stripe-webhook] Subscription cancel failed:', err);
      }
    }
    return new Response('OK', { status: 200 });
  }

  // ── Dispute logging ──
  if (event.type === 'charge.dispute.created') {
    const dispute = event.data.object;
    console.error('[stripe-webhook] Dispute created:', dispute.id, 'amount:', dispute.amount, 'reason:', dispute.reason);
    return new Response('OK', { status: 200 });
  }

  return new Response('OK', { status: 200 });
}
