# Payment UX Fixes — Progress

## Summary
7 fixes for the payment flow: deposit on Mark as Booked, card option in Home sheets, remove card from Mark as Paid, shorten status badge, URL overflow fix, Stripe link in chases (already existed), payment method indicator badge.

## Items

| # | Item | Status | Commit |
|---|------|--------|--------|
| 1 | JobDetail: deposit flow on Mark as Booked (shows record_deposit sheet for deposit-term jobs) | ✅ Done | 3be3b32 |
| 2a | Home: card payment option in mark_done sheet (stripe_connected check + handleStripePayment) | ✅ Done | 3be3b32 |
| 2b | Home: card payment option in mark_done_deposit sheet | ✅ Done | 3be3b32 |
| 3a | JobDetail: removed card payment from Mark as Paid sheet (was confusing — that's for recording existing payments) | ✅ Done | 3be3b32 |
| 3b | JobDetail: added "Request card" button on awaiting_payment footer alongside "Mark as Paid" | ✅ Done | 3be3b32 |
| 3c | JobDetail: removed card from mark_done sheet (keep it in More Options + footer) | ✅ Done | 3be3b32 |
| 4 | StatusBadge: "Awaiting Payment" → "Awaiting", "In Progress" → "Active", shrink-0 added | ✅ Done | 3be3b32 |
| 5 | SendSheet: break-all on message text (prevents URL overflow) | ✅ Done | 3be3b32 |
| 6 | Chase reminder: Stripe link already included in chase messages (no change needed) | ✅ Already done | — |
| 7 | JobDetail: "Card link sent" badge on header when deposit_stripe_url exists | ✅ Done | 3be3b32 |
| 8 | TSC clean + build passes | ✅ Done | 3be3b32 |

## Files Changed
- src/screens/JobDetail/index.tsx — deposit on booking, removed card from mark_done/mark_paid, request card on footer, payment indicator badge
- src/screens/Home/index.tsx — handleStripePayment function, card options in both mark_done sheets
- src/components/StatusBadge/index.tsx — shorter labels + shrink-0
- src/components/SendSheet/index.tsx — break-all for URLs
