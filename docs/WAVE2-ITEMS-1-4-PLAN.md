# Wave 2 — Items 1‑4: End‑to‑End Build Plan

> **Scope:** Settings booking page UI (1), Custom Items public/duration UI (2), in‑app referral
> source on the Quote flow (3), referral breakdown on the Dashboard (4).
> **Out of scope (running in parallel, need your input):** 5 (booking 500 / env+SQL), 6 (Stripe
> architecture), 7 (seed slug + public items to test end‑to‑end).
>
> **Headline:** The Supabase schema **and** the Cloudflare booking Function are already built and
> merged. Items 1‑4 are ~95% client UI + a small aggregation helper. No new tables required.

---

## 0. What already exists (do not rebuild)

| Area | Status | Evidence |
|---|---|---|
| `profiles` booking columns | ✅ migrated | `20260627000001_booking_funnel.sql`: `booking_slug`, `booking_enabled` (default false), `booking_buffer_hours` (default 24), `booking_show_phone` (default true), `stripe_account_id`, `stripe_connected`. Unique index on `booking_slug`. |
| `custom_items` public/duration | ✅ migrated | `20260627000002_create_missing_tables.sql`: `is_public` (default false), `duration_minutes` (default 60). |
| `jobs` referral columns | ✅ migrated | `20260627000001`: `referral_source`, `referral_detail`. |
| `booking_requests` table | ✅ migrated | includes `referral_source`, `referral_detail`, `status`, `accepted_job_id`, rate‑limit indexes. |
| Dexie types | ✅ present | `src/lib/db.ts` — `Profile`, `CustomItem`, `Job`, `BookingRequest` all carry the new fields. |
| Booking page Function | ✅ built | `functions/book/[[slug]].js` — renders page, computes slots from first public item's `duration_minutes` + `booking_buffer_hours`, shows/hides phone via `booking_show_phone`, captures `referral_source`/`referral_detail`, inserts `booking_requests` with double‑book guard + 3/hr rate limit. **Needs `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` env (item 5).** |
| Sync plumbing | ✅ works | `src/lib/sync.ts` `pushToSupabase` sends whatever fields are in the queue payload (no whitelist) for `profiles`, `custom_items`, `booking_requests`. |
| Booking inbox (accept/reject) | ⚠️ stub | `src/lib/booking.ts` `acceptBookingRequest` throws "Not implemented". Home already renders a `booking_request` sheet. (Belongs to 5‑7 track.) |

**Implication:** Items 1‑4 write to columns that already sync. The moment item 5 lands (env+SQL on
Preview), the booking page is live and items 1‑2 feed it; items 3‑4 feed the dashboard.

---

## 1. Cross‑cutting requirements (do these first, they unblock all four)

### 1a. Canonical referral source list — one source of truth
Create `src/lib/referral.ts`. Must match the option list already hard‑coded in
`functions/book/[[slug]].js` so in‑app, online, and dashboard all aggregate against the same keys.

```ts
export interface ReferralSourceOption {
  value: string;        // stored in referral_source
  label: string;        // UI label + dashboard label
  hasDetail: boolean;   // show a free-text "detail" input when selected
  detailPlaceholder?: string;
}

export const REFERRAL_SOURCES: ReferralSourceOption[] = [
  { value: 'google',       label: 'Google / Search',           hasDetail: false },
  { value: 'instagram',    label: 'Instagram / Facebook',      hasDetail: false },
  { value: 'recommended',  label: 'Recommended by someone',    hasDetail: true,  detailPlaceholder: 'Who recommended you?' },
  { value: 'saw_work',     label: 'Saw their work',            hasDetail: false },
  { value: 'other',        label: 'Other',                     hasDetail: true,  detailPlaceholder: 'Tell us more' },
];

export const REFERRAL_LABEL: Record<string, string> =
  Object.fromEntries(REFERRAL_SOURCES.map(s => [s.value, s.label]));

export function referralLabel(value?: string | null): string {
  if (!value) return 'Unknown';
  return REFERRAL_LABEL[value] || value; // tolerate unknown future values gracefully
}
```

> **Drift guard:** the Function is server‑side JS and cannot import from `src/`. Add a comment
> block at the top of `functions/book/[[slug]].js` listing these same keys, and vice‑versa. Adding
> a new source = update both files. (A future cleanup could serve the list from a tiny RPC.)

### 1b. Site URL env var (needed for the booking link + QR)
The app is mounted at `basename="/app"`; the public booking page lives at the **site root**
`/book/:slug`. The app cannot reliably derive the root origin from `window.location` (dev vs prod,
`/app` suffix). Add to `.env` / `.env.example`:

```
VITE_SITE_URL=https://buildlogg.com
```

Helper in `src/lib/referral.ts` (or `src/lib/booking.ts`):

```ts
export function bookingPageUrl(slug: string): string {
  const base = (import.meta.env.VITE_SITE_URL || window.location.origin).replace(/\/$/, '');
  return `${base}/book/${encodeURIComponent(slug)}`;
}
```

Dev note: under `vite dev` the `/book/*` Function does not run unless proxied (`vite.config.proxy.ts`
exists). The preview link will 404 in pure dev — that's expected; test the page via `wrangler pages dev`
or Preview deploy. Document this in the Settings screen as a tooltip.

### 1c. QR code dependency
No QR lib is installed. Add `qrcode` (small, dep‑free SVG/canvas output, works offline — important
because the QR encodes a public URL that must render with no network):

```
npm i qrcode && npm i -D @types/qrcode
```

Render to an `<canvas>` ( crisp, downloadable PNG ) via `QRCode.toCanvas(canvasEl, url, opts)`.

### 1d. Analytics events (spec'd in P2‑12 doc, not yet implemented)
Add to `src/lib/analytics.ts`:
- `captureBookingPageEnabled()` / `captureBookingPageDisabled()`
- `captureBookingSlugChanged()` (properties: hadSlug, hasSlug)
- `captureReferralSourceTracked({ source, context: 'in_app' | 'online' })` — fire from item 3.
- `captureReferralCardViewed()` — fire when the dashboard referral card renders with data.

---

## 2. Item 1 — Settings: booking page setup

### 2.1 Goal
Let a merchant configure their public booking page: enable it, pick a URL slug, set the lead‑time
buffer, choose whether their phone number is visible, and get a QR code + copyable/previewable link.

### 2.2 Files
- **New:** `src/screens/Settings/Booking.tsx` (dedicated screen, matches the `custom-items` /
  `message-templates` separate‑screen pattern).
- **Edit:** `src/screens/Settings/index.tsx` — add a nav row "Online booking" → `/settings/booking`
  in a new "Grow" section between "My items" and "More".
- **Edit:** `src/App.tsx` — add `<Route path="/settings/booking" element={<Booking/>} />`.
- **Edit:** `.env.example` — add `VITE_SITE_URL`.
- **New migration:** `supabase/migrations/20260627000003_booking_slug_check.sql` — a `SECURITY DEFINER`
  function so the client can check slug uniqueness across **other** merchants (RLS only lets a user
  read their own `profiles` row, so a pure client check cannot see taken slugs).

```sql
-- Public slug availability check (bypasses RLS safely: returns boolean only)
create or replace function is_booking_slug_taken(p_slug text)
returns boolean language sql security definer set search_path = public as $$
  select exists(select 1 from profiles where booking_slug = p_slug);
$$;
grant execute on function is_booking_slug_taken(text) to anon, authenticated;
```

### 2.3 UI spec (`Booking.tsx`)
Header: back chevron + "Online booking" (same sticky header as `CustomItems.tsx`).

Section **Status** (white card):
- Master toggle **"Booking page is live"** (`booking_enabled`). Uses the existing toggle pattern
  (sliding knob, `bg-brand-black` when on). Subtext: "When off, your /book/… page shows 'not found'."
- When ON and slug set: a green status row "Live at buildlogg.com/book/dave‑plumbing" with an
  external‑link icon.

Section **Page address** (white card):
- Label "Your booking link".
- Slug input: prefix chip `buildlogg.com/book/` + text field. Allowed chars: `[a-z0-9-]`, lowercase
  auto‑forced, 3–40 chars, no leading/trailing/double hyphens. Debounced (400ms) format validation
  + uniqueness check via `supabase.rpc('is_booking_slug_taken', { p_slug })` (skip if unchanged from
  current). Show inline states: ⏳ checking, ✓ available, ✗ "That link is taken", ⚠ invalid format.
- Save behaviour: slug writes through `updateProfile({ booking_slug })` on blur / "Save link" button.
  Because the unique constraint also enforces server‑side, treat a sync error containing
  `duplicate key` / `unique` as "slug taken" and surface it (the sync layer currently swallows
  errors to `_sync_status='error'` — see edge case 2.6c).

Section **Availability** (white card):
- "Minimum notice before bookings" (`booking_buffer_hours`). Present as a select of friendly
  options mapping to hours: *Same day (0)*, *2 hours*, *4 hours*, *12 hours*, *1 day (24)*,
  *2 days (48)*, *3 days (72)*, *1 week (168)*. Store the integer hours. Default 24.
- Subtext: "Clients can't book a slot sooner than this."

Section **Privacy** (white card):
- Toggle **"Show my phone number on the page"** (`booking_show_phone`, default true). Subtext:
  "Lets clients call you directly. Turn off to keep bookings online only."

Section **Share** (white card, only when `booking_enabled && slug`):
- QR `<canvas>` encoding `bookingPageUrl(slug)`.
- Buttons: **Copy link** (clipboard, `showSuccess('Link copied')`), **Open page** (`window.open(url,
  '_blank')`), **Download QR** (canvas → PNG download: `booking-qr-<slug>.png`), **Share link**
  (`navigator.share` where available, fallback to copy).
- Empty/preview hint when disabled: a muted placeholder QR outline + "Enable the page and choose a
  link to see your QR."

### 2.4 Data flow
All writes go through the existing `updateProfile(Partial<Profile>)` (Dexie `profiles.update` +
`sync_queue` `update`). No new store. Reads from `db.profiles.get(userId)` on mount (already loaded
by Settings; pass `profile` as prop or re‑read).

### 2.5 Edge cases & scenarios
- **a. Slug left blank while enabled.** Page 404s (Function requires `booking_enabled=eq.true` AND a
  matching `booking_slug`). UI should show a warning "Pick a link before going live" and ideally
  block enabling until a slug is saved.
- **b. Slug uniqueness can't be checked client‑side without the RPC** (RLS). Hence migration 2.2.
  Until the RPC is applied, fall back to optimistic save + surface sync `duplicate key` errors.
- **c. Sync error surfacing.** `sync.ts` marks `_sync_status='error'` but doesn't notify the UI.
  For the slug (the only field with a server constraint), after `updateProfile` we can poll
  `db.profiles.get(userId)` `_sync_status` shortly after, or simpler: attempt a direct
  `supabase.from('profiles').update({booking_slug}).eq('id',userId)` and read `error` — if
  duplicate, revert the local slug and show "taken". Recommended: do the direct Supabase write for
  the slug only (authoritative + instant), and still queue for Dexie consistency.
- **d. Changing slug while live.** Old slug immediately 404s; anyone with the old QR/link gets "not
  found". Show a confirm sheet: "Changing your link breaks the old one. Continue?"
- **e. Disabling the page.** `booking_enabled=false` → Function returns 404. Existing
  `booking_requests` remain (status pending/accepted). No data loss.
- **f. Buffer = 0.** Slots can start "now" — the Function still only shows 9–17 working hours and
  the next 14 days, so 0 is safe but may show same‑day slots. Validate integer ≥ 0, ≤ 168.
- **g. Phone hidden but no services public.** Page shows "hasn't set up their services yet" with no
  contact CTA — a dead end. Cross‑link: if `booking_show_phone=false` and zero public items, show a
  Settings warning "Your page has no way for clients to reach you — add public items or show your
  number."
- **h. QR must encode the public root URL, not `/app/...`.** Use `bookingPageUrl()` (1b).
- **i. Entitlements.** No `booking_page` feature exists. **Product decision (see §7):** keep free
  for beta (no `ProBadge`). If gated later, the Function must also check `subscription_status`
  server‑side — UI‑only gating is leaky.
- **j. Two devices.** `initialSync` pulls `profiles` `select('*')`, so booking config syncs across
  devices on login. Good.

### 2.6 Acceptance criteria
- [ ] Nav row "Online booking" opens the screen.
- [ ] Toggling live on/off updates `booking_enabled` and syncs.
- [ ] Slug validation rejects invalid format live; taken slug shows ✗ via RPC.
- [ ] Buffer select persists `booking_buffer_hours`.
- [ ] Phone toggle persists `booking_show_phone`.
- [ ] QR renders for the public URL and downloads as PNG; copy/share/open work.
- [ ] Enabling with no slug shows a blocking warning.
- [ ] Changing a live slug shows a confirm sheet.

---

## 3. Item 2 — Custom Items: `is_public` + `duration_minutes`

### 3.1 Goal
Let a merchant mark which saved items appear on the booking page and how long each takes, so the
booking Function has a service catalogue to render and to size slots.

### 3.2 Files
- **Edit:** `src/screens/Settings/CustomItems.tsx` — make each item row tappable to expand an inline
  config; add the toggle + duration control; update through Dexie + sync queue.
- (No schema/type changes — already present in `db.ts` and Supabase.)

### 3.3 UI spec
Keep the existing list + bottom add‑bar exactly as‑is (fast add of description + amount). Change
each list row from display‑only to **expandable**:
- Row (collapsed): description · £amount · a small badge "On booking page" (green) when
  `is_public`, and a chevron. Delete (trash) stays.
- Row (expanded, on tap): 
  - Toggle **"Show on booking page"** (`is_public`).
  - **"Duration"** control — a compact select of `15 / 30 / 45 / 60 / 90 / 120 / 180 min` plus a
    custom number input (min 15, step 15, max 480). Store `duration_minutes`. Default 60.
  - Helper text: "Used to size time slots on your booking page."
- The bottom add‑bar keeps creating items with `is_public: false, duration_minutes: 60` (defaults);
  users expand to publish. (Keeps add friction low — matches "add fast, configure after".)

### 3.4 Data flow
New helper in `CustomItems.tsx`:

```ts
async function updateItem(id: string, patch: Partial<CustomItem>) {
  const n = new Date().toISOString();
  await db.custom_items.update(id, { ...patch, updated_at: n, _sync_status: 'pending' });
  await db.sync_queue.add({
    operation: 'update', table_name: 'custom_items', record_id: id,
    payload: { ...patch, updated_at: n }, created_at: n, retry_count: 0,
  });
  setItems(prev => prev.map(i => i.id === id ? { ...i, ...patch } : i));
}
```

`addItem` already queues an `insert` with the full record (includes `is_public`/`duration_minutes`
once we add the defaults to the constructed object — **fix:** the current `addItem` builds `item`
without `is_public`/`duration_minutes`; add `is_public: false, duration_minutes: 60` so the insert
payload is complete).

### 3.5 Edge cases & scenarios
- **a. Booking Function uses only the FIRST public item's `duration_minutes` for slot sizing**
  (`const sd = services[0].duration_minutes||60`), even though each card displays its own duration.
  So per‑service duration is shown but not used for slot math. **Not blocking item 2** (we just store
  it), but flag for a Function follow‑up: size slots per selected service, or use the max duration.
- **b. Amount = 0.** Function renders "Price on enquiry" — valid (e.g. "Free quote"). Keep allowed.
- **c. An item with `is_public` but no `duration_minutes`.** Defaults to 60 in the Function and UI.
  Coerce null → 60 on read.
- **d. Zero public items.** Booking page shows the "no services yet" state (item 1 edge 2.5g).
- **e. `custom_items` is NOT pulled down by `initialSync`** (only profiles, customers, jobs,
  line_items, work_log, payments, job_photos, booking_requests are). They sync **up** fine, so the
  Function sees them, but a second device won't see items created on the first until we extend
  `initialSync`. **Pre‑existing gap.** Recommended follow‑up: add `custom_items` (and
  `material_items`, `message_templates`) to `initialSync`'s `Promise.all`. Note in plan, don't
  block items 1‑4.
- **f. Toggling public on many items rapidly.** Each toggle queues a separate `update` — fine, sync
  drains in order. No debounce needed for correctness; optional 300ms debounce to reduce queue size.
- **g. Delete a public item.** Row removed locally + `delete` queued; Function stops showing it
  after sync. Any already‑submitted `booking_requests` for it keep their `service_description`
  snapshot (denormalised at submit), so history is safe.

### 3.6 Acceptance criteria
- [ ] Tapping a row expands config; toggling "Show on booking page" persists + syncs.
- [ ] Duration select/input persists `duration_minutes` (coerced 15–480, default 60).
- [ ] New items get `is_public:false, duration_minutes:60` in the insert payload.
- [ ] Collapsed row shows a green "On booking page" badge when public.
- [ ] After sync, `GET /book/<slug>` lists exactly the public items (verified via Preview once 5 lands).

---

## 4. Item 3 — Referral: in‑app referral source in the Quote flow

### 4.1 Goal
When a merchant starts a new quote, capture (optionally) "How did they find you?" and store it on
the **job** as `referral_source` (+ `referral_detail`), so the dashboard can attribute acquisition.

### 4.2 Files
- **Edit:** `src/screens/Quote/CustomerDetails.tsx` — add the dropdown + conditional detail field.
- **Edit:** `src/screens/Quote/index.tsx` — extend `handleCustomerDetailsComplete` to write
  `referral_source`/`referral_detail` onto the job.
- **Edit:** `src/lib/analytics.ts` — add `captureReferralSourceTracked`.

### 4.3 UI spec (`CustomerDetails.tsx`)
Add a new block **below Address**, still inside the "Customer" group, labelled
**"How did they find you?"** with an "(optional)" suffix (same label style as Address).
- A `<select>` populated from `REFERRAL_SOURCES` (1a), first option `""` → "— Optional —".
- When the selected option has `hasDetail`, reveal a text input below (placeholder =
  `detailPlaceholder`). For `recommended` → "Who recommended you?"; for `other` → free text.
- No effect on `canContinue` (name + valid phone still gate the Continue button) — referral is
  purely optional and never blocks the flow.
- State: `referralSource` (`''` default), `referralDetail` (`''`).

`onComplete` signature changes from
`{ id, name, phone, address? }` → `{ id, name, phone, address?, referralSource?, referralDetail? }`,
passing `referralSource: referralSource || undefined` (omit when empty so we don't overwrite with
empty string on reuse).

### 4.4 Data flow (`Quote/index.tsx` `handleCustomerDetailsComplete`)
Two branches today:
1. **Existing enquiry job reused** (`existingJobs.length > 0`): only set referral if the job doesn't
   already have one (`if (!existing.referral_source && data.referralSource) update`).
2. **New job created**: include `referral_source` + `referral_detail` in the `db.jobs.add` object
   **and** in the `sync_queue` insert payload.

Helper:

```ts
async function setJobReferral(jobId: string, source?: string, detail?: string) {
  if (!source) return;
  const n = now();
  await db.jobs.update(jobId, { referral_source: source, referral_detail: detail, updated_at: n, _sync_status: 'pending' });
  await db.sync_queue.add({
    operation: 'update', table_name: 'jobs', record_id: jobId,
    payload: { referral_source: source, referral_detail: detail, updated_at: n },
    created_at: n, retry_count: 0,
  });
}
```

Fire `captureReferralSourceTracked({ source, context: 'in_app' })` when a source is chosen and
Continue is pressed.

### 4.5 Edge cases & scenarios
- **a. Returning customer, existing enquiry job already has a source.** Do not overwrite (4.4.1).
  If the merchant wants to change it, that's a JobDetail edit (out of scope; note as follow‑up —
  JobDetail currently shows no referral field).
- **b. Returning customer, existing enquiry job has NO source, merchant picks one now.** Set it.
- **c. Duplicate‑phone customer selected mid‑flow (`selectDuplicate`).** Still a new enquiry job is
  created (or existing enquiry reused) — referral applies to the job, not the customer record. The
  referral is per‑enquiry, which is correct (a customer can find you differently each time).
- **d. Merchant skips the field.** `referralSource` is `undefined` → nothing written, job has
  `null` referral_source → counted as "Unknown" on the dashboard.
- **e. `recommended` selected but detail left blank.** Save `referral_source='recommended'`,
  `referral_detail=null`. Don't force detail.
- **f. Persisted quote draft restore.** `localStorage` quote state stores `step/customerId/jobId`
  only — referral is captured at the `customer_details` step before a job exists, so a refresh
  mid‑step loses the dropdown selection (acceptable: it's optional and pre‑job). No change needed.
- **g. Booking‑page‑originated enquiries.** Today the accept flow is a stub, so online bookings
  never become jobs yet. When item‑5/6 implement accept, **copy `booking_requests.referral_source`
  → the created `job.referral_source`** and set `booking_requests.accepted_job_id`. This keeps the
  dashboard from double‑counting (see 5.4). Note this as a hard requirement for the accept task.
- **h. Schema mismatch cleanup.** `Profile` in `db.ts` currently has dormant `referral_source`/
  `referral_detail` fields (not in any migration). Don't use them; referral lives on `jobs`/
  `booking_requests`. Optionally remove from the `Profile` interface to avoid confusion.

### 4.6 Acceptance criteria
- [ ] Dropdown shows the 5 canonical sources + "Optional"; detail field appears for
  `recommended`/`other`.
- [ ] Choosing a source and continuing writes `referral_source` (and `referral_detail`) to the job
  and sync queue; `captureReferralSourceTracked` fires.
- [ ] Skipping writes nothing.
- [ ] Reusing an existing enquiry job does not overwrite an existing source.

---

## 5. Item 4 — Referral: dashboard stats

### 5.1 Goal
A "Where customers find you" card on the Dashboard that breaks down acquisition by source, combining
in‑app quotes (jobs) and online bookings (booking_requests).

### 5.2 Files
- **Edit:** `src/lib/dashboard.ts` — add `getReferralBreakdown(userId)` + extend `DashboardStats`
  with `referral: { bySource: {source,label,count}[]; total: number; unknown: number }`.
- **Edit:** `src/screens/Dashboard/index.tsx` — render the card.
- Uses `referralLabel()` from `src/lib/referral.ts` (1a).

### 5.3 Aggregation logic (`dashboard.ts`)
All‑time (referral data is sparse; monthly would usually be empty). Union of two Dexie tables:

```ts
export async function getReferralBreakdown(userId: string): Promise<ReferralBreakdown> {
  const [jobs, bookings] = await Promise.all([
    db.jobs.where('user_id').equals(userId).filter(j => !j.is_sample).toArray(),
    db.booking_requests.where('merchant_id').equals(userId).toArray(),
  ]);

  // In-app: jobs with a referral_source.
  // Online: booking_requests with a referral_source, EXCLUDING those already converted to a job
  //         (accepted_job_id IS NOT NULL) so we don't double-count once accept ships (item 5/6).
  const counts: Record<string, number> = {};
  const bump = (s?: string) => { if (s) counts[s] = (counts[s] || 0) + 1; };

  let unknown = 0;
  jobs.forEach(j => j.referral_source ? bump(j.referral_source) : unknown++);
  bookings
    .filter(b => !b.accepted_job_id)   // not yet represented as a job
    .forEach(b => b.referral_source ? bump(b.referral_source) : unknown++);

  const bySource = Object.entries(counts)
    .map(([source, count]) => ({ source, label: referralLabel(source), count }))
    .sort((a, b) => b.count - a.count);

  return { bySource, total: bySource.reduce((s, r) => s + r.count, 0), unknown };
}
```

Wire into `getDashboardStats` (add `referral: await getReferralBreakdown(userId)` — it's cheap and
the dashboard already loads all jobs).

### 5.4 UI spec (`Dashboard/index.tsx`)
New full‑width card after the existing "Top job type" card, titled **"Where customers find you"**
with a small icon (e.g. `Users` or `Share2`). Body:
- If `total > 0`: a stacked list — each row `label · count · (xx% of total)`, sorted desc. Render a
  thin proportional bar per row (brand‑black fill on brand‑surface track) for quick scanning.
- If `total === 0 && unknown === 0`: muted empty state "No referral data yet — ask 'How did you find
  me?' when you start a quote." (non‑interactive).
- If `total === 0 && unknown > 0`: show "X customers · source not recorded" to nudge recording.
- Footer line: "All time · in‑app quotes + online bookings".
- Display‑only (no navigation) for MVP; fire `captureReferralCardViewed()` when rendered with data.

### 5.5 Edge cases & scenarios
- **a. Double‑counting once accept ships.** Handled by excluding `booking_requests` with
  `accepted_job_id` set (5.3). Today `acceptBookingRequest` is a stub so all bookings count —
  correct, no overlap yet. **Requirement for the accept task (5/6):** set `accepted_job_id` on the
  request AND copy `referral_source`/`referral_detail` to the new job.
- **b. Unknown future source values** (e.g. a source added to the Function but not to
  `REFERRAL_SOURCES`). `referralLabel()` falls back to the raw value, so the dashboard still shows
  it (no crash, no hidden data).
- **c. Sample jobs.** Excluded via `!j.is_sample` (matches the rest of the dashboard).
- **d. Expired/rejected bookings.** Counted if they have a source — they still represent an
  acquisition touch. If you'd rather count only `pending`+`accepted`, filter in 5.3 (product call;
  default = count all with a source).
- **e. Performance.** Dashboard already loads all jobs; `booking_requests` is small. One extra
  indexed read. Negligible.
- **f. Empty dashboard (new user).** Shows the empty state; no card‑shifting layout jank (card is
  full‑width and degrades to one muted line).
- **g. Monthly view.** Out of scope for MVP; the card is all‑time. Future: a SegmentedControl
  Month/All‑time on the card.

### 5.6 Acceptance criteria
- [ ] `getReferralBreakdown` returns counts from jobs + unconverted booking_requests.
- [ ] Card renders sorted rows with counts + percentages and proportional bars when data exists.
- [ ] Empty/unknown states render gracefully.
- [ ] Unknown source values display via `referralLabel` fallback (no crash).
- [ ] Sample jobs excluded.

---

## 6. Consolidated edge cases & scenarios (cross‑item)

| # | Scenario | Expected behaviour | Owner |
|---|---|---|---|
| X1 | Merchant enables page with no slug | Block + warning; page would 404 | 1 |
| X2 | Slug taken by another merchant | RPC `is_booking_slug_taken` → ✗; sync dup → revert + "taken" | 1 |
| X3 | Change a live slug | Confirm sheet; old link/QR 404s | 1 |
| X4 | Phone hidden + zero public items | Dead‑end page; Settings warning | 1+2 |
| X5 | First public item's duration drives all slots | Documented Function limitation; per‑service sizing = follow‑up | 2 |
| X6 | custom_items not pulled on initialSync (2nd device blind) | Pre‑existing; add custom_items to initialSync as follow‑up | 2 |
| X7 | Referral optional, never blocks quote | Continue gated only by name+phone | 3 |
| X8 | Reuse enquiry job with existing source | Don't overwrite | 3 |
| X9 | Online booking accept (future) | Copy referral to job + set accepted_job_id; dashboard dedups | 5/6 |
| X10 | Unknown source value | Dashboard shows raw label via fallback | 4 |
| X11 | Booking page 500 (no service‑role key on Preview) | Item 5; items 1‑2 still save locally + queue, page works once env set | 5 |
| X12 | Offline edits to booking config / public items | Queued in sync_queue, drained when online (existing behaviour) | 1+2 |
| X13 | QR encodes public `/book/<slug>`, not `/app/…` | `bookingPageUrl()` + `VITE_SITE_URL` | 1 |

---

## 7. Open product decisions (flag, don't block)

1. **Is the booking page Free or Pro?** Schema/RLS/Function don't gate it. **Recommend:** free for
   beta (maximise acquisition value + QR sharing); add a `booking_page` Pro feature later **with a
   server‑side `subscription_status` check in the Function** (UI‑only gating is leaky). *Default:
   free, no ProBadge on the nav row.*
2. **Count expired/rejected booking_requests in referral stats?** *Default: yes (any source captured
   = an acquisition signal).*
3. **Referral card time window.** *Default: all‑time. Monthly toggle = future.*
4. **Per‑service slot sizing on the booking page.** *Default: leave Function as‑is (first item's
   duration); follow‑up to size by selected service.*

None of these block building items 1‑4 now.

---

## 8. Build sequence (independent of item 5)

1. **Shared foundations (1a–1d):** `src/lib/referral.ts`, `VITE_SITE_URL`, `qrcode` dep, analytics
   events. ≈30 min.
2. **Item 2 (Custom Items UI):** smallest, self‑contained, unblocks a useful booking page once 5
   lands. ≈1 h.
3. **Item 1 (Settings booking screen) + migration 2.2 (slug RPC):** the biggest piece. ≈2 h.
4. **Item 3 (Quote referral dropdown):** small, touches two files. ≈30 min.
5. **Item 4 (Dashboard referral card):** aggregation + card. ≈1 h.
6. **Verify:** `npm run lint` (tsc --noEmit) after each; manual smoke per acceptance criteria; full
   end‑to‑end (page live + public items + quote referral + dashboard) once item 5 env/SQL is on
   Preview.

> Items 2, 3, 4 are fully independent and could be built in parallel by separate workers on
> disjoint files. Item 1 is also independent but is the largest; do it after the shared foundations.

---

## 9. Files touched (summary)

**New**
- `src/lib/referral.ts`
- `src/screens/Settings/Booking.tsx`
- `supabase/migrations/20260627000003_booking_slug_check.sql`

**Edit**
- `src/screens/Settings/index.tsx` (nav row + Grow section)
- `src/screens/Settings/CustomItems.tsx` (expandable rows, is_public + duration)
- `src/screens/Quote/CustomerDetails.tsx` (referral dropdown)
- `src/screens/Quote/index.tsx` (write referral to job)
- `src/screens/Dashboard/index.tsx` (referral card)
- `src/lib/dashboard.ts` (getReferralBreakdown + DashboardStats)
- `src/lib/analytics.ts` (4 events)
- `src/App.tsx` (route)
- `.env.example` (VITE_SITE_URL)
- `functions/book/[[slug]].js` (comment drift‑guard for REFERRAL_SOURCES — no logic change)
- `package.json` (qrcode + @types/qrcode)

**Optional follow‑ups (not blocking)**
- `src/lib/initialSync.ts` — pull `custom_items` (and material_items, message_templates) on login.
- `src/lib/booking.ts` — implement `acceptBookingRequest` (copies referral → job, sets
  `accepted_job_id`) — belongs to item 5/6 track.
- `src/screens/JobDetail/*` — show/edit `referral_source` on a job.
- `src/lib/db.ts` — remove dormant `Profile.referral_source`/`referral_detail`.
