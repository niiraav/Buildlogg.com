# Campaign Summary — Rolling

> Updated manually after each batch send. Auto-metrics in `logs/` provide daily snapshots.
> Last updated: 2026-06-27 (corrected with Resend API verification)

## Send History

| Date | Vertical | Step | Version | Sent | Bounced | Opens | Clicks | Unsubs | Notes |
|------|----------|------|---------|------|---------|-------|--------|--------|-------|
| 2026-06-23 | trades | 1 | v1 | 61 | 0 | 0 | 0 | — | No HTML (no open tracking) |
| 2026-06-24 | trades | 1 | v1 | 106 | 0 | 1 | 1 | — | Only open+click in entire campaign |
| 2026-06-25 | beauty | 1 | v1 | 100 | 5 | 0 | 0 | — | Non-clickable CTA links |
| 2026-06-26 | beauty | 1 | v1 | 128 | 1 | TBD | TBD | — | Includes 28 deferred + fresh leads |
| **Total** | | | | **395** | **6** | **1** | **1** | **10** | Verified via Resend API |

**Note:** Previous logs reported 400 sends. Resend API confirms 395 campaign emails + 5 non-campaign (password resets, test sends). Supabase shows 400 rows (6 bounced → 394 delivered).

## Design Version Sent to Leads

| Version | Sent to leads | Issues |
|---------|--------------|--------|
| v1 (plain text HTML) | 395 | Non-clickable links, no branding, trades had no HTML |
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
| 30 sends | ✅ | Jun 23 |
| 100 sends | ✅ | Jun 23 |
| 200 sends | ✅ | Jun 24 |
| 300 sends | ✅ | Jun 25 |
| 395 sends | ✅ | Jun 26 |
| 500 sends (Microsoft unlock) | ⏳ | ~1 more day at 100/day |
| 1,000 sends | ⏳ | ~7 days at 100/day |

## Resend Free Tier Quota (verified Jun 27, 11:00 BST)

| Limit | Remaining | Used |
|-------|-----------|------|
| Daily | 7 (3 consumed by test sends today) | ~2,433/month |
| Monthly | 566 | Free tier = 3,000/month |

## Next Actions

1. **Send 5–7 beauty leads with v11 template** — first production test of branded design (use daily quota today)
2. **48h after v11 batch**: compare open/click vs v1 batch
3. **Jun 28**: send step 2 follow-ups to 200 trades leads (overdue since Jun 25)
4. **After 500 sends**: re-include Microsoft domains (~499 more beauty leads unlock)
5. **Consider re-sending step 1 to 395 v1 leads** if v11 significantly outperforms
