# Mode-Based Onboarding — Implementation Progress

## Phase 0: Data model + config
- [x] 0.1 — Add `app_mode` to Profile interface — `2abc1d9`
- [x] 0.2 — Add `BOTH_CONFIG` + `getAppModeConfig()` + `getAppModeFromUrl()` to verticalConfig — `2abc1d9`
- [x] 0.3 — Update `useVerticalConfig` to read `app_mode` with fallback — `2abc1d9`
- [x] 0.4 — Create Supabase migration for `app_mode` column — `2abc1d9`

## Phase 1: Templates + keyword matching
- [x] 1.1 — Add new booking template sets (barber, grooming, massage, tutoring) — `2abc1d9`
- [x] 1.2 — Add new quote template sets (photographer, cleaning) to TRADE_TEMPLATES — `2abc1d9`
- [x] 1.3 — Create keyword matching function (`templateMatcher.ts`) — `2abc1d9`
- [x] 1.4 — Add sample jobs for new verticals + update `seedSampleJob` signature — `2abc1d9`

## Phase 2: Onboarding rewrite
- [x] 2.1 — Move business name + phone to Step 1 — `0497816`
- [x] 2.2 — Replace Step 2 with mode selection cards — `0497816`
- [x] 2.3 — Add "What do you do?" text input to Step 3 with debounced keyword matching — `0497816`
- [x] 2.4 — Make Step 3 fields mode-driven via `getAppModeConfig(appMode)` — `0497816`
- [x] 2.5 — Update `handleWriteProfile` to persist `app_mode` + `specialty` — `0497816`
- [x] 2.6 — Update `handleContinueS4` seeding + analytics — `0497816`
- [x] 2.7 — Update Enter key handler + Step 2 button disabled state — `0497816`
- [x] 2.8 — Remove dead code: TradeType, BeautySpecialty, TRADE_OPTIONS, BEAUTY_SPECIALTIES — `0497816`

## Phase 3: Downstream updates
- [x] 3.1 — Update QuoteBuilder template picker to be mode-aware — `0497816`
- [x] 3.2 — Update booking page subtitle + no-services fallback — `0497816`
- [x] 3.3 — Add mode display row in Settings — `0497816`

## Phase 4: Build + deploy + test
- [x] 4.1 — TypeScript check — clean (0 errors)
- [x] 4.2 — Production build — 101 precache entries, SW generated
- [x] 4.3 — Deploy to preview — https://preview.tradepad-eu0.pages.dev
- [ ] 4.4 — Run Supabase migration — BLOCKED: requires Supabase dashboard access (service role key). SQL file at `supabase/migrations/20260630000001_app_mode.sql`. Run manually in Supabase SQL Editor.
