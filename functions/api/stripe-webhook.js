// Buildlogg — Stripe Webhook Handler (Cloudflare Pages Function)
// POST /api/stripe-webhook
// Receives Stripe webhook events and updates job/payment status in Supabase.
//
// Env vars (set in Cloudflare Pages dashboard):
//   STRIPE_WEBHOOK_SECRET     — webhook signing secret (whsec_...)
//   SUPABASE_URL              — app's Supabase project URL
//   SUPABASE_SERVICE_ROLE_KEY — bypasses RLS for server-side queries
//
// Setup:
//   1. In Stripe Dashboard → Developers → Webhooks → Add endpoint:
//      URL: https://buildlogg.com/api/stripe-webhook
//      Events: checkout.session.completed
//   2. Copy the signing secret (whsec_...) and add to Cloudflare as STRIPE_WEBHOOK_SECRET

import Stripe from 'stripe';

async function supabaseQuery(url, key, table, query, method = 'GET', body = null) {
  const headers = { 'apikey': key, 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' };
  const fullUrl = `${url}/rest/v1/${table}${query}`;
  const options = { method, headers };
  if (body) options.body = JSON.stringify(body);
  const resp = await fetch(fullUrl, options);
  if (method === 'GET') return resp.json();
  return resp;
}

async function supabasePatch(url, key, table, query, body) {
  const headers = {
    'apikey': key,
    'Authorization': `Bearer ${key}`,
    'Content-Type': 'application/json',
    'Prefer': 'return=minimal',
  };
  const resp = await fetch(`${url}/rest/v1/${table}${query}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify(body),
  });
  return resp;
}

export async function onRequestPost(context) {
  const { request, env } = context;

  const STRIPE_SECRET = env.STRIPE_WEBHOOK_SECRET;
  const STRIPE_KEY = env.STRIPE_SECRET_KEY;
  const SUPABASE_URL = env.SUPABASE_URL;
  const SUPABASE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;

  if (!STRIPE_SECRET || !STRIPE_KEY || !SUPABASE_URL || !SUPABASE_KEY) {
    return new Response('Server not configured', { status: 500 });
  }

  const stripe = new Stripe(STRIPE_KEY);

  // Verify webhook signature
  const payload = await request.text();
  const signature = request.headers.get('Stripe-Signature');

  let event;
  try {
    event = stripe.webhooks.constructEvent(payload, signature, STRIPE_SECRET);
  } catch (err) {
    console.error('[stripe-webhook] Signature verification failed:', err.message);
    return new Response('Invalid signature', { status: 400 });
  }

  // Handle checkout.session.completed
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const sessionId = session.id;
    const metadata = session.metadata || {};
    const merchantId = metadata.merchant_id;
    const jobId = metadata.job_id || null;
    const type = metadata.type || 'deposit';
    const amountPaid = session.amount_total / 100; // Stripe stores in pence

    try {
      // 1. Look up checkout_sessions by stripe_session_id
      const sessions = await supabaseQuery(SUPABASE_URL, SUPABASE_KEY, 'checkout_sessions',
        `?stripe_session_id=eq.${sessionId}&select=*`);

      if (!sessions || sessions.length === 0) {
        console.warn('[stripe-webhook] No checkout_sessions record for session:', sessionId);
        return new Response('OK', { status: 200 });
      }

      const checkoutRecord = sessions[0];

      // 2. Idempotency check — if already paid, skip
      if (checkoutRecord.status === 'paid') {
        return new Response('OK (already processed)', { status: 200 });
      }

      // 3. Update checkout_sessions status to paid
      await supabasePatch(SUPABASE_URL, SUPABASE_KEY, 'checkout_sessions',
        `?id=eq.${checkoutRecord.id}`,
        { status: 'paid', paid_at: new Date().toISOString() }
      );

      // 4. If job_id is set, update the job
      if (jobId) {
        // Update job deposit status
        await supabasePatch(SUPABASE_URL, SUPABASE_KEY, 'jobs',
          `?id=eq.${jobId}`,
          { deposit_status: 'paid', deposit_paid_at: new Date().toISOString(), updated_at: new Date().toISOString() }
        );

        // Create a payment record
        await supabaseQuery(SUPABASE_URL, SUPABASE_KEY, 'payments', '', 'POST', {
          job_id: jobId,
          type: type === 'deposit' ? 'deposit' : 'full',
          method: 'card',
          amount: amountPaid,
          recorded_at: new Date().toISOString(),
          created_at: new Date().toISOString(),
          _sync_status: 'pending',
        });
      }

      console.log('[stripe-webhook] Payment processed:', sessionId, 'amount:', amountPaid);
      return new Response('OK', { status: 200 });

    } catch (err) {
      console.error('[stripe-webhook] Processing error:', err);
      return new Response('OK (error logged)', { status: 200 }); // Return 200 so Stripe doesn't retry
    }
  }

  // Unhandled event type — acknowledge but don't process
  return new Response('OK', { status: 200 });
}
