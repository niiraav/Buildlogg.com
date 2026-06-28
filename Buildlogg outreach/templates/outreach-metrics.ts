/**
 * Outreach Metrics Tracker
 * =========================
 *
 * Queries Supabase + Resend for cold email outreach metrics and produces
 * a markdown summary. Designed to run daily via launchd at 14:00 BST.
 *
 * Data sources:
 * - Supabase: cold_email_stats (aggregate), cold_email_sends (per-send log),
 *   cold_email_state (per-lead status), email_suppressions, auth.users (sign-ups)
 * - Resend API: emails.get(id) → last_event (delivered/opened/clicked/bounced/complained)
 *
 * Output: ~/lead-triage/logs/outreach-metrics-YYYY-MM-DD.md
 *
 * Schedule: launchd daily at 13:00 UTC (14:00 BST) — 4 hours before EOD review.
 *
 * Optional env vars:
 * - POSTHOG_PERSONAL_API_KEY: if set, queries PostHog for user_signed_up events
 * - POSTHOG_HOST: PostHog API host (default: https://eu.posthog.com)
 */

import * as dotenv from 'dotenv';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config();

// ─── Config ───
const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY!;

// TradePad app Supabase — where auth.users actually live (different project)
const TRADEPAD_SUPABASE_URL = process.env.TRADEPAD_SUPABASE_URL || 'https://klprbojgvpdnjvxvmylh.supabase.co';
const TRADEPAD_SUPABASE_ANON_KEY = process.env.TRADEPAD_SUPABASE_ANON_KEY || '';
const RESEND_API_KEY = process.env.RESEND_API_KEY!;
const POSTHOG_PERSONAL_KEY = process.env.POSTHOG_PERSONAL_API_KEY || '';
const POSTHOG_HOST = process.env.POSTHOG_HOST || process.env.VITE_POSTHOG_HOST || 'https://eu.posthog.com';
const POSTHOG_PROJECT_ID = process.env.POSTHOG_PROJECT_ID || '';

const OUTPUT_DIR = path.join(__dirname, '..', '..', 'logs');
const TODAY = new Date().toISOString().split('T')[0];

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
const resend = new Resend(RESEND_API_KEY);

// ─── Types ───
interface ResendEventMap {
  [messageId: string]: string;
}

// ─── Supabase queries ───

async function getAggregateStats(): Promise<Record<string, number> | null> {
  const { data, error } = await supabase
    .from('cold_email_stats')
    .select('*')
    .single();

  if (error) {
    console.error('[stats] Error:', error.message);
    return null;
  }
  return data as any;
}

async function getAllSends(): Promise<any[]> {
  const { data, error } = await supabase
    .from('cold_email_sends')
    .select('*')
    .order('sent_at', { ascending: false });

  if (error) {
    console.error('[sends] Error:', error.message);
    return [];
  }
  return data || [];
}

async function getStates(): Promise<any[]> {
  const { data, error } = await supabase
    .from('cold_email_state')
    .select('*');

  if (error) {
    console.error('[states] Error:', error.message);
    return [];
  }
  return data || [];
}

async function getSuppressedCount(): Promise<number> {
  const { count, error } = await supabase
    .from('email_suppressions')
    .select('*', { count: 'exact', head: true });

  if (error) {
    console.error('[suppressed] Error:', error.message);
    return 0;
  }
  return count || 0;
}

async function getAuthUsers(): Promise<any[]> {
  // Auth users live on the TradePad app Supabase project, NOT the lead-triage project.
  // We use the anon key + signInWithOtp to check existence (service key not available).
  // Since we can't list users with the anon key, we cross-reference cold_email_state
  // emails against the TradePad project by attempting a password reset for each
  // sent lead — if it succeeds, the user exists.
  //
  // SIMPLER APPROACH: Query the TradePad profiles table (readable with anon key + RLS)
  // and also check PostHog for sign-up events.
  const users: any[] = [];

  // Try the TradePad Supabase profiles table
  if (TRADEPAD_SUPABASE_ANON_KEY) {
    try {
      const tradepadDb = createClient(TRADEPAD_SUPABASE_URL, TRADEPAD_SUPABASE_ANON_KEY);
      const { data: profiles, error } = await tradepadDb
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);

      if (!error && profiles) {
        users.push(...profiles.map((p: any) => ({
          email: p.email || '',
          id: p.id,
          created_at: p.created_at,
          email_confirmed: true,
        })));
        console.log(`[auth] Found ${profiles.length} profiles on TradePad Supabase`);
      } else if (error) {
        console.error('[auth] TradePad profiles error:', error.message);
      }
    } catch (err) {
      console.error('[auth] TradePad Supabase connection failed:', err);
    }
  } else {
    console.warn('[auth] TRADEPAD_SUPABASE_ANON_KEY not set — sign-up counts will be 0');
  }

  // Also check via PostHog sign-up events (more reliable than auth.users)
  // PostHog events are fetched later in getPosthogSignups()

  return users;
}

async function _getAuthUsersLegacy(): Promise<any[]> {
  const users: any[] = [];
  let page = 1;
  const perPage = 100;

  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage,
    });

    if (error) {
      console.error('[auth] Error:', error.message);
      break;
    }

    if (!data.users || data.users.length === 0) break;
    users.push(...data.users);

    if (data.users.length < perPage) break;
    page++;
  }

  return users;
}

// ─── Resend queries ───

async function getResendEvent(messageId: string): Promise<string> {
  try {
    const { data, error } = await resend.emails.get(messageId);
    if (error || !data) return 'unknown';
    return (data as any).last_event || 'unknown';
  } catch {
    return 'unknown';
  }
}

async function getResendEventsBatch(messageIds: string[]): Promise<ResendEventMap> {
  const results: ResendEventMap = {};
  const concurrency = 5;

  for (let i = 0; i < messageIds.length; i += concurrency) {
    const batch = messageIds.slice(i, i + concurrency);
    const batchResults = await Promise.all(
      batch.map(async (id) => {
        const event = await getResendEvent(id);
        return { id, event };
      })
    );
    for (const r of batchResults) {
      results[r.id] = r.event;
    }
    // Small delay between batches to respect rate limits
    if (i + concurrency < messageIds.length) {
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }

  return results;
}

// ─── PostHog queries (optional) ───

async function getPostHogSignups(): Promise<any[] | null> {
  if (!POSTHOG_PERSONAL_KEY) return null;

  try {
    // PostHog Events API — requires personal API key
    const url = `${POSTHOG_HOST}/api/projects/${POSTHOG_PROJECT_ID || '@current'}/events/?event=user_signed_up&limit=100&orderBy=["-timestamp"]`;
    const resp = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${POSTHOG_PERSONAL_KEY}`,
      },
    });

    if (!resp.ok) {
      console.error('[posthog] Error:', resp.status, resp.statusText);
      return null;
    }

    const data = await resp.json() as any;
    return data.results || [];
  } catch (err) {
    console.error('[posthog] Error:', err);
    return null;
  }
}

// ─── Formatting helpers ───

function formatDate(ts: string): string {
  return new Date(ts).toLocaleString('en-GB', {
    timeZone: 'Europe/London',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function pct(n: number, total: number): string {
  if (total === 0) return '—';
  return `${((n / total) * 100).toFixed(1)}%`;
}

// ─── Main ───

async function main() {
  console.log(`[outreach-metrics] Starting metrics collection for ${TODAY}`);
  const startTime = Date.now();

  // 1. Gather all data in parallel
  console.log('[outreach-metrics] Querying Supabase...');
  const [stats, allSends, states, suppressedCount, authUsers, posthogSignups] = await Promise.all([
    getAggregateStats(),
    getAllSends(),
    getStates(),
    getSuppressedCount(),
    getAuthUsers(),
    getPostHogSignups(),
  ]);

  // 2. Get Resend events for all sends
  const messageIds = allSends
    .map((s: any) => s.provider_message_id)
    .filter((id: any): id is string => !!id && id !== '' && id !== null);

  console.log(`[outreach-metrics] Querying Resend for ${messageIds.length} emails...`);
  const resendEvents = await getResendEventsBatch(messageIds);

  // 3. Aggregate Resend events
  const eventCounts: Record<string, number> = {};
  for (const id of messageIds) {
    const event = resendEvents[id] || 'unknown';
    eventCounts[event] = (eventCounts[event] || 0) + 1;
  }

  const totalSends = allSends.length;
  const delivered = eventCounts['delivered'] || 0;
  const opened = eventCounts['opened'] || 0;
  const clicked = eventCounts['clicked'] || 0;
  const bouncedResend = eventCounts['bounced'] || 0;
  const complained = eventCounts['complained'] || 0;
  const failed = eventCounts['failed'] || 0;
  const suppressed = eventCounts['suppressed'] || 0;
  const unknown = eventCounts['unknown'] || 0;

  // last_event shows only the LAST event. An email opened then clicked shows as 'clicked'.
  // So open rate = opened + clicked (clicked implies opened).
  const openedOrClicked = opened + clicked;

  // 4. Cross-reference auth users with cold email state
  const coldEmailAddresses = new Set(
    states.map((s: any) => (s.email || '').toLowerCase()).filter(Boolean)
  );
  const signupsFromEmail = authUsers.filter((u: any) =>
    coldEmailAddresses.has((u.email || '').toLowerCase())
  );

  // 5. Today's sends
  const todaySends = allSends.filter((s: any) => s.sent_at.startsWith(TODAY));

  // 6. Per-day breakdown
  const sendsByDate: Record<string, number> = {};
  for (const s of allSends) {
    const date = (s as any).sent_at.split('T')[0];
    sendsByDate[date] = (sendsByDate[date] || 0) + 1;
  }

  // 7. Status breakdown from cold_email_state
  const statusCounts: Record<string, number> = {};
  for (const s of states) {
    const status = (s as any).status || 'unknown';
    statusCounts[status] = (statusCounts[status] || 0) + 1;
  }

  // ─── Analysis: per-trade breakdown ───
  // Group sends by subcategory to find which trades engage vs ignore
  const tradeStats: Record<string, { sent: number; delivered: number; opened: number; clicked: number; bounced: number; unknown: number }> = {};
  for (const s of allSends) {
    const state = states.find((st: any) => (st.email || '').toLowerCase() === (s as any).lead_email?.toLowerCase());
    const trade = (state as any)?.subcategory || 'unknown';
    if (!tradeStats[trade]) tradeStats[trade] = { sent: 0, delivered: 0, opened: 0, clicked: 0, bounced: 0, unknown: 0 };
    const ts = tradeStats[trade];
    ts.sent++;
    const evt = (s as any).provider_message_id ? resendEvents[(s as any).provider_message_id] || 'unknown' : 'unknown';
    if (evt === 'delivered') ts.delivered++;
    else if (evt === 'opened') { ts.opened++; }
    else if (evt === 'clicked') { ts.clicked++; ts.opened++; }
    else if (evt === 'bounced') ts.bounced++;
    else ts.unknown++;
  }

  // ─── Analysis: per-domain breakdown (deliverability issues by recipient domain) ───
  const domainStats: Record<string, { sent: number; delivered: number; unknown: number; bounced: number }> = {};
  for (const s of allSends) {
    const email = (s as any).lead_email || '';
    const domain = email.split('@')[1]?.toLowerCase() || 'unknown';
    if (!domainStats[domain]) domainStats[domain] = { sent: 0, delivered: 0, unknown: 0, bounced: 0 };
    const ds = domainStats[domain];
    ds.sent++;
    const evt = (s as any).provider_message_id ? resendEvents[(s as any).provider_message_id] || 'unknown' : 'unknown';
    if (evt === 'delivered') ds.delivered++;
    else if (evt === 'bounced') ds.bounced++;
    else if (evt === 'unknown') ds.unknown++;
  }

  // ─── Analysis: send-time analysis (which time slots get better delivery/engagement) ───
  const timeSlotStats: Record<string, { sent: number; delivered: number; opened: number }> = {};
  for (const s of allSends) {
    const sentDate = new Date((s as any).sent_at);
    const bstHour = parseInt(sentDate.toLocaleString('en-GB', { timeZone: 'Europe/London', hour: '2-digit', hour12: false }));
    const slot = bstHour < 10 ? 'morning (6-9)' : bstHour < 14 ? 'midday (10-13)' : bstHour < 18 ? 'afternoon (14-17)' : 'evening (18+)';
    if (!timeSlotStats[slot]) timeSlotStats[slot] = { sent: 0, delivered: 0, opened: 0 };
    const tss = timeSlotStats[slot];
    tss.sent++;
    const evt = (s as any).provider_message_id ? resendEvents[(s as any).provider_message_id] || 'unknown' : 'unknown';
    if (evt === 'delivered') tss.delivered++;
    if (evt === 'opened' || evt === 'clicked') tss.opened++;
  }

  // ─── Analysis: lead score correlation ───
  const scoreBands: Record<string, { sent: number; delivered: number; opened: number }> = {
    '70-79': { sent: 0, delivered: 0, opened: 0 },
    '80-89': { sent: 0, delivered: 0, opened: 0 },
    '90-100': { sent: 0, delivered: 0, opened: 0 },
    'unknown': { sent: 0, delivered: 0, opened: 0 },
  };
  for (const s of allSends) {
    const state = states.find((st: any) => (st.email || '').toLowerCase() === (s as any).lead_email?.toLowerCase());
    const score = (state as any)?.score || 0;
    const band = score >= 90 ? '90-100' : score >= 80 ? '80-89' : score >= 70 ? '70-79' : 'unknown';
    const sb = scoreBands[band];
    sb.sent++;
    const evt = (s as any).provider_message_id ? resendEvents[(s as any).provider_message_id] || 'unknown' : 'unknown';
    if (evt === 'delivered') sb.delivered++;
    if (evt === 'opened' || evt === 'clicked') sb.opened++;
  }

  // ─── Analysis: email type / company-type breakdown (generic vs personal email) ───
  let genericCount = 0, personalCount = 0;
  for (const s of allSends) {
    const email = (s as any).lead_email || '';
    const localPart = email.split('@')[0]?.toLowerCase() || '';
    const genericPrefixes = ['info', 'sales', 'accounts', 'enquiries', 'contact', 'office', 'admin', 'hello', 'mail', 'team', 'finance', 'purchasing', 'purchase', 'orders', 'support'];
    if (genericPrefixes.some(p => localPart.startsWith(p))) genericCount++;
    else personalCount++;
  }

  // ─── Generate insights ───
  const insights: string[] = [];
  const warnings: string[] = [];
  const actions: string[] = [];

  // 1. Unknown rate signal
  const unknownRate = totalSends > 0 ? unknown / totalSends : 0;
  if (unknownRate > 0.4) {
    warnings.push(`**High unknown rate (${pct(unknown, totalSends)})** — ${unknown} of ${totalSends} emails have no Resend event yet. This is likely API lag for same-day sends. Tomorrow's run should resolve most. If unknown persists for 48h+ sends, check Resend webhook setup.`);
  }

  // 2. Deliverability rate
  const deliveryRate = totalSends > 0 ? delivered / totalSends : 0;
  if (delivered > 0 && deliveryRate < 0.8 && unknownRate < 0.3) {
    warnings.push(`**Delivery rate is ${pct(delivered, totalSends)}** — below the 80% healthy threshold. Check Resend domain reputation, SPF/DKIM/DMARC, and whether specific recipient domains are bouncing.`);
  }

  // 3. Open rate signal
  const resolvedSends = totalSends - unknown; // emails where we actually know the status
  const openRate = resolvedSends > 0 ? openedOrClicked / resolvedSends : 0;
  if (resolvedSends > 20) {
    if (openRate < 0.1) {
      warnings.push(`**Open rate is ${pct(openedOrClicked, resolvedSends)} of resolved emails** — below 10%. Subject line "The admin you do at 9pm" may not be resonating, or emails are landing in spam/promotions. Consider: (a) A/B test a new subject line on next batch, (b) check spam placement with a seed test, (c) try sending at a different time.`);
    } else if (openRate < 0.2) {
      insights.push(`Open rate is ${pct(openedOrClicked, resolvedSends)} of resolved emails — below the 20% cold email benchmark but not alarming this early. Monitor after Step 2 sends start.`);
    } else {
      insights.push(`Open rate is ${pct(openedOrClicked, resolvedSends)} of resolved emails — solid for cold email. The subject line is working.`);
    }
  } else {
    insights.push(`Not enough resolved sends (${resolvedSends} with known status) to judge open rate yet. Need 20+ to draw conclusions.`);
  }

  // 4. Sequence progression signal
  const step1Sent = stats?.step1_sent || 0;
  const step2Sent = stats?.step2_sent || 0;
  const step3Sent = stats?.step3_sent || 0;
  const step4Sent = stats?.step4_sent || 0;
  if (step1Sent > 0 && step2Sent === 0) {
    const earliestSendDate = allSends.length > 0
      ? allSends.reduce((min, s) => (s as any).sent_at < min ? (s as any).sent_at : min, allSends[0].sent_at)
      : null;
    if (earliestSendDate) {
      const daysSinceFirst = (Date.now() - new Date(earliestSendDate).getTime()) / (1000 * 60 * 60 * 24);
      if (daysSinceFirst >= 3) {
        actions.push(`**Step 2 is overdue.** First emails were sent ${Math.floor(daysSinceFirst)} days ago; Step 2 fires on Day 3. Run: \`npx tsx src/scripts/send-cold-emails.ts send 2\` to send follow-ups to eligible leads.`);
      } else {
        insights.push(`Step 2 not yet due (first send was ${Math.floor(daysSinceFirst)} days ago, Step 2 fires on Day 3). Will become eligible in ${Math.ceil(3 - daysSinceFirst)} day(s).`);
      }
    }
  }
  if (step2Sent > 0 && step3Sent === 0) {
    insights.push(`Step 2 has been sent (${step2Sent} leads). Step 3 fires on Day 7 after Step 1 — check eligibility in a few days.`);
  }

  // 5. Best/worst performing trades
  const sortedTrades = Object.entries(tradeStats)
    .filter(([_, t]) => t.sent >= 5)
    .sort((a, b) => {
      const aResolved = a[1].sent - a[1].unknown;
      const bResolved = b[1].sent - b[1].unknown;
      const aOpenRate = aResolved > 0 ? (a[1].opened + a[1].clicked) / aResolved : 0;
      const bOpenRate = bResolved > 0 ? (b[1].opened + b[1].clicked) / bResolved : 0;
      return bOpenRate - aOpenRate;
    });

  if (sortedTrades.length > 0 && resolvedSends > 20) {
    const bestTrade = sortedTrades[0];
    const worstTrade = sortedTrades[sortedTrades.length - 1];
    const bestResolved = bestTrade[1].sent - bestTrade[1].unknown;
    const worstResolved = worstTrade[1].sent - worstTrade[1].unknown;
    if (bestResolved > 0 && bestTrade[1].opened > 0) {
      insights.push(`**Best-engaging trade:** ${bestTrade[0]} — ${bestTrade[1].opened + bestTrade[1].clicked} opens on ${bestTrade[1].sent} sends (${pct(bestTrade[1].opened + bestTrade[1].clicked, bestTrade[1].sent)}). This trade feels the pain most acutely — consider doubling down with trade-specific outreach or a targeted landing page.`);
    }
    if (worstResolved > 0 && worstTrade[0] !== bestTrade[0]) {
      const worstOpenRate = worstResolved > 0 ? (worstTrade[1].opened + worstTrade[1].clicked) / worstResolved : 0;
      if (worstOpenRate === 0 && worstTrade[1].sent >= 10) {
        warnings.push(`**Worst-engaging trade:** ${worstTrade[0]} — 0 opens on ${worstTrade[1].sent} sends. Either this trade doesn't feel the pain, or your subject line/positioning doesn't land for them. Consider dropping them from future batches or testing a trade-specific subject line.`);
      }
    }
  }

  // 6. Domain deliverability issues
  const sortedDomains = Object.entries(domainStats)
    .filter(([_, d]) => d.sent >= 3)
    .sort((a, b) => b[1].sent - a[1].sent);

  const problemDomains = sortedDomains.filter(([_, d]) => {
    const resolved = d.sent - d.unknown;
    return resolved > 0 && d.delivered / resolved < 0.7;
  });

  if (problemDomains.length > 0 && unknownRate < 0.3) {
    const domainList = problemDomains.slice(0, 5).map(([domain, d]) => `${domain} (${d.delivered}/${d.sent} delivered)`).join(', ');
    warnings.push(`**Deliverability issues on recipient domains:** ${domainList}. These domains have <70% delivery rate. May indicate spam filtering or domain reputation issues with specific email providers.`);
  }

  // 7. Generic vs personal email signal
  if (totalSends > 20) {
    const genericPct = pct(genericCount, totalSends);
    if (genericCount > personalCount) {
      insights.push(`**${genericPct} of sends go to generic addresses** (info@, sales@, accounts@). These are shared inboxes — open rates are typically lower because they're checked less frequently and by multiple people. Personal emails (name@company.co.uk) tend to convert better. Consider scoring personal-email leads higher in future list building.`);
    } else {
      insights.push(`**${pct(personalCount, totalSends)} of sends go to personal/named email addresses** — good. These typically have higher open rates than generic (info@/sales@) inboxes.`);
    }
  }

  // 8. Lead score correlation
  const scoreBandsWithResolved = Object.entries(scoreBands).filter(([_, sb]) => (sb.sent - 0) >= 5);
  if (scoreBandsWithResolved.length > 1 && resolvedSends > 20) {
    const highBand = scoreBands['90-100'];
    const lowBand = scoreBands['70-79'];
    if (highBand.sent >= 5 && lowBand.sent >= 5) {
      const highResolved = highBand.sent - 0; // no unknown tracking for simplicity
      const lowResolved = lowBand.sent - 0;
      const highOpen = highBand.opened;
      const lowOpen = lowBand.opened;
      if (highOpen > lowOpen && highOpen > 0) {
        insights.push(`**Lead score correlates with engagement:** 90-100 score band has ${highOpen} opens vs ${lowOpen} for 70-79 band. Your scoring model is working — prioritise high-score leads for future batches.`);
      } else if (lowOpen > highOpen && lowOpen > 0) {
        warnings.push(`**Lead score is NOT correlating with engagement:** 70-79 band has ${lowOpen} opens vs ${highOpen} for 90-100 band. Your scoring model may need recalibration.`);
      }
    }
  }

  // 9. Spam complaint signal
  if (complained > 0) {
    const complaintRate = totalSends > 0 ? complained / totalSends : 0;
    if (complaintRate > 0.001) {
      warnings.push(`**Spam complaint rate is ${pct(complained, totalSends)}** — above the 0.1% safe threshold. ${complained} recipient(s) marked this as spam. This can damage domain reputation. Review email content for tone — ensure it doesn't read as overly promotional.`);
    }
  }

  // 10. Unsubscribe signal
  const unsubCount = stats?.unsubscribed || 0;
  if (unsubCount > 0) {
    insights.push(`**${unsubCount} unsubscribe(s)** — normal for cold email. Unsubscribes are healthier than spam complaints (they actively opted out rather than reporting you).`);
  }

  // 11. Sign-up signal
  if (signupsFromEmail.length > 0) {
    insights.push(`**${signupsFromEmail.length} sign-up(s) from email outreach!** The funnel is working. Track which step/trade they came from to double down on what converts.`);
  } else if (totalSends > 50 && resolvedSends > 20 && openedOrClicked === 0) {
    warnings.push(`**0 sign-ups and 0 opens on ${totalSends} sends.** The funnel is broken at the open stage. Before sending more, diagnose: (1) Are emails landing in spam? Send a test to a seed address. (2) Is the subject line compelling enough? (3) Is the landing page working when they DO click?`);
  } else if (totalSends > 50 && openedOrClicked > 0 && signupsFromEmail.length === 0) {
    insights.push(`**${openedOrClicked} open(s) but 0 sign-ups.** People are reading but not clicking through. Check: (1) Is the CTA (buildlogg.com) prominent and clickable in the email body? (2) Does the landing page load fast and show clear value? (3) Is the sign-up frictionless?`);
  }

  // 12. Warm-up progress
  if (totalSends < 500) {
    insights.push(`**Warm-up phase:** ${totalSends}/500 sends. Microsoft domains (hotmail/outlook/live) are being skipped. After 500 sends, re-include them to expand reach by ~15-20%.`);
  } else if (totalSends >= 500) {
    actions.push(`**Warm-up complete** (${totalSends} sends). Microsoft domains (hotmail/outlook) should now be included in batches. Verify the send script is no longer filtering them.`);
  }

  // 13. Send time analysis
  const sortedSlots = Object.entries(timeSlotStats).filter(([_, ts]) => ts.sent >= 5);
  if (sortedSlots.length > 1 && resolvedSends > 20) {
    const bestSlot = sortedSlots.sort((a, b) => {
      const aResolved = a[1].sent - 0;
      const bResolved = b[1].sent - 0;
      const aOpen = aResolved > 0 ? a[1].opened / aResolved : 0;
      const bOpen = bResolved > 0 ? b[1].opened / bResolved : 0;
      return bOpen - aOpen;
    })[0];
    if (bestSlot && bestSlot[1].opened > 0) {
      insights.push(`**Best send time:** ${bestSlot[0]} — ${bestSlot[1].opened} opens on ${bestSlot[1].sent} sends. Consider concentrating future sends in this window.`);
    }
  }

  // ─── Build markdown report ───
  const lines: string[] = [];
  lines.push(`# 📧 Outreach Metrics — ${TODAY}`);
  lines.push('');
  lines.push(`> Auto-generated by outreach-metrics.ts at ${new Date().toLocaleString('en-GB', { timeZone: 'Europe/London' })}`);
  lines.push('');

  // ─── Executive Summary ───
  lines.push('## 🎯 Executive Summary');
  lines.push('');
  lines.push(`${totalSends} emails sent across ${Object.keys(sendsByDate).length} day(s). ${delivered} delivered, ${openedOrClicked} opened, ${clicked} clicked, ${signupsFromEmail.length} sign-up(s).`);
  lines.push('');

  // ─── What to do next ───
  if (actions.length > 0) {
    lines.push('## ⚡ Actions Needed');
    lines.push('');
    for (const a of actions) {
      lines.push(`- ${a}`);
    }
    lines.push('');
  }

  // ─── Warnings ───
  if (warnings.length > 0) {
    lines.push('## ⚠️ Warnings');
    lines.push('');
    for (const w of warnings) {
      lines.push(`- ${w}`);
    }
    lines.push('');
  }

  // ─── Signals & Insights ───
  if (insights.length > 0) {
    lines.push('## 🔍 Signals & Insights');
    lines.push('');
    for (const i of insights) {
      lines.push(`- ${i}`);
    }
    lines.push('');
  }

  // ─── Funnel ───
  lines.push('## Funnel Summary');
  lines.push('');
  lines.push('| Stage | Count | Rate |');
  lines.push('|-------|-------|------|');
  lines.push(`| Total leads in sequence | ${stats?.total_leads || states.length} | — |`);
  lines.push(`| Emails sent | ${totalSends} | — |`);
  lines.push(`| Delivered | ${delivered} | ${pct(delivered, totalSends)} |`);
  lines.push(`| Opened (incl. clicked) | ${openedOrClicked} | ${pct(openedOrClicked, totalSends)} |`);
  lines.push(`| Clicked | ${clicked} | ${pct(clicked, totalSends)} |`);
  lines.push(`| Signed up (from email) | ${signupsFromEmail.length} | ${pct(signupsFromEmail.length, totalSends)} |`);
  lines.push(`| Replied | ${stats?.replied || 0} | ${pct(stats?.replied || 0, totalSends)} |`);
  lines.push(`| Unsubscribed | ${stats?.unsubscribed || 0} | ${pct(stats?.unsubscribed || 0, totalSends)} |`);
  lines.push(`| Bounced | ${bouncedResend + (stats?.bounced || 0)} | ${pct(bouncedResend + (stats?.bounced || 0), totalSends)} |`);
  lines.push(`| Complained (spam) | ${complained} | ${pct(complained, totalSends)} |`);
  lines.push('');

  // ─── Resend event breakdown ───
  lines.push('### Resend Event Breakdown (last_event per email)');
  lines.push('');
  lines.push('| Event | Count | % |');
  lines.push('|-------|-------|---|');
  for (const [event, count] of Object.entries(eventCounts).sort((a, b) => b[1] - a[1])) {
    lines.push(`| ${event} | ${count} | ${pct(count, totalSends)} |`);
  }
  lines.push('');

  // ─── Per-trade performance ───
  if (sortedTrades.length > 0) {
    lines.push('## 📊 Per-Trade Performance');
    lines.push('');
    lines.push('| Trade | Sent | Delivered | Opened | Open Rate (of resolved) | Bounced |');
    lines.push('|-------|------|-----------|--------|--------------------------|---------|');
    for (const [trade, ts] of sortedTrades) {
      const resolved = ts.sent - ts.unknown;
      const openRate = resolved > 0 ? pct(ts.opened + ts.clicked, resolved) : '—';
      lines.push(`| ${trade} | ${ts.sent} | ${ts.delivered} | ${ts.opened + ts.clicked} | ${openRate} | ${ts.bounced} |`);
    }
    lines.push('');
  }

  // ─── Per-domain deliverability ───
  if (sortedDomains.length > 0) {
    lines.push('## 📬 Domain Deliverability (top 15 by volume)');
    lines.push('');
    lines.push('| Domain | Sent | Delivered | Unknown | Bounced | Delivery Rate |');
    lines.push('|--------|------|-----------|---------|---------|---------------|');
    for (const [domain, ds] of sortedDomains.slice(0, 15)) {
      const resolved = ds.sent - ds.unknown;
      const deliveryRate = resolved > 0 ? pct(ds.delivered, resolved) : '—';
      lines.push(`| ${domain} | ${ds.sent} | ${ds.delivered} | ${ds.unknown} | ${ds.bounced} | ${deliveryRate} |`);
    }
    lines.push('');
  }

  // ─── Send time analysis ───
  if (sortedSlots.length > 0) {
    lines.push('## ⏰ Send Time Analysis (BST)');
    lines.push('');
    lines.push('| Time Slot | Sent | Delivered | Opened |');
    lines.push('|-----------|------|-----------|--------|');
    for (const [slot, ts] of sortedSlots) {
      lines.push(`| ${slot} | ${ts.sent} | ${ts.delivered} | ${ts.opened} |`);
    }
    lines.push('');
  }

  // ─── Lead score correlation ───
  lines.push('## 🎯 Lead Score vs Engagement');
  lines.push('');
  lines.push('| Score Band | Sent | Delivered | Opened |');
  lines.push('|------------|------|-----------|--------|');
  for (const [band, sb] of Object.entries(scoreBands)) {
    if (sb.sent === 0) continue;
    lines.push(`| ${band} | ${sb.sent} | ${sb.delivered} | ${sb.opened} |`);
  }
  lines.push('');

  // ─── Email type breakdown ───
  lines.push('## 📧 Email Address Type');
  lines.push('');
  lines.push(`- **Personal/named emails:** ${personalCount} (${pct(personalCount, totalSends)})`);
  lines.push(`- **Generic inboxes (info@, sales@, etc.):** ${genericCount} (${pct(genericCount, totalSends)})`);
  lines.push('');

  // ─── Today's sends ───
  lines.push(`## Today's Sends (${todaySends.length})`);
  lines.push('');
  if (todaySends.length === 0) {
    lines.push('No emails sent today.');
  } else {
    lines.push('| Time (BST) | Email | Step | Subject | Resend Status |');
    lines.push('|------------|-------|------|---------|---------------|');
    for (const s of todaySends) {
      const event = (s as any).provider_message_id ? resendEvents[(s as any).provider_message_id] || 'unknown' : 'no-id';
      const email = (s as any).lead_email || '—';
      const subject = ((s as any).subject || '—').substring(0, 40);
      lines.push(`| ${formatDate((s as any).sent_at)} | ${email} | Step ${(s as any).sequence_step} | ${subject} | ${event} |`);
    }
  }
  lines.push('');

  // ─── Sends by date ───
  lines.push('## Sends by Date');
  lines.push('');
  lines.push('| Date | Sends |');
  lines.push('|------|-------|');
  for (const [date, count] of Object.entries(sendsByDate).sort((a, b) => b[0].localeCompare(a[0]))) {
    lines.push(`| ${date} | ${count} |`);
  }
  lines.push('');

  // ─── Sequence progress ───
  lines.push('## Sequence Progress');
  lines.push('');
  lines.push('| Step | Sent |');
  lines.push('|------|------|');
  lines.push(`| Step 1 (intro) | ${step1Sent} |`);
  lines.push(`| Step 2 (value) | ${step2Sent} |`);
  lines.push(`| Step 3 (case study) | ${step3Sent} |`);
  lines.push(`| Step 4 (breakup) | ${step4Sent} |`);
  lines.push('');

  // ─── Sign-ups ───
  lines.push('## Sign-ups');
  lines.push('');
  lines.push(`- **Total auth users:** ${authUsers.length}`);
  lines.push(`- **From email outreach (matched):** ${signupsFromEmail.length}`);
  lines.push('');

  if (signupsFromEmail.length > 0) {
    lines.push('### Sign-ups from email outreach:');
    lines.push('');
    for (const u of signupsFromEmail) {
      const created = new Date((u as any).created_at).toLocaleDateString('en-GB');
      const state = states.find((st: any) => (st.email || '').toLowerCase() === ((u as any).email || '').toLowerCase());
      const trade = state ? (state as any).subcategory : '—';
      const step = state ? (state as any).sequence_step : '—';
      lines.push(`- ${(u as any).email} — signed up ${created} (trade: ${trade}, last step: ${step})`);
    }
    lines.push('');
  }

  if (authUsers.length > 0) {
    lines.push('### Recent sign-ups (last 7 days):');
    lines.push('');
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const recent = authUsers
      .filter((u: any) => new Date(u.created_at) > sevenDaysAgo)
      .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    if (recent.length === 0) {
      lines.push('No sign-ups in the last 7 days.');
    } else {
      for (const u of recent) {
        const created = new Date((u as any).created_at).toLocaleString('en-GB', { timeZone: 'Europe/London' });
        const fromEmail = coldEmailAddresses.has(((u as any).email || '').toLowerCase()) ? '✅ email' : '— organic';
        lines.push(`- ${(u as any).email} — ${created} (${fromEmail})`);
      }
    }
    lines.push('');
  }

  // ─── PostHog (if available) ───
  if (posthogSignups && posthogSignups.length > 0) {
    lines.push('## PostHog Sign-up Events');
    lines.push('');
    lines.push('| Timestamp | Email/Distinct ID | Source | Trade |');
    lines.push('|-----------|------------------|--------|-------|');
    for (const e of posthogSignups.slice(0, 20)) {
      const ts = new Date((e as any).timestamp).toLocaleString('en-GB', { timeZone: 'Europe/London' });
      const distinctId = (e as any).distinct_id || '—';
      const props = (e as any).properties || {};
      const source = props.source || '—';
      const trade = props.trade || '—';
      lines.push(`| ${ts} | ${distinctId} | ${source} | ${trade} |`);
    }
    lines.push('');
  }

  // ─── Issues & suppressions ───
  lines.push('## Issues & Suppressions');
  lines.push('');
  lines.push(`- **Suppressed emails:** ${suppressedCount}`);
  lines.push(`- **Bounced:** ${bouncedResend + (stats?.bounced || 0)}`);
  lines.push(`- **Complained (spam):** ${complained}`);
  lines.push(`- **Unsubscribed:** ${unsubCount}`);
  lines.push(`- **Failed sends:** ${failed}`);
  lines.push(`- **Suppressed by provider:** ${suppressed}`);
  lines.push(`- **Unknown status (API miss):** ${unknown}`);
  lines.push('');

  // ─── Status breakdown ───
  lines.push('### cold_email_state status breakdown');
  lines.push('');
  lines.push('| Status | Count |');
  lines.push('|--------|-------|');
  for (const [status, count] of Object.entries(statusCounts).sort((a, b) => b[1] - a[1])) {
    lines.push(`| ${status} | ${count} |`);
  }
  lines.push('');

  // ─── Notes ───
  lines.push('## Notes');
  lines.push('');
  lines.push('- Open rate = emails where `last_event` is "opened" or "clicked" (clicked implies opened).');
  lines.push('- "Resolved" emails = those with a known Resend event (excludes unknown/API lag).');
  lines.push('- `last_event` shows only the most recent event — an email opened then clicked shows as "clicked".');
  lines.push('- Sign-up matching: auth.users emails cross-referenced with cold_email_state emails.');
  lines.push('- For real-time open/click tracking with timestamps, set up Resend webhooks → Supabase `email_events` table.');
  if (!POSTHOG_PERSONAL_KEY) {
    lines.push('- PostHog integration disabled (no POSTHOG_PERSONAL_API_KEY in .env). Set it to enable PostHog sign-up event tracking.');
  }
  lines.push('');

  // ─── Write output ───
  const outputPath = path.join(OUTPUT_DIR, `outreach-metrics-${TODAY}.md`);
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  fs.writeFileSync(outputPath, lines.join('\n'));

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`[outreach-metrics] Report saved to ${outputPath} (${elapsed}s)`);
  console.log(`[outreach-metrics] Summary: ${totalSends} sent, ${delivered} delivered (${pct(delivered, totalSends)}), ${openedOrClicked} opened (${pct(openedOrClicked, totalSends)}), ${clicked} clicked, ${signupsFromEmail.length} sign-ups from email`);

  // Print summary for launchd log
  console.log('\n' + lines.join('\n'));
}

main().catch(err => {
  console.error('[outreach-metrics] Fatal error:', err);
  process.exit(1);
});
