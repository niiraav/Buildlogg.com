# Sprint: BU-3 + BU-7 + CU-3/XU-5 — Progress Log

> **Branch:** codex/bu3-bu7-cu3-xu5
> **Date:** 2026-06-28
> **Status:** All items implemented, tsc + vite build + lint green

---

## Items

| # | Feature | File | Status | Commit |
|---|---------|------|--------|--------|
| BU-3 | Booking link on CustomerDetail | `src/screens/Customers/CustomerDetail.tsx` | ✅ Done | (255a226) |
| BU-7 | Merchant logo on booking page | `functions/book/[[slug]].js` | ✅ Done | (255a226) |
| CU-3/XU-5 | QR codes on invoice PDFs | `src/lib/prettyQr.ts`, `src/lib/pdfGenerator.ts` | ✅ Done | (255a226) |

---

## BU-3 — Booking Link on CustomerDetail

**What changed:**
- Added imports: `useAppStore`, `Calendar` (lucide), `bookingPageUrl`, `Profile` type
- Added `userId` from `useAppStore` + `profile` state
- Extended existing `Promise.all` in `useEffect` to load `db.profiles.get(userId)` as 5th entry
- Added "Send booking link" button in the sticky footer, between "New quote" and "Merge"
- Condition: `profile?.booking_enabled && profile?.booking_slug`
- If customer has phone → opens WhatsApp deep-link with pre-filled message
- If no phone → copies booking URL to clipboard + toast

**Edge cases handled:**
- `booking_enabled === false` or `booking_slug` missing → button not rendered
- Profile not loaded → `booking_enabled` is undefined → falsy → no button
- No customer phone → clipboard copy fallback
- Clipboard API failure → catch block still shows success toast

---

## BU-7 — Merchant Logo on Booking Page

**What changed:**
- Added `logo` variable in `renderBookingPage()`: renders `<img>` if `merchant.logo_data_url` exists
- Inserted `${logo}` before `<h1>` in the header div
- Logo: 64px circular, object-fit cover, auto margins, 12px bottom margin
- No CSS changes — inline styles on the `<img>` element
- `select=*` query already fetches `logo_data_url` — no new data fetch

**Edge cases handled:**
- `logo_data_url` null/undefined → `logo` is empty string → output HTML unchanged
- Corrupt base64 → browser shows broken image icon (merchant's data issue)

---

## CU-3/XU-5 — QR Codes on Invoice PDFs

**What changed in `src/lib/prettyQr.ts`:**
- Fixed `createPrettyQR` image line: `undefined` → brand icon (unchanged), `null` → no image (new), string → custom logo (unchanged). Backwards-compatible.
- Added `qrToDataUrl()` async helper: creates QRCodeStyling instance, calls `getRawData('png')`, converts Blob to data URL via FileReader. Returns `null` on any failure.

**What changed in `src/lib/pdfGenerator.ts`:**
- Added imports: `qrToDataUrl` from prettyQr, `bookingPageUrl` from referral
- Changed `buildFooter` from sync to async: `async function buildFooter(doc, profile, job?): Promise<void>`
- Added QR section before the hairline in `buildFooter`:
  - "Scan to pay" QR: renders if `job?.deposit_stripe_url && job?.deposit_status === 'requested'`
  - "Scan to book" QR: renders if `profile?.booking_enabled && profile?.booking_slug`
  - Both use `qrToDataUrl()` with `profile.logo_data_url ?? null` (no brand icon on PDFs — clean QR)
  - Each wrapped in try/catch — QR render failure skips silently
- Updated `generateInvoicePDF` call site: `await buildFooter(doc, profile, job)` — passes job for pay QR
- Updated `generateQuotePDF` call site: `await buildFooter(doc, profile)` — NO job parameter (quotes don't have payment links)
- Increased autoTable `bottom` margin from 30 to 55 in `generateInvoicePDF` only — prevents table content from overlapping the QR zone. Quote PDF margins unchanged (30).

**Edge cases handled:**
- `deposit_stripe_url` missing → no pay QR
- `booking_enabled` false → no book QR
- Both missing → footer unchanged (no QR section renders)
- `qrToDataUrl` returns null → `addImage` skipped, PDF still generates
- `getRawData` throws → caught, returns null
- `FileReader` fails → caught, returns null
- `addImage` fails → caught, QR skipped
- Quote PDFs → no QRs (no job parameter passed)

---

## Build Verification

```
$ npx tsc --noEmit
(zero errors)

$ npx vite build
✓ built in 2.00s
PWA v0.20.5 — 99 precache entries

$ npm run lint
(zero errors)
```

---

## File Disjointness (no conflict with current sprint)

| This sprint | Previous sprint (CU-2 + BU-4) |
|-------------|-------------------------------|
| `src/screens/Customers/CustomerDetail.tsx` | `src/screens/Home/index.tsx` (CU-2) |
| `functions/book/[[slug]].js` | `src/screens/JobDetail/index.tsx` (BU-4) |
| `src/lib/prettyQr.ts` | `src/lib/paymentChase.ts` (CU-2) |
| `src/lib/pdfGenerator.ts` | |

Zero file overlap.

---

*Last updated: 2026-06-28*
*Author: Codex*
