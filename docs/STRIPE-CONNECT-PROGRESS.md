# Stripe Connect + Beta-to-Live Flip — Progress

## Summary
Stripe Connect Express onboarding for merchants (replacing single-account mode), checkout routing to connected accounts, webhook for account.updated, Settings UI redirect flow, VITE_BETA_MODE env var for beta-to-live flip.

## Items

| # | Item | Status | Commit |
|---|------|--------|--------|
| 1 | stripe-connect-onboard.js Function (creates Express account + account link) | ✅ Done | 21f1705 |
| 2a | create-checkout-session.js — Stripe-Account header for Connect | ✅ Done | 21f1705 |
| 2b | booking function — stripe_account_id in SELECT + Stripe-Account header | ✅ Done | 21f1705 |
| 3 | webhook — account.updated handler (sets stripe_connected based on details_submitted + payouts_enabled) | ✅ Done | 21f1705 |
| 4 | Settings UI — Connect onboarding redirect + ?stripe=return/refresh toast | ✅ Done | 21f1705 |
| 5 | VITE_BETA_MODE env var + useEntitlements beta-to-live flip | ✅ Done | 21f1705 |
| 6 | TSC clean + build passes | ✅ Done | 21f1705 |

## Files Changed
- functions/api/stripe-connect-onboard.js (NEW) — Express onboarding
- functions/api/create-checkout-session.js — Stripe-Account header
- functions/book/[[slug]].js — stripe_account_id in SELECT + header
- functions/api/stripe-webhook.js — account.updated handler
- src/screens/Settings/index.tsx — Connect redirect + toast
- src/hooks/useEntitlements.ts — VITE_BETA_MODE check
- .env — VITE_BETA_MODE=true

## Manual Setup Required
1. Add Stripe key permissions: accounts_write, account_links_write, connected_account_read (DONE by user)
2. Add account.updated to webhook events in Stripe Dashboard
3. Add VITE_BETA_MODE=true to Cloudflare env (Production + Preview)
4. Deploy to activate

## To Go Live
1. Set VITE_BETA_MODE=false in Cloudflare
2. Batch-update beta profiles: UPDATE profiles SET subscription_status='trialing', subscription_ends_at='2026-09-30' WHERE subscription_status IS NULL
3. Change landing page pricing from "Free during beta" to "£19/month"
4. Deploy
