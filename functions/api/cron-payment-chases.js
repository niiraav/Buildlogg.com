// Buildlogg — Sprint 4 Item 19: Payment Chase Email Cron
// GET /api/cron-payment-chases
// Authorization: Bearer <CRON_...
// Processes due payment_chases and sends email chases to customers
// when merchant's default_reminder_mode is 'remind_client' or 'both'.
// Mirrors cron-recurring-reminders.js structure.

import { sendWebPush } from '../_lib/webpush.js';

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
    const dueChases = await supabaseFetch(supabaseUrl, supabaseKey, `
      SELECT pc.*, j.title as job_title, j.status as job_status, j.actual_end,
             c.name as customer_name, c.email as customer_email, c.phone as customer_phone,
             p.full_name, p.business_name,
             p.logo_data_url, p.subscription_status, p.default_reminder_mode,
             p.push_subscription_endpoint, p.push_subscription_keys,
             (SELECT COALESCE(SUM(amount), 0) FROM line_items WHERE job_id = j.id) as job_total,
             (SELECT COALESCE(SUM(amount), 0) FROM payments WHERE job_id = j.id) as paid_amount
      FROM payment_chases pc
      LEFT JOIN jobs j ON pc.job_id = j.id
      LEFT JOIN customers c ON j.customer_id = c.id
      LEFT JOIN profiles p ON pc.user_id = p.id
      WHERE pc.status = 'pending'
        AND pc.due_at <= $1
        AND pc.stage != 'small_claims'
      ORDER BY pc.due_at ASC
      LIMIT 50
    `, [now]);

    if (!dueChases || dueChases.length === 0) {
      return json({ ...results, message: 'no due chases' });
    }

    for (const chase of dueChases) {
      results.processed++;

      // Auto-resolve if job is no longer awaiting_payment
      if (chase.job_status !== 'awaiting_payment') {
        await supabaseUpdate(supabaseUrl, supabaseKey, 'payment_chases', chase.id, {
          status: 'resolved', updated_at: now,
        });
        results.skipped++;
        continue;
      }

      const mode = chase.default_reminder_mode || 'remind_me';
      const hasEmail = chase.customer_email && chase.customer_email.trim();
      const outstanding = parseFloat(chase.job_total) - parseFloat(chase.paid_amount);
      const daysOverdue = chase.actual_end
        ? Math.floor((Date.now() - new Date(chase.actual_end).getTime()) / (24 * 60 * 60 * 1000))
        : 0;

      let sendResult = { channel: 'push', status: 'skipped' };

      if ((mode === 'remind_client' || mode === 'both') && hasEmail) {
        sendResult = await sendChaseEmail(env, chase, outstanding, daysOverdue);
      } else if (mode === 'remind_client' || mode === 'both') {
        // No email — push fallback
        if (chase.push_subscription_endpoint) {
          await sendWebPush(env, chase.push_subscription_endpoint, chase.push_subscription_keys, {
            title: `Payment chase — ${chase.customer_name || 'Customer'}`,
            body: `No email for ${chase.job_title}. Send WhatsApp manually.`,
            url: '/app/',
          });
        }
        sendResult = { channel: 'push', status: 'sent' };
      } else if (chase.push_subscription_endpoint) {
        // remind_me mode — push to merchant
        await sendWebPush(env, chase.push_subscription_endpoint, chase.push_subscription_keys, {
          title: `Payment chase — ${chase.customer_name || 'Customer'}`,
          body: `${chase.job_title} is ${daysOverdue}d overdue. Tap to chase.`,
          url: '/app/',
        });
        sendResult = { channel: 'push', status: 'sent' };
      }

      // Update chase: mark as sent
      await supabaseUpdate(supabaseUrl, supabaseKey, 'payment_chases', chase.id, {
        status: 'sent',
        sent_at: now,
        message_method: sendResult.channel === 'email' ? 'email' : 'push',
        updated_at: now,
      });

      // Insert work_log
      await supabaseInsert(supabaseUrl, supabaseKey, 'work_log', {
        id: crypto.randomUUID(),
        job_id: chase.job_id,
        type: 'payment_chase_sent',
        description: `[Auto chase ${sendResult.channel} ${sendResult.status} — ${chase.stage} — ${chase.job_title}]`,
        created_at: now,
      });

      if (sendResult.status === 'sent') results.sent++;
      else if (sendResult.status === 'failed') results.failed++;
      else results.skipped++;
    }

    return json(results);
  } catch (err) {
    console.error('[cron-payment-chases] Error:', err);
    return json({ ...results, error: err.message }, 500);
  }
}

// --- Helpers (copied from cron-recurring-reminders.js) ---

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

async function supabaseFetch(url, key, query, params) {
  const res = await fetch(`${url}/rest/v1/rpc/exec_sql`, {
    method: 'POST',
    headers: { 'apikey': key, 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, params }),
  });
  if (!res.ok) { const text = await res.text(); console.error('[supabaseFetch] Error:', text); return []; }
  const data = await res.json();
  return data || [];
}

async function supabaseUpdate(url, key, table, id, updates) {
  await fetch(`${url}/rest/v1/${table}?id=eq.${id}`, {
    method: 'PATCH',
    headers: { 'apikey': key, 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  });
}

async function supabaseInsert(url, key, table, record) {
  await fetch(`${url}/rest/v1/${table}`, {
    method: 'POST',
    headers: { 'apikey': key, 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
    body: JSON.stringify(record),
  });
}

async function sendChaseEmail(env, chase, outstanding, daysOverdue) {
  const apiKey = env.RESEND_API_KEY;
  if (!apiKey) return { channel: 'email', status: 'failed', error: 'no RESEND_API_KEY' };

  const firstName = (chase.customer_name || 'there').split(' ')[0];
  const businessName = chase.business_name || chase.full_name || 'Your business';
  const total = `£${outstanding.toFixed(2)}`;

  let body, subject;
  if (chase.stage === 'gentle') {
    body = `Hi ${firstName}, just a friendly reminder about the ${total} for the ${chase.job_title}. Let me know if you need to talk about payment timing. — ${businessName}`;
    subject = `Payment reminder from ${businessName}`;
  } else if (chase.stage === 'firm') {
    body = `Hi ${firstName}, the balance of ${total} is now ${daysOverdue} days overdue. Happy to set up a payment plan if that helps. — ${businessName}`;
    subject = `Overdue payment — ${total}`;
  } else { // final
    body = `Hi ${firstName}, the balance of ${total} for the ${chase.job_title} is now ${daysOverdue} days overdue. Please arrange payment at your earliest convenience. — ${businessName}`;
    subject = `Final notice — ${total} overdue`;
  }

  const isPro = !chase.subscription_status || chase.subscription_status === 'active' || chase.subscription_status === 'trialing';
  const hasLogo = isPro && chase.logo_data_url;
  const emailBody = hasLogo
    ? JSON.stringify({
        from: 'Buildlogg <noreply@mail.buildlogg.com>',
        to: [chase.customer_email],
        subject, text: body,
        html: `<table width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;margin:0 auto;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif"><tr><td style="text-align:center;padding:24px 0 16px"><img src="${chase.logo_data_url}" alt="${businessName}" style="width:64px;height:64px;border-radius:50%;object-fit:cover"/></td></tr><tr><td style="padding:0 24px 24px;font-size:16px;line-height:1.6;color:#111827">${body}</td></tr><tr><td style="padding:0 24px 24px;font-size:13px;color:#6b7280;border-top:1px solid #e5e7eb;padding-top:16px">Sent via Buildlogg</td></tr></table>`,
      })
    : JSON.stringify({
        from: 'Buildlogg <noreply@mail.buildlogg.com>',
        to: [chase.customer_email],
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
      console.error('[sendChaseEmail] Resend error:', errText);
      if (res.status === 429) return { channel: 'email', status: 'failed', error: 'rate_limited' };
      return { channel: 'email', status: 'failed', error: errText };
    }
    const data = await res.json();
    return { channel: 'email', status: 'sent', preview: body.substring(0, 100), provider_id: data.id };
  } catch (err) {
    return { channel: 'email', status: 'failed', error: err.message };
  }
}
