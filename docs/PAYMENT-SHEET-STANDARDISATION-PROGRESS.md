# Payment Sheet Standardisation — Progress

## Summary
Standardised all 5 payment method sheets across Home and JobDetail. "Record payment" sheets: Cash, Bank Transfer, Terminal, Other. "Complete job" sheets: Cash, Bank Transfer, Terminal, Card link (if stripe), Other, Not yet.

## Items

| # | Item | Status | Commit |
|---|------|--------|--------|
| 1 | Home: add Building2 + Pencil imports, add 'other' to handlePayment type | ✅ Done | HEAD |
| 2 | Home mark_done: add Card link + Other, reorder to standard | ✅ Done | HEAD |
| 3 | Home mark_done_deposit: add Bank Transfer + Other, reorder to standard | ✅ Done | HEAD |
| 4 | JobDetail mark_done: add Terminal (card link already existed) | ✅ Done | HEAD |
| 5 | JobDetail mark_paid: add Terminal | ✅ Done | HEAD |
| 6 | JobDetail record_deposit: add Terminal + Card link | ✅ Done | HEAD |
| 7 | TSC clean + build passes | ✅ Done | HEAD |

## Standard Layouts

**Record payment** (Mark as Paid, Record Deposit): Cash → Bank Transfer → Terminal → Other
**Complete job** (Mark Done, Mark Done Deposit): Cash → Bank Transfer → Terminal → Card link → Other → Not yet

## Files Changed
- src/screens/Home/index.tsx — imports, handlePayment type, both mark_done sheets
- src/screens/JobDetail/index.tsx — 3 handler types + 3 sheets
