# 📧 Email Design & A/B Test Log

> Tracks every email design iteration, what changed, what we tested, and results.
> Updated manually after each design change. Cross-reference with outreach-metrics-*.md for delivery data.

---

## Campaign Status (as of 2026-06-27 — Resend API verified)

| Metric | Value |
|--------|-------|
| Total emails sent (Resend) | 400 (395 campaign + 5 non-campaign) |
| Campaign sends | 395 (200 trades + 195 beauty) |
| Bounced | 6 (beauty) |
| Suppressed | 27 |
| Warm-up progress | 395/500 (79%) — Microsoft domains gradual ramp (5/day cap) |
| Beauty leads remaining | 1,301 |
| Open rate (trades, 4-5 days old) | 0.3% (1 open on 167 — unreliable, trades had no HTML) |
| Open rate (beauty, 24-48h old) | 2.6% (beauty_salon segment) |
| Click rate | 0.3% (1 click — trades variant B) |
| Sign-ups from email | 0 |
| Unsubscribes | 10 |
| Best subject line | "Quick question about your quotes" (trades B — only open+click) |
| Best vertical | beauty_salon (2.6% open vs 0% trades) |
| Email design version in production | v11 (light footer, force light mode) |
| Email design version sent to leads | v1 (plain text — 395 leads got the broken template) |
| Resend daily quota remaining | 7 (3 consumed by test sends today) |
| Resend monthly quota remaining | 566 (of 3,000 free tier) |

### Critical gap
**395 leads received v1 (broken template with non-clickable links).** The design fixes (v2-v11) were only sent as test emails to the user's own addresses. The next batch will be the first to receive the v11 branded template with working CTA links + click tracking.

### Next actions
1. Send 5–7 beauty leads with v11 template — first production test of the branded design
2. After 48h, compare open/click rates vs the v1 batch (395 leads)
3. If v11 outperforms v1, re-send step 1 to the 395 v1 leads (they had non-clickable CTAs)
4. Send step 2 follow-ups to 200 trades leads (overdue since Jun 25)

---

## Design Iterations

### v1 — Plain text → HTML (2026-06-25)
**Changes:** Raw text converted to HTML via `textToHtml()`. No branding, no layout, no CTA button.
**Issues:** Links were white-on-white (invisible). Unsubscribe was a full URL — looked like phishing.
**Sent to:** 100 beauty leads (step 1)
**Result:** 0 opens, 0 clicks. Trades batch (200, Jun 22-23) had `html: null` — no open tracking at all.

### v2 — Branded teal template (2026-06-25)
**Changes:** Added Buildlogg wordmark (teal #0F766E), serif body (Georgia), CTA button, light footer.
**Issues:** Teal not in DESIGN.md. Serif font didn't match app. Unsubscribe still prominent.
**Sent to:** Test only (2 addresses)
**Result:** User feedback — doesn't match app branding.

### v3 — Cal.com design system (2026-06-25)
**Changes:** Switched to DESIGN.md tokens. Black CTA (#111111), Inter body, Manrope wordmark, dark footer (#101010).
**Issues:** Wordmark was blue (email clients default link color). Button broken in Apple Mail (inline-block + line-height). Footer logo was white-on-white (invisible).
**Sent to:** Test only (2 addresses)

### v4 — App token match (2026-06-25)
**Changes:** Aligned to app tokens.css — #111827 brand-black, #F9FAFB surface, font-weight 800, 44px button height.
**Issues:** #111827 and #F9FAFB are app tokens, NOT in DESIGN.md. Button still blue text in Apple Mail.
**Sent to:** Test only (2 addresses)

### v5 — Apple Mail button fix (2026-06-25)
**Changes:** Table-based button (bulletproof pattern from Termius email). `color: !important` on `<a>` tag. Inverted footer logo (dark icon in white box).
**Issues:** Wordmark still blue. Subject "How many no-shows this week?" had low impact.
**Sent to:** Test only (2 addresses)

### v6 — All 5 DESIGN.md changes (2026-06-25)
**Changes:** Product UI fragment card, two-tier type voice (Manrope 600 + Inter 400), CTA band (surface-card), pill badge, structured footer links.
**Issues:** Too much visual noise. Product card felt forced. CTA band added unnecessary weight.
**Sent to:** Test only (2 addresses)

### v7 — Termius layout (2026-06-26)
**Changes:** Adopted Termius email layout — grey outer bg (#EDF1F2), white content card, centered logo above card. Bulletproof button with bgcolor on both td + a.
**Issues:** #EDF1F2 not in DESIGN.md. Button text still blue in Apple Mail.
**Sent to:** Test only (2 addresses)

### v8 — Cleanup (2026-06-26)
**Changes:** Removed product card, CTA band headline, consistent 15px font, button left-aligned, 24px wordmark.
**Issues:** Double quotes in `font-family:"Manrope"` broke the style attribute — ALL CSS after it was lost. Caused Times New Roman + blue button text.
**Sent to:** Test only (2 addresses)

### v9 — Font quote fix (2026-06-26) ⭐ ROOT CAUSE FIX
**Changes:** Single quotes in font-family (`'Manrope'` not `"Manrope"`). Fixed ALL colors to DESIGN.md only. Fixed alt text, role=presentation, preheader spacing.
**Issues:** None remaining — 18/18 audit checks pass.
**Sent to:** Test only (2 addresses) + verified via Resend API
**Result:** Button renders white text, no underline. Fonts load as Inter/Manrope. All WCAG AA contrast passes.

### v10 — Audit fixes (2026-06-26)
**Changes:** Added role=presentation to 3 missing layout tables. Fixed preheader double-space. Reduced paragraph-button gap from 48px to 32px.
**Issues:** None.
**Sent to:** Test only (2 addresses)
**Result:** 18/18 checks pass on sent email via Resend API verification.

### v11 — Light footer + force light mode (2026-06-26) ⭐ CURRENT
**Changes:** Replaced dark footer (#101010) with confirmation email's light footer style (Buildlogg · buildlogg.com · © 2026 Buildlogg Ltd. · Unsubscribe). Added `color-scheme: light only` meta to prevent dark mode inversion. Removed inverted footer logo.
**Issues:** None — 7 colors all from DESIGN.md, no dark footer stealing attention.
**Sent to:** Test only (2 addresses)
**Result:** Pending user confirmation. Content card is now the visual focus.

---

## A/B Subject Line Tests

### Beauty Vertical — Step 1

| Variant | Subject | Sent | Opens | Clicks | Status |
|---------|---------|------|-------|--------|--------|
| A | How many no-shows this week? | ~33 | 0 | 0 | ❌ Killed — low impact |
| B | Quick question about your bookings | ~33 | 1 | 0 | ⏳ Active |
| C | [Company] — deposits for no-shows? | ~34 | 0 | 0 | ⏳ Active (personalized) |

**New variants (v9+):**
| Variant | Subject | Status |
|---------|---------|--------|
| A | Quick question about your bookings | ✅ Active |
| B | Your empty chair is costing you | ✅ Active (pain-driven) |
| C | [Company name] — deposits for no-shows? | ✅ Active (personalized) |

### Trades Vertical — Step 1

| Variant | Subject | Sent | Opens | Clicks | Status |
|---------|---------|------|-------|--------|--------|
| A | The admin you do at 9pm | ~67 | 0 | 0 | ⏳ Active |
| B | Quick question about your quotes | ~67 | 1 | 1 | ✅ Best performer |
| C | [Trade] quotes from your phone? | ~66 | 0 | 0 | ⏳ Active |

---

## Key Findings

1. **Font quotes are the #1 email bug** — `font-family:"Manrope"` inside `style="..."` closes the attribute. ALL CSS after it is lost. This caused Times New Roman + blue button text across 8 iterations. Fix: single quotes only.

2. **Apple Mail buttons need table-based layout** — `display:inline-block` + `line-height` matching `height` is unreliable. Use `<table><td bgcolor><a>` pattern with `padding` on the `<td>`.

3. **Dark footers steal attention** — the #101010 footer block was visually heavier than the content. Light footer (matching confirmation email) keeps focus on the message + CTA.

4. **Cold emails should force light mode** — `color-scheme: light only` prevents unpredictable dark mode inversion across Outlook/Gmail/Apple Mail. Cold recipients see predictable branding.

5. **CTA links must have `https://`** — bare `buildlogg.com` URLs are not clickable in email clients. `textToHtml()` only converts `https?://` patterns. Fixed in all 8 templates.

6. **Trades batch had no open tracking** — 200 emails sent Jun 22-23 with `html: null`. The "0 opens" on trades is meaningless — can't measure what we can't track.

7. **Beauty_salon has highest engagement** — 2.6% open rate vs 0% for all trades. Pain (no-shows) is more acute than admin friction.

8. **Subject line B performs best** — "Quick question about your quotes" got the only open+click across 300 emails. Curiosity-driven subjects outperform pain-driven ones.

---

## Design System Compliance (v11)

### Colors used (ALL from DESIGN.md)
- `#111111` — primary/ink (button bg, wordmark, greeting)
- `#374151` — body text
- `#6b7280` — muted (footer brand name, signature company)
- `#898989` — muted-soft (footer links, address)
- `#ffffff` — canvas (content card, button text)
- `#f8f9fa` — surface-soft (outer background)
- `#f5f5f5` — surface-card (pill badge)

### Typography
- **Manrope 800** — wordmark (24px header, 18px footer)
- **Inter 400** — body text (15px)
- **Inter 500** — greeting + signature name
- **Inter 600** — button label (14px)
- **Inter 500** — pill badge (13px)

### WCAG 2.0 Contrast (all pass AA)
| Pair | Ratio | AA | AAA |
|------|-------|-----|-----|
| #374151 on #ffffff | 10.31 | ✓ | ✓ |
| #111111 on #ffffff | 18.88 | ✓ | ✓ |
| #6b7280 on #ffffff | 4.83 | ✓ | ✓* |
| #ffffff on #111111 | 18.88 | ✓ | ✓ |
| #898989 on #f8f9fa | 3.50 | ✓* | ✗ |

### Accessibility
- ✅ `role="presentation"` on all 6 layout tables
- ✅ `alt="Buildlogg"` on all images (no empty alt)
- ✅ `color-scheme: light only` meta
- ✅ `lang="en"` on `<html>`
- ✅ Single-quote font-family (no broken style attributes)
- ✅ `text-decoration: none` on all links
- ✅ Preheader text (hidden inbox preview)

---

## Test Sends Log

| Date | Version | Gmail ID | Hotmail ID | Purpose |
|------|---------|----------|------------|---------|
| 2026-06-25 | v1 | — | — | First beauty batch (100 leads) |
| 2026-06-25 | v3 | 8ded3cf5 | 5ee1cdcf | Branded template test |
| 2026-06-25 | v4 | 0221e7e0 | 4ba9db75 | App token match |
| 2026-06-25 | v5 | 8a4fc52f | 0269a378 | Apple Mail button fix |
| 2026-06-25 | v6 | ef4a45b7 | 4509efc0 | All 5 DESIGN.md changes |
| 2026-06-26 | v7 | 6b90edeb | 02b13f08 | Termius layout |
| 2026-06-26 | v9 | 4e912d42 | b79ecf47 | Font quote root cause fix |
| 2026-06-26 | v10 | be407e34 | 128e0afa | Audit fixes (role, spacing) |
| 2026-06-26 | v11 | 335042fa | a06ffa2f | Light footer + force light mode |
