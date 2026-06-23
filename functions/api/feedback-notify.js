// Buildlogg — Feedback notification email (Cloudflare Pages Function)
// POST /api/feedback-notify
// Body: { type, message, userEmail, userName }
// Sends an email to team@mail.buildlogg.com via Resend.
// Env var: RESEND_API_KEY

const TYPE_LABELS = {
  bug: 'Bug report',
  feature_request: 'Feature request',
  general: 'General feedback',
};

export async function onRequestPost(context) {
  const url = new URL(context.request.url);

  try {
    const body = await context.request.json();
    const { type, message, userEmail, userName } = body;

    if (!message || typeof message !== 'string') {
      return json({ error: 'message is required' }, 400);
    }

    const apiKey = context.env.RESEND_API_KEY;
    if (!apiKey) {
      console.error('[feedback-notify] Missing RESEND_API_KEY env var');
      return json({ error: 'server not configured' }, 500);
    }

    const typeLabel = TYPE_LABELS[type] || 'General feedback';
    const displayName = userName || 'Unknown user';
    const displayEmail = userEmail || 'No email on file';
    const replyTo = userEmail || undefined;

    const subject = `[Feedback] ${typeLabel} from ${displayEmail}`;
    const textBody = [
      `New feedback from Buildlogg app:`,
      ``,
      `Type: ${typeLabel}`,
      `From: ${displayName} <${displayEmail}>`,
      `Submitted: ${new Date().toISOString()}`,
      ``,
      `Message:`,
      message,
    ].join('\n');

    const emailPayload = {
      from: 'Buildlogg Feedback <noreply@mail.buildlogg.com>',
      to: ['team@mail.buildlogg.com'],
      subject,
      text: textBody,
      tags: [
        { name: 'type', value: 'feedback-notification' },
      ],
    };

    if (replyTo) {
      emailPayload.reply_to = replyTo;
    }

    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(emailPayload),
    });

    if (!resp.ok) {
      const errBody = await resp.text();
      console.error('[feedback-notify] Resend error:', resp.status, errBody);
      return json({ error: 'email send failed' }, 502);
    }

    return json({ status: 'sent' }, 200);
  } catch (err) {
    console.error('[feedback-notify] Error:', err);
    return json({ error: 'internal error' }, 500);
  }
}

function json(data, status) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
