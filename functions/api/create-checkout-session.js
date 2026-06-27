// Buildlogg — Stripe Checkout Session Creator (Cloudflare Pages Function)
// POST /api/create-checkout-session
// Body: { merchantId, jobId, amount, description, type }
// Returns: { url, id }
//
// Env vars (set in Cloudflare Pages dashboard):
//   STRIPE_SECRET_KEY         — Stripe restricted key (sk_...)
//   SUPABASE_URL              — app's Supabase project URL
//   SUPABASE_SERVICE_ROLE_KEY — bypasses RLS for server-side queries

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
  const SUPABASE_URL = env.SUPABASE_URL;
  const SUPABASE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;

  if (!STRIPE_KEY) return json({ error: 'Stripe not configured' }, 500);
  if (!SUPABASE_URL || !SUPABASE_KEY) return json({ error: 'Server not configured' }, 500);

  try {
    const body = await request.json();
    const { merchantId, jobId, amount, description, type } = body;

    if (!merchantId || !amount || amount <= 0) {
      return json({ error: 'merchantId and positive amount are required' }, 400);
    }

    // Look up merchant's Stripe account
    const profiles = await supabaseQuery(SUPABASE_URL, SUPABASE_KEY, 'profiles',
      `?id=eq.${merchantId}&select=stripe_account_id,stripe_connected,business_name,full_name`);

    if (!profiles || profiles.length === 0) {
      return json({ error: 'Merchant not found' }, 404);
    }

    const merchant = profiles[0];
    if (!merchant.stripe_connected) {
      return json({ error: 'Stripe not connected. Go to Settings to connect.' }, 400);
    }

    // Create Stripe Checkout Session
    const merchantName = merchant.business_name || merchant.full_name || 'Buildlogg merchant';
    const sessionBody = new URLSearchParams({
      'mode': 'payment',
      'line_items[0][quantity]': '1',
      'line_items[0][price_data][currency]': 'gbp',
      'line_items[0][price_data][product_data][name]': description || `${type === 'deposit' ? 'Deposit' : 'Payment'} for ${merchantName}`,
      'line_items[0][price_data][unit_amount]': String(Math.round(amount * 100)),
      'success_url': `${new URL(request.url).origin}/book/payment-success`,
      'cancel_url': `${new URL(request.url).origin}/book/payment-cancelled`,
      'metadata[merchant_id]': merchantId,
      'metadata[job_id]': jobId || '',
      'metadata[type]': type || 'deposit',
    });

    const stripeResp = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${STRIPE_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: sessionBody.toString(),
    });

    const session = await stripeResp.json();

    if (!stripeResp.ok) {
      console.error('[stripe] Checkout session creation failed:', session);
      return json({ error: 'Could not create payment link' }, 500);
    }

    // Store checkout session in Supabase
    await supabaseQuery(SUPABASE_URL, SUPABASE_KEY, 'checkout_sessions', '', 'POST', {
      merchant_id: merchantId,
      job_id: jobId || null,
      stripe_session_id: session.id,
      stripe_url: session.url,
      amount: amount,
      description: description || '',
      type: type || 'deposit',
      status: 'pending',
    });

    return json({ url: session.url, id: session.id }, 200);
  } catch (err) {
    console.error('[stripe] create-checkout-session error:', err);
    return json({ error: 'Something went wrong' }, 500);
  }
}
