// Buildlogg — Pro Subscription Checkout Session (Cloudflare Pages Function)
// POST /api/create-subscription-session
// Body: { userId }
// Returns: { url, id }
//
// Env vars:
//   STRIPE_SECRET_KEY     — Stripe restricted key
//   STRRIPE_PRO_PRICE_ID  — Stripe Price ID for Buildlogg Pro (£14/mo recurring)
//   SUPABASE_URL          — Supabase project URL
//   SUPABASE_SERVICE_ROLE_KEY — bypasses RLS
//
// Manual setup required:
// 1. Create a Stripe Product "Buildlogg Pro" + Price £14/month recurring in Stripe Dashboard
// 2. Copy the price_xxx ID
// 3. Add STRIPE_PRO_PRICE_ID to Cloudflare env vars (Production + Preview)
// 4. Add webhook events in Stripe Dashboard: customer.subscription.updated, customer.subscription.deleted

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

async function supabaseQuery(url, key, table, query, method = 'GET', body = null) {
  const headers = { 'apikey': key, 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' };
  const fullUrl = `${url}/rest/v1/${table}${query}`;
  const options = { method, headers };
  if (body) options.body = JSON.stringify(body);
  const resp = await fetch(fullUrl, options);
  if (method === 'GET') return resp.json();
  return resp;
}

export async function onRequestPost(context) {
  const { request, env } = context;

  const STRIPE_KEY = env.STRIPE_SECRET_KEY;
  const PRICE_ID = env.STRIPE_PRO_PRICE_ID;
  const SUPABASE_URL = env.SUPABASE_URL;
  const SUPABASE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;

  if (!STRIPE_KEY) return json({ error: 'Stripe not configured' }, 500);
  if (!PRICE_ID) return json({ error: 'Pro subscription not configured. Add STRIPE_PRO_PRICE_ID to env vars.' }, 500);
  if (!SUPABASE_URL || !SUPABASE_KEY) return json({ error: 'Server not configured' }, 500);

  try {
    const body = await request.json();
    const { userId } = body;

    if (!userId) {
      return json({ error: 'userId is required' }, 400);
    }

    // Look up profile for business name
    const profiles = await supabaseQuery(SUPABASE_URL, SUPABASE_KEY, 'profiles',
      `?id=eq.${userId}&select=full_name,business_name,stripe_customer_id`);

    if (!profiles || profiles.length === 0) {
      return json({ error: 'User not found' }, 404);
    }

    const profile = profiles[0];
    const merchantName = profile.business_name || profile.full_name || 'Buildlogg user';
    const origin = new URL(request.url).origin;

    // Build checkout session params
    const params = new URLSearchParams({
      'mode': 'subscription',
      'line_items[0][price]': PRICE_ID,
      'line_items[0][quantity]': '1',
      'success_url': `${origin}/app/settings?subscription=success`,
      'cancel_url': `${origin}/app/settings?subscription=cancelled`,
      'metadata[user_id]': userId,
      'subscription_data[metadata][user_id]': userId,
      'client_reference_id': userId,
    });

    // If user already has a Stripe customer ID, pass it to link the subscription
    if (profile.stripe_customer_id) {
      params.append('customer', profile.stripe_customer_id);
    }

    const stripeResp = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${STRIPE_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    const session = await stripeResp.json();

    if (!stripeResp.ok) {
      console.error('[stripe] Subscription session creation failed:', session);
      return json({ error: 'Could not create checkout session' }, 500);
    }

    return json({ url: session.url, id: session.id }, 200);
  } catch (err) {
    console.error('[stripe] create-subscription-session error:', err);
    return json({ error: 'Something went wrong' }, 500);
  }
}
