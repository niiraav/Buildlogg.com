# Stripe Setup Guide — Buildlogg

> Complete setup instructions for Stripe integration (W2-2)

## Prerequisites

- A Stripe account (UK)
- Access to Cloudflare Pages dashboard
- Access to Supabase dashboard

## Step 1: Create a Restricted API Key

1. Go to **Stripe Dashboard → Developers → API Keys**
2. Click **"Create restricted key"**
3. Name it: `Buildlogg Server`
4. Select these permissions:
   - **Checkout Sessions**: Write
   - **Webhooks**: Read
5. Click **"Create key"**
6. Copy the key starting with `sk_live_` (or `sk_test_` for test mode)

## Step 2: Create a Webhook Endpoint

1. Go to **Stripe Dashboard → Developers → Webhooks**
2. Click **"Add endpoint"**
3. Endpoint URL: `https://buildlogg.com/api/stripe-webhook`
   - For testing with preview deploys: `https://codex-wave-2-booking-funnel.tradepad-eu0.pages.dev/api/stripe-webhook`
4. Select events to send:
   - `checkout.session.completed`
5. Click **"Add endpoint"**
6. On the endpoint page, click **"Signing secret"** → Reveal → Copy the key starting with `whsec_`

## Step 3: Add Environment Variables to Cloudflare

Go to **Cloudflare Dashboard → Pages → tradepadapp → Settings → Environment variables**

Add these to **both Production and Preview**:

| Type | Name | Value |
|------|------|-------|
| Secret | `STRIPE_SECRET_KEY` | `sk_live_...` (from Step 1) |
| Secret | `STRIPE_WEBHOOK_SECRET` | `whsec_...` (from Step 2) |

## Step 4: Verify the Webhook

1. After deploying, go back to **Stripe Dashboard → Developers → Webhooks**
2. Click your endpoint
3. Click **"Send test webhook"**
4. Select `checkout.session.completed`
5. Click **"Send test webhook"**
6. Check that the webhook receives a 200 response

## What Each Key Does

| Key | Purpose | Where it's used |
|-----|---------|-----------------|
| `STRIPE_SECRET_KEY` | Creates Checkout Sessions (payment links) | `functions/api/create-checkout-session.js` |
| `STRIPE_WEBHOOK_SECRET` | Verifies webhook signatures (security) | `functions/api/stripe-webhook.js` |

## How the Flow Works

1. Merchant marks a job as "Booked" in the app
2. App offers "Take a deposit?"
3. Merchant enters amount (e.g., £50)
4. App calls `/api/create-checkout-session` with merchantId, jobId, amount
5. Cloudflare Function creates a Stripe Checkout Session
6. App receives the checkout URL
7. Merchant shares the URL via WhatsApp/SMS using SendSheet
8. Client opens URL → pays by card/Apple Pay
9. Stripe fires webhook to `/api/stripe-webhook`
10. Webhook verifies signature → updates `checkout_sessions` → updates job `deposit_status = 'paid'` → creates Payment record
11. Merchant's app syncs the updated job status

## Testing

### Test mode (no real money):
1. Use `sk_test_...` key instead of `sk_live_...`
2. Use Stripe test card: `4242 4242 4242 4242`, any expiry, any CVC
3. Webhook still fires and updates the database

### Going live:
1. Replace `sk_test_...` with `sk_live_...` in Cloudflare env vars
2. Update webhook endpoint URL if you were using a preview URL
3. Redeploy

## Troubleshooting

| Issue | Fix |
|-------|-----|
| "Stripe not configured" in app | `STRIPE_SECRET_KEY` not set in Cloudflare env vars |
| Webhook returns 400 "Invalid signature" | `STRIPE_WEBHOOK_SECRET` doesn't match the endpoint's signing secret |
| Webhook returns 500 | `SUPABASE_URL` or `SUPABASE_SERVICE_ROLE_KEY` not set |
| Checkout session creation fails | Check Stripe Dashboard → Logs for API errors |
| Payment not reflected in app | Check Supabase → `checkout_sessions` table for the session status |

## Future: Stripe Connect (multi-merchant)

Currently using a single Stripe account. When you have 50+ merchants:
1. Register as a Stripe Connect platform
2. Each merchant connects via OAuth (Stripe Connect Onboarding)
3. Checkout sessions are created on the merchant's connected account
4. Money goes directly to the merchant's bank account
5. Buildlogg takes a platform fee

This requires:
- Stripe Connect account setup
- OAuth flow in the app
- `stripe_account` parameter in API calls
- Per-merchant webhook routing

