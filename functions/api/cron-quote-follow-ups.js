// Buildlogg — Sprint 4 Item 18: Quote Follow-Up Email Cron
// GET /api/cron-quote-follow-ups
// Authorization: Bearer <CRON_SECRET>
//
// Processes due quote_follow_ups and sends email follow-ups to customers
// when merchant's default_reminder_mode is 'remind_client' or 'both'.
// Mirrors cron-recurring-reminders.js structure.

export async function onRequestGet(context) {
  const { request, env } = context;

  const authHeader = request.headers.get('Authorization');
  if (!authHeader || authHeader !== `Bearer ${env.CRON_SECRET}`) {
    return json({ error: 'unauthorized' }, 401);
  }

  const supabaseUrl = env.SUPABASE_URL;
  const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    return json({ error: 'server not configured' }, 500);
  }

  const now = new Date().toISOString();
  const results = { processed: 0, sent: 0, failed: 0, skipped: 0 };

  try {
    const dueFollowUps = await supabaseFetch(supabaseUrl, supabaseKey, `
      SELECT qu.*, j.title as job_title, j.status as job_status,
             c.name as customer_name, c.email as customer_email, c.phone as customer_phone,
             p.full_name, p.business_name, p.booking_slug, p.booking_enabled,
             p.logo_data_url, p.subscription_status, p.default_reminder_mode,
             p.push_subscription_endpoint, p.push_subscription_keys
      FROM quote_follow_ups qu
      LEFT JOIN jobs j ON qu.job_id = j.id
      LEFT JOIN customers c ON j.customer_id = c.id
      LEFT JOIN profiles p ON qu.user_id = p.id
      WHERE (qu.status = 'pending' OR (qu.status = 'snoozed' AND qu.snooze_until <= $1))
        AND qu.first_nudge_at <= $1
        AND qu.nudge_count < 3
      ORDER BY qu.first_nudge_at ASC
      LIMIT 50
    `, [now]);

    if (!dueFollowUps || dueFollowUps.length === 0) {
      return json({ ...results, message: 'no due follow-ups' });
    }

    for (const fu of dueFollowUps) {
      results.processed++;

      // Auto-resolve if job is no longer 'quoted'
      if (fu.job_status !== 'quoted') {
        await supabaseUpdate(supabaseUrl, supabaseKey, 'quote_follow_ups', fu.id, {
          status: 'responded', updated_at: now,
        });
        results.skipped++;
        continue;
      }

      const mode = fu.default_reminder_mode || 'remind_me';
      const hasEmail = fu.customer_email && fu.customer_email.trim();
      let sendResult = { channel: 'push', status: 'skipped' };

      if ((mode === 'remind_client' || mode === 'both') && hasEmail) {
        sendResult = await sendFollowUpEmail(env, fu);
      } else if (mode === 'remind_client' || mode === 'both') {
        // No email — push fallback to merchant
        if (fu.push_subscription_endpoint) {
          await sendPush(env, fu.push_subscription_endpoint, fu.push_subscription_keys, {
            title: `Quote follow-up — ${fu.customer_name || 'Customer'}`,
            body: `No email on file for ${fu.job_title}. Send WhatsApp manually.`,
            url: '/app/',
          });
        }
        sendResult = { channel: 'push', status: 'sent' };
      } else if (fu.push_subscription_endpoint) {
        // remind_me mode — push to merchant only
        await sendPush(env, fu.push_subscription_endpoint, fu.push_subscription_keys, {
          title: `Quote follow-up — ${fu.customer_name || 'Customer'}`,
          body: `${fu.job_title} quote is going cold. Tap to follow up.`,
          url: '/app/',
        });
        sendResult = { channel: 'push', status: 'sent' };
      }

      // Update follow-up: increment nudge count, auto-dismiss after 3
      const newCount = (fu.nudge_count || 0) + 1;
      const updates = {
        nudge_count: newCount,
        last_nudge_at: now,
        status: newCount >= 3 ? 'dismissed' : (fu.status === 'snoozed' ? 'pending' : fu.status),
        updated_at: now,
      };
      await supabaseUpdate(supabaseUrl, supabaseKey, 'quote_follow_ups', fu.id, updates);

      // Insert work_log
      await supabaseInsert(supabaseUrl, supabaseKey, 'work_log', {
        id: crypto.randomUUID(),
        job_id: fu.job_id,
        type: 'quote_follow_up_sent',
        description: `[Auto follow-up ${sendResult.channel} ${sendResult.status} — ${fu.job_title}]`,
        created_at: now,
      });

      if (sendResult.status === 'sent') results.sent++;
      else if (sendResult.status === 'failed') results.failed++;
      else results.skipped++;
    }

    return json(results);
  } catch (err) {
    console.error('[cron-quote-follow-ups] Error:', err);
    return json({ ...results, error: err.message }, 500);
  }
}

// --- Helpers (copied from cron-recurring-reminders.js — CF Functions can't share code) ---

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function supabaseFetch(url, key, query, params) {
  const res = await fetch(`${url}/rest/v1/rpc/exec_sql`, {
    method: 'POST',
    headers: {
      'apikey': key,
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, params }),
  });
  if (!res.ok) {
    const text = await res.text();
    console.error('[supabaseFetch] Error:', text);
    return [];
  }
  const data = await res.json();
  return data || [];
}

async function supabaseUpdate(url, key, table, id, updates) {
  await fetch(`${url}/rest/v1/${table}?id=eq.${id}`, {
    method: 'PATCH',
    headers: {
      'apikey': key,
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(updates),
  });
}

async function supabaseInsert(url, key, table, record) {
  await fetch(`${url}/rest/v1/${table}`, {
    method: 'POST',
    headers: {
      'apikey': key,
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal',
    },
    body: JSON.stringify(record),
  });
}

async function sendFollowUpEmail(env, fu) {
  const apiKey = env.RESEND_API_KEY;
  if (!apiKey) return { channel: 'email', status: 'failed', error: 'no RESEND_API_KEY' };

  const firstName = (fu.customer_name || 'there').split(' ')[0];
  const businessName = fu.business_name || fu.full_name || 'Your business';
  const body = `Hi ${firstName}, just following up on the quote I sent for the ${fu.job_title}. Happy to answer any questions. — ${businessName}`;
  const subject = `Following up on your quote from ${businessName}`;

  const isPro = !fu.subscription_status || fu.subscription_status === 'active' || fu.subscription_status === 'trialing';
  const hasLogo = isPro && fu.logo_data_url;
  const emailBody = hasLogo
    ? JSON.stringify({
        from: 'Buildlogg <noreply@mail.buildlogg.com>',
        to: [fu.customer_email],
        subject, text: body,
        html: `<table width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;margin:0 auto;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif"><tr><td style="text-align:center;padding:24px 0 16px"><img src="${fu.logo_data_url}" alt="${businessName}" style="width:64px;height:64px;border-radius:50%;object-fit:cover"/></td></tr><tr><td style="padding:0 24px 24px;font-size:16px;line-height:1.6;color:#111827">${body}</td></tr><tr><td style="padding:0 24px 24px;font-size:13px;color:#6b7280;border-top:1px solid #e5e7eb;padding-top:16px">Sent via Buildlogg</td></tr></table>`,
      })
    : JSON.stringify({
        from: 'Buildlogg <noreply@mail.buildlogg.com>',
        to: [fu.customer_email],
        subject, text: body,
      });

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: emailBody,
    });
    if (!res.ok) {
      const errText = await res.text();
      console.error('[sendFollowUpEmail] Resend error:', errText);
      if (res.status === 429) return { channel: 'email', status: 'failed', error: 'rate_limited' };
      return { channel: 'email', status: 'failed', error: errText };
    }
    const data = await res.json();
    return { channel: 'email', status: 'sent', preview: body.substring(0, 100), provider_id: data.id };
  } catch (err) {
    return { channel: 'email', status: 'failed', error: err.message };
  }
}

async function sendPush(env, endpoint, keys, notification) {
  if (!endpoint || !env.VAPID_PRIVATE_KEY || !env.VAPID_PUBLIC_KEY) return;
  try {
    const vapidPrivateKey = env.VAPID_PRIVATE_KEY;
    const vapidPublicKey = env.VAPID_PUBLIC_KEY;
    const audience = new URL(endpoint).origin;
    const header = { typ: 'JWT', alg: 'ES256' };
    const payload = { aud: audience, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: 'mailto:noreply@buildlogg.com' };
    const jwt = await createJWT(header, payload, vapidPrivateKey);
    const body = JSON.stringify({ notification: { title: notification.title, body: notification.body, data: { url: notification.url } } });
    await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Encoding': 'aes128gcm', 'Authorization': `vapid t=${jwt}, k=${vapidPublicKey}`, 'TTL': '86400' },
      body,
    });
  } catch (err) {
    console.error('[sendPush] Error:', err.message);
  }
}

async function createJWT(header, payload, privateKey) {
  const enc = new TextEncoder();
  const headerB64 = base64UrlEncode(enc.encode(JSON.stringify(header)));
  const payloadB64 = base64UrlEncode(enc.encode(JSON.stringify(payload)));
  const data = `${headerB64}.${payloadB64}`;
  const keyData = urlBase64ToUint8Array(privateKey);
  const cryptoKey = await crypto.subtle.importKey('pkcs8', keyData, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, cryptoKey, enc.encode(data));
  const signatureB64 = base64UrlEncode(new Uint8Array(signature));
  return `${data}.${signatureB64}`;
}

function base64UrlEncode(bytes) {
  let str = '';
  for (const byte of bytes) str += String.fromCharCode(byte);
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
  return outputArray.buffer;
}
