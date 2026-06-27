import posthog from 'posthog-js';

const POSTHOG_KEY = import.meta.env.VITE_POSTHOG_KEY || '';
const POSTHOG_HOST = import.meta.env.VITE_POSTHOG_HOST || 'https://eu.posthog.com';

let isReady = false;

export async function initAnalytics() {
  if (!POSTHOG_KEY) {
    console.warn('[Analytics] PostHog key not set — events will be no-ops');
    return;
  }

  // No pre-flight check — the /e/ endpoint returns 400 for any non-PostHog
  // request (HEAD, POST, GET), which caused false positives in the pre-flight.
  // Instead, we initialize PostHog unconditionally and suppress network errors
  // silently in the loaded() callback. If an ad-blocker blocks requests,
  // PostHog's events fail silently without console spam.
  try {
    posthog.init(POSTHOG_KEY, {
      api_host: POSTHOG_HOST,
      person_profiles: 'identified_only',
      capture_pageview: false,
      autocapture: false,
      dead_clicks_autocapture: false,
      advanced_disable_decide: true,
      advanced_disable_feature_flags: true,
      // Disable opt-out caching to avoid stale state
      disable_session_recording: true,
      // Reduce retry attempts — if the first event fails, don't spam the console
      loaded: (ph: any) => {
        // Override the internal retry mechanism to fail fast
        // PostHog stores events in a queue and retries failed sends.
        // We patch the send function to catch network errors silently.
        if (ph._send_request) {
          const originalSend = ph._send_request.bind(ph);
          ph._send_request = function(...args: any[]) {
            return originalSend(...args).catch(() => {
              // Network error (ad-blocker, offline, etc) — silently drop
              return Promise.resolve();
            });
          };
        }
        // Also patch the retriableRequest if it exists
        if (ph._retriableRequest) {
          const originalRetry = ph._retriableRequest.bind(ph);
          ph._retriableRequest = function(...args: any[]) {
            try {
              const result = originalRetry(...args);
              if (result && typeof result.catch === 'function') {
                return result.catch(() => Promise.resolve());
              }
              return result;
            } catch {
              return Promise.resolve();
            }
          };
        }
      },
    } as any);
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

/* ─── P2-01: Quote Follow-Up Analytics ─── */

export function captureQuoteFollowUpShown(data: { jobId: string; nudgeCount: number }) {
  capture('quote_follow_up_shown', data);
}
export function captureQuoteFollowUpSent(data: { jobId: string; nudgeCount: number; method: 'whatsapp' | 'sms' }) {
  capture('quote_follow_up_sent', data);
}
export function captureQuoteFollowUpSnoozed(data: { jobId: string; duration: string }) {
  capture('quote_follow_up_snoozed', data);
}
export function captureQuoteFollowUpResponded(data: { jobId: string }) {
  capture('quote_follow_up_responded', data);
}

/* ─── P2-02: Recurring Job Analytics ─── */

export function captureRecurringJobCreated(data: { interval: string; hasSuggestedMonth: boolean }) {
  capture('recurring_job_created', data);
}
export function captureRecurringReminderShown(data: { recurringId: string; daysUntilDue: number }) {
  capture('recurring_reminder_shown', data);
}
export function captureRecurringReminderActed(data: { recurringId: string; action: 'call' | 'whatsapp' | 'done' | 'no_response' | 'cancel' }) {
  capture('recurring_reminder_acted', data);
}
export function captureRecurringJobDormant(data: { recurringId: string }) {
  capture('recurring_job_dormant', data);
}

/* ─── P2-03: Payment Chase Analytics ─── */

export function capturePaymentChaseShown(data: { jobId: string; stage: string }) {
  capture('payment_chase_shown', data);
}
export function capturePaymentChaseSent(data: { jobId: string; stage: string; method: 'whatsapp' | 'sms' }) {
  capture('payment_chase_sent', data);
}
export function capturePaymentChasePaused(data: { jobId: string; reason: string }) {
  capture('payment_chase_paused', data);
}
export function capturePaymentChaseResumed(data: { jobId: string }) {
  capture('payment_chase_resumed', data);
}

/* ─── W2-1: Booking Page Analytics ─── */

export function captureBookingPageEnabled() {
  capture('booking_page_enabled');
}
export function captureBookingPageDisabled() {
  capture('booking_page_disabled');
}
export function captureBookingSlugChanged(data: { hadSlug: boolean; hasSlug: boolean }) {
  capture('booking_slug_changed', data);
}

/* ─── W2-3: Referral Analytics ─── */

export function captureReferralSourceTracked(data: { source: string; context: 'in_app' | 'online' }) {
  capture('referral_source_tracked', data);
}
export function captureReferralCardViewed() {
  capture('referral_card_viewed');
}
