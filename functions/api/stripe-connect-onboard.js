// Buildlogg — Stripe Connect Express Onboarding (Cloudflare Pages Function)
// POST /api/stripe-connect-onboard
// Body: { userId }
// Returns: { url, accountId }
//
// Creates a Stripe Express connected account for the merchant and returns
// a Stripe-hosted onboarding URL. The merchant enters bank details, Stripe
// verifies identity. Webhook (account.updated) sets stripe_connected=true.
//
// Env vars:
//   STRIPE_SECRET_KEY         — Stripe restricted key (needs accounts_write, account_links_write)
//   SUPABASE_URL              — Supabase project URL
//   SUPABASE_SERVICE_ROLE_KEY — bypasses RLS
//
// Prerequisites:
//   1. Stripe key must have: accounts_write, account_links_write, connected_account_read
//   2. Webhook endpoint must have: account.updated event enabled

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

async function supabaseQuery(url, key, table, query, method = 'GET', body = null) {
  const headers = { 'apikey': key, 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' };
  if (method === 'PATCH') headers['Prefer'] = 'return=minimal';
  const fullUrl = `${url}/rest/v1/${table}${query}`;
  const options = { method, headers };
  if (body) options.body = JSON.stringify(body);
  const resp = await fetch(fullUrl, options);
  if (method === 'GET') {
    const data = await resp.json();
    if (!resp.ok) {
      console.error(`[supabaseQuery] ${table} GET failed: ${resp.status}`, data);
      return null;
    }
    return data;
  }
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
    const { userId } = body;

    if (!userId) return json({ error: 'userId is required' }, 400);

    // Look up profile
    const profiles = await supabaseQuery(SUPABASE_URL, SUPABASE_KEY, 'profiles',
      `?id=eq.${userId}&select=stripe_account_id,business_name,full_name`);

    if (!profiles || profiles.length === 0) return json({ error: 'User not found' }, 404);

    const profile = profiles[0];
    const origin = new URL(request.url).origin;
    let accountId = profile.stripe_account_id;

    // If no real connected account, create one
    if (!accountId || accountId === 'buildlogg-shared') {
      const accountParams = new URLSearchParams({
        'type': 'express',
        'country': 'GB',
        'metadata[user_id]': userId,
      });

      const accountResp = await fetch('https://api.stripe.com/v1/accounts', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${STRIPE_KEY}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: accountParams.toString(),
      });

      const account = await accountResp.json();

      if (!accountResp.ok) {
        console.error('[stripe-connect] Account creation failed:', account);
        const errMsg = account.error?.message || 'Could not create Stripe account';
        return json({ error: errMsg }, 500);
      }

      accountId = account.id;

      // Store the connected account ID on the profile
      await supabaseQuery(SUPABASE_URL, SUPABASE_KEY, 'profiles',
        `?id=eq.${userId}`, 'PATCH',
        { stripe_account_id: accountId });
    }

    // Create account link for onboarding
    const linkParams = new URLSearchParams({
      'account': accountId,
      'type': 'account_onboarding',
      'return_url': `${origin}/app/settings?stripe=return`,
      'refresh_url': `${origin}/app/settings?stripe=refresh`,
    });

    const linkResp = await fetch('https://api.stripe.com/v1/account_links', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${STRIPE_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: linkParams.toString(),
    });

    const link = await linkResp.json();

    if (!linkResp.ok) {
      console.error('[stripe-connect] Account link creation failed:', link);
      return json({ error: 'Could not create onboarding link' }, 500);
    }

    return json({ url: link.url, accountId }, 200);
  } catch (err) {
    console.error('[stripe-connect] Error:', err.message, err.stack);
    return json({ error: err.message || 'Something went wrong' }, 500);
  }
}
