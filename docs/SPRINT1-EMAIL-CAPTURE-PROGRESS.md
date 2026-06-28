# Sprint 1: Email Capture + Recurring Mode Selection + Email Coverage Stat — Progress

## Summary
Five changes that solve the W3-1 channel problem: email capture at natural moments (quote creation, recurring prompt), email edit on CustomerDetail, mode selection on recurring prompt, and email coverage stat in Settings.

## Items

| # | Item | Status | Commit |
|---|------|--------|--------|
| 1 | Email field on Quote CustomerDetails step + saveCustomer 4-place email save | ✅ Done | 2fbda69 |
| 2 | Email capture on recurring_prompt sheet (shown when customer has no email) | ✅ Done | 2fbda69 |
| 3 | Email edit on CustomerDetail via InlineEditRow + inputType email | ✅ Done | 2fbda69 |
| 4 | Mode selection on recurring_prompt sheet (Remind me / Auto-message / Both) | ✅ Done | 2fbda69 |
| 5 | Email coverage stat in Reminders settings ("X of Y clients have email") | ✅ Done | 2fbda69 |
| 6 | TSC clean + build passes | ✅ Done | 2fbda69 |

## Files Changed
- src/screens/Quote/CustomerDetails.tsx — email state, input, onComplete type
- src/screens/Quote/index.tsx — saveCustomer 4-place email save + handleCustomerDetailsComplete type
- src/screens/Customers/CustomerDetail.tsx — InlineEditRow for email
- src/components/InlineEditRow/index.tsx — inputType union includes 'email'
- src/screens/Settings/Reminders.tsx — email coverage stat card
- src/screens/JobDetail/index.tsx — recurring_prompt email input + mode selection
- src/screens/Home/index.tsx — recurring_prompt email input + mode selection

## Verification
- npx tsc --noEmit — 0 errors (excluding pre-existing AddToHomeScreen)
- npx vite build — passes
