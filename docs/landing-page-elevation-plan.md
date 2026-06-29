# Buildlogg Landing Page — Progressive Elevation Plan

> Based on analysis of enginy.ai + cal.com layout patterns
> Updated: 2026-06-29

## Phase 1: Grid Border Template (current)

The signature Enginy/Cal.com look — vertical lines on either side of content + horizontal dividers between sections.

**Implementation:**
- `::after` pseudo-element on the main content wrapper
- `border-left: 1px solid #ebebeb` + `border-right: 1px solid #ebebeb`
- `border-top: 1px solid #ebebeb` between sections
- Width matches container (1120px)
- Dashed variant for hero section

## Phase 2: Content Structure Refinement

### Section ordering (match Enginy flow)
1. Hero (headline + CTA + phone demo)
2. Trust bar (logos/stats)
3. Problem (pain points)
4. Before vs After
5. How it works (3 step cards)
6. Feature: Missed calls → tasks (copy + phone)
7. Who is this for (persona cards)
8. Feature grid (6 secondary features)
9. Booking page preview (copy + phone)
10. Pricing
11. CTA band

### Content improvements
- Add a trust/stats bar after hero: "Built for solo tradespeople · £840K tracked · 100% offline"
- Steps section: use "01/02/03" number labels (already done)
- Feature sections: add "Learn more" links like Enginy
- Add integration logos section: WhatsApp, Google Maps, Stripe, Resend

## Phase 3: Visual Polish

- Soften hero headline weight (800 → 600)
- Section backgrounds: subtle gradient `linear-gradient(#fff → #f8f9fa)` instead of flat
- Card hover: translateY(-2px) with shadow lift (already done on some cards)
- Improve spacing rhythm: consistent 64-88px section padding
- Add gradient fade on phone mockup bottom edge

## Phase 4: Engagement Enhancements

- Tab switcher on hero phone (Home / Quote / Paid) — clickable, user-controlled
- Stats strip with big numbers: "60s quotes · £0 to start · Works offline"
- Testimonial section with metric chips
- Trust/security badges section (GDPR, data in UK, no contracts)

## Files
- `public/assets/landing.css` — all styling
- `index.html` — HTML structure changes
- Bump `landing.css?v=14` → `v=15` after grid border implementation
