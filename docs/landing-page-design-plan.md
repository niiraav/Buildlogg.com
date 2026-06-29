# Buildlogg Landing Page — Design Elevation Plan

> Based on analysis of enginy.ai (Framer-built site) vs current Buildlogg landing page.
> Created: 2026-06-29

## How Enginy.ai Works

- Built with **Framer** — no-code site builder
- **Interactive dashboard is an iframe** — embeds a live working app (`ai-finder.enginy.ai`) inside the landing page. Not a CSS mockup.
- **985 scroll-triggered animations** — Framer's built-in animation system powers element entrances on scroll
- **Gradient fade overlays** — `linear-gradient(90deg, rgba(255,255,255,0) 52%, rgb(255,255,255) 83%)` creates content fading into white at edges
- **Section gradient backgrounds** — `linear-gradient(rgb(255,255,255) 0%, rgb(250,250,250) 100%)` gives sections subtle off-white to white transitions
- **Large hero headline** — 60px, font-weight 444 (lighter than bold), elegant editorial feel
- **Cards with subtle layered shadows** — `rgba(16,24,40,0.08) 0px 2px 6px -2px` — very soft
- **10px border radius** on cards, 20px on larger containers
- **Tab switcher in hero** — clickable tabs (AI Finder, Lead Enrichment, Campaigns, Smart Inbox, Analytics) that swap the iframe content

---

## What We Should Adopt for Buildlogg

### Phase 1 — Quick wins (CSS only, no HTML changes)

| # | Change | Details | Effort |
|---|--------|---------|--------|
| 1 | **Soften hero headline weight** | Reduce from 800 to 600-700 for a more elegant, Cal.com/Linear aesthetic | Low |
| 2 | **Gradient section backgrounds** | Replace flat `--surface-soft` with `linear-gradient(#fff → #f8f9fa)` for fluid section transitions | Low |
| 3 | **Improve card shadows** | Match Enginy's layered soft shadows: `rgba(16,24,40,0.08) 0px 2px 6px -2px` | Low |
| 4 | **Gradient fade on phone edges** | Add `mask-image: linear-gradient(...)` so phone mockup blends into background instead of hard edges | Low |
| 5 | **Refine scroll animations** | Add staggered children, scale-up on enter, directional reveals (from left/right for alternating sections) | Low |

### Phase 2 — Moderate changes (HTML + CSS)

| # | Change | Details | Effort |
|---|--------|---------|--------|
| 6 | **Tab switcher in hero** | Add 3 clickable tabs above phone: "Home", "Quote", "Paid" — each swaps the demo frame. Currently frames auto-cycle; making them user-controllable adds engagement. | Medium |
| 7 | **Stats strip section** | "60s quotes · £0 to start · 100% offline" or "2,000+ tradespeople · £840K tracked · 14k quotes sent" — big numbers with small labels | Low |
| 8 | **Integration logos section** | "Works with WhatsApp, Google Maps, Stripe, Resend" with logos | Low |
| 9 | **Bordered section cards** | Add subtle 1px border `var(--line)` to section containers with `border-radius: 20px` and soft shadow — creates the "template" card look | Medium |

### Phase 3 — Larger additions

| # | Change | Details | Effort |
|---|--------|---------|--------|
| 10 | **Testimonial with metrics** | Customer quote + 3 metric chips: "First quote sent in 90 seconds" + "Got paid in 2 days" + "0 missed calls this month" | Medium |
| 11 | **Trust/security section** | "Data stored in UK · No contracts · Works offline" elevated from footer to a dedicated section with icon cards | Low |
| 12 | **Refined final CTA** | More direct and action-oriented heading, possibly with an interactive element | Low |

---

## Design Tokens from Enginy

| Token | Value | Usage |
|-------|-------|-------|
| Hero headline | 60px, weight 444 | Large, lightweight editorial feel |
| Section heading | 29-40px, weight 500 | Medium weight, not too heavy |
| Card radius | 10px (small), 20px (large) | Rounded but not pill-shaped |
| Card shadow | `rgba(16,24,40,0.08) 0px 2px 6px -2px` | Very soft, layered |
| Section bg gradient | `linear-gradient(rgb(255,255,255) 0%, rgb(250,250,250) 100%)` | Subtle off-white transition |
| Edge fade gradient | `linear-gradient(90deg, rgba(255,255,255,0) 52%, rgb(255,255,255) 83%)` | Content fades into background |
| Body font | sans-serif (Framer default) | Clean, neutral |
| Stats numbers | 18px, weight 400 | De-emphasised, let the number speak |

---

## What We Already Have (Don't Change)

- ✅ 3-frame hero phone animation (Home → Quote → Paid) — works well, just needs tab control
- ✅ Scroll reveal with IntersectionObserver — solid foundation, just needs refinement
- ✅ Before/After comparison section — recently styled, looks good
- ✅ Persona cards — recently styled, looks good
- ✅ Booking page preview — recently styled, two-column layout works
- ✅ Pricing section — clean two-tier layout
- ✅ Install modal — functional, well-designed

---

## Files to Modify

- `public/assets/landing.css` — all Phase 1 changes
- `index.html` — Phase 2 and 3 HTML additions
- Bump `landing.css?v=13` → `v=14` after changes

## Reference

- Enginy.ai: https://www.enginy.ai/
- Built with Framer (no-code)
- Key inspiration: gradient transitions, soft shadows, large lightweight headlines, interactive tab switcher, stats strips
