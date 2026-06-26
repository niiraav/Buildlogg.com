/**
 * Branded HTML email templates for Buildlogg cold outreach.
 *
 * Layout: surface-soft outer bg + white content card + centered logo
 * Design: strictly follows DESIGN.md — no colors outside the spec
 * Typography: Manrope (display) + Inter (body) — Cal.com design system
 *
 * CRITICAL: Font names use SINGLE quotes inside double-quoted style attributes.
 * Double quotes close the attribute and break ALL CSS after them.
 */

import { Lead, firstName, beautyLabel, tradeLabel } from './email-templates';

// ─── Design tokens — STRICTLY from DESIGN.md, no others ───
const C = {
  ink:          '#111111',   // DESIGN.md: primary / ink
  body:         '#374151',   // DESIGN.md: body
  muted:        '#6b7280',   // DESIGN.md: muted
  mutedSoft:    '#898989',   // DESIGN.md: muted-soft
  canvas:       '#ffffff',   // DESIGN.md: canvas
  surfaceSoft:  '#f8f9fa',   // DESIGN.md: surface-soft
  surfaceCard:  '#f5f5f5',   // DESIGN.md: surface-card
  surfaceDark:  '#101010',   // DESIGN.md: surface-dark
  hairline:     '#e5e7eb',   // DESIGN.md: hairline
  onDark:       '#ffffff',   // DESIGN.md: on-dark
  onDarkSoft:   '#a1a1aa',   // DESIGN.md: on-dark-soft
  btnText:      '#ffffff',   // DESIGN.md: on-primary
};

const SP = { sm: '12px', md: '16px', lg: '24px', xl: '32px' };

// SINGLE QUOTES for font names — double quotes break style attributes
const DISPLAY = "'Manrope','Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif";
const UI = "'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

const LOGO_ICON = 'https://buildlogg.com/assets/icon-black-square.png';

export function wrapBrandedHtml(opts: {
  recipientName: string;
  bodyParagraphs: { display?: string; body?: string }[];
  ctaText: string;
  ctaUrl: string;
  badgeText: string;
  senderName: string;
  companyName: string;
  unsubscribeUrl: string;
}): string {
  const { recipientName, bodyParagraphs, ctaText, ctaUrl, badgeText, senderName, companyName, unsubscribeUrl } = opts;

  // Consistent 15px body type — DESIGN.md body-md
  const paragraphs = bodyParagraphs.map((p) => {
    const text = p.display || p.body || '';
    return `          <p style="margin:0 0 ${SP.md} 0;font-size:15px;line-height:1.6;color:${C.body};font-family:${UI};font-weight:400;">${text}</p>`;
  }).join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta http-equiv="X-UA-Compatible" content="IE=Edge">
  <meta name="x-apple-disable-message-reformatting">
  <meta name="color-scheme" content="light only">
  <meta name="supported-color-schemes" content="light only">
  <title>${companyName}</title>
  <!--[if (gte mso 9)|(IE)]>
  <style>body{width:600px;margin:0 auto;}table{border-collapse:collapse;}table,td{mso-table-lspace:0pt;mso-table-lspace:0pt;}img{-ms-interpolation-mode:bicubic;}</style>
  <![endif]-->
</head>
<body style="margin:0;padding:0;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">

  <!-- Preheader — hidden preview text for inbox snippet -->
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;height:0;width:0;">
    ${bodyParagraphs[0]?.body?.replace(/<[^>]+>/g, '').replace(/&mdash;|&amp;/g, '').replace(/\s+/g, ' ').trim().slice(0, 120) || ''}
  </div>

  <!-- Outer surface-soft background -->
  <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" bgcolor="${C.surfaceSoft}" style="background-color:${C.surfaceSoft};">
    <tr>
      <td valign="top" width="100%" bgcolor="${C.surfaceSoft}" style="background-color:${C.surfaceSoft};">
        <table width="100%" align="center" cellpadding="0" cellspacing="0" border="0" role="presentation">
          <tr>
            <td>

              <!--[if mso]><center><table><tr><td width="600"><![endif]-->

              <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" style="max-width:600px;width:100%;" align="center">

                <!-- Logo — centered, above white card -->
                <tr>
                  <td align="center" style="padding:30px 0 30px 0;">
                    <a href="https://buildlogg.com" style="text-decoration:none;color:${C.ink};">
                      <img src="${LOGO_ICON}" alt="${companyName}" width="34" height="34" style="display:inline-block;border-radius:8px;vertical-align:middle;border:0;">
                      <span style="font-family:${DISPLAY};font-weight:800;font-size:24px;color:${C.ink};letter-spacing:-0.03em;text-decoration:none;vertical-align:middle;margin-left:10px;">${companyName}</span>
                    </a>
                  </td>
                </tr>

                <!-- White content card -->
                <tr>
                  <td>
                    <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" bgcolor="${C.canvas}" style="background-color:${C.canvas};border-radius:12px;">
                      <tr>
                        <td style="padding:32px 30px 32px 30px;">

                          <!-- Category pill badge — surface-card, pill radius -->
                          <table cellpadding="0" cellspacing="0" border="0" role="presentation">
                            <tr>
                              <td bgcolor="${C.surfaceCard}" style="background-color:${C.surfaceCard};border-radius:999px;padding:4px 12px;">
                                <span style="font-family:${UI};font-size:13px;font-weight:500;color:${C.ink};">${badgeText}</span>
                              </td>
                            </tr>
                          </table>

                          <!-- Greeting -->
                          <p style="margin:20px 0 16px 0;font-size:15px;line-height:1.6;color:${C.ink};font-family:${UI};font-weight:500;">Hi ${recipientName},</p>

                          <!-- Body -->
${paragraphs}

                          <!-- CTA button — table-based, left-aligned, span for color safety -->
                          <table cellpadding="0" cellspacing="0" border="0" role="presentation" style="margin:16px 0 32px 0;">
                            <tr>
                              <td bgcolor="${C.ink}" style="background-color:${C.ink};border-radius:6px;padding:12px 24px;">
                                <a href="${ctaUrl}" style="font-family:${UI};font-size:14px;font-weight:600;color:${C.btnText};text-decoration:none;display:block;white-space:nowrap;">
                                  <span style="color:${C.btnText};text-decoration:none;">${ctaText}</span>
                                </a>
                              </td>
                            </tr>
                          </table>

                          <!-- Signature -->
                          <p style="margin:0 0 2px 0;font-size:15px;line-height:1.5;color:${C.ink};font-family:${UI};font-weight:500;">${senderName}</p>
                          <p style="margin:0;font-size:14px;line-height:1.5;color:${C.muted};font-family:${UI};">${companyName}</p>

                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                <!-- Light footer — matches confirmation email style -->
                <tr>
                  <td style="padding:20px 16px 30px 16px;" align="center">
                    <p style="margin:0;font-size:12px;line-height:1.5;color:${C.mutedSoft};font-family:${UI};">
                      <span style="font-weight:700;color:${C.muted};letter-spacing:0.2px;">${companyName}</span>
                      &nbsp;&middot;&nbsp;
                      <a href="https://buildlogg.com" style="color:${C.mutedSoft};text-decoration:none;">buildlogg.com</a>
                      <br>&copy; 2026 ${companyName} Ltd. &nbsp;&middot;&nbsp;
                      <a href="${unsubscribeUrl}" style="color:${C.mutedSoft};text-decoration:none;">Unsubscribe</a>
                      <br>${companyName}, 71-75 Shelton Street, Covent Garden, London, WC2H 9JQ
                    </p>
                  </td>
                </tr>

              </table>

              <!--[if mso]></td></tr></table></center><![endif]-->

            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>

</body>
</html>`;
}

/* ─── Email content builders ─── */

export interface EmailContent {
  paragraphs: { display?: string; body?: string }[];
  ctaText: string;
  ctaUrl: string;
  badgeText: string;
}

export function buildBeautyEmail1(lead: Lead): EmailContent {
  const label = beautyLabel(lead.subcategory);
  const company = lead.company || 'your salon';
  return {
    badgeText: 'For beauty salons',
    paragraphs: [
      { body: `<strong style="color:${C.ink};">${company}</strong> &mdash; every ${label} business we talk to loses money to no-shows. A client books a slot, doesn't turn up, and that chair sits empty for an hour.` },
      { body: `Buildlogg fixes that. Take deposits at booking, send automatic reminders, and auto-charge for late cancellations &mdash; all from your phone. No more chasing, no more lost revenue.` },
    ],
    ctaText: 'See how it works',
    ctaUrl: 'https://buildlogg.com/beauty',
  };
}

export function buildBeautyEmail2(lead: Lead): EmailContent {
  const label = beautyLabel(lead.subcategory);
  return {
    badgeText: 'For beauty salons',
    paragraphs: [
      { body: `Following up on my last email &mdash; quick question.` },
      { body: `When a ${label} client doesn't show up, what does that actually cost you? The chair time, the product, the preparation &mdash; it adds up. Most ${label} businesses we talk to just absorb it.` },
      { body: `Buildlogg lets you take a deposit at booking. Client pays in advance, gets a reminder 24 hours before, and if they cancel late &mdash; the deposit stays with you.` },
    ],
    ctaText: 'See how it works',
    ctaUrl: 'https://buildlogg.com/beauty',
  };
}

export function buildBeautyEmail3(lead: Lead): EmailContent {
  return {
    badgeText: 'For beauty salons',
    paragraphs: [
      { body: `I get it &mdash; you've probably already got a system. Most salon owners I talk to use a mix of Instagram DMs, a paper booking book, and a payment terminal.` },
      { body: `The thing is, those systems work fine until a client no-shows and you're left with an empty chair and no deposit.` },
      { body: `Buildlogg puts it all in one place on your phone. Bookings, deposits, reminders, cancellations &mdash; even offline if you're in a basement room with no signal.` },
    ],
    ctaText: 'See how it works',
    ctaUrl: 'https://buildlogg.com/beauty',
  };
}

export function buildBeautyEmail4(lead: Lead): EmailContent {
  return {
    badgeText: 'For beauty salons',
    paragraphs: [
      { body: `I'll stop emailing after this &mdash; don't want to be a nuisance.` },
      { body: `If the no-show thing is a real problem for you, the app's live and ready to use. If not, no worries.` },
    ],
    ctaText: 'Check it out',
    ctaUrl: 'https://buildlogg.com/beauty',
  };
}

export function buildTradesEmail1(lead: Lead): EmailContent {
  const trade = tradeLabel(lead.subcategory);
  const company = lead.company || 'your business';
  return {
    badgeText: 'For trades',
    paragraphs: [
      { body: `<strong style="color:${C.ink};">${company}</strong> &mdash; most ${trade} businesses we talk to are still doing quotes and invoices from the sofa at 9pm.` },
      { body: `Buildlogg fixes that. Send a professional quote from your phone in about a minute. Customer approves, books the slot, pays. No laptop, no spreadsheet, no chasing.` },
    ],
    ctaText: 'See how it works',
    ctaUrl: 'https://buildlogg.com',
  };
}

export function buildTradesEmail2(lead: Lead): EmailContent {
  return {
    badgeText: 'For trades',
    paragraphs: [
      { body: `Following up on my last email &mdash; quick question.` },
      { body: `When a customer asks for a quote, what does that actually look like? Word doc? WhatsApp? A text with a number?` },
      { body: `Buildlogg does it from your phone in about a minute &mdash; quote, booking, payment, all in one flow.` },
    ],
    ctaText: 'See how it works',
    ctaUrl: 'https://buildlogg.com/#how',
  };
}

export function buildTradesEmail3(lead: Lead): EmailContent {
  return {
    badgeText: 'For trades',
    paragraphs: [
      { body: `I get it &mdash; you've probably already got a system. Most tradespeople use a mix of WhatsApp, a notebook, and a spreadsheet.` },
      { body: `Those work fine until you're juggling five jobs and someone's chasing an invoice you forgot to send.` },
      { body: `Buildlogg puts it all in one place on your phone. Quotes, scheduling, invoices, payments &mdash; even offline if you're in a basement with no signal.` },
    ],
    ctaText: 'See how it works',
    ctaUrl: 'https://buildlogg.com/#how',
  };
}

export function buildTradesEmail4(lead: Lead): EmailContent {
  return {
    badgeText: 'For trades',
    paragraphs: [
      { body: `I'll stop emailing after this &mdash; don't want to be a nuisance.` },
      { body: `If any of this sounds useful, the app's live and ready to use. If not, no worries.` },
    ],
    ctaText: 'Check it out',
    ctaUrl: 'https://buildlogg.com',
  };
}

export function getEmailContent(vertical: 'beauty' | 'trades', step: number, lead: Lead): EmailContent {
  if (vertical === 'beauty') {
    switch (step) {
      case 1: return buildBeautyEmail1(lead);
      case 2: return buildBeautyEmail2(lead);
      case 3: return buildBeautyEmail3(lead);
      case 4: return buildBeautyEmail4(lead);
    }
  }
  switch (step) {
    case 1: return buildTradesEmail1(lead);
    case 2: return buildTradesEmail2(lead);
    case 3: return buildTradesEmail3(lead);
    case 4: return buildTradesEmail4(lead);
  }
  return buildTradesEmail1(lead);
}
