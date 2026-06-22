#!/usr/bin/env bash
# Verify Supabase auth email delivery after configuring Resend SMTP.
# See docs/SUPABASE-EMAIL-SETUP.md
#
# Runs a real (throwaway) signup against the live Supabase project and reports whether
# the confirmation email can be sent. Before SMTP is configured you get 429
# over_email_send_rate_limit; after, you should get 200 with session: null.
#
# Usage:  ./scripts/verify-email-delivery.sh
set -euo pipefail

ENV_FILE="$(cd "$(dirname "$0")/.." && pwd)/.env"
if [[ ! -f "$ENV_FILE" ]]; then
  echo "ERROR: .env not found at $ENV_FILE" >&2
  exit 1
fi

SB_URL="$(grep -E '^VITE_SUPABASE_URL=' "$ENV_FILE" | cut -d= -f2-)"
ANON="$(grep -E '^VITE_SUPABASE_ANON_KEY=' "$ENV_FILE" | cut -d= -f2-)"

if [[ -z "$SB_URL" || -z "$ANON" ]]; then
  echo "ERROR: VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY missing from .env" >&2
  exit 1
fi

TS="$(date +%s)"
EMAIL="buildlogg-verify-${TS}@example.com"
echo "Project : $SB_URL"
echo "Test    : signup $EMAIL"
echo "------------------------------------------------------------"

RESP="$(curl -sS --max-time 30 \
  -X POST "$SB_URL/auth/v1/signup" \
  -H "apikey: $ANON" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"TestPassword123!\"}" || true)"

echo "$RESP" | python3 -m json.tool 2>/dev/null || echo "$RESP"
echo "------------------------------------------------------------"

if echo "$RESP" | grep -q "over_email_send_rate_limit"; then
  echo "RESULT: STILL RATE-LIMITED (429). Custom SMTP is NOT enabled yet."
  echo "        -> Re-do Step 2 in docs/SUPABASE-EMAIL-SETUP.md (enable Resend SMTP)."
  exit 2
fi

if echo "$RESP" | grep -q "Error sending confirmation email"; then
  echo "RESULT: SMTP SEND FAILED (500). Supabase reached Resend but Resend rejected the email."
  echo "        Most common cause: the Sender email domain is NOT verified in Resend."
  echo "        -> Check Supabase SMTP Settings 'Sender email' uses a Resend-verified domain"
  echo "           (Buildlogg uses no-reply@mail.buildlogg.com). See the troubleshooting note"
  echo "           in docs/SUPABASE-EMAIL-SETUP.md for the Resend-API diagnostic."
  exit 4
fi

# Confirmation-required signup: Supabase's raw REST API returns the user object at the
# top level with `confirmation_sent_at` set and NO `session`/`access_token` key. The JS
# SDK wraps this differently (data.session === null), so check both shapes.
if echo "$RESP" | grep -q '"confirmation_sent_at"'; then
  echo "RESULT: OK - confirmation email sent (confirmation_sent_at is set)."
  echo "        -> Resend accepted the send. Check Resend -> Logs for the delivery event."
  echo "        -> Remember to delete the test user in Supabase -> Authentication -> Users."
  exit 0
fi

if echo "$RESP" | grep -q '"session":null' || echo "$RESP" | grep -q '"session": null'; then
  echo "RESULT: OK - confirmation email sent (session null = confirmation required)."
  echo "        -> Check Resend -> Logs + the test inbox. Delete the test user in Supabase."
  exit 0
fi

if echo "$RESP" | grep -q '"access_token"'; then
  echo "RESULT: OK - signed up + auto-confirmed (no email needed). Email confirmation may be OFF."
  exit 0
fi

echo "RESULT: Unexpected response - inspect above."
exit 3
