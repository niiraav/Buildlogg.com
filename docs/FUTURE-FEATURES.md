# Future Features — Buildlogg Roadmap

## The Marketplace Play

Buildlogg's free-forever tradesperson base is the **supply side** of a future customer-side booking platform. The acquisition strategy (free forever, no caps) is designed to build supply density before the marketplace exists.

### How the signature seeds the marketplace

Every free-tier message Dave sends includes "— Sent via Buildlogg.com". Over a year, 1,000 free users × 50 messages = 50,000 Buildlogg.com impressions to customers. Customers start associating Buildlogg with "finding a tradesperson" before the booking platform even launches.

### The customer-side booking platform (future)

Once supply density is reached (500+ active tradespeople):
- Customers visit Buildlogg.com, describe their job, get matched with available tradespeople
- Tradespeople receive job leads through the app they already use
- Buildlogg takes a commission on booked jobs
- Free tier tradespeople get lead notifications; Pro tier gets priority ranking + unlimited leads

This is the OpenTable model: free software to restaurants (tradespeople), revenue from customer bookings (the marketplace).

---

## Future Pro Features (when built)

| Feature | Description | Why Pro |
|---------|-------------|---------|
| Expense tracking | Fuel, parking, tools, receipt photo capture. Monthly totals by category. CSV export. | Business intelligence |
| Job checklists | Per-trade quality checklists + digital sign-off | Professional workflow |
| Team / multi-user | Owner invites employees, assigns jobs, shared customer DB, role-based permissions | Business platform |
| Accountant export | HMRC/CIS-compliant CSV/PDF export for tax returns | Compliance |
| Recurring jobs | Auto-generate next job on completion, reminder nudges | Revenue protection |
| Payment chases | Automated Day 7/14/30 reminders with payment link | Revenue protection |
| Referral engine | Tracked referral page, vCard sharing, "refer a friend" flow | Growth tool |
| Priority listing | Higher ranking in marketplace search results | Marketplace feature |
| Lead alerts | Real-time push for new job leads in their area | Marketplace feature |

---

## Entitlements Architecture

The codebase has an adaptive entitlements system (`src/lib/entitlements.ts` + `src/hooks/useEntitlements.ts`). Adding a new Pro feature:

1. Add to `Feature` type in `entitlements.ts`
2. Add to `PRO_FEATURES` array
3. Add `can('new_feature')` check at the gate point in the UI

No architecture changes needed. The `useEntitlements` hook returns `{ isPro, can, upgradeUrl }` and is the single source of truth for all feature gating.

During beta: `isPro = true` for everyone. Post-beta: reads `profile.subscription_status` from Supabase.

---

*Last updated: 2026-06-26*
