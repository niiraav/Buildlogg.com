# Supabase Email Delivery Setup (Resend SMTP)

## Why confirmation emails aren't arriving

Diagnosed 2026-06-20 by calling the live Supabase signup endpoint directly:

```json
{ "code": 429, "error_code": "over_email_send_rate_limit", "msg": "email rate limit exceeded" }
```

**Root cause:** the project is still using Supabase's **built-in email service**. That service is
hard-throttled (~3 emails/hour on the free tier, 4/hour on Pro -- shared across *all* auth emails:
signups, magic links, password resets, invites). Once the cap is hit, every `signUp` call fails to
send the confirmation email and the client gets `over_email_send_rate_limit`. Even under the cap,
the built-in sender (`noreply@mail.supabase.com`) has poor reputation and lands in spam.

A `RESEND_API_KEY` already exists in `.env`, but it is **not referenced by any code** and was never
configured as Supabase's custom SMTP -- so it does nothing. This guide wires it up.

The fix is entirely in the **Supabase Dashboard** (no code deploy needed). Steps below.

---

## Step 1 -- Verify a sending domain in Resend

Resend's shared sandbox address `onboarding@resend.dev` **only delivers to the Resend account
owner's own inbox**, so it is useless for real signups. You must verify your own domain.

1. Sign in to https://resend.com/domains
2. Add a domain to verify. **Buildlogg uses the subdomain `mail.buildlogg.com`** (verified
   2026-06-22). You can verify the apex `buildlogg.com` instead if you prefer, but whatever you
   verify here **must match the "Sender email" domain in Step 2** -- Resend rejects any `from`
   address whose domain is not verified (Supabase then surfaces this as
   `500 "Error sending confirmation email"`).
3. Add the DNS records Resend shows you (SPF / DKIM / DMARC). Wait for status **Verified**.
4. Use the **send-only API key** already in `.env` (`RESEND_API_KEY`, prefix `re_NEN...`) -- this
   key is restricted to sending, which is exactly what SMTP needs. It is also the **SMTP password**.

> The Resend key in `.env` is scoped "send only" and cannot list domains -- that's expected and fine.

---

## Step 2 -- Enable custom SMTP in Supabase

Supabase Dashboard -> **Authentication -> SMTP Settings** (a.k.a. "Email Provider")

| Field              | Value                                      |
|--------------------|--------------------------------------------|
| Enable custom SMTP | **ON** (disables built-in sender + its rate limiter) |
| Host               | `smtp.resend.com`                          |
| Port               | `465` (SSL) -- or `587` for STARTTLS       |
| Username           | `resend`                                   |
| Password           | `<paste your RESEND_API_KEY, e.g. re_NEN...>` |
| Sender email       | `no-reply@mail.buildlogg.com` (must be on a **Resend-verified** domain) |
| Sender name        | `Buildlogg`                                |
| Minimum interval   | `1` second (Supabase requires > 0; 1s = effectively no throttle) |

Click **Save**, then use Supabase's "Send test email" button to confirm credentials work.

> **If you see `500 "Error sending confirmation email"` after enabling SMTP:** the Sender email's
> domain is not verified in Resend (or doesn't match the verified domain). Diagnose with the
> Resend API directly:
> ```bash
> RESEND_KEY=$(grep '^RESEND_API_KEY=' .env | cut -d= -f2-)
> curl -sS -X POST https://api.resend.com/emails -H "Authorization: Bearer $RESEND_KEY" \
>   -H "Content-Type: application/json" \
>   -d '{"from":"no-reply@mail.buildlogg.com","to":"<your-email>","subject":"t","text":"t"}'
> ```
> A `403 "domain is not verified"` means the `from` domain isn't verified -- fix the Sender email
> in Supabase SMTP Settings to use your verified domain. A `200 {"id":"..."}` means Resend is fine
> and the issue is elsewhere (host/port/credentials).

After this, `over_email_send_rate_limit` is gone and confirmations are delivered by Resend.

---

## Step 3 -- Allowlist the redirect URL + set Site URL

Supabase Dashboard -> **Authentication -> URL Configuration**

- **Site URL:** `https://buildlogg.com`
- **Redirect URLs** (add each on its own line):
  - `https://buildlogg.com/app/auth`   <-- used by `emailRedirectTo` in `Auth.tsx`
  - `https://buildlogg.com/**`
  - `http://localhost:5173/app/auth`    <-- local `vite` dev (port 5173)

If `https://buildlogg.com/app/auth` is not in this list, the confirmation link errors when clicked
even after the email is delivered. (Separate failure mode from "email not arriving", but fix now
so the full flow works.)

---

## Step 4 -- Fix the email template (important)

Supabase Dashboard -> **Authentication -> Email Templates -> Confirm signup**

The confirmation flow in `Auth.tsx` is **password signup -> confirmation LINK**, not an OTP code.
The template must contain the link variable:

```text
{{ .ConfirmationURL }}
```

> Note: an old note in `.env` said to use the **Magic Link** template with `{{ .Token }}`. That is
> stale and wrong for this flow. `{{ .Token }}` renders a short code and only applies to OTP/magic
> link sign-in. For password-signup confirmation you need `{{ .ConfirmationURL }}`.

Minimal working template body:

```html
<h2>Welcome to Buildlogg</h2>
<p>Confirm your email to activate your account:</p>
<p><a href="{{ .ConfirmationURL }}">Confirm your email</a></p>
<p>If you didn't sign up, you can ignore this email.</p>
```

Leave "Confirm email" (Email provider -> Email) **enabled** so `data.session` is null on signup and
the app shows the "Check your email" state.

---

## Step 5 -- Verify it works

After Steps 1-4, run the verification script with a throwaway email:

```bash
./scripts/verify-email-delivery.sh
```

Expected: a `200` with `{ "user": { ... }, "session": null }` (confirmation required, email sent)
instead of the `429 over_email_send_rate_limit`. Then check the inbox (and spam) for the link.

Manual curl:

```bash
curl -sS -X POST https://<project-ref>.supabase.co/auth/v1/signup \
  -H "apikey: <VITE_SUPABASE_ANON_KEY>" \
  -H "Content-Type: application/json" \
  -d '{"email":"test+<timestamp>@example.com","password":"TestPassword123!"}'
```

- `429 over_email_send_rate_limit` -> SMTP not enabled yet (re-check Step 2).
- `200` + `session: null` -> email sent; check Resend -> Logs for the delivery event.

---

## Cleanup after testing

Test signups create real rows in `auth.users`. Delete them in
Supabase Dashboard -> Authentication -> Users (filter by the test email).
