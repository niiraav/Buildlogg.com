import posthog from 'posthog-js';

const POSTHOG_KEY = import.meta.env.VITE_POSTHOG_KEY || '';
const POSTHOG_HOST = import.meta.env.VITE_POSTHOG_HOST || 'https://eu.posthog.com';

let isReady = false;

export function initAnalytics() {
  if (!POSTHOG_KEY) {
    console.warn('[Analytics] PostHog key not set — events will be no-ops');
    return;
  }
  try {
    // Cast to `any` because this version's TypeScript types don't include
    // the newer remote-disable options (they still work at runtime).
    const posthogConfig: any = {
      api_host: POSTHOG_HOST,
      person_profiles: 'identified_only',
      capture_pageview: false, // SPA — we capture manually if needed
      autocapture: false,      // Keep noise low; we fire explicit events
      // Disable remote features that load extra scripts and hit /decide.
      // This prevents ad-blockers/content-blockers from logging errors for
      // dead-clicks-autocapture.js and the PostHog decide endpoint.
      dead_clicks_autocapture: false,
      advanced_disable_decide: true,
      advanced_disable_feature_flags: true,
    };
    posthog.init(POSTHOG_KEY, posthogConfig);
    isReady = true;
  } catch (err) {
    // Ad-blockers or strict privacy extensions may block the PostHog host
    // before init completes. Analytics should never break the app.
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
