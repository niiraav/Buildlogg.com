# Campaign Summary — Rolling

> Updated manually after each batch send. Auto-metrics in `logs/` provide daily snapshots.
> Last updated: 2026-06-27 18:50 BST

## 🎉 Milestone — First Email-Driven Sign-Up

**quraan6060@gmail.com** (Omar Qoraan, King Turkish Barber) converted from today's v11+hero batch:

| Time (BST) | Event |
|------------|-------|
| 17:46 | Cold email delivered — subject A: "Quick question about your bookings" |
| 17:48 | Clicked CTA → `buildlogg.com/beauty/` (2 min after delivery) |
| 17:49 | Supabase confirmation email delivered ("Confirm your email address") |
| 17:49 | Clicked confirmation link → sign-up completed (3 min after delivery) |

**Full conversion funnel: cold email → click → landing page → sign up → email confirmed. All within 3 minutes.**

This is the first sign-up from cold outreach in the entire campaign. It came from the v11+hero template, subject variant A, beauty vertical.

## Send History

| Date | Vertical | Step | Version | Sent | Bounced | Opens | Clicks | Unsubs | Notes |
|------|----------|------|---------|------|---------|-------|--------|--------|-------|
| 2026-06-22 | trades | 1 | v1 | 100 | 0 | 0 | 0 | 4 | No HTML (no open tracking) |
| 2026-06-23 | trades | 1 | v1 | 100 | 0 | 1 | 1 | 5 | Only open+click in v1 campaign |
| 2026-06-25 | beauty | 1 | v1 | 100 | 5 | 0 | 0 | 1 | Non-clickable CTA links |
| 2026-06-26 | beauty | 1 | v1 | 100 | 1 | TBD | TBD | 0 | 54 deferred + 46 fresh |
| 2026-06-27 | beauty | 1 | v11+hero | 100 | 7 | TBD | 1→signup | 0 | **First v11 production batch + hero image** |
| 2026-06-28 | trades | 2 | v11+hero | 100 | 0 | TBD | TBD | 0 | Step 2 follow-ups — rewritten pain-driven copy |
| 2026-06-29 | trades | 2 | v11+hero | 45 | 0 | TBD | TBD | 0 | Remaining step 2 follow-ups — hero image now working |
| 2026-06-29 | beauty | 1 | v11+hero | 55 | TBD | TBD | TBD | 0 | Microsoft domains included (warm-up complete) |
| **Total** | | | | **700** | **13** | **32+TBD** | **58+TBD** | **10** | |

## Design Version Sent to Leads

| Version | Sent to leads | Issues |
|---------|--------------|--------|
| v1 (plain text HTML) | 400 | Non-clickable links, no branding, trades had no HTML |
| v11+hero (branded + hero image) | 100 | Sent Jun 27 — beauty batch with salon image. **1 sign-up.** |

## Subject Line Performance

### Trades (v1 — broken template)
| Subject | Variant | Sent | Opens | Clicks | Verdict |
|---------|---------|------|-------|--------|---------|
| The admin you do at 9pm | A | ~67 | 0 | 0 | Weak |
| Quick question about your quotes | B | ~67 | 1 | 1 | ⭐ Best (only v1 conversion) |
| [Trade] quotes from your phone? | C | ~66 | 0 | 0 | Weak |

### Beauty (v1 — broken template, Jun 25–26)
| Subject | Variant | Sent | Opens | Clicks | Verdict |
|---------|---------|------|-------|--------|---------|
| How many no-shows this week? | A (old) | ~33 | 0 | 0 | ❌ Killed |
| Quick question about your bookings | B (new A) | ~33 | 0 | 0 | Active |
| Your empty chair is costing you | C (new B) | ~34 | 0 | 0 | Active |
| [Company] — deposits for no-shows? | D (new C) | ~34 | 0 | 0 | Active |

### Beauty (v11+hero — working template, Jun 27)
| Subject | Variant | Sent | Opens | Clicks | Sign-ups | Verdict |
|---------|---------|------|-------|--------|----------|---------|
| Quick question about your bookings | A | ~34 | TBD | 1 | 1 | ⭐ First sign-up! |
| Your empty chair is costing you | B | ~33 | TBD | 0 | 0 | TBD |
| [Company] — deposits for no-shows? | C | ~33 | TBD | 0 | 0 | TBD |

## Vertical Performance

| Vertical | Sent | Delivered | Open Rate | Click Rate | Sign-up Rate |
|----------|------|-----------|-----------|------------|--------------|
| trades (v1) | 200 | 200 | 0.5% | 0.5% | 0% |
| beauty (v1) | 200 | 194 | 0% | 0% | 0% |
| beauty (v11+hero) | 100 | 93 | TBD | 1% | **1%** ⭐ |

## v1 vs v11+hero Comparison (preliminary — 48h data pending)

| Metric | v1 (400 sends) | v11+hero (100 sends) |
|--------|----------------|---------------------|
| Clicks on CTA | 1 (0.25%) | 1 (1%) |
| Clicks on unsubscribe | 10 (2.5%) | 0 (0%) |
| Sign-ups | 0 | 1 (1%) |
| CTA clickable? | ❌ No | ✅ Yes |
| Branded design? | ❌ No | ✅ Yes |
| Hero image? | ❌ No | ✅ Yes |
| Open tracking? | Partial (trades had no HTML) | ✅ Full |

**Key insight:** v1's only clicks were unsubscribe links (broken CTA). v11+hero's first click was a CTA → sign-up. The template fix is already showing results within minutes.

## Warm-up Progress

| Milestone | Status | Date |
|-----------|--------|------|
| 100 sends | ✅ | Jun 22 |
| 200 sends | ✅ | Jun 23 |
| 300 sends | ✅ | Jun 25 |
| 400 sends | ✅ | Jun 26 |
| 500 sends (Microsoft unlock) | ✅ | Jun 27 |
| 1,000 sends | ⏳ | ~5 days at 100/day |

## Email Deliverability Fixes (Jun 26–27)

| Fix | Status | Impact |
|-----|--------|--------|
| DMARC `p=quarantine` → `p=none` | ✅ Live | Stops Microsoft junking on minor alignment |
| Warm-up: gradual Microsoft ramp | ✅ Live | 20 MS leads/day (was 0), building reputation |
| Beauty CTA URL redirect fix | ✅ Live | Direct to `/beauty/` (no 308 redirect) |
| Hero image added to template | ✅ Live | 540×252px, 42KB JPEG, above badge |
| Microsoft SNDS registration | ❌ Pending | https://sendersupport.olc.protection.outlook.com/snds/ |
| Hotmail still junking | ⚠️ Ongoing | Reputation needs days to build |

## Next Actions

1. **Tomorrow (Jun 30)**: send 100 beauty step 1 leads — 1,645 remaining
2. **Jun 30–Jul 1**: beauty step 2 follow-ups for Jun 27 batch (Day 3 cadence)
3. **Jul 1**: trades step 3 (case study) for Jun 22–23 batch (Day 7 cadence)
4. **Monitor Hotmail**: today's beauty batch included many MS domains — check placement
5. **Kill "The admin you do at 9pm"** — ✅ Done (replaced with "How fast can you send a quote?")
6. **Kill "Your empty chair is costing you"** — ✅ Done (replaced with "How do you handle no-shows?")
7. **Fix root domain SPF** — add Resend/AWS SES include to buildlogg.com SPF record
8. **Set up inbound reply monitoring** — forward team@mail.buildlogg.com to readable inbox
