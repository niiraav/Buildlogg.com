import * as dotenv from 'dotenv';
import { parse } from 'csv-parse/sync';
import * as fs from 'fs';
import * as path from 'path';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import { Lead, EmailTemplate, SubjectVariant, firstName, tradeLabel, beautyLabel, templates, beautyTemplates, getTemplates, getLandingUrl, isGenericEmail, Vertical } from '../lib/email-templates';
import { wrapBrandedHtml, getEmailContent } from '../lib/email-html';

dotenv.config();

// ─── Configuration ───
const DRY_RUN = process.env.DRY_RUN === 'true';
const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY!;
const RESEND_API_KEY = process.env.RESEND_API_KEY!;
const FROM_EMAIL = process.env.FROM_EMAIL || 'team@buildlogg.com';
const FROM_NAME = process.env.FROM_NAME || 'James at Buildlogg';
const UNSUBSCRIBE_BASE = process.env.UNSUBSCRIBE_BASE || 'https://buildlogg.com/unsubscribe';
const SEND_DELAY_MS = parseInt(process.env.SEND_DELAY_MS || '3000', 10);
const MAX_DAILY_SENDS = parseInt(process.env.MAX_DAILY_SENDS || '250', 10);
const EXCLUDE_GENERIC = process.env.EXCLUDE_GENERIC !== 'false'; // default: true

// Vertical — passed via CLI flag --vertical=beauty or --vertical=trades (default: trades)
const VERTICAL: Vertical = process.argv.includes('--vertical=beauty') ? 'beauty'
  : process.argv.includes('--vertical=trades') ? 'trades'
  : 'trades';

// Use the right template set + landing page for this vertical
const activeTemplates = getTemplates(VERTICAL);
const activeLandingUrl = getLandingUrl(VERTICAL);

// Use the right label function for the active vertical
const labelFor = (subcategory: string) => VERTICAL === 'beauty' ? beautyLabel(subcategory) : tradeLabel(subcategory);

// Sequence cadence: step → days after step 1
const SEQUENCE_DAYS: Record<number, number> = { 1: 0, 2: 3, 3: 7, 4: 14 };
const TEMPLATE_KEYS = ['email1', 'email2', 'email3', 'email4'] as const;

// ─── Filter leads to a specific vertical by subcategory ───

const BEAUTY_SUBCATEGORIES = new Set([
  'beauty_salon', 'nail_salon', 'nail_tech', 'hair_salon', 'hairdresser',
  'barber', 'barber_shop', 'tattoo_studio', 'tattoo_artist', 'tattoo',
  'spa', 'massage', 'massage_therapy', 'beauty', 'beauty_therapy',
  'threading', 'lash_technician', 'brow_bar', 'waxing', 'facial',
  'makeup_artist', 'makeup', 'nail_technician', 'nail_bar',
  'tanning', 'skin_care', 'skincare', 'cosmetics',
]);

function isBeautyLead(lead: Lead): boolean {
  const sub = (lead.subcategory || '').toLowerCase();
  if (BEAUTY_SUBCATEGORIES.has(sub)) return true;
  // Also check by company name keywords
  const company = (lead.company || '').toLowerCase();
  if (/\b(salon|nail|beauty|tattoo|barber|spa|lash|brow|wax|facial|makeup|threading)\b/.test(company)) return true;
  return false;
}

// ─── Load Leads from CSV ───
function loadLeads(csvPath: string): Lead[] {
  const content = fs.readFileSync(csvPath, 'utf-8');
  const records = parse(content, { columns: true, skip_empty_lines: true });

  return records.map((r: any) => ({
    id: r.email,
    name: r.name,
    email: r.email,
    company: r.company || '',
    subcategory: r.subcategory || '',
    score: parseInt(r.prospect_score || '0', 10),
    phone: r.phone || '',
  }));
}

// ─── Supabase: Suppression check ───
async function isSuppressed(supabase: SupabaseClient, email: string): Promise<boolean> {
  try {
    const { data } = await supabase
      .from('email_suppressions')
      .select('email')
      .eq('email', email.toLowerCase())
      .maybeSingle();
    return !!data;
  } catch {
    return false;
  }
}

// ─── Supabase: Get sequence state ───
async function getSequenceState(supabase: SupabaseClient, email: string) {
  try {
    const { data } = await supabase
      .from('cold_email_state')
      .select('*')
      .eq('email', email.toLowerCase())
      .maybeSingle();
    return data;
  } catch {
    return null;
  }
}

async function upsertSequenceState(
  supabase: SupabaseClient,
  email: string,
  lead: Lead,
  step: number,
  status: string,
  messageId?: string,
  subjectVariant?: string,
  vertical?: string
) {
  const now = new Date().toISOString();
  const { error } = await supabase
    .from('cold_email_state')
    .upsert({
      email: email.toLowerCase(),
      lead_name: lead.name,
      lead_company: lead.company,
      subcategory: lead.subcategory,
      score: lead.score,
      sequence_step: step,
      status,
      last_sent_at: now,
      provider_message_id: messageId || null,
      subject_variant: subjectVariant || null,
      vertical: vertical || 'trades',
      updated_at: now,
    }, { onConflict: 'email' });

  if (error) {
    console.warn(`  ⚠ Failed to upsert state for ${email}:`, error.message);
  }
}

// ─── Supabase: Count today's sends ───
async function countTodaySends(supabase: SupabaseClient): Promise<number> {
  const today = new Date().toISOString().slice(0, 10);
  const { count, error } = await supabase
    .from('cold_email_sends')
    .select('*', { count: 'exact', head: true })
    .gte('sent_at', `${today}T00:00:00Z`)
    .lte('sent_at', `${today}T23:59:59Z`);

  if (error) {
    console.warn('  ⚠ Could not count today\'s sends:', error.message);
    return 0;
  }
  return count || 0;
}

// ─── Resend Client ───
function getResendClient(): Resend {
  return new Resend(RESEND_API_KEY);
}

// ─── Build unsubscribe URL ───
function buildUnsubscribeUrl(email: string): string {
  const encoded = Buffer.from(email).toString('base64url');
  return `${UNSUBSCRIBE_BASE}?e=${encoded}`;
}

// ─── Convert plain text to simple HTML (enables Resend open/click tracking) ───
function textToHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>\n')
    .replace(
      /(https?:\/\/[^\s<]+)/g,
      '<a href="$1" style="color: #111827; font-weight: 600;">$1</a>'
    );
}

// ─── Pick A/B subject variant (round-robin by index) ───
function pickSubjectVariant(template: EmailTemplate, index: number): { subject: string; variantLabel: string } {
  const variants = template.subjectVariants;
  const variant = variants[index % variants.length];
  const subject = typeof variant.subject === 'function' ? variant.subject({} as Lead) : variant.subject;
  return { subject, variantLabel: variant.label };
}

// ─── Send Single Email ───
async function sendEmail(
  client: Resend,
  lead: Lead,
  template: EmailTemplate,
  step: number,
  supabase?: SupabaseClient,
  sendIndex?: number
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const unsubUrl = buildUnsubscribeUrl(lead.email);

  // Pick A/B subject variant
  const idx = sendIndex ?? 0;
  const variant = template.subjectVariants[idx % template.subjectVariants.length];
  const subject = typeof variant.subject === 'function' ? variant.subject(lead) : variant.subject;
  const variantLabel = variant.label;

  // Plain text body (for text-only email clients + Resend tracking)
  const footer = `\n---\nUnsubscribe: ${unsubUrl}\nBuildlogg, 71-75 Shelton Street, Covent Garden, London, WC2H 9JQ`;
  const body = template.body(lead) + footer;

  // Branded HTML version — DESIGN.md compliant template with logo, button, footer
  const emailContent = getEmailContent(VERTICAL, step, lead);
  const htmlBody = wrapBrandedHtml({
    recipientName: firstName(lead.name),
    bodyParagraphs: emailContent.paragraphs,
    ctaText: emailContent.ctaText,
    ctaUrl: emailContent.ctaUrl,
    badgeText: emailContent.badgeText,
    senderName: FROM_NAME.replace(' at Buildlogg', '').replace('Buildlogg', 'James'),
    companyName: 'Buildlogg',
    unsubscribeUrl: unsubUrl,
    heroImage: emailContent.heroImage,
  });

  const listUnsubscribeHeader = `<${unsubUrl}>`;

  if (DRY_RUN) {
    console.log('\n─── DRY RUN ───');
    console.log(`To: ${lead.email}`);
    console.log(`Step: ${step} | Subject variant: ${variantLabel}`);
    console.log(`Subject: ${subject}`);
    console.log(`Body:\n${body}`);
    console.log('────────────────\n');
    return { success: true, messageId: 'dry-run-id' };
  }

  try {
    const { data, error } = await client.emails.send({
      from: `${FROM_NAME} <${FROM_EMAIL}>`,
      to: [lead.email],
      subject,
      text: body,
      html: htmlBody,
      replyTo: FROM_EMAIL,
      headers: {
        'List-Unsubscribe': listUnsubscribeHeader,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      },
      tags: [
        { name: 'campaign', value: 'buildlogg-outreach' },
        { name: 'vertical', value: VERTICAL },
        { name: 'step', value: `step-${step}` },
        { name: 'subject_variant', value: variantLabel },
      ],
    });

    if (error) {
      throw new Error(error.message);
    }

    const messageId = data?.id;

    // Log send to Supabase
    if (supabase) {
      try {
        await supabase.from('cold_email_sends').insert({
          lead_email: lead.email.toLowerCase(),
          sequence_step: step,
          subject,
          subject_variant: variantLabel,
          provider_message_id: messageId || null,
          sent_at: new Date().toISOString(),
          vertical: VERTICAL,
        });

        await upsertSequenceState(supabase, lead.email, lead, step, 'sent', messageId, variantLabel, VERTICAL);
      } catch (logErr) {
        console.warn(`  ⚠ Supabase log failed for ${lead.email}:`, logErr);
      }
    }

    return { success: true, messageId };
  } catch (err: any) {
    console.error(`Failed to send to ${lead.email}:`, err.message || err);

    if (supabase) {
      try {
        await supabase.from('cold_email_sends').insert({
          lead_email: lead.email.toLowerCase(),
          sequence_step: step,
          subject,
          subject_variant: variantLabel,
          provider_message_id: null,
          sent_at: new Date().toISOString(),
          status: 'failed',
          error_message: err.message || String(err),
        });
      } catch {}
    }

    return { success: false, error: err.message || String(err) };
  }
}

// ─── Preview ───
function showPreview(leads: Lead[], step: number) {
  const templateKey = TEMPLATE_KEYS[step - 1];
  const template = activeTemplates[templateKey];
  console.log('\n' + '═'.repeat(80));
  console.log(`📋 PREVIEW: [${VERTICAL}] Step ${step} — ${templateKey}`);
  console.log('═'.repeat(80));

  // Show all subject variants
  console.log(`\nSubject variants:`);
  template.subjectVariants.forEach(v => {
    const s = typeof v.subject === 'function' ? v.subject(leads[0] || {} as Lead) : v.subject;
    console.log(`  ${v.label}: "${s}"`);
  });

  console.log(`\nLeads to send (${leads.length}):`);
  console.log('─'.repeat(80));

  leads.slice(0, 10).forEach((lead, i) => {
    const name = firstName(lead.name).padEnd(12);
    const trade = labelFor(lead.subcategory).padEnd(15);
    const generic = isGenericEmail(lead.email) ? ' [generic]' : '';
    console.log(`  ${(i + 1).toString().padStart(2)}. ${name} | ${trade} | ${lead.email}${generic}`);
  });

  if (leads.length > 10) {
    console.log(`  ... and ${leads.length - 10} more`);
  }

  console.log('─'.repeat(80));
  if (leads.length > 0) {
    console.log(`\nSample body for ${firstName(leads[0].name)} (${labelFor(leads[0].subcategory)}):`);
    console.log(template.body(leads[0]));
  }
  console.log('\n' + '═'.repeat(80));
}

// ─── Batch fetch suppressed emails ───
async function getSuppressedEmails(supabase: SupabaseClient): Promise<Set<string>> {
  try {
    const { data } = await supabase
      .from('email_suppressions')
      .select('email');
    if (!data) return new Set();
    return new Set(data.map((r: any) => (r.email || '').toLowerCase()));
  } catch {
    return new Set();
  }
}

// ─── Batch fetch sequence states ───
async function getAllSequenceStates(supabase: SupabaseClient): Promise<Map<string, any>> {
  try {
    const { data } = await supabase
      .from('cold_email_state')
      .select('*');
    if (!data) return new Map();
    const map = new Map();
    data.forEach((row: any) => map.set((row.email || '').toLowerCase(), row));
    return map;
  } catch {
    return new Map();
  }
}

// ─── Filter leads eligible for a given step ───
async function getEligibleLeads(
  supabase: SupabaseClient,
  allLeads: Lead[],
  step: number,
  minScore: number
): Promise<Lead[]> {
  const suppressed = await getSuppressedEmails(supabase);
  const stateMap = await getAllSequenceStates(supabase);

  const eligible: Lead[] = [];

  for (const lead of allLeads) {
    if (lead.score && lead.score < minScore) continue;

    // Exclude generic email addresses (info@, sales@, etc.)
    if (EXCLUDE_GENERIC && isGenericEmail(lead.email)) continue;

    // Check suppression list
    if (suppressed.has(lead.email.toLowerCase())) continue;

    // Check sequence state
    const state = stateMap.get(lead.email.toLowerCase());

    if (step === 1) {
      if (state && state.status !== 'new') continue;
    } else {
      if (!state) continue;
      if (state.sequence_step !== step - 1) continue;
      if (state.status === 'replied' || state.status === 'unsubscribed' || state.status === 'bounced') continue;

      const prevSentAt = new Date(state.last_sent_at);
      const daysSince = (Date.now() - prevSentAt.getTime()) / (1000 * 60 * 60 * 24);
      if (daysSince < SEQUENCE_DAYS[step]) continue;
    }

    eligible.push(lead);
  }

  return eligible;
}

// ─── Main ───
async function main() {
  // Filter out --vertical flags before parsing positional args
  const rawArgs = process.argv.slice(2).filter(a => !a.startsWith('--vertical='));
  const args = rawArgs;
  const command = args[0] || 'help';

  if (!DRY_RUN && !RESEND_API_KEY) {
    console.error('Error: RESEND_API_KEY required in .env');
    console.error('Set DRY_RUN=true to test without sending.');
    process.exit(1);
  }

  const DEFAULT_CSV = '/Users/niravarvinda/Workspace/projects/TradePad/outreach/tradepad_all_trade_leads_sending.csv';
  const csvPath = args[1] || DEFAULT_CSV;
  const csvPathFinal = fs.existsSync(csvPath)
    ? csvPath
    : path.join(__dirname, '../../data/tradepad_all_trade_leads_sending.csv');

  if (!fs.existsSync(csvPathFinal)) {
    console.error(`CSV not found at: ${csvPathFinal}`);
    console.error('Pass the path as the second argument.');
    process.exit(1);
  }

  const allLeads = loadLeads(csvPathFinal);
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  // Microsoft domains warm-up — gradual ramp instead of hard block.
  // Microsoft builds sender reputation by seeing emails to its users that
  // are NOT marked as spam. Completely skipping Microsoft domains leaves
  // Microsoft with zero reputation data, causing it to default to junk.
  // Solution: allow a small daily quota of Microsoft sends during warm-up,
  // ramping up as total volume grows.
  const MICROSOFT_DOMAINS = [
    'hotmail.com', 'hotmail.co.uk', 'outlook.com', 'outlook.co.uk',
    'live.com', 'live.co.uk', 'msn.com', 'windowslive.com',
  ];
  const WARMUP_THRESHOLD = 500;
  // Daily Microsoft cap scales with total sends: 5/day under 200, 10/day
  // under 400, 20/day under 500, unlimited after 500.
  function microsoftDailyCap(totalSent: number): number {
    if (totalSent >= WARMUP_THRESHOLD) return Infinity;
    if (totalSent >= 400) return 20;
    if (totalSent >= 200) return 10;
    return 5;
  }
  const { count: totalSentCount } = await supabase
    .from('cold_email_sends')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'sent');
  const isWarmingUp = (totalSentCount || 0) < WARMUP_THRESHOLD;

  let qualifiedLeads = allLeads.filter(l => (l.score || 0) >= 70);
  if (isWarmingUp) {
    const msCap = microsoftDailyCap(totalSentCount || 0);
    const today = new Date().toISOString().slice(0, 10);
    // Count today's Microsoft sends (Supabase doesn't support LIKE in .in())
    const { data: todaySends } = await supabase
      .from('cold_email_sends')
      .select('lead_email')
      .gte('sent_at', `${today}T00:00:00Z`)
      .lte('sent_at', `${today}T23:59:59Z`);
    const msSentToday = (todaySends || []).filter((row: any) => {
      const domain = (row.lead_email || '').toLowerCase().split('@')[1] || '';
      return MICROSOFT_DOMAINS.includes(domain);
    }).length;
    const msRemaining = Math.max(0, msCap - msSentToday);

    const nonMsLeads = qualifiedLeads.filter(l => {
      const domain = (l.email || '').toLowerCase().split('@')[1] || '';
      return !MICROSOFT_DOMAINS.includes(domain);
    });
    const msLeads = qualifiedLeads.filter(l => {
      const domain = (l.email || '').toLowerCase().split('@')[1] || '';
      return MICROSOFT_DOMAINS.includes(domain);
    });
    const msToInclude = msLeads.slice(0, msRemaining);
    const msDeferred = msLeads.length - msToInclude.length;
    qualifiedLeads = [...nonMsLeads, ...msToInclude];
    console.log(`Loaded ${allLeads.length} leads | Qualified: ${qualifiedLeads.length} | Warm-up: ${msLeads.length} Microsoft leads (${msToInclude.length} included, ${msDeferred} deferred — cap ${msCap}/day at ${totalSentCount}/${WARMUP_THRESHOLD} total)`);
  } else {
    console.log(`Loaded ${allLeads.length} leads | Qualified: ${qualifiedLeads.length} | Microsoft domains: fully included (warm-up complete)`);
  }

  // Generic email exclusion
  if (EXCLUDE_GENERIC) {
    const before = qualifiedLeads.length;
    qualifiedLeads = qualifiedLeads.filter(l => !isGenericEmail(l.email));
    const excluded = before - qualifiedLeads.length;
    if (excluded > 0) {
      console.log(`Excluded ${excluded} generic email addresses (info@, sales@, etc.) — set EXCLUDE_GENERIC=false to include`);
    }
  }

  // Vertical filter — only send beauty templates to beauty leads
  if (VERTICAL === 'beauty') {
    const before = qualifiedLeads.length;
    qualifiedLeads = qualifiedLeads.filter(isBeautyLead);
    console.log(`Vertical filter [beauty]: ${qualifiedLeads.length} beauty leads (filtered out ${before - qualifiedLeads.length} non-beauty)`);
  }

  if (qualifiedLeads.length === 0) {
    console.error('No qualified leads found. Check CSV path and scores.');
    process.exit(1);
  }

  const resendClient = DRY_RUN ? null : getResendClient();

  // ─── Command: preview ───
  if (command === 'preview') {
    const step = parseInt(args[2] || '1', 10);
    if (step < 1 || step > 4) {
      console.error('Usage: send-cold-emails.ts preview <step 1-4>');
      process.exit(1);
    }
    const eligible = await getEligibleLeads(supabase, qualifiedLeads, step, 70);
    showPreview(eligible, step);
    console.log(`\n${eligible.length} leads eligible for step ${step}`);
    return;
  }

  // ─── Command: test ───
  if (command === 'test') {
    const testLead = qualifiedLeads[0];
    if (!testLead) {
      console.error('No qualified leads to test with.');
      return;
    }
    console.log('\n📧 Testing email 1 with first qualified lead...');
    if (resendClient) {
      await sendEmail(resendClient, testLead, activeTemplates.email1, 1, supabase, 0);
    } else {
      await sendEmail(null as any, testLead, activeTemplates.email1, 1, undefined, 0);
    }
    return;
  }

  // ─── Command: send ───
  if (command === 'send') {
    const step = parseInt(args[2] || '1', 10);

    if (step < 1 || step > 4) {
      console.error('Usage: send-cold-emails.ts send <step 1-4> [csv_path]');
      process.exit(1);
    }

    const templateKey = TEMPLATE_KEYS[step - 1];
    const eligible = await getEligibleLeads(supabase, qualifiedLeads, step, 70);

    if (eligible.length === 0) {
      console.log(`No leads eligible for step ${step} at this time.`);
      return;
    }

    const todayCount = await countTodaySends(supabase);
    const remaining = MAX_DAILY_SENDS - todayCount;
    const toSend = eligible.slice(0, remaining);

    if (remaining <= 0) {
      console.log(`Daily send limit reached (${MAX_DAILY_SENDS}). Try again tomorrow.`);
      return;
    }

    showPreview(toSend, step);

    console.log(`\n📅 [${VERTICAL}] Step ${step} (${templateKey}): Sending ${toSend.length} of ${eligible.length} eligible emails`);
    console.log(`Daily sends so far: ${todayCount} / ${MAX_DAILY_SENDS}`);
    console.log(`From: ${FROM_NAME} <${FROM_EMAIL}>`);
    console.log(`Landing page: ${activeLandingUrl}`);
    console.log(`HTML tracking: enabled (open + click)`);
    console.log(`Subject A/B: ${activeTemplates[templateKey].subjectVariants.length} variants`);
    console.log(`Generic emails: ${EXCLUDE_GENERIC ? 'excluded' : 'included'}`);
    console.log(`Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`);
    console.log(`Sleeping 5s... Press Ctrl+C to cancel.`);
    await new Promise(r => setTimeout(r, 5000));

    let sent = 0;
    let failed = 0;

    for (let i = 0; i < toSend.length; i++) {
      const lead = toSend[i];
      const template = activeTemplates[templateKey];
      const result = resendClient
        ? await sendEmail(resendClient, lead, template, step, supabase, i)
        : await sendEmail(null as any, lead, template, step, undefined, i);

      if (result.success) {
        sent++;
        const variant = template.subjectVariants[i % template.subjectVariants.length];
        console.log(`  ✓ ${lead.email} [${labelFor(lead.subcategory)}] variant=${variant.label}`);
      } else {
        failed++;
        console.log(`  ✗ ${lead.email}: ${result.error}`);
      }
      await new Promise(r => setTimeout(r, SEND_DELAY_MS));
    }

    console.log(`\nDone. Sent: ${sent}, Failed: ${failed}`);
    if (eligible.length > toSend.length) {
      console.log(`${eligible.length - toSend.length} leads deferred to tomorrow (daily limit).`);
    }
    return;
  }

  // ─── Command: suppress ───
  if (command === 'suppress') {
    const email = args[1];
    if (!email) {
      console.error('Usage: send-cold-emails.ts suppress <email>');
      process.exit(1);
    }
    const { error } = await supabase
      .from('email_suppressions')
      .insert({
        email: email.toLowerCase(),
        reason: 'manual',
        suppressed_at: new Date().toISOString(),
      });
    if (error) {
      console.error('Failed to suppress:', error.message);
    } else {
      console.log(`✓ ${email} added to suppression list.`);
    }
    return;
  }

  // ─── Command: stats ───
  if (command === 'stats') {
    const { data: stepCounts } = await supabase
      .from('cold_email_state')
      .select('sequence_step, status')
      .order('sequence_step');

    const { count: totalSent } = await supabase
      .from('cold_email_sends')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'sent');

    const { count: suppressed } = await supabase
      .from('email_suppressions')
      .select('*', { count: 'exact', head: true });

    console.log('\n📊 Campaign Stats');
    console.log('═'.repeat(50));
    console.log(`Total sends: ${totalSent || 0}`);
    console.log(`Suppressed: ${suppressed || 0}`);

    if (stepCounts) {
      const byStep: Record<number, Record<string, number>> = {};
      stepCounts.forEach((row: any) => {
        if (!byStep[row.sequence_step]) byStep[row.sequence_step] = {};
        byStep[row.sequence_step][row.status] = (byStep[row.sequence_step][row.status] || 0) + 1;
      });
      Object.keys(byStep).forEach((step) => {
        console.log(`\n  Step ${step}:`);
        Object.entries(byStep[Number(step)]).forEach(([status, count]) => {
          console.log(`    ${status}: ${count}`);
        });
      });
    }
    console.log('═'.repeat(50));
    return;
  }

  // ─── Help ───
  console.log(`
Buildlogg Cold Email Sender — Resend + Supabase

Usage:
  send-cold-emails.ts <command> [args] [--vertical=trades|beauty]

Commands:
  preview <step>         Preview eligible leads + email body for a step (1-4)
  test                   Send a test email to the first qualified lead
  send <step>            Send emails for sequence step (1-4)
  suppress <email>       Add an email to the suppression list
  stats                  Show campaign stats from Supabase

Verticals:
  --vertical=trades      Tradesperson templates (default) → buildlogg.com
  --vertical=beauty      Beauty/salon templates → buildlogg.com/beauty/

Features:
  ✓ HTML body with open/click tracking (Resend pixel injection)
  ✓ A/B subject line testing (round-robin across variants)
  ✓ Generic email exclusion (info@, sales@, etc.)
  ✓ Microsoft domain warm-up (skip until 500 sends)
  ✓ Unsubscribe link + GDPR footer in every email
  ✓ Vertical tracking in Supabase (cold_email_sends.vertical, cold_email_state.vertical)

Environment:
  DRY_RUN=true            Print emails instead of sending
  FROM_NAME               Sender display name (default: James at Buildlogg)
  FROM_EMAIL              Sender address
  EXCLUDE_GENERIC=false   Include info@/sales@ addresses (default: excluded)
  MAX_DAILY_SENDS         Daily send cap
  SEND_DELAY_MS           Delay between sends (default: 3000)
`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
