import posthog from 'posthog-js';

const POSTHOG_KEY = import.meta.env.VITE_POSTHOG_KEY || '';
const POSTHOG_HOST = import.meta.env.VITE_POSTHOG_HOST || 'https://eu.posthog.com';

let isReady = false;

export async function initAnalytics() {
  if (!POSTHOG_KEY) {
    console.warn('[Analytics] PostHog key not set — events will be no-ops');
    return;
  }

  // Check if the PostHog event endpoint is reachable before initializing.
  // Ad-blockers block POST requests to /e/ at the network level (ERR_BLOCKED_BY_CLIENT).
  // We test with a real POST — if it throws OR returns type:'error', the endpoint is blocked.
  let posthogBlocked = false;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(`${POSTHOG_HOST}/e/`, {
      method: 'POST',
      signal: controller.signal,
      mode: 'no-cors',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    clearTimeout(timeout);
    // no-cors returns type:'opaque' if the request went through.
    // type:'error' means it was blocked even though fetch didn't throw.
    if (res.type === 'error') posthogBlocked = true;
  } catch {
    posthogBlocked = true;
  }
  if (posthogBlocked) {
    console.warn('[Analytics] PostHog blocked by client (ad-blocker or privacy extension). Analytics disabled.');
    isReady = false;
    return;
  }

  try {
    const posthogConfig: any = {
      api_host: POSTHOG_HOST,
      person_profiles: 'identified_only',
      capture_pageview: false,
      autocapture: false,
      dead_clicks_autocapture: false,
      advanced_disable_decide: true,
      advanced_disable_feature_flags: true,
      // Limit retries to prevent console spam if events are blocked after init
      loaded: (posthog: any) => {
        // Override the retry mechanism to fail fast on network errors
        if (posthog._retriableRequest) {
          const original = posthog._retriableRequest;
          posthog._retriableRequest = function(...args: any[]) {
            try {
              return original.apply(this, args);
            } catch (e) {
              // Silently fail on network errors
              return Promise.resolve();
            }
          };
        }
      },
    };
    posthog.init(POSTHOG_KEY, posthogConfig);
    isReady = true;
  } catch (err) {
    console.warn('[Analytics] PostHog init failed; events will be no-ops.', err);
    isReady = false;
  }
}

function safePostHogCall<T>(fn: () => T): T | undefined {
  if (!isReady) return undefined;
  try {
    return fn();
  } catch (err) {
    // Swallow analytics failures so the app keeps working when blocked.
    if (import.meta.env.DEV) {
      console.warn('[Analytics] PostHog call failed:', err);
    }
    return undefined;
  }
}

export function identifyUser(userId: string, traits?: Record<string, unknown>) {
  safePostHogCall(() => posthog.identify(userId, traits));
}

export function resetUser() {
  safePostHogCall(() => posthog.reset());
}

export function capture(event: string, properties?: Record<string, unknown>) {
  safePostHogCall(() => posthog.capture(event, properties));
}

/* ─── Funnel events (typed) ─── */

export function captureUserSignedUp(trade?: string, source?: string) {
  capture('user_signed_up', { trade, source: source || 'organic' });
}

export function captureJobCreated(entryPoint: 'missed_call' | 'new_quote') {
  capture('job_created', { entry_point: entryPoint });
}

export function captureQuoteSent(sendMethod: 'whatsapp' | 'sms' | 'copy') {
  capture('quote_sent', { send_method: sendMethod });
}

export function captureJobMarkedPaid(daysSinceQuoteSent?: number | null) {
  capture('job_marked_paid', {
    days_since_quote_sent: daysSinceQuoteSent ?? null,
  });
}

export function captureUserSignedIn() {
  capture('user_signed_in');
}

export function captureJobBooked() {
  capture('job_booked');
}

export function captureJobStarted() {
  capture('job_started');
}

export function captureJobCancelled(reason: 'customer_cancelled' | 'dave_cancelled') {
  capture('job_cancelled', { reason });
}

export function capturePlanUpgraded(fromTrigger: 'cap_hit' | 'value_prompt') {
  capture('plan_upgraded', { from_trigger: fromTrigger });
}

/* ─── MVP Feature Analytics ─── */

export function captureCustomItemAdded() {
  capture('custom_item_added');
}

export function captureCustomItemUsed() {
  capture('custom_item_used');
}

export function capturePhotoAdded() {
  capture('photo_added');
}

export function captureVoiceInputUsed() {
  capture('voice_input_used');
}

export function capturePaymentChase(method: 'whatsapp' | 'sms') {
  capture('payment_chase', { method });
}

export function captureMaterialAdded() {
  capture('material_added');
}

export function captureActivityViewed() {
  capture('activity_viewed');
}

/* ─── Anti-Forgetting System events ─── */

import type { StaleType } from './jobStaleness';

export function captureStaleJobNudgeShown(data: { jobId: string; staleType: StaleType; elapsedHours: number }) {
  capture('stale_job_nudge_shown', data);
}

export function captureStaleJobNudgeTapped(data: { jobId: string; staleType: StaleType }) {
  capture('stale_job_nudge_tapped', data);
}

export function captureStaleJobNudgeDismissed(data: { jobId: string; staleType: StaleType; multiDaySet: boolean }) {
  capture('stale_job_nudge_dismissed', data);
}

export function captureOvernightAutoComplete(data: { count: number }) {
  capture('overnight_auto_complete', data);
}

export function captureNewJobInterceptShown(data: { oldJobId: string }) {
  capture('new_job_intercept_shown', data);
}

export function captureNewJobInterceptMarkDone(data: { oldJobId: string }) {
  capture('new_job_intercept_mark_done', data);
}

export function captureNewJobInterceptLeaveInProgress(data: { oldJobId: string }) {
  capture('new_job_intercept_leave_in_progress', data);
}

export function captureCompletionPhotoTaken(data: { jobId: string }) {
  capture('completion_photo_taken', data);
}

export function captureCompletionPhotoSkipped(data: { jobId: string }) {
  capture('completion_photo_skipped', data);
}

export function captureTradeTemplatesSeeded(data: { trade: string; count: number }) {
  capture('trade_templates_seeded', data);
}

export function captureTemplateUsed(data: { templateId: string; category: string; context: string }) {
  capture('template_used', data);
}
export function captureTemplateCreated(data: { category: string }) {
  capture('template_created', data);
}
export function captureTemplateEdited(data: { templateId: string }) {
  capture('template_edited', data);
}

export function capturePDFGenerated(data: { jobId: string; type: 'quote' | 'invoice'; hasLogo: boolean; isVat: boolean }) {
  capture('pdf_generated', data);
}
export function capturePDFShared(data: { jobId: string; type: 'quote' | 'invoice'; method: 'whatsapp' | 'download' | 'share' }) {
  capture('pdf_shared', data);
}

// P2-04: Vertical config
export function captureVerticalSelected(data: { businessType: string; specialty?: string; source: string }) {
  capture('vertical_selected', data);
}

// P2-05: Scheduling
export function captureConflictDetected(data: { jobId: string; conflictCount: number; action: 'keep_both' | 'reschedule' | 'cancel' }) {
  capture('conflict_detected', data);
}

// P2-06: Customer CRM
export function captureCustomerSearched(data: { resultCount: number }) {
  capture('customer_searched', data);
}
export function captureCustomerDetailViewed(data: { customerId: string; jobCount: number }) {
  capture('customer_detail_viewed', data);
}
export function captureCustomersMerged(data: { sourceJobCount: number }) {
  capture('customers_merged', data);
}
export function captureCustomerReengaged(data: { customerId: string; method: 'call' | 'whatsapp' }) {
  capture('customer_reengaged', data);
}

// P2-07: Dashboard
export function captureDashboardViewed() {
  capture('dashboard_viewed');
}
export function captureDashboardCardTapped(data: { card: string }) {
  capture('dashboard_card_tapped', data);
}
export function captureDataExported(data: { format: string; month: string }) {
  capture('data_exported', data);
}

// P2-08: Google Reviews
export function captureReviewRequestShown(data: { jobId: string }) {
  capture('review_request_shown', data);
}
export function captureReviewRequestSent(data: { jobId: string }) {
  capture('review_request_sent', data);
}
export function captureReviewRequestSkipped(data: { jobId: string }) {
  capture('review_request_skipped', data);
}
