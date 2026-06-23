// Buildlogg — Unsubscribe handler (Cloudflare Pages Function)
// Handles GET /unsubscribe?e=<base64url-email> (link click)
// and POST /unsubscribe (one-click List-Unsubscribe)
//
// Writes to email_suppressions in the outreach Supabase project.
// Env vars (set in Cloudflare Pages dashboard or via wrangler):
//   OUTREACH_SUPABASE_URL  — lead-triage Supabase project URL
//   OUTREACH_SUPABASE_KEY  — service role key for inserting suppressions

function decodeEmail(encoded) {
  try {
    // base64url decode → utf-8 string
    const b64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64 + '=='.slice(0, (4 - b64.length % 4) % 4);
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
    return new TextDecoder().decode(bytes).toLowerCase().trim();
  } catch {
    return null;
  }
}

function isValidEmail(email) {
  if (!email || email.length > 320) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function htmlPage(title, message, success) {
  const bg = success ? '#F9FAFB' : '#FEF2F2';
  const accent = success ? '#111827' : '#DC2626';
  return new Response(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light only">
<meta name="robots" content="noindex">
<title>${title}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
    background: ${bg}; color: #111827;
    display: flex; align-items: center; justify-content: center;
    min-height: 100dvh; padding: 24px;
  }
  .card {
    background: #fff; border: 1px solid #E5E7EB; border-radius: 12px;
    padding: 32px; max-width: 420px; width: 100%; text-align: center;
  }
  .logo { width: 36px; height: 36px; margin: 0 auto 20px; display: block; }
  h1 { font-size: 20px; font-weight: 700; color: ${accent}; margin-bottom: 8px; letter-spacing: -0.3px; }
  p { font-size: 15px; line-height: 1.55; color: #6B7280; }
  .email { font-weight: 600; color: #374151; word-break: break-all; }
</style>
</head>
<body>
  <div class="card">
    <img src="/assets/icon-black-square.png" alt="Buildlogg" class="logo" />
    <h1>${title}</h1>
    <p>${message}</p>
  </div>
</body>
</html>`, {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const encoded = url.searchParams.get('e');

  if (!encoded) {
    return htmlPage('Unsubscribe', 'This link is invalid. If you want to stop receiving emails from Buildlogg, reply to any email with "unsubscribe".', false);
  }

  const email = decodeEmail(encoded);
  if (!email || !isValidEmail(email)) {
    return htmlPage('Unsubscribe', 'This link is invalid or has expired.', false);
  }

  // Suppress in Supabase (uses context.env for credentials)
  const sbUrl = context.env.OUTREACH_SUPABASE_URL;
  const sbKey = context.env.OUTREACH_SUPABASE_KEY;

  if (sbUrl && sbKey) {
    try {
      await fetch(`${sbUrl}/rest/v1/email_suppressions?on_conflict=email`, {
        method: 'POST',
        headers: {
          'apikey': sbKey,
          'Authorization': `Bearer ${sbKey}`,
          'Content-Type': 'application/json',
          'Prefer': 'resolution=merge-duplicates',
        },
        body: JSON.stringify({
          email: email,
          reason: 'unsubscribe_link',
          suppressed_at: new Date().toISOString(),
        }),
      });
    } catch (err) {
      console.error('[unsubscribe] Supabase insert failed:', err);
    }
  } else {
    console.error('[unsubscribe] Missing OUTREACH_SUPABASE_URL or OUTREACH_SUPABASE_KEY env var');
  }

  return htmlPage(
    'You\'re unsubscribed',
    'You won\'t receive any more emails from Buildlogg about <span class="email">' + email + '</span>.<br><br>If this was a mistake, you can sign up again anytime at buildlogg.com.',
    true
  );
}

// One-click List-Unsubscribe (POST) — email clients send this when the user
// clicks the native "unsubscribe" button in their mail app.
export async function onRequestPost(context) {
  const url = new URL(context.request.url);
  const encoded = url.searchParams.get('e');

  // Some clients send the email in the POST body as form data
  let email = null;
  if (encoded) {
    email = decodeEmail(encoded);
  }

  if (!email || !isValidEmail(email)) {
    return new Response(JSON.stringify({ status: 'error', message: 'invalid email' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const sbUrl = context.env.OUTREACH_SUPABASE_URL;
  const sbKey = context.env.OUTREACH_SUPABASE_KEY;

  if (sbUrl && sbKey) {
    try {
      await fetch(`${sbUrl}/rest/v1/email_suppressions?on_conflict=email`, {
        method: 'POST',
        headers: {
          'apikey': sbKey,
          'Authorization': `Bearer ${sbKey}`,
          'Content-Type': 'application/json',
          'Prefer': 'resolution=merge-duplicates',
        },
        body: JSON.stringify({
          email: email,
          reason: 'one_click_unsubscribe',
          suppressed_at: new Date().toISOString(),
        }),
      });
    } catch (err) {
      console.error('[unsubscribe] Supabase insert failed:', err);
    }
  }

  return new Response(JSON.stringify({ status: 'unsubscribed' }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
