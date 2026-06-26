# Campaign Summary — Rolling

> Updated manually after each batch send. Auto-metrics in `logs/` provide daily snapshots.
> Last updated: 2026-06-26

## Send History

| Date | Vertical | Step | Version | Sent | Bounced | Opens | Clicks | Unsubs | Notes |
|------|----------|------|---------|------|---------|-------|--------|--------|-------|
| 2026-06-22 | trades | 1 | v1 | 100 | 0 | 0 | 0 | 4 | No HTML (no open tracking) |
| 2026-06-23 | trades | 1 | v1 | 100 | 0 | 1 | 1 | 5 | Only open+click in entire campaign |
| 2026-06-25 | beauty | 1 | v1 | 100 | 5 | 0 | 0 | 1 | Non-clickable CTA links |
| 2026-06-26 | beauty | 1 | v1 | 100 | 0 | TBD | TBD | 0 | 54 deferred + 46 fresh leads |
| **Total** | | | | **400** | **5** | **1** | **1** | **10** | |

## Design Version Sent to Leads

| Version | Sent to leads | Issues |
|---------|--------------|--------|
| v1 (plain text HTML) | 400 | Non-clickable links, no branding, trades had no HTML |
| v11 (branded, DESIGN.md) | 0 (test only) | None — ready for production |

## Subject Line Performance

### Trades
| Subject | Variant | Sent | Opens | Clicks | Verdict |
|---------|---------|------|-------|--------|---------|
| The admin you do at 9pm | A | ~67 | 0 | 0 | Weak |
| Quick question about your quotes | B | ~67 | 1 | 1 | ⭐ Best |
| [Trade] quotes from your phone? | C | ~66 | 0 | 0 | Weak |

### Beauty
| Subject | Variant | Sent | Opens | Clicks | Verdict |
|---------|---------|------|-------|--------|---------|
| How many no-shows this week? | A (old) | ~33 | 0 | 0 | ❌ Killed |
| Quick question about your bookings | B (new A) | ~33 | 0 | 0 | Active |
| Your empty chair is costing you | C (new B) | ~34 | 0 | 0 | Active |
| [Company] — deposits for no-shows? | D (new C) | ~34 | 0 | 0 | Active |

## Vertical Performance

| Vertical | Sent | Delivered | Open Rate | Click Rate | Unsub Rate |
|----------|------|-----------|-----------|------------|------------|
| trades | 200 | 200 (100%) | 0.5% | 0.5% | 4.5% |
| beauty | 200 | 195 (97.5%) | 0% (too early) | 0% | 0.5% |

## Warm-up Progress

| Milestone | Status | Date |
|-----------|--------|------|
| 30 sends | ✅ | Jun 22 |
| 100 sends | ✅ | Jun 22 |
| 200 sends | ✅ | Jun 23 |
| 300 sends | ✅ | Jun 25 |
| 400 sends | ✅ | Jun 26 |
| 500 sends (Microsoft unlock) | ⏳ | ~1 more day |
| 1,000 sends | ⏳ | ~6 days at 100/day |

## Next Actions

1. **Send 100 beauty leads with v11 template** — first production test of branded design
2. **48h after v11 batch**: compare open/click vs v1 batch
3. **Jun 28**: send step 2 follow-ups to 200 beauty leads from Jun 25
4. **After 500 sends**: re-include Microsoft domains (~499 more beauty leads unlock)
5. **Consider re-sending step 1 to 400 v1 leads** if v11 significantly outperforms
