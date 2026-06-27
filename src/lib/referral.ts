/**
 * Referral engine — canonical source list, label helpers, booking URL helper.
 * Shared between the Quote flow (in-app capture), the Dashboard (breakdown),
 * and the Settings booking page (link/QR generation).
 *
 * IMPORTANT: the option keys here MUST match the <option value="…"> list
 * hard-coded in functions/book/[[slug]].js so in-app, online, and dashboard
 * all aggregate against the same source keys. Drift guard: update both files
 * when adding/removing a source.
 */

export interface ReferralSourceOption {
  value: string;        // stored in referral_source column
  label: string;        // UI label + dashboard label
  hasDetail: boolean;   // show a free-text "detail" input when selected
  detailPlaceholder?: string;
}

/**
 * Canonical referral sources.
 * Keys must match functions/book/[[slug]].js referral <option> values:
 *   google, instagram, recommended, saw_work, other
 */
export const REFERRAL_SOURCES: ReferralSourceOption[] = [
  { value: 'google',       label: 'Google / Search',           hasDetail: false },
  { value: 'instagram',    label: 'Instagram / Facebook',      hasDetail: false },
  { value: 'recommended',  label: 'Recommended by someone',    hasDetail: true,  detailPlaceholder: 'Who recommended you?' },
  { value: 'saw_work',     label: 'Saw their work',            hasDetail: false },
  { value: 'other',        label: 'Other',                     hasDetail: true,  detailPlaceholder: 'Tell us more' },
];

/** Fast lookup: value -> label. Tolerates unknown future values gracefully. */
export const REFERRAL_LABEL: Record<string, string> = Object.fromEntries(
  REFERRAL_SOURCES.map((s) => [s.value, s.label]),
);

/** Human-readable label for a stored referral_source value (falls back to raw value). */
export function referralLabel(value?: string | null): string {
  if (!value) return 'Unknown';
  return REFERRAL_LABEL[value] || value;
}

/** Find an option by value (for hasDetail checks in the UI). */
export function referralOption(value?: string | null): ReferralSourceOption | undefined {
  if (!value) return undefined;
  return REFERRAL_SOURCES.find((s) => s.value === value);
}

/**
 * Build the public booking page URL for a given slug.
 * The app is mounted at basename="/app"; the booking page lives at the
 * site root /book/:slug (served by the Cloudflare Pages Function).
 * In production both share one origin, so window.location.origin is correct.
 * VITE_SITE_URL is an optional override (e.g. for dev proxy testing).
 */
export function bookingPageUrl(slug: string): string {
  const base = (import.meta.env.VITE_SITE_URL || window.location.origin).replace(/\/$/, '');
  return `${base}/book/${encodeURIComponent(slug)}`;
}
