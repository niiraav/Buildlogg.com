# Pro Subscription Checkout + Webhook + Settings UI — Progress

## Summary
Prepare the revenue model for when beta ends. New Cloudflare Function creates Stripe Checkout for Pro subscription (£14/mo recurring). Webhook handles subscription lifecycle events. Settings shows "Your plan" section with upgrade button. Everything built but NOT activated — beta users stay Pro. Activation = create Stripe Price + set STRIPE_PRO_PRICE_ID env var.

## Items

| # | Item | Status | Commit | Verified |
|---|------|--------|--------|----------|
| 1 | create-subscription-session.js Function (mode: subscription) | ✅ Done | 1265984 | File exists, follows create-checkout-session pattern |
| 2 | Webhook: subscription branch in checkout.session.completed | ✅ Done | 1265984 | session.mode === 'subscription' → update profile, return before job logic |
| 3 | Webhook: customer.subscription.updated handler | ✅ Done | 1265984 | Updates subscription_status + subscription_ends_at from current_period_end |
| 4 | Webhook: customer.subscription.deleted handler | ✅ Done | 1265984 | Sets subscription_status = 'canceled' |
| 5 | Webhook: charge.dispute.created logging | ✅ Done | 1265984 | console.error with dispute ID + reason |
| 6 | Settings: "Your plan" section with Pro/Free status | ✅ Done | 1265984 | Shows "Pro — Free during beta" or "Free plan" + upgrade button |
| 7 | Settings: "Upgrade to Pro" button → calls Function → redirects to Stripe | ✅ Done | 1265984 | fetch /api/create-subscription-session → window.location.href = url |
| 8 | Settings: ?subscription=success/cancelled toast on return | ✅ Done | 1265984 | Reads URL param, shows toast |
| 9 | Migration: stripe_customer_id column | ✅ Done | 1265984 | 20260629000002_stripe_customer_id.sql |
| 10 | db.ts: stripe_customer_id on Profile interface | ✅ Done | 1265984 | Optional field, no breaking change |
| 11 | TSC clean + build passes | ✅ Done | 1265984 | TSC 0 errors, build 2x ✓ |

## Files Changed
- functions/api/create-subscription-session.js (NEW) — Stripe subscription checkout
- functions/api/stripe-webhook.js — subscription + dispute event handlers
- src/screens/Settings/index.tsx — "Your plan" section + upgrade button + return toast
- src/lib/db.ts — stripe_customer_id on Profile
- supabase/migrations/20260629000002_stripe_customer_id.sql (NEW) — migration

## Manual Setup Required to Activate
1. Run migration in Supabase SQL Editor: 20260629000002_stripe_customer_id.sql
2. Create Stripe Product "Buildlogg Pro" + Price £14/month recurring in Stripe Dashboard
3. Copy price_xxx ID → add as STRIPE_PRO_PRICE_ID in Cloudflare env (Production + Preview)
4. Add webhook events in Stripe Dashboard: customer.subscription.updated, customer.subscription.deleted, charge.dispute.created
5. Beta users stay Pro (subscription_status = null → isPro = true). To end beta: batch-update profiles to subscription_status = 'trialing'
