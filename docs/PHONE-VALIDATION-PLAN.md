# Phone Number Validation & Verification — Full Plan

**Date:** 29 June 2026  
**Author:** Nirav + Hermes

---

## PART 1: Current State Audit

### Every phone number touchpoint in the codebase

| # | Location | File | Who enters | Current validation | International? | Format helper | Stored as |
|---|---|---|---|---|---|---|---|
| 1 | **Settings — merchant phone** | `Settings/index.tsx` L1045 | Merchant | `validateUKPhone()` — UK only | ❌ Rejects +48, +353 | `normalizeUKPhone()` → +44XXXXXXXXXX | `profile.phone` |
| 2 | **Onboarding — merchant phone** | `Onboarding/index.tsx` L127 | Merchant | **None** — hardcoded `phone: ''` | N/A (empty) | None | `profile.phone` |
| 3 | **Quote builder — customer phone** | `Quote/CustomerDetails.tsx` L281 | Merchant | `formatUkPhoneInput()` — forces 07 prefix, caps 11 digits | ❌ Strips +44, forces 0 | Same function | `customer.phone` |
| 4 | **Add Customer — phone** | `Customers/AddCustomer.tsx` L134 | Merchant | `type="tel"` only, no regex | ✅ Accepts anything | None | `customer.phone` |
| 5 | **Log Missed Call — phone** | `Quote/LogMissedCall.tsx` L161 | Merchant | Error message says "UK mobile" but no regex validation | ✅ Accepts anything | None | Job/customer phone |
| 6 | **Booking page — client phone** | `functions/book/[[slug]].js` L10 | Customer | `UK_PHONE_REGEX = /^(\+44\|0)[0-9]{10}$/` | ❌ Rejects all non-UK | None | `booking_requests.client_phone` |
| 7 | **Customer search** | `Customers/index.tsx` L119 | Merchant | None (search field) | N/A | N/A | N/A |
| 8 | **SendSheet — WhatsApp** | `SendSheet/index.tsx` L150 | Uses stored | `phone.replace(/\D/g, '')` — strips non-digits | ✅ Works with any E.164 | None | N/A (runtime) |
| 9 | **JobCard — Call/Message** | `JobCard/index.tsx` L80,88 | Uses stored | `tel:` and `wa.me/` deep links | ✅ Works with any format | None | N/A (runtime) |
| 10 | **ActiveBar — Call/SMS** | `ActiveBar/index.tsx` L50,56 | Uses stored | `tel:` and `sms:` deep links | ✅ Works with any format | None | N/A (runtime) |
| 11 | **PDF generator — invoice** | `pdfGenerator.ts` L64,106 | Uses stored | None — prints raw string | ✅ Prints whatever is stored | None | N/A (runtime) |
| 12 | **Customer dedup — by phone** | `customers.ts` L12 | Uses stored | `normalizePhone()` — UK only normalisation | ❌ Non-UK passes through unnormalised | Same function | N/A (runtime) |
| 13 | **Booking accept — customer match** | `booking.ts` L198 | Uses stored | `findDuplicateByPhone()` → `normalizePhone()` | ❌ UK-only normalisation | Same function | N/A (runtime) |

### Key findings

1. **3 separate phone validation/normalisation functions exist** — `validateUKPhone` + `normalizeUKPhone` in Settings, `formatUkPhoneInput` in CustomerDetails, `normalizePhone` in customers.ts. All UK-only. No shared utility.

2. **Inconsistent validation across inputs** — Settings rejects non-UK, Add Customer accepts anything, Quote builder forces UK format, Onboarding has no validation at all.

3. **WhatsApp deep links work with any number** — `wa.me/${phone.replace(/\D/g, '')}` strips non-digits and works with any E.164 number (e.g. `wa.me/48123456789`). The problem is upstream — if the stored number is in UK format `07...`, the `replace(/\D/g, '')` produces `07...` without country code, and `wa.me/07123456789` doesn't work internationally.

4. **Customer dedup is UK-only** — `normalizePhone()` only normalises UK numbers. A customer saved as `+48123456789` and another as `0048123456789` won't be matched as duplicates.

5. **Booking page rejects non-UK customers** — a Polish customer trying to book a UK plumber can't submit the form.

6. **Onboarding doesn't collect phone at all** — `phone: ''` is hardcoded. The merchant only adds their phone later in Settings.

---

## PART 2: Use Cases & Edge Cases

### Core use cases

**UC-1: Merchant enters their own phone (Onboarding/Settings)**
- Dave is a UK plumber with `07837 391 747` — should normalise to `+447837391747`
- Marek is a Polish plumber working in UK with `+48 512 345 678` — should accept as-is
- Dave types `07837 391 174` (typo) — should be caught by "Send test WhatsApp" button
- Dave leaves phone empty — should be allowed initially but prompted to add before enabling booking page

**UC-2: Merchant enters customer phone (Quote/Add Customer/Missed Call)**
- Dave enters `07700 900123` for a UK customer — normalise to `+447700900123`
- Dave enters `+353 86 123 4567` for an Irish customer — accept as-is, normalise to `+353861234567`
- Dave enters `00353861234567` — normalise to `+353861234567`
- Dave enters `12345` (too short) — show format error
- Dave enters nothing — allow (phone is optional for customers)

**UC-3: Customer enters their phone on booking page**
- UK customer enters `07700 900123` — accept
- UK customer enters `+447700900123` — accept
- Irish customer enters `+353861234567` — accept (currently rejected ❌)
- Customer enters `12345` — reject with helpful error
- Customer enters nothing — reject (required field)

**UC-4: Phone number used in WhatsApp deep link**
- `wa.me/447837391747` — works ✅
- `wa.me/07837391747` — doesn't work (missing country code) ❌
- `wa.me/353861234567` — works ✅
- `wa.me/+447837391747` — doesn't work (wa.me doesn't accept +) ❌

**UC-5: Phone number used in tel: deep link**
- `tel:+447837391747` — works on mobile ✅
- `tel:07837391747` — works on mobile ✅
- `tel:+353861234567` — works on mobile ✅

**UC-6: Customer dedup by phone**
- Same customer enters `07700 900123` on booking page, Dave also has them as `+447700900123` in his customer list — should match
- Customer with Irish number `+353861234567` books twice — should match
- Customer enters `0044 7700 900123` vs `+44 7700 900123` — should match (both normalise to `+447700900123`)

**UC-7: Phone number on PDF invoice**
- `+447837391747` — prints correctly ✅
- `07837 391747` — prints correctly but less professional ✅
- `+353 86 123 4567` — prints correctly ✅

### Edge cases

**EC-1: Empty phone**
- Merchant profile with no phone → booking page shows no phone (if `booking_show_phone` is on)
- Customer with no phone → "Call" and "Message" buttons disabled
- Add Customer → phone is optional, allow empty

**EC-2: Partially typed number**
- User types `07` then tabs away — don't validate on every keystroke, validate on blur
- User types `+44 7` then continues — don't truncate mid-typing

**EC-3: Landline numbers**
- UK landline: `020 7946 0958` — current `validateUKPhone` rejects this (only accepts `07...` mobiles)
- Should landlines be accepted? Dave might have a customer who only has a landline
- Decision: accept any valid phone format, don't restrict to mobiles

**EC-4: Very long numbers**
- International numbers can be up to 15 digits (E.164 standard)
- Current `formatUkPhoneInput` caps at 11 digits — would truncate international numbers

**EC-5: Formatting display**
- `+447837391747` is hard to read — should display as `+44 7837 391747` or `07837 391747`
- But stored format should be E.164 for consistent dedup

**EC-6: Phone number changes**
- Dave changes his phone number in Settings → old quotes still show old number (quotes are sent as text, not regenerated)
- Customer changes phone number → future quotes use new number, old quotes unaffected
- Booking page shows current profile.phone — updates immediately on Settings change

**EC-7: WhatsApp without country code**
- If stored as `07837391747` (no country code), `wa.me/07837391747` fails silently
- Need to normalise to E.164 (`+447837391747`) before storing so `wa.me/447837391747` works
- For non-UK numbers entered without country code, we can't know the country — accept as-is but warn

**EC-8: Rate limiting on booking page**
- Currently uses `client_phone` for rate limiting (3 per hour per phone)
- If phone normalisation changes, existing rate-limit records may not match new format
- Need to normalise before rate-limit check

**EC-9: Data migration**
- Existing customers in Dexie/Supabase have phones in various formats (`07...`, `+44...`, `447...`)
- Need a migration to normalise all existing phones to E.164
- Risk: changing stored phone format could break dedup if some are normalised and others aren't

**EC-10: Mock mode**
- Dev mode uses mock data with sample customers — phone format in sample data may not match new validation

---

## PART 3: Design Decisions

### Decision 1: Store all phones in E.164 format

**E.164 format:** `+` followed by country code and number, no spaces. Max 15 digits.
- UK mobile: `+447837391747`
- Irish mobile: `+353861234567`
- Polish mobile: `+48512345678`

**Why:** This is the international standard, works with `wa.me/`, `tel:`, and `sms:` deep links (after stripping `+` for wa.me). Enables consistent dedup across all formats.

**Trade-off:** Display format is less readable (`+447837391747` vs `07837 391747`). Solution: format for display, store as E.164.

### Decision 2: Accept international numbers everywhere

**All phone inputs accept any valid phone number.** UK numbers get auto-normalised (strip leading 0, add +44). International numbers require the user to include the country code.

**Why:** UK tradespeople serve diverse communities. Rejecting non-UK numbers on the booking page loses customers.

**Trade-off:** Can't auto-detect country code for numbers entered without one. If Dave types `512 345 678` (Polish number without +48), we can't know it's Polish. Solution: require country code for non-UK numbers, show a hint.

### Decision 3: No SMS OTP verification (yet)

**Use "Send test WhatsApp" button instead of SMS OTP.**

**Why:** 
- SMS OTP costs money (£0.05/SMS via Twilio)
- WhatsApp deep links are free
- The self-correcting incentive is strong (wrong number = can't receive customer calls)
- Full OTP is needed when server-side SMS sending is added (future)

### Decision 4: Create a shared phone utility module

**One module (`src/lib/phone.ts`) handles all phone validation, normalisation, and formatting.** Replace the 3 scattered functions.

### Decision 5: Booking page accepts international numbers

**Relax `UK_PHONE_REGEX` to accept any E.164-format number.** Keep rate limiting by normalised phone.

---

## PART 4: Implementation Plan

### Step 1: Create shared phone utility module

**File:** `src/lib/phone.ts` (new)

```typescript
/**
 * Phone number utilities — shared across all phone inputs in the app.
 * Stores all phones in E.164 format (+countrycode + number, no spaces).
 */

/**
 * Validate a phone number. Accepts:
 * - UK: 07XXXXXXXXX, 447XXXXXXXXX, +447XXXXXXXXX
 * - International: +<countrycode><number> (7-15 digits total)
 * - UK landline: 0XXXXXXXXXX (area code + number)
 * Returns null if valid, error message if invalid.
 */
export function validatePhone(value: string): string | null {
  const cleaned = value.replace(/[\s-()]/g, '');
  if (!cleaned) return null; // Empty is valid (phone is optional in some contexts)
  
  // UK mobile: 07XXXXXXXXX or 447XXXXXXXXX
  if (/^(\+?44)?0?7\d{9}$/.test(cleaned)) return null;
  // UK landline: 0XXXXXXXXXX (area code starts 01/02/03)
  if (/^0[123]\d{8,9}$/.test(cleaned)) return null;
  // International with +: 7-15 digits
  if (/^\+\d{7,15}$/.test(cleaned)) return null;
  // International with 00: 00 + 7-15 digits
  if (/^00\d{7,15}$/.test(cleaned)) return null;
  
  return 'Enter a valid phone number with country code (e.g. +44 7700 900123)';
}

/**
 * Normalise a phone number to E.164 format.
 * - 07XXXXXXXXX → +447XXXXXXXXX
 * - 0XXXXXXXXXX (landline) → +44XXXXXXXXXX
 * - 447XXXXXXXXX → +447XXXXXXXXX
 * - +447XXXXXXXXX → +447XXXXXXXXX
 * - 00XXXXXXXXXXX → +XXXXXXXXXXX
 * - +XXXXXXXXXXX (already E.164) → +XXXXXXXXXXX
 * - Unknown format → return as-is (trimmed)
 */
export function normalizePhone(phone: string): string {
  if (!phone) return '';
  const cleaned = phone.replace(/[\s-()]/g, '');
  if (!cleaned) return '';
  
  // UK mobile: 07XXXXXXXXX
  if (/^0?7\d{9}$/.test(cleaned)) return '+44' + cleaned.replace(/^0/, '');
  // UK with 44 prefix
  if (/^447\d{9}$/.test(cleaned)) return '+' + cleaned;
  // +44 already
  if (/^\+447\d{9}$/.test(cleaned)) return cleaned;
  // UK landline: 0XXXXXXXXXX
  if (/^0[123]\d{8,9}$/.test(cleaned)) return '+44' + cleaned.slice(1);
  // 00 international prefix
  if (/^00\d{7,15}$/.test(cleaned)) return '+' + cleaned.slice(2);
  // Already E.164
  if (/^\+\d{7,15}$/.test(cleaned)) return cleaned;
  // Unknown — return trimmed
  return phone.trim();
}

/**
 * Format a phone number for display.
 * E.164 → readable format:
 * - +447XXXXXXXXX → 07XXX XXX XXX (UK mobile, show local format)
 * - +44XXXXXXXXXX → 0XXXX XXX XXX (UK landline)
 * - Other → show as-is with spaces every 3-4 digits
 */
export function formatPhoneDisplay(phone: string): string {
  if (!phone) return '';
  const normalized = normalizePhone(phone);
  
  // UK mobile: +447XXXXXXXXX → 07XXX XXX XXX
  if (/^\+447\d{9}$/.test(normalized)) {
    const local = '0' + normalized.slice(3);
    return local.slice(0, 5) + ' ' + local.slice(5, 8) + ' ' + local.slice(8);
  }
  // UK landline: +44XXXXXXXXXX → 0XXXX XXX XXXX
  if (/^\+44[123]\d{8,9}$/.test(normalized)) {
    const local = '0' + normalized.slice(3);
    return local.slice(0, 5) + ' ' + local.slice(5);
  }
  // International: just add spaces
  return phone.trim();
}

/**
 * Strip a phone number for wa.me deep links.
 * wa.me requires digits only, no + sign.
 * +447XXXXXXXXX → 447XXXXXXXXX
 */
export function phoneForWhatsApp(phone: string): string {
  const normalized = normalizePhone(phone);
  return normalized.replace(/\D/g, '');
}

/**
 * Check if a phone number looks like a UK number.
 */
export function isUKPhone(phone: string): boolean {
  const normalized = normalizePhone(phone);
  return normalized.startsWith('+44');
}
```

### Step 2: Update Settings — merchant phone

**File:** `src/screens/Settings/index.tsx`

Changes:
1. Replace `validateUKPhone` with `validatePhone` from `src/lib/phone.ts`
2. Replace `normalizeUKPhone` with `normalizePhone` from `src/lib/phone.ts`
3. Remove the local `validateUKPhone` and `normalizeUKPhone` functions
4. Add "Send test WhatsApp" button below the phone input
5. Update placeholder: `"e.g. 07700 900123 or +353 86 123 4567"`
6. Update error message: `"Enter a valid phone number with country code"`

**Test WhatsApp button implementation:**
```tsx
{editPhone && !phoneError && (
  <button
    onClick={() => {
      const normalized = normalizePhone(editPhone);
      window.open(`https://wa.me/${phoneForWhatsApp(normalized)}?text=${encodeURIComponent('Test message from Buildlogg — your phone number is correct!')}`, '_blank');
    }}
    className="mt-2 flex items-center gap-1.5 text-sm font-medium text-status-green"
  >
    <MessageCircle size={14} />
    Send test WhatsApp to this number
  </button>
)}
```

### Step 3: Update Quote builder — customer phone

**File:** `src/screens/Quote/CustomerDetails.tsx`

Changes:
1. Replace `formatUkPhoneInput` with `validatePhone` + `normalizePhone`
2. Remove the local `formatUkPhoneInput` function
3. Update placeholder: `"e.g. 07700 900123 or +353 86 123 4567"`
4. On blur: validate and show error if invalid
5. On save: normalise to E.164 before storing
6. Don't force 07 prefix or cap at 11 digits — accept international

### Step 4: Update Add Customer — phone

**File:** `src/screens/Customers/AddCustomer.tsx`

Changes:
1. Add `validatePhone` on blur
2. Add `normalizePhone` on save
3. Update placeholder: `"e.g. 07700 900123 or +353 86 123 4567"`
4. Phone remains optional — empty is valid

### Step 5: Update Log Missed Call — phone

**File:** `src/screens/Quote/LogMissedCall.tsx`

Changes:
1. Replace "Enter a valid UK mobile number" error with `validatePhone` result
2. Add `normalizePhone` on save
3. Update placeholder

### Step 6: Update Onboarding — add phone field

**File:** `src/screens/Onboarding/index.tsx`

Changes:
1. Add phone input field to onboarding Step 2 (Business details)
2. Use `validatePhone` on blur
3. Use `normalizePhone` on save
4. Add "Send test WhatsApp" button
5. Phone is optional during onboarding but prompted later

### Step 7: Update customer dedup

**File:** `src/lib/customers.ts`

Changes:
1. Replace local `normalizePhone` with import from `src/lib/phone.ts`
2. `findDuplicateByPhone` now normalises both the search phone and stored phones to E.164 before comparing
3. This enables dedup across different formats (07... vs +44... vs 0044...)

### Step 8: Update booking page — accept international numbers

**File:** `functions/book/[[slug]].js`

Changes:
1. Replace `UK_PHONE_REGEX` with a broader validation:
```javascript
function isValidPhone(phone) {
  // E.164: + followed by 7-15 digits
  if (/^\+\d{7,15}$/.test(phone)) return true;
  // UK local: 0 followed by 10 digits (mobile or landline)
  if (/^0\d{10}$/.test(phone)) return true;
  // UK with 44: 447XXXXXXXXX
  if (/^44\d{10}$/.test(phone)) return true;
  return false;
}
```
2. Normalise phone to E.164 before storing in `booking_requests`:
```javascript
function normalizePhone(phone) {
  const cleaned = phone.replace(/[\s-()]/g, '');
  if (/^0\d{10}$/.test(cleaned)) return '+44' + cleaned.slice(1);
  if (/^44\d{10}$/.test(cleaned)) return '+' + cleaned;
  if (/^00\d{7,15}$/.test(cleaned)) return '+' + cleaned.slice(2);
  if (/^\+\d{7,15}$/.test(cleaned)) return cleaned;
  return cleaned;
}
```
3. Update error message: `"Please enter a valid phone number with country code (e.g. +44 7700 900123)"`
4. Update rate-limiting to use normalised phone for consistency
5. Update the HTML form's phone input: change placeholder and add a hint about country code

### Step 9: Update WhatsApp/tel deep links

**Files:** `SendSheet/index.tsx`, `JobCard/index.tsx`, `ActiveBar/index.tsx`

Changes:
1. Use `phoneForWhatsApp()` from `src/lib/phone.ts` instead of raw `.replace(/\D/g, '')`
2. This ensures the number is normalised to E.164 first, then stripped for wa.me
3. `tel:` links can use the normalised number directly (E.164 works with tel:)

### Step 10: Data migration — normalise existing phones

**One-time migration script:** Run via Supabase SQL or a Cloudflare Function

```sql
-- Normalise UK mobile numbers (07XXXXXXXXX → +447XXXXXXXXX)
UPDATE customers SET phone = '+44' || substring(phone from 2) 
WHERE phone ~ '^07\d{9}$' AND user_id IS NOT NULL;

-- Normalise UK with 44 (447XXXXXXXXX → +447XXXXXXXXX)
UPDATE customers SET phone = '+' || phone 
WHERE phone ~ '^447\d{9}$';

-- Normalise 00 prefix (00XXXXXXXXXXX → +XXXXXXXXXXX)
UPDATE customers SET phone = '+' || substring(phone from 3) 
WHERE phone ~ '^00\d{7,15}$';

-- Same for profiles
UPDATE profiles SET phone = '+44' || substring(phone from 2) 
WHERE phone ~ '^07\d{9}$';

UPDATE profiles SET phone = '+' || phone 
WHERE phone ~ '^447\d{9}$';
```

**Also run on local Dexie:** Add a one-time migration in `initialSync` or app startup that normalises all existing phone numbers in local Dexie.

### Step 11: Update PDF generator

**File:** `src/lib/pdfGenerator.ts`

Changes:
1. Use `formatPhoneDisplay()` for display on PDFs — shows `07837 391747` instead of `+447837391747`
2. Apply to both merchant phone (line 64) and customer phone (line 106)

---

## PART 5: File Change Summary

| File | Change | Priority |
|---|---|---|
| `src/lib/phone.ts` | **New** — shared phone utility module | P0 (foundation) |
| `src/screens/Settings/index.tsx` | Replace local functions, add test WhatsApp button | P0 |
| `src/screens/Quote/CustomerDetails.tsx` | Replace `formatUkPhoneInput`, accept international | P1 |
| `src/lib/customers.ts` | Replace local `normalizePhone` with shared import | P1 |
| `functions/book/[[slug]].js` | Relax regex, add normalisation, accept international | P1 |
| `src/screens/Customers/AddCustomer.tsx` | Add validation + normalisation | P2 |
| `src/screens/Quote/LogMissedCall.tsx` | Update validation message, add normalisation | P2 |
| `src/screens/Onboarding/index.tsx` | Add phone field with validation | P2 |
| `src/components/SendSheet/index.tsx` | Use `phoneForWhatsApp()` | P2 |
| `src/components/JobCard/index.tsx` | Use `phoneForWhatsApp()` | P2 |
| `src/components/ActiveBar/index.tsx` | Use `phoneForWhatsApp()` | P2 |
| `src/lib/pdfGenerator.ts` | Use `formatPhoneDisplay()` | P3 |
| Supabase migration SQL | Normalise existing phones to E.164 | P2 |

---

## PART 6: Edge Case Handling Summary

| Edge case | How it's handled |
|---|---|
| Empty phone | `validatePhone('')` returns null (valid). Inputs allow empty. Buttons disabled when phone is empty. |
| Partially typed number | Validate on blur, not on every keystroke. Don't truncate mid-typing. |
| UK landline (020...) | `validatePhone` accepts `0[123]\d{8,9}`. `normalizePhone` converts to `+44XXXXXXXXXX`. |
| International without country code | `validatePhone` returns error: "Enter with country code". Can't auto-detect country. |
| Very long numbers (15+ digits) | `validatePhone` rejects: E.164 max is 15 digits. |
| Display formatting | `formatPhoneDisplay()` converts E.164 to readable local format for UI. |
| WhatsApp without country code | `phoneForWhatsApp()` normalises to E.164 first, then strips non-digits. |
| Customer dedup across formats | `normalizePhone()` converts both to E.164 before comparison. |
| Rate limiting with new format | Booking page normalises phone before rate-limit check. |
| Data migration | SQL migration + Dexie one-time normalisation on app startup. |
| Phone number changes | Old quotes/invoices unaffected (already sent). New quotes use current number. |
| Mock mode sample data | Update sample customer phone to E.164 format in seed data. |

---

*Plan created 29 June 2026 — based on full codebase audit of 13 phone touchpoints across 11 files*
