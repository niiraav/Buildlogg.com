# W3-3: Business Insights & Coaching — Progress Log

> Plan: docs/W3-3-PLAN.md (amended)
> Branch: codex/w3-1-smart-reminders

## Implementation items

| # | Item | Status | Commit |
|---|------|--------|--------|
| 1 | `src/lib/insights.ts` — insight computation engine (6 insights, session cache, per-insight try/catch, all queries filter !is_sample) | ✅ Done | d26c5e5 |
| 2 | `src/lib/analytics.ts` — captureInsightsShown, captureInsightCtaTapped, captureInsightDismissed | ✅ Done | d26c5e5 |
| 3 | `src/lib/entitlements.ts` — add 'business_insights' to Feature type + PRO_FEATURES | ✅ Done | d26c5e5 |
| 4 | `src/components/InsightCard/index.tsx` — presentational component (severity colours, dismiss, CTA) | ✅ Done | 5ceebf4 |
| 5 | `src/screens/Dashboard/index.tsx` — wire insights (useEffect, dismissal, analytics, Pro gate, upsell) | ✅ Done | 5ceebf4 |

## Verification

| Check | Status | Notes |
|-------|--------|-------|
| `tsc` | ✅ Pass | Exit 0 |
| `npm run build` | ✅ Pass | Vite build + PWA SW build succeed |
| `npm run lint` (tsc --noEmit) | ✅ Pass | Exit 0 |

## Insights implemented (6)

1. **Win rate drop** (warning) — compares this month's win rate to last month's, fires if drop >15pp with ≥3 quotes
2. **Profit margin** (warning) — fires if expenses >60% of revenue (margin <40%)
3. **Most/least revenue day** (info) — groups paid jobs by day-of-week, needs ≥4 jobs across ≥2 days
4. **Stale quote cost** (info) — quoted jobs >5 days old with summed line-item value, CTA → Home
5. **Avg job value up** (positive) — fires if avg job value >20% higher than last month
6. **Slow payer** (warning) — awaiting_payment jobs >14 days old, CTA → /jobs?filter=unpaid

## Key design decisions

- All Dexie queries filter `!j.is_sample` (sample job excluded)
- Insights are month-scoped (calendar month, not rolling 30-day)
- Dismissal is month-scoped (reappears next month if condition still holds)
- Pro-gated via `business_insights` entitlement (all users Pro during beta)
- `generateInsights` re-queries Dexie for historical data (acceptable for v1)
- Revenue day insight computes revenue, not profit (per-job expenses deferred to v2)
- Session cache prevents redundant computation on re-renders
- `canSeeInsights` boolean used in dep array (not `can` callback) to avoid double-fire

*Last updated: 2026-06-28*
