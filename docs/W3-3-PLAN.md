# Plan: W3-3 — Business Insights & Coaching

> Generated 2026-06-28. Verified against codebase at commit 843b36f.

## 0. WHAT changes

### New file: `src/lib/insights.ts`

**Why:** Pure computation engine. Generates insight objects from existing Dexie
data. No new tables, no network calls. Mirrors the `pricingHistory.ts` pattern
(pure functions, session cache, returns typed objects).

Contents:
- `Insight` interface: `{ id, type, severity, title, body, ctaLabel, ctaRoute, priority }`
- `InsightSeverity` type: `'positive' | 'warning' | 'info'`
- `InsightType` union: `'win_rate_drop' | 'profit_margin' | 'profitable_day' | 'stale_quote_cost' | 'avg_job_value_up' | 'slow_payer'`
- `generateInsights(userId, stats): Promise<Insight[]>` — accepts the already-loaded
  `DashboardStats` to avoid re-querying jobs/payments for data already fetched by
  `getDashboardStats`. Only runs additional Dexie queries for insights that need
  data not in `DashboardStats` (day-of-week grouping, stale quotes, payment speed).
- Session cache keyed by `userId + month` (same pattern as `pricingHistory.ts`)
- `clearInsightsCache()` for manual invalidation

Insight generation logic (all thresholds are constants, easily tuned):

1. **Win rate drop** — needs `stats.winRate` + last month's win rate. Last month
   win rate requires querying jobs quoted last month (NOT in DashboardStats — only
   this month is computed). Query: `allJobs.filter(j.quote_sent_at in lastMonth)`,
   count booked vs quoted. If this month's win rate dropped >15 percentage points
   from last month AND >3 quotes this month → warning. If no quotes last month,
   skip (can't compute trend).

2. **Profit margin** — needs `stats.monthEarnings`, `stats.monthExpenses`,
   `stats.monthProfit`. Compute `margin = monthProfit / monthEarnings`. If
   `monthExpenses > 0` and `margin < 0.4` (40%) → warning: "Materials are eating
   {pct}% of your revenue." If `monthExpenses === 0` → skip (no expense data).
   If `monthEarnings === 0` → skip (no revenue).

3. **Most/least profitable day** — needs all paid jobs this month grouped by
   `actual_start` day-of-week. Query: `db.jobs` filtered to paid status + this
   month, get their payments, compute profit per day. Needs 4+ jobs to be
   meaningful. If <4 paid jobs this month → skip.

4. **Stale quote cost** — needs quoted jobs with `quote_sent_at` older than 5
   days. Query: `db.jobs` where `status === 'quoted'` and `quote_sent_at` exists.
   Compute `daysSince = daysBetween(quote_sent_at)`. Sum their line-item totals.
   If total > 0 → info: "You have {n} quotes worth £{total} that haven't been
   followed up." Uses existing `daysBetween` from `jobStaleness.ts`.

5. **Avg job value up** — needs `stats.avgJobValue` + last month's avg job value.
   Last month avg requires querying paid jobs from last month. If this month's
   avg is >20% higher than last month AND last month had >0 paid jobs → positive:
   "Your average job value went from £{last} to £{now}."

6. **Slow payer** — needs awaiting_payment jobs with `actual_end` older than 14
   days. Query: `db.jobs` where `status === 'awaiting_payment'` and `actual_end`
   exists. Compute `daysBetween(actual_end)`. If any job is >14 days → warning:
   "{Customer name} is at {n} days — consider chasing." Needs customer name from
   `db.customers.get(customer_id)`.

All insights returned sorted by `severity` (warning first, then info, then
positive) and then by a manual `priority` field.

### New file: `src/components/InsightCard/index.tsx`

**Why:** Presentational component, one per insight. Matches the existing
Dashboard card pattern: `bg-white border border-brand-border rounded-xl p-4`.

Props: `{ insight: Insight, onDismiss: (id: string) => void, onCta: (insight: Insight) => void }`

Layout:
- Top row: severity icon (AlertCircle for warning, TrendingUp for positive,
  Info for info) + title + dismiss X button (same pattern as `NotificationBanner`)
- Body text (the coaching message)
- CTA button (if `ctaLabel` exists) — `text-xs font-semibold text-brand-dark`
  with chevron, matches the "Export jobs" button pattern on Dashboard

Severity colours (using existing Tailwind tokens from `tailwind.config.js`):
- warning → `text-status-amber`, icon `AlertCircle`
- positive → `text-status-green`, icon `TrendingUp`
- info → `text-status-blue`, icon `Info` (lucide-react has `Info`)

Card border-left accent: 3px solid coloured border on the left side only,
using the severity colour. Done via inline style `borderLeft`.

### Modify: `src/screens/Dashboard/index.tsx`

**Why:** Wire the insight engine into the Dashboard. Insights render above the
existing stat grid, as the first thing the user sees after the header.

Changes (minimal, surgical):
1. Add import: `import { generateInsights, type Insight } from '../../lib/insights'`
2. Add import: `import InsightCard from '../../components/InsightCard'`
3. Add import: `import { useEntitlements } from '../../hooks/useEntitlements'`
4. Add state: `const [insights, setInsights] = useState<Insight[]>([])`
5. Add: `const { can, upgradeUrl } = useEntitlements()`
6. Add a `useEffect` that fires after `stats` are loaded:
   ```ts
   useEffect(() => {
     if (!userId || !stats || !can('business_insights')) return;
     generateInsights(userId, stats).then(setInsights).catch(() => {});
   }, [userId, stats, can]);
   ```
7. Add dismiss state + localStorage pattern (same as `buildlogg_eod_review`):
   - Key: `buildlogg_insight_dismissed_{id}_{YYYY-MM}` (month-scoped so insights
     reappear next month)
   - `dismissedInsights` state: `Set<string>` loaded from localStorage on mount
   - `handleDismissInsight(id)`: add to set, save to localStorage, filter out
   - `handleInsightCta(insight)`: fire `captureInsightCtaTapped`, then
     `navigate(insight.ctaRoute)` if route exists
8. Render block: between the header `<div>` and the stat grid `<div>`, insert:
   ```tsx
   {can('business_insights') && visibleInsights.length > 0 && (
     <div className="mb-4 space-y-3">
       {visibleInsights.map(insight => (
         <InsightCard key={insight.id} insight={insight}
           onDismiss={handleDismissInsight} onCta={handleInsightCta} />
       ))}
     </div>
   )}
   ```
9. If `!can('business_insights')`, show a subtle upsell card: "Upgrade to Pro
   for business coaching insights" with a link to `upgradeUrl`. Matches the
   existing entitlement gate pattern used in `QuotePreview.tsx` and
   `SendSheet/index.tsx`.
10. Fire analytics: `captureInsightsShown({ count, types })` in a `useEffect`
    when insights first render.

### Modify: `src/lib/analytics.ts`

**Why:** Add typed insight events, matching the existing pattern.

Add after line 325 (after `captureReferralCardViewed`):
```ts
export function captureInsightsShown(data: { count: number; types: string[] }) {
  capture('insights_shown', data);
}
export function captureInsightCtaTapped(data: { type: string }) {
  capture('insight_cta_tapped', data);
}
export function captureInsightDismissed(data: { type: string }) {
  capture('insight_dismissed', data);
}
```

### Modify: `src/lib/entitlements.ts`

**Why:** Gate insights behind Pro (same as `revenue_dashboard`). Insights are a
premium coaching feature — free users see the stat grid, Pro users see coaching.

Add `'business_insights'` to the `Feature` type union and `PRO_FEATURES` array.

## 1. WHY

| Change | Problem it solves |
|--------|-----------------|
| `insights.ts` | Dashboard shows numbers but no context. "£2,340" is meaningless without knowing if that's good or bad. |
| `InsightCard` | No UI pattern exists for dismissible coaching cards with CTAs. NotificationBanner is close but not reusable. |
| Dashboard wiring | Insights need to appear where the user already looks at numbers — the Dashboard. |
| Analytics events | Need to measure which insights drive action vs get dismissed, to tune thresholds. |
| Entitlement gate | Insights are a coaching/advisor feature — the "lock-in" feature from FUTURE.md. Free users get stats, Pro gets coaching. |

## 2. SEQUENCING

### Phase 1: Data layer (can start immediately, no UI dependency)
1. `src/lib/insights.ts` — new file, pure computation
2. `src/lib/analytics.ts` — add 3 capture functions
3. `src/lib/entitlements.ts` — add `business_insights` feature

Steps 1–3 are disjoint files → **can be done in parallel**.

### Phase 2: UI layer (depends on Phase 1)
4. `src/components/InsightCard/index.tsx` — new component (depends on `Insight` type from step 1)
5. `src/screens/Dashboard/index.tsx` — wire everything (depends on steps 1, 2, 3, 4)

Steps 4 and 5 are **serial** — Dashboard imports InsightCard.

### What CANNOT run in parallel with W3-1
- W3-1 touches: `recurringJobs.ts`, Cloudflare cron triggers, message templates
- W3-3 touches: `insights.ts` (new), `Dashboard/index.tsx`, `entitlements.ts`, `analytics.ts`
- **Zero file overlap.** Both can proceed independently.

## 3. EDGE CASES

### Empty/zero/null data
- **No jobs at all** (brand new user): `getDashboardStats` returns zeros. `generateInsights` returns `[]` (empty array). Dashboard renders zero insight cards. No crash.
- **No expenses logged**: Profit margin insight skips (condition: `monthExpenses === 0`). User sees "Log expenses on jobs to see your true profit" from existing BN-2 card — no duplicate nudge.
- **No quotes sent**: Win rate insight skips (condition: `monthQuoted < 3` or `lastMonthQuoted === 0`). Stale quote cost returns `[]`.
- **No paid jobs**: Avg job value insight skips. Profitable day insight skips (condition: `< 4 paid jobs`).
- **No awaiting_payment jobs**: Slow payer insight skips.
- **All insights skip**: `insights` array is empty → insight section renders nothing. No empty-state needed (stats grid is the baseline).

### Error & partial-failure states
- `generateInsights` wraps each insight computation in try/catch. If one insight throws (e.g., Dexie query fails), the others still return. The catch logs to console in dev, swallows in prod.
- `generateInsights` itself is wrapped in `.catch(() => {})` in the Dashboard useEffect (same as existing `getJobTitlePricingHistory` call at line 27).
- If `stats` is null (getDashboardStats failed), the insights useEffect returns early — no insights rendered.

### Auth/permission
- Dashboard is behind `AuthGuard` (route `/dashboard` is inside `<Route element={<AuthGuard />}>` in App.tsx:303). No additional auth needed.
- Entitlement gate: `can('business_insights')` controls whether insights render. During beta, `isPro = true` for everyone, so all users see insights.

### Race conditions
- `generateInsights` is called in a useEffect that depends on `[userId, stats, can]`. `stats` is set once by `getDashboardStats`. No concurrent calls.
- Session cache in `insights.ts` (Map keyed by `userId:month`) prevents redundant computation if the component re-renders.
- Stale closure risk: none — `stats` is the dependency, and `generateInsights` receives it as a parameter.

### Offline/slow-network
- `generateInsights` queries Dexie only (no Supabase calls). Works fully offline.
- The existing `getDashboardStats` already queries Dexie for jobs/payments — insights piggyback on that data.
- No network calls in the insight engine. No loading state needed (computation is synchronous-ish, <50ms for typical datasets).

### Date/timezone
- All date comparisons use `new Date().toDateString()` and `new Date().getMonth()` — same pattern as `dashboard.ts` `isSameMonth`. Uses the device's local timezone. Consistent with existing dashboard behaviour.
- `daysBetween` from `jobStaleness.ts` uses `Math.floor((now - start) / 86400000)` — local timezone, matches existing stale-job detection.
- Month boundary: insights are scoped to the current calendar month. If the user opens the dashboard on June 1, they see June insights (which will be sparse). This is expected — matches how `getDashboardStats` works.
- Dismissal persistence: keyed by `{id}_{YYYY-MM}`. An insight dismissed in June won't reappear in June, but will reappear in July (fresh month = fresh data). This is intentional.

### Data migration & rollback
- **No migration needed.** No new tables, no schema changes, no Supabase changes.
- **Rollback:** Delete `insights.ts`, `InsightCard/index.tsx`, revert Dashboard changes. No data is persisted beyond localStorage keys (which are harmless if left behind).
- **Feature flag:** The entitlement gate (`can('business_insights')`) acts as a kill switch. Set `isPro = false` for all users → insights disappear, stats grid remains.

## 4. INTEGRATION RISK

| Feature | Shared code path | Regression risk |
|---------|-----------------|----------------|
| Dashboard stats grid | `Dashboard/index.tsx` — we add a useEffect + render block, don't modify existing JSX | LOW — additive only, no existing code changed |
| `getDashboardStats` | `dashboard.ts` — NOT modified. Insights receive its output as a parameter. | NONE — read-only consumer |
| Pricing insights card | `Dashboard/index.tsx` — existing pricing card renders below stats. Insights render above stats. No collision. | NONE — separate render blocks |
| Referral breakdown card | Same as above — separate render block | NONE |
| Entitlements system | `entitlements.ts` — we add one feature to the union + array. Existing `isProFeature` iterates the array. | LOW — adding to an array doesn't break existing checks |
| Analytics | `analytics.ts` — we add 3 new functions. Existing functions untouched. | NONE — additive |
| BN-2 expense/profit card | Same Dashboard screen, separate card. No shared state. | NONE |

**Highest risk:** The Dashboard `useEffect` for insights. If `generateInsights`
throws synchronously (shouldn't — it's async and catches internally), it could
prevent the component from rendering. Mitigated by the `.catch(() => {})` wrapper.

## 5. ASSUMPTIONS

1. **`getDashboardStats` data is sufficient for most insights.** Only win-rate
   trend, avg-job-value trend, profitable-day, and stale-quote-cost need
   additional Dexie queries. If this assumption is wrong, we'd need to extend
   `DashboardStats` — but the plan avoids that to keep `dashboard.ts` untouched.
   **Validate:** Check if any insight needs data not queryable from Dexie
   independently (it doesn't — all data is in jobs/payments/line_items/customers).

2. **Insights should be month-scoped.** The coaching is about "this month vs
   last month." If you want rolling 30-day windows instead, the date logic in
   `insights.ts` changes but the structure doesn't. **Validate:** Do you want
   calendar-month or rolling-30-day?

3. **6 insights is the right starting set.** FUTURE.md mentions win rate, profit
   margin, and day-of-week. I added stale quotes, avg job value trend, and slow
   payer based on existing data availability. **Validate:** Are there insights
   you'd cut or add?

4. **Insights are Pro-gated.** FUTURE.md calls this a "lock-in feature." During
   beta, everyone is Pro, so no impact. Post-beta, this becomes a Pro differentiator.
   **Validate:** Should insights be free during beta to drive adoption, or
   Pro-gated from day one?

5. **Dismissal is month-scoped, not permanent.** An insight dismissed in June
   reappears in July if the condition still holds. This prevents stale dismissals
   from hiding actionable coaching. **Validate:** Should dismissal be permanent
   (insight never shows again for that user)?

6. **No server-side computation.** All insights compute on-device from Dexie.
   This is consistent with the entire app's local-first architecture. For users
   with thousands of jobs, computation may take 100-200ms. **Validate:** Is
   that acceptable, or should we add a loading spinner for the insight section?

7. **`lucide-react` has `Info` and `TrendingUp` icons.** Verified: `TrendingUp`
   is already imported in Dashboard. `Info` exists in lucide-react. `AlertCircle`
   is already imported in Dashboard. **No new icon dependency.**

8. **The `can()` function from `useEntitlements` is available in Dashboard.**
   Dashboard doesn't currently use it, but the hook is used in 5 other screens.
   Adding the import + call is a one-liner. **No risk.**

## 6. OUT OF SCOPE

- **Modifying `dashboard.ts`** — insights consume its output, don't extend it
- **New Supabase tables or migrations** — zero backend changes
- **Server-side insight computation** (Cloudflare Worker) — not needed; Dexie is sufficient
- **Push notification insights** — "Your win rate dropped" as a notification is a future feature, not this one
- **Insight settings/preferences** — no UI for users to toggle which insights they see
- **Historical insight tracking** — we don't store which insights were shown or acted on beyond PostHog analytics
- **AI-powered insights** — explicitly deferred in FUTURE.md ("Dangerous — Dave knows his pricing")
- **The booking page, booking engine, or any W3-1 code** — zero overlap
- **Modifying the TabBar or navigation** — Dashboard stays at `/dashboard`, accessed from Settings
- **New CSS or Tailwind config changes** — uses existing colour tokens only
- **PDF export of insights** — not in scope
- **Insight sharing** — no "share this insight" feature

## File summary

| File | Action | Lines (est.) |
|------|--------|-------------|
| `src/lib/insights.ts` | NEW | ~180 |
| `src/components/InsightCard/index.tsx` | NEW | ~80 |
| `src/screens/Dashboard/index.tsx` | MODIFY | +40 lines |
| `src/lib/analytics.ts` | MODIFY | +12 lines |
| `src/lib/entitlements.ts` | MODIFY | +2 lines |
| **Total** | | ~314 lines |

No new dependencies. No new tables. No backend changes. No migrations.

*Author: Codex*
*Date: 2026-06-28*
