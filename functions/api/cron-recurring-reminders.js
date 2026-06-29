// Buildlogg — W3-1 Smart Reminders cron endpoint (Cloudflare Pages Function)
// GET /api/cron-recurring-reminders
// Authorization: Bearer ***
//
// Processes due recurring_jobs and sends:
// - Email to client (via Resend) when mode is 'remind_client' or 'both'
// - Web Push to merchant when mode is 'remind_me' or 'both'
//
// External scheduler setup (choose one):
// 1. cron-job.org (free): create a job that GETs this URL with the Authorization header
// 2. GitHub Actions: scheduled workflow that curls this endpoint
// 3. Separate Cloudflare Worker with scheduled() handler that fetches this URL
//
// Env vars required:
// - CRON_SECRET: random string for auth
// - SUPABASE_URL: app's Supabase URL
// - SUPABASE_SERVICE_ROLE_KEY: service role key (bypasses RLS)
// - RESEND_API_KEY: for sending emails
// - VAPID_PUBLIC_KEY + VAPID_PRIVATE_KEY: for Web Push (optional if no push subscriptions)

import { sendWebPush } from '../_lib/webpush.js';

export async function onRequestGet(context) {
  const { request, env } = context;

  // Auth check
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
  const results = { processed: 0, sent: 0, failed: 0, dormant: 0, skipped: 0 };

  try {
    // Query due recurring jobs (max 50 per run)
    // Condition: active, next_due_at - reminder_lead_days <= now, and not already reminded this cycle
    const dueJobs = await supabaseFetch(supabaseUrl, supabaseKey, `
      SELECT rj.*, p.full_name, p.business_name, p.booking_slug, p.booking_enabled,
             p.push_subscription_endpoint, p.push_subscription_keys,
             p.logo_data_url, p.subscription_status,
             c.name as customer_name, c.email as customer_email, c.phone as customer_phone
      FROM recurring_jobs rj
      LEFT JOIN profiles p ON rj.user_id = p.id
      LEFT JOIN customers c ON rj.customer_id = c.id
      WHERE rj.status = 'active'
        AND (rj.reminder_mode = 'remind_client' OR rj.reminder_mode = 'both' OR rj.reminder_mode = 'remind_me' OR rj.reminder_mode IS NULL)
        AND (
          (rj.next_due_at::date - COALESCE(rj.reminder_lead_days, 14))::timestamp <= $1::timestamp
        )
        AND (
          rj.last_reminder_sent_at IS NULL
          OR rj.last_reminder_sent_at < (rj.next_due_at::date - COALESCE(rj.reminder_lead_days, 14))::timestamp
        )
      ORDER BY rj.next_due_at ASC
      LIMIT 50
    `, [now]);

    if (!dueJobs || dueJobs.length === 0) {
      return json({ ...results, message: 'no due jobs' });
    }

    // Group by merchant for batch push
    const byMerchant = {};
    for (const job of dueJobs) {
      if (!byMerchant[job.user_id]) byMerchant[job.user_id] = [];
      byMerchant[job.user_id].push(job);
    }

    for (const [merchantId, jobs] of Object.entries(byMerchant)) {
      const merchantJobs = jobs;
      const isBatch = merchantJobs.length >= 3;
      const mode = merchantJobs[0].reminder_mode || 'remind_me';

      // Batch push notification for merchants with 3+ due jobs
      if (isBatch && (mode === 'remind_me' || mode === 'both')) {
        const merchant = merchantJobs[0];
        if (merchant.push_subscription_endpoint) {
          await sendWebPush(env, merchant.push_subscription_endpoint, merchant.push_subscription_keys, {
            title: `Buildlogg — ${merchantJobs.length} recurring jobs due`,
            body: 'Tap to review and contact clients',
            url: '/app/?tab=tasks',
          });
        }
      }

      for (const job of merchantJobs) {
        results.processed++;
        const effectiveMode = job.reminder_mode || 'remind_me';
        let sendResult = { channel: 'push', status: 'skipped' };

        // Email to client
        if ((effectiveMode === 'remind_client' || effectiveMode === 'both') && job.customer_email && job.last_reminder_status !== 'bounced') {
          sendResult = await sendReminderEmail(env, job);
        } else if (effectiveMode === 'remind_client' || effectiveMode === 'both') {
          // No email or bounced — fallback to push
          if (!isBatch && job.push_subscription_endpoint) {
            await sendWebPush(env, job.push_subscription_endpoint, job.push_subscription_keys, {
              title: `${job.customer_name || 'Client'} — ${job.title} due`,
              body: job.customer_email ? 'Last email bounced — send WhatsApp manually' : 'No email on file — send WhatsApp manually',
              url: '/app/?recurring=' + job.id,
            });
          }
          sendResult = { channel: 'push', status: 'sent' };
        } else if (!isBatch && (effectiveMode === 'remind_me' || effectiveMode === 'both') && job.push_subscription_endpoint) {
          // Push to merchant only
          await sendWebPush(env, job.push_subscription_endpoint, job.push_subscription_keys, {
            title: `${job.customer_name || 'Client'} — ${job.title} due`,
            body: `Recurring job due soon. Tap to contact client.`,
            url: '/app/',
          });
          sendResult = { channel: 'push', status: 'sent' };
        }

        // Update recurring job
        const newCount = (job.reminder_count || 0) + 1;
        const updates = {
          last_reminder_sent_at: now,
          last_reminder_status: sendResult.status,
          reminder_count: newCount,
          updated_at: now,
        };

        // Auto-dormant after 3 reminders
        if (newCount >= 3) {
          updates.status = 'dormant';
          results.dormant++;
        }

        await supabaseUpdate(supabaseUrl, supabaseKey, 'recurring_jobs', job.id, updates);

        // Insert reminder_log
        await supabaseInsert(supabaseUrl, supabaseKey, 'reminder_log', {
          id: crypto.randomUUID(),
          recurring_job_id: job.id,
          user_id: job.user_id,
          channel: sendResult.channel,
          recipient: job.customer_email || job.push_subscription_endpoint || '',
          status: sendResult.status,
          message_preview: sendResult.preview || '',
          error_message: sendResult.error || null,
          sent_at: now,
        });

        // Insert work_log
        await supabaseInsert(supabaseUrl, supabaseKey, 'work_log', {
          id: crypto.randomUUID(),
          job_id: job.original_job_id,
          type: sendResult.status === 'sent' ? 'auto_reminder_sent' : 'auto_reminder_failed',
          description: `[Auto-reminder ${sendResult.channel} ${sendResult.status} — ${job.title}]`,
          created_at: now,
        });

        if (sendResult.status === 'sent') results.sent++;
        else if (sendResult.status === 'failed') results.failed++;
        else results.skipped++;
      }
    }

    return json(results);
  } catch (err) {
    console.error('[cron-recurring-reminders] Error:', err);
    return json({ ...results, error: err.message }, 500);
  }
}

// --- Helpers ---

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function supabaseFetch(url, key, query, params) {
  // Use REST API for simple queries, RPC for complex ones
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

async function sendReminderEmail(env, job) {
  const apiKey = env.RESEND_API_KEY;
  if (!apiKey) return { channel: 'email', status: 'failed', error: 'no RESEND_API_KEY' };

  // Fill template server-side (can't import templateEngine.ts in a Function)
  const firstName = (job.customer_name || 'there').split(' ')[0];
  const businessName = job.business_name || job.full_name || 'Your business';
  const bookingLink = job.booking_slug && job.booking_enabled
    ? `https://buildlogg.com/book/${job.booking_slug}`
    : '';

  // Build body text — custom message overrides default template
  let body;
  if (job.custom_reminder_message && job.custom_reminder_message.trim()) {
    body = job.custom_reminder_message.trim();
  } else {
    body = `Hi ${firstName}, your ${job.title} is due soon.`;
    if (bookingLink) body += ` Book your next appointment: ${bookingLink}`;
    body += ` — ${businessName}`;
  }

  const subject = `${job.title} reminder from ${businessName}`;

  // Branded HTML for Pro merchants (beta: subscription_status undefined = Pro)
  const isPro = !job.subscription_status || job.subscription_status === 'active' || job.subscription_status === 'trialing';
  const hasLogo = isPro && job.logo_data_url;
  const emailBody = hasLogo
    ? JSON.stringify({
        from: 'Buildlogg <noreply@mail.buildlogg.com>',
        to: [job.customer_email],
        subject,
        text: body,
        html: `<table width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;margin:0 auto;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif"><tr><td style="text-align:center;padding:24px 0 16px"><img src="${job.logo_data_url}" alt="${businessName}" style="width:64px;height:64px;border-radius:50%;object-fit:cover"/></td></tr><tr><td style="padding:0 24px 24px;font-size:16px;line-height:1.6;color:#111827">${body.replace(/\n/g, '<br>')}</td></tr><tr><td style="padding:0 24px 24px;font-size:13px;color:#6b7280;border-top:1px solid #e5e7eb;padding-top:16px">Sent via Buildlogg</td></tr></table>`,
      })
    : JSON.stringify({
        from: 'Buildlogg <noreply@mail.buildlogg.com>',
        to: [job.customer_email],
        subject,
        text: body,
      });

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: emailBody,
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error('[sendReminderEmail] Resend error:', errText);
      if (res.status === 429) return { channel: 'email', status: 'failed', error: 'rate_limited' };
      return { channel: 'email', status: 'failed', error: errText };
    }

    const data = await res.json();
    return { channel: 'email', status: 'sent', preview: body.substring(0, 100), provider_id: data.id };
  } catch (err) {
    return { channel: 'email', status: 'failed', error: err.message };
  }
}
