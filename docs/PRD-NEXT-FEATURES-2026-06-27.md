# Buildlogg — Next Features PRD

**Date:** 27 June 2026  
**Author:** Nirav + Hermes  
**Context:** Post-QA, all critical bugs fixed. 129/164 features tested and working. Ready to prioritise next high-impact features.

---

## Where Buildlogg Is Now

**Shipped and working (confirmed by QA):**
- Full quote lifecycle: create → preview → send (WhatsApp/SMS/Copy) → accept → book → start → complete → payment → receipt
- PDF quotes & invoices with logo, bank details, VAT
- Customer CRM: list, detail, notes, archive, merge, find duplicates
- Message templates with placeholder engine
- Revenue dashboard with CSV export
- Online booking page (live, public, QR code)
- Stripe card payments connected
- Google review prompts after payment
- Recurring job prompts (Monthly/Quarterly/6-monthly/Annual)
- Payment chase (send reminder with invoice template)
- Smart pricing hints (historical pricing)
- Custom item library
- Dark mode
- Deposit collection infrastructure (Stripe checkout sessions, webhook handler)
- Job staleness detection, overnight auto-complete
- Quote follow-up task cards
- Booking request acceptance flow

**Known gaps from QA:**
- No "Add Customer" button (customers only created via quote builder)
- No edit customer functionality
- Duplicate message templates (seed function bug)
- "Save as draft" from send sheet broken
- Materials section simplified (no line-item CRUD)
- Log out hangs browser
- Marketing hero renders on authenticated pages
- Accessibility gaps (clickable divs, missing labels, no ARIA tabs)

---

## PRD: Next High-Impact Features

### Selection Criteria

Each feature is evaluated against:
1. **Revenue impact** — Does it directly protect or generate revenue?
2. **Retention impact** — Does it make users depend on Buildlogg daily?
3. **QA-discovered gap** — Does it fill a hole found during testing?
4. **Build cost** — How much effort relative to impact?
5. **Gate criteria** — Is this a blocker for GTM/launch?

---

## TIER 1 — Ship Before Any New User Testing

### FIX-1. Fix QA Discovered Bugs (Critical Path)

**Why:** These are blockers for real user testing. A user will hit these in their first session.

| Bug | Severity | Effort |
|---|---|---|
| Add Customer button + route | Critical | Low — add FAB button to /app/customers, create /app/customers/new route |
| Edit customer functionality | High | Low — add inline edit on customer detail (name, phone, email, address) |
| Log out hangs browser | Critical | Low — add timeout/fallback to supabase.auth.signOut() |
| Marketing hero on auth pages | Critical | Medium — separate authenticated layout from marketing layout |
| Email validation silent failure | Critical | Low — fix setError() call in validateEmail flow |
| Duplicate message templates | High | Low — fix seedMissingTemplates dedup logic |
| "Save as draft" from send sheet | Medium | Low — wire up the onClick handler |
| Forgot password page blank | Medium | Low — fix loading state / redirect handling |

**Build cost:** 2-3 days total  
**Impact:** Unblocks real user testing. These are the difference between "looks broken" and "feels professional."

---

### FIX-2. Materials Line-Item CRUD

**Problem:** The `MaterialItem` schema exists in db.ts with fields for description, quantity, unit cost, markup %, unit price, total cost, total price — but the UI only shows a single "Total spent at merchant" text input. The full materials tracking system was designed but never built in the UI.

**Why now:** Materials tracking is a daily-use feature for tradespeople. Dave buys parts from Screwfix and needs to log what he spent per job to calculate profit. The simplified input doesn't give him per-item tracking or markup calculation.

**Spec:**
1. In Job Detail, replace the simple cost input with a materials list component
2. "Add material" button opens a row: description, quantity, unit cost, markup %, auto-calculated unit price and total
3. Materials list shows running total
4. "For your reference only — not included in customer invoice" stays
5. Edit and delete individual material lines
6. Total syncs to dashboard profit calculation (when expense tracking is built)

**Build cost:** Medium (2-3 days) — MaterialsList component already exists in /components/, schema is in db.ts  
**Impact:** Medium-High — completes a designed-but-unbuilt feature, enables accurate profit tracking

---

## TIER 2 — High Impact, Low Cost (Ship Next Sprint)

### NEXT-1. Expense & Profit Tracking (from FUTURE.md BN-2)

**Problem:** Dashboard shows "£7,423 earned this month" but Dave spent £800 on materials. His profit is £6,623, not £7,423. The dashboard is showing a misleading number.

**Spec:**
1. Add "Log expense" to the More menu (already exists in code — `type: 'expense'` in WorkLogType)
2. Expense entry: amount, description, optional (per-job or general)
3. Dashboard: Revenue £7,423 → Expenses £800 → **Profit £6,623**
4. Per-job profitability on job detail: revenue, expenses, profit
5. General expenses (not tied to a job) — bulk supplies, fuel, parking

**Build cost:** Low-Medium (2 days) — WorkLogEntry type already has 'expense', "Log expense" already in More menu, dashboard.ts needs computation update  
**Impact:** HIGH — fundamental data accuracy. Without this, the dashboard misleads.

---

### NEXT-2. End-of-Day Review Prompt (from FUTURE.md W1-2)

**Problem:** Dave finishes a job at 4pm, drives home, forgets to mark it done. Next morning the job still shows "In Progress." Data is inaccurate.

**Spec:**
1. At 6pm (configurable), if in-progress jobs exist from today:
   - If notification permission granted → push: "You had 1 job today — Mark O'Connor. Mark complete?"
   - If no notification permission → in-app banner on next open: "Mark today's job as complete?"
2. Tapping opens review sheet: today's in-progress jobs with "Complete" / "Still working"
3. "Complete" triggers existing mark-done flow. "Still working" dismisses for today.
4. `checkEndOfDay()` function already exists in notifications.ts — extend it.

**Build cost:** Low (1-2 days) — function exists, needs UI + notification integration  
**Impact:** HIGH — data accuracy. Incomplete jobs cascade into wrong dashboard numbers, wrong outstanding amounts, wrong activity feed.

---

### NEXT-3. Quote Revision Flow (from FUTURE.md BN-3)

**Problem:** Customer says "that's too much." Dave needs to edit and re-send. The "Revise quote" button exists (confirmed in QA) but the revision history and timestamp reset aren't fully wired.

**Spec:**
1. "Revise quote" button on quoted job detail → opens QuoteBuilder with existing job ✅ (already works)
2. On re-send, work log shows two "Quote sent" entries with different totals
3. Quote expiry timer resets (new `quote_sent_at`)
4. Quote preview shows "Revised Quote v2" if this is a revision

**Build cost:** Low (1 day) — mostly already works, needs timestamp reset and version label  
**Impact:** Medium-High — "can you do it cheaper?" is the most common quote response

---

## TIER 3 — Strategic Features (Ship After Tier 1-2)

### NEXT-4. Proactive Notification Permission Flow (from FUTURE.md BN-1)

**Problem:** Notification permission fires cold on first visit. Most users deny it. Without notifications, end-of-day prompts, stale job nudges, and booking alerts all fail.

**Spec:**
1. In-app banner on first Home visit: "Turn on notifications for job reminders, quote follow-ups, and payment alerts" ✅ (already exists)
2. Only fire `Notification.requestPermission()` when user taps "Allow" ✅ (already works)
3. Add contextual re-prompts: after first quote sent → "Want a reminder to follow up in 2 days?"
4. After 3 denials, stop asking
5. Track opt-in rate in PostHog

**Build cost:** Low (1 day) — banner exists, needs contextual re-prompts at 3 key moments  
**Impact:** HIGH — enables all notification-dependent features (end-of-day, stale jobs, booking alerts)

---

### NEXT-5. Client Preferences & Important Notes (from FUTURE.md W1-3)

**Problem:** Sophie can't remember Emma is allergic to latex. Dave can't remember Mark's boiler is a 2012 Worcester. The notes field exists on Customer but there's no "important" flag.

**Spec:**
1. Customer notes already work (confirmed in QA) ✅
2. Add "⚠ Important" flag on notes — pins to top with warning styling
3. Important notes show as a banner on Job Detail for that customer
4. Use cases: allergies (beauty), safety notes (trades), access instructions (gate codes, parking)

**Build cost:** Low (1 day) — notes field exists, add boolean flag + banner component  
**Impact:** Medium — retention through personalisation. "My plumber remembers my boiler" builds loyalty.

---

### NEXT-6. Multi-Device Cloud Sync Hardening (from FUTURE.md W3-2)

**Problem:** Dave's phone breaks → data gone. Sophie wants phone + iPad. The initialSync exists but has timeout issues (found in QA — session expiry, sync errors).

**Spec:**
1. Harden initialSync — increase timeout, add retry logic, show progress indicator
2. Test real-time sync via Supabase subscriptions (code exists in realtime.ts)
3. Conflict resolution: last-write-wins (document this limitation)
4. "Sync error" display needs to be actionable — show what failed and a retry button
5. Fix the message_templates sync constraint violation (found in QA — PROD-13)

**Build cost:** Medium (3-4 days) — infrastructure hardening  
**Impact:** HIGH — data insurance. A user who loses their data never comes back.

---

## NOT YET — Defer Until PMF

| Feature | Why Defer |
|---|---|
| Business insights & coaching (W3-3) | Need 3+ months of data + expense tracking first |
| Smart auto-messaging (W3-1) | Need notification opt-in rate > 40% first |
| Calendar sync (iCal) | Nice-to-have, low daily friction |
| Supplier price tracking | Need expense data for 3+ months |
| Full Stripe checkout (in-app) | Payment links cover 80% |
| AI-powered quote pricing | Liability risk, Dave knows his pricing |
| Multi-staff scheduling | Solo trader product thesis |
| Accounting integration | CSV export covers 80% |

---

## Recommended Build Order

| Sprint | Features | Duration | Impact |
|---|---|---|---|
| **Sprint 1 (now)** | FIX-1: All QA critical bugs | 2-3 days | Unblocks user testing |
| **Sprint 2** | FIX-2: Materials CRUD + NEXT-1: Expense tracking | 4-5 days | Dashboard accuracy |
| **Sprint 3** | NEXT-2: End-of-day prompt + NEXT-3: Quote revision + NEXT-4: Notification flow | 3-4 days | Daily engagement |
| **Sprint 4** | NEXT-5: Important notes + NEXT-6: Cloud sync hardening | 4-5 days | Retention + data safety |

**Total: ~15-17 days for all tiers**

---

## Success Metrics

After implementing Tier 1-2, measure:

| Metric | Target | How |
|---|---|---|
| Dashboard profit accuracy | 100% (revenue - expenses = profit) | Manual verification |
| In-progress jobs left overnight | <10% (down from current ~30%) | PostHog: overnight_auto_complete events |
| Quote revision rate | Track % of quotes that get revised | PostHog: quote_revised event |
| Notification opt-in rate | >40% (up from current ~15% estimated) | PostHog: notification_permission_granted |
| User completes first quote in one session | >80% | PostHog funnel: quote_started → quote_sent |
| 7-day retention | >60% | PostHog: return session within 7 days of signup |

---

*PRD created 27 June 2026 — informed by full QA audit (164 features, 129 tested), FUTURE.md roadmap, and GTM strategy*
