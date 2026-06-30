# Onboarding & Price List — Implementation Progress

## Phase 0: Fix Blockers
- [x] 0.1 — Fix `business_type`/`specialty` persistence in onboarding Supabase upsert + sync queue — `706a948`
- [x] 0.2 — Fix Enter key handler for beauty Step 2 — `706a948`
- [x] 0.3 — Add `showServiceMenu` flag to `VerticalConfig` — `05698b9`
- [x] 0.4 — Create `useVerticalConfig()` hook — `05698b9`

## Phase 1: Seeded Templates
- [x] 1.1 — Extend `TemplateSeed` interface with `duration_minutes` + `is_public` — `2e69932`
- [x] 1.2 — Add durations + `is_public: true` to beauty templates — `2e69932`
- [x] 1.3 — Update `seedItems` to pass `is_public` and `duration_minutes` + immediate Supabase push — `2e69932`

## Phase 2: Unified Onboarding Step 3
- [x] 2.1 — Add item state to onboarding — `c62fef1`
- [x] 2.2 — Rebuild Step 3 UI as "Your pricing" — `c62fef1`
- [x] 2.3 — Save items in Step 3 continue handler — `c62fef1`
- [x] 2.4 — Update `handleContinueS4` seeding comment — `c62fef1`
- [x] 2.5 — Update Step 4 done copy — `c62fef1`
- [x] 2.6 — Update Enter key handler for Step 3 — `c62fef1`

## Phase 3: Booking Settings Cross-Link
- [x] 3.1 — Add "Your services" card to Booking.tsx — `d9347fc`
- [x] 3.2 — Update no-services fallback on booking page (vertical-aware) — `d9347fc`

## Phase 4: Warning Prompts
- [x] 4.1 — Share link warning when zero public items — `d079cea`
- [x] 4.2 — QR download warning when zero public items — `d079cea`

## Phase 5: Settings Label Adaptation
- [x] 5.1 — Settings index section label → "Price list" — `0f562cf`
- [x] 5.2 — CustomItems page title → "Price list" — `0f562cf`
- [x] 5.3 — Settings "Saved items" row label — `0f562cf`
