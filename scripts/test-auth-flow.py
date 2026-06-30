#!/usr/bin/env python3
"""Test the Supabase signup flow and trace the confirmation link structure."""
import json
import time
import urllib.request
import urllib.error
import os
import re

# Load env
env_path = os.path.join(os.path.dirname(__file__), '..', '.env')
with open(env_path) as f:
    for line in f:
        line = line.strip()
        if line and not line.startswith('#') and '=' in line:
            key, _, val = line.partition('=')
            os.environ[key] = val

SUPABASE_URL = os.environ.get('VITE_SUPABASE_URL', '')
ANON_KEY = os.environ.get('VITE_SUPABASE_ANON_KEY', '')

print(f"Supabase URL: {SUPABASE_URL}")
print(f"Anon key prefix: {ANON_KEY[:25]}...")
print()

# 1. Check auth settings
print("=== Auth Settings ===")
req = urllib.request.Request(
    f"{SUPABASE_URL}/auth/v1/settings",
    headers={"apikey": ANON_KEY}
)
try:
    with urllib.request.urlopen(req) as resp:
        settings = json.loads(resp.read())
    print(f"  mailer_autoconfirm: {settings.get('mailer_autoconfirm')}")
    print(f"  disable_signup: {settings.get('disable_signup')}")
    print(f"  email enabled: {settings.get('external', {}).get('email')}")
except Exception as e:
    print(f"  Error: {e}")

print()

# 2. Do a test signup
email = f"test+authdebug{int(time.time())}@buildlogg.com"
password = "TestPass123!"
print(f"=== Test Signup: {email} ===")

signup_data = json.dumps({
    "email": email,
    "password": password,
    "options": {
        "emailRedirectTo": "https://buildlogg.com/app/auth"
    }
}).encode()

req = urllib.request.Request(
    f"{SUPABASE_URL}/auth/v1/signup",
    data=signup_data,
    headers={
        "apikey": ANON_KEY,
        "Content-Type": "application/json"
    },
    method="POST"
)

try:
    with urllib.request.urlopen(req) as resp:
        result = json.loads(resp.read())
    print(f"  Status: {resp.status}")
    print(f"  Has user: {result.get('user') is not None}")
    print(f"  Has session: {result.get('session') is not None}")
    if result.get('user'):
        u = result['user']
        print(f"  User ID: {u.get('id')}")
        print(f"  Email confirmed: {u.get('email_confirmed_at')}")
        print(f"  Confirmation sent: {u.get('confirmation_sent_at')}")
        # Check for any action link in the response
        print(f"  Action link: {u.get('action_link', 'N/A')}")
    if result.get('error'):
        print(f"  Error: {result['error']}")
    print(json.dumps(result, indent=2, default=str)[:2000])
except urllib.error.HTTPError as e:
    body = e.read().decode()
    print(f"  HTTP Error: {e.code}")
    print(f"  Body: {body[:500]}")
except Exception as e:
    print(f"  Error: {e}")

print()

# 3. Check what the confirmation URL format would look like
# The key question: does Supabase use PKCE (code=) or implicit (token_hash=) flow?
print("=== Flow Analysis ===")
print(f"  flowType in supabase.ts: 'pkce'")
print(f"  detectSessionInUrl: false (just changed)")
print()
print("  With PKCE flow, Supabase sends confirmation emails with a link like:")
print(f"    {SUPABASE_URL}/auth/v1/verify?token_hash=xxx&type=signup&redirect_to=https://buildlogg.com/app/auth")
print()
print("  When user clicks, Supabase verifies the token and redirects to:")
print("    https://buildlogg.com/app/auth?code=<PKCE_AUTHORIZATION_CODE>")
print()
print("  The PKCE code verifier must be stored in localStorage by the client")
print("  that called signUp(). When exchangeCodeForSession(code) is called,")
print("  the client sends BOTH the code AND the stored code_verifier.")
print()
print("  CRITICAL ISSUE: If the user signed up on one device/browser and clicks")
print("  the confirmation link on ANOTHER device/browser, the code_verifier is")
print("  NOT in that browser's localStorage. exchangeCodeForSession will fail")
print("  because PKCE requires the verifier that was generated at signup time.")
print()
print("  This is the #1 cause of 'invalid or expired' with PKCE email flows:")
print("  the code_verifier is bound to the browser that started the flow.")
