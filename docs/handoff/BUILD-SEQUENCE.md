# TradePad — Build Sequence & Kimi k2.6 Handoff Tickets
## Version 1.0 — 17 Milestones in Strict Order

> **How to use this document**
> Each milestone is a self-contained prompt to paste into Kimi k2.6. They must be executed in order — each milestone depends on the previous. Never send more than one milestone at a time. Do not skip milestones. Do not send partial milestones.
>
> Before pasting any ticket, prepend the HARD RULES BLOCK (§1 below). Copy the HARD RULES verbatim at the top of every prompt.
>
> Wireframe files: `/Users/niravarvinda/Workspace/projects/TradePad/wireframes/`
> Handoff docs: `/Users/niravarvinda/Workspace/projects/TradePad/docs/handoff/`

---

## §1 — HARD RULES BLOCK (prepend to every Kimi prompt)

```
═══════════════════════════════════════════════
HARD RULES — NON-NEGOTIABLE (read before writing any code)
═══════════════════════════════════════════════

1. MOBILE-FIRST: Target 375-430px viewport only. No desktop breakpoints.
2. TOUCH TARGETS: Primary CTAs 52px height. Secondary 46px. List rows 56px min. Icon buttons 40×40px. Back buttons 44px min.
3. FORM INPUTS: 48px min-height. font-size 16px (critical — prevents iOS auto-zoom on focus). Amount fields use inputmode="decimal".
4. NO SAVE BUTTONS: Auto-save on blur. [Done] is a tap target, not a save trigger — save happens on blur.
5. STICKY FOOTER: All CTAs on detail screens must be in a sticky footer pinned to bottom. Never inline at end of scroll content.
6. NO TAB BAR: Hide bottom TabBar on all detail screens (Job Detail, Quote flow steps). Only show on Home, Jobs, Settings.
7. ICONS: Use Lucide React for all icons. No emoji in production code. See mapping in wireframe HTML comments.
8. OFFLINE-FIRST: All writes → Dexie first → sync queue → Supabase background. UI never waits for network.
9. MVP ONLY: Do not build any feature not explicitly in the wireframe states. Do not add "nice-to-haves".
10. AMOUNT FIELDS: Validate that amounts are positive numbers > 0. Block form submission if empty (not null). No TBC items.

Refer to these rules if any implementation decision is unclear. These override all other considerations.
═══════════════════════════════════════════════
```

---

## §2 — Project Context Block (include in every Kimi prompt)

```
PROJECT: TradePad — PWA for UK sole-trader tradespeople (plumbers, electricians, builders)
PERSONA: "Dave" — works back-to-back jobs, often one-handed in customers' homes
STACK: React 18 + Vite + Tailwind CSS v3 + Zustand + Supabase + Dexie.js + Lucide React + React Hook Form + React Router v6

HANDOFF DOCS:
- MASTER-PRD.md: product rules, job states, feature scope
- DATA-MODEL.md: Supabase schema + Dexie local schema
- DESIGN-TOKENS.md: all colours, spacing, radii, shadows, component CSS
- COMPONENT-LIBRARY.md: all reusable components with props + visual specs
- SCREEN-SPECS.md: all screens, all states, all business rules
```

---

## Milestones Overview

| # | Milestone | Est. complexity | Blocking |
|---|---|---|---|
| M01 | Project scaffold | Low | Everything |
| M02 | Design tokens | Low | M03+ |
| M03 | Base components | Medium | M06+ |
| M04 | Supabase + Dexie setup | Medium | M05+ |
| M05 | Auth (phone OTP) | Medium | M06+ |
| M06 | Onboarding | Medium | M07+ |
| M07 | Home — Today tab | High | M08+ |
| M08 | Jobs list | Medium | M09+ |
| M09 | Job Detail — Booked + In Progress | High | M10+ |
| M10 | Job Detail — Awaiting Payment + Chase | Medium | M11+ |
| M11 | Job Detail — No-Show + terminals | Medium | M12+ |
| M12 | Quote — Missed call + Customer | Medium | M13+ |
| M13 | Quote — Builder + Preview + Send | High | M14+ |
| M14 | Settings | Medium | M15+ |
| M15 | Offline + sync | Medium | M16+ |
| M16 | Notifications | Low | M17 |
| M17 | QA pass | — | Ship |

---

## M01 — Project Scaffold

```
# Ticket M01 — Project Scaffold

[PREPEND HARD RULES BLOCK]
[PREPEND PROJECT CONTEXT BLOCK]

## You are building
The initial project scaffold for TradePad PWA — directory structure, config files, empty screen stubs, and the PWA manifest. No UI yet, just the skeleton.

## Output: files to create

### Root
- `package.json` — with all dependencies listed below
- `vite.config.ts` — with vite-plugin-pwa configured
- `tailwind.config.js` — with extended theme from DESIGN-TOKENS.md §8
- `tsconfig.json` — strict mode, path aliases
- `index.html` — PWA-ready with manifest link, viewport meta, theme-color

### src/ structure
```
src/
  main.tsx              — React 18 createRoot, router setup
  App.tsx               — Router with all screen routes, wraps everything in #app-shell
  styles/
    globals.css         — Tailwind base + CSS custom properties from DESIGN-TOKENS.md §9
    tokens.css          — Design tokens (copy exact content from DESIGN-TOKENS.md §9)
  lib/
    supabase.ts         — Supabase client (env vars)
    db.ts               — Dexie schema (copy exact content from DATA-MODEL.md §4)
    sync.ts             — syncWorker stub (empty implementation for now)
  screens/
    Auth.tsx            — empty stub
    Onboarding/
      index.tsx         — empty stub
    Home/
      index.tsx         — empty stub
    Jobs/
      index.tsx         — empty stub
    JobDetail/
      index.tsx         — empty stub
    Quote/
      index.tsx         — empty stub
    Settings/
      index.tsx         — empty stub
  components/           — empty directory (components added in M03)
  store/
    useAppStore.ts      — Zustand store stub (empty for now)
```

### App shell — implement in `App.tsx` and `globals.css` (CRITICAL)

The entire app renders inside `#app-shell`. This scopes all positioned elements (bottom sheets, sticky footers, tab bar) to a 430px container, preventing broken layout on desktop. Sign-up works on desktop; a nudge banner directs users to mobile.

```css
/* globals.css */
body {
  background: #F3F4F6;
  min-height: 100svh;
}

#app-shell {
  max-width: 430px;
  min-height: 100svh;
  margin: 0 auto;
  background: #ffffff;
  position: relative;   /* ALL child sheets/footers scope to this */
  overflow-x: hidden;
  box-shadow: 0 0 40px rgba(0,0,0,.08);
}

@media (max-width: 430px) {
  body { background: #ffffff; }
  #app-shell { box-shadow: none; }
}
```

```tsx
// App.tsx
export default function App() {
  return (
    <div id="app-shell">
      <DesktopNudge />   {/* renders only on viewport > 768px */}
      <Router>
        {/* all routes */}
      </Router>
    </div>
  );
}
```

**RULE: Never use `position: fixed` anywhere in the app. Use `position: absolute` instead. The shell's `position: relative` makes this behave identically on mobile while staying contained on desktop.**

### DesktopNudge component — implement in `src/components/DesktopNudge/index.tsx`

```tsx
// Shows on viewport > 768px only. Dismissed state stored in localStorage.
// This is a temporary MVP measure — will be replaced by proper desktop UI in Phase 2.
export function DesktopNudge() {
  const [dismissed, setDismissed] = useState(
    () => localStorage.getItem('tp_desktop_nudge_dismissed') === '1'
  );
  // Only render on desktop
  if (typeof window !== 'undefined' && window.innerWidth <= 768) return null;
  if (dismissed) return null;

  return (
    <div style={{
      background: '#111827', color: '#fff',
      padding: '12px 16px', fontSize: '13px',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      gap: '12px'
    }}>
      <span>TradePad is designed for your phone — for the best experience, open it on mobile.</span>
      <button onClick={() => {
        localStorage.setItem('tp_desktop_nudge_dismissed', '1');
        setDismissed(true);
      }} style={{ background: 'none', border: 'none', color: '#9CA3AF', cursor: 'pointer', fontSize: '18px', lineHeight: 1, minWidth: '28px', minHeight: '28px' }}>✕</button>
    </div>
  );
}
```

### public/
- `manifest.json` — PWA manifest (see below)
- `icons/` — placeholder 192px and 512px PNGs (solid colour, "TP" text)

## manifest.json content
```json
{
  "name": "TradePad",
  "short_name": "TradePad",
  "description": "Quotes, jobs, and payments for tradespeople",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#ffffff",
  "theme_color": "#111827",
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

## Dependencies (package.json)
```json
{
  "dependencies": {
    "react": "^18.3.0",
    "react-dom": "^18.3.0",
    "react-router-dom": "^6.26.0",
    "zustand": "^4.5.0",
    "@supabase/supabase-js": "^2.45.0",
    "dexie": "^3.2.7",
    "dexie-react-hooks": "^1.1.7",
    "lucide-react": "^0.400.0",
    "react-hook-form": "^7.52.0",
    "@fontsource/inter": "^5.0.0",
    "@radix-ui/react-dialog": "^1.1.0"
  },
  "devDependencies": {
    "typescript": "^5.5.0",
    "vite": "^5.3.0",
    "@vitejs/plugin-react": "^4.3.0",
    "vite-plugin-pwa": "^0.20.0",
    "tailwindcss": "^3.4.0",
    "autoprefixer": "^10.4.0",
    "postcss": "^8.4.0"
  }
}
```

## Routes (App.tsx)
```
/auth               → Auth screen
/onboarding         → Onboarding screen
/                   → Home screen (protected)
/jobs               → Jobs list (protected)
/jobs/:jobId        → Job Detail (protected)
/quote              → Quote flow (protected)
/settings           → Settings (protected)
```

Protected routes: redirect to /auth if no Supabase session.

## Acceptance criteria
- [ ] `npm install` completes without errors
- [ ] `npm run dev` serves on http://localhost:3000
- [ ] Browser shows blank white screen (no errors in console)
- [ ] PWA manifest is valid (Lighthouse or browser DevTools)
- [ ] All screen stub files exist and export a default component returning null
- [ ] Dexie DB initialises without error (check console: "TradePadDB opened")
- [ ] Supabase client initialises (no error — env vars may be empty for now)

## DO NOT
- Do not add any UI components yet
- Do not add Storybook
- Do not add testing frameworks
- Do not use Next.js or any other meta-framework — Vite only
```

---

## M02 — Design Tokens

```
# Ticket M02 — Design Tokens

[PREPEND HARD RULES BLOCK]
[PREPEND PROJECT CONTEXT BLOCK]

## You are building
The complete design token system — Tailwind theme extension and CSS custom properties. No components, no screens — just the token layer.

## Reference
- Read **DESIGN-TOKENS.md** in full — this IS the implementation spec for the app
- Read **DESIGN.md** (Cal design system, project root) — use this for colour name context only. Do NOT use Cal's component heights, touch targets, or font Cal Sans. Inter is the font.

## Files to create / modify

### `tailwind.config.js`
Copy the theme extension from DESIGN-TOKENS.md §8 exactly. Do not change any values.

### `src/styles/tokens.css`
Copy the CSS custom properties from DESIGN-TOKENS.md §9 exactly.

### `src/main.tsx` — add Inter font imports at the top
```typescript
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import '@fontsource/inter/800.css';
```

### `src/styles/globals.css`
```css
@tailwind base;
@tailwind components;
@tailwind utilities;
@import './tokens.css';

* { box-sizing: border-box; margin: 0; padding: 0; }
body {
  font-family: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  background: #ffffff;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}
input, button, textarea, select {
  font-family: inherit;
}
```

## Acceptance criteria
- [ ] `npm run dev` still works with no errors
- [ ] Tailwind class `bg-brand-black` resolves to `#111827`
- [ ] Tailwind class `text-status-green` resolves to `#15803D`
- [ ] CSS var `--color-black` is accessible in browser DevTools as `#111827`
- [ ] No hardcoded colour hex values in this file — all should reference the token

## DO NOT
- Do not add components
- Do not modify any screen stubs
```

---

## M03 — Base Components

```
# Ticket M03 — Base Components

[PREPEND HARD RULES BLOCK]
[PREPEND PROJECT CONTEXT BLOCK]

## You are building
The reusable component library. These are the building blocks used by every screen. Build each component exactly to spec.

## Reference
Read COMPONENT-LIBRARY.md in full. Each component spec is in that file.

## Files to create

```
src/components/
  Button/index.tsx
  BottomSheet/index.tsx
  StatusBadge/index.tsx
  FlagBadge/index.tsx
  JobCard/index.tsx
  ActiveBar/index.tsx
  TodayStrip/index.tsx
  InvoiceItemRow/index.tsx
  AmountCard/index.tsx
  QuotePreviewCard/index.tsx
  MapPreview/index.tsx
  SegmentedControl/index.tsx
  InlineEditRow/index.tsx
  ProgressDots/index.tsx
  TabBar/index.tsx
  HomeTabSwitcher/index.tsx
  StickyFooter/index.tsx
  TaskCard/index.tsx
```

## Component props interfaces
All props interfaces are defined in COMPONENT-LIBRARY.md. Implement each exactly.

## Critical implementation notes

### BottomSheet
- Use `@radix-ui/react-dialog` as the behaviour primitive — handles focus trap, ARIA `role="dialog"`, Escape key, screen readers
- Do NOT use `ReactDOM.createPortal` to `document.body` — sheet must render inside `#app-shell` to stay contained on desktop
- Override ALL Radix default styles; apply the scoped CSS from COMPONENT-LIBRARY.md §2
- Overlay: `position: absolute; inset: 0` (scoped to shell)
- Panel: `position: absolute; bottom: 0; left: 0; right: 0`
- Animation: CSS transition `transform: translateY(100%)` → `translateY(0)` (300ms ease)

### Button (ghost variant)
- `min-height: 44px` — even text links need touch target
- `display: flex; align-items: center` for vertical centering

### ActiveBar
- Elapsed time updates every 60 seconds via `setInterval`
- Format: "2h 14m" (hours + minutes), "45m" (minutes only if <1h), "< 1m" if brand new
- Pulse animation must be CSS keyframe (not JS)

### InvoiceItemRow
- `isAddedOnSite` items: text AND amount colour both `#15803D`
- × remove button: 28×28px, border-radius 50%

### MapPreview
- MVP: grey `#F3F4F6` rectangle with MapPin icon centred + address text below
- Tapping: `window.open('https://maps.google.com/?q=' + encodeURIComponent(address))`
- Height: 120px, border-radius: 10px

### SegmentedControl
- Active segment: white background + `box-shadow: 0 1px 3px rgba(0,0,0,.1)`
- No external state — controlled component only

## Acceptance criteria
- [ ] All 19 component files exist and export typed React components (18 from COMPONENT-LIBRARY.md + DesktopNudge from M01)
- [ ] No TypeScript errors (`tsc --noEmit`)
- [ ] All props interfaces match COMPONENT-LIBRARY.md exactly
- [ ] Button all 4 variants render with correct heights
- [ ] BottomSheet animates on open/close
- [ ] StatusBadge renders correct colours for all 9 states
- [ ] FlagBadge renders correct colours for all 5 flag types
- [ ] ActiveBar pulse animation is visible

## DO NOT
- Do not wire components to real data yet
- Do not add components not listed above
- Do not use any component library (MUI, Chakra, etc.) — custom only
```

---

## M04 — Supabase + Dexie Setup

```
# Ticket M04 — Supabase + Dexie Setup

[PREPEND HARD RULES BLOCK]
[PREPEND PROJECT CONTEXT BLOCK]

## You are building
The database layer: Supabase migrations + Dexie local DB + Zustand store setup.

## Reference
Read DATA-MODEL.md in full. All table definitions, RLS policies, and Dexie schema are there.

## Files to create / modify

### Supabase migrations (create in `supabase/migrations/`)
Create one file per section in DATA-MODEL.md §2:
- `20260101000001_create_profiles.sql` — profiles table + RLS
- `20260101000002_create_customers.sql` — customers table + RLS
- `20260101000003_create_jobs.sql` — jobs table + RLS + indexes
- `20260101000004_create_line_items.sql` — line_items table + RLS
- `20260101000005_create_work_log.sql` — work_log table + RLS (append-only)
- `20260101000006_create_payments.sql` — payments table + RLS
- `20260101000007_rls_policies.sql` — all RLS policies consolidated

Copy SQL exactly from DATA-MODEL.md §2. Do not modify field types or constraints.

### `src/lib/db.ts`
Copy the complete Dexie schema from DATA-MODEL.md §4 exactly. This includes:
- All TypeScript interfaces (Profile, Customer, Job, LineItem, WorkLogEntry, Payment, SyncQueueItem)
- TradePadDB class with all tables and indexes
- `export const db = new TradePadDB()`

### `src/lib/sync.ts`
Implement the syncWorker function from DATA-MODEL.md §5:
- Read from `db.sync_queue`
- Push to Supabase via insert/update/delete
- Update `_sync_status` on success
- Increment `retry_count` on error

### `src/lib/initialSync.ts`
Implement the `initialSync(userId)` function from DATA-MODEL.md §5.

### `src/store/useAppStore.ts`
```typescript
import { create } from 'zustand';

interface AppState {
  userId: string | null;
  isOnline: boolean;
  syncStatus: 'synced' | 'syncing' | 'error';
  setUserId: (id: string | null) => void;
  setOnline: (online: boolean) => void;
  setSyncStatus: (status: 'synced' | 'syncing' | 'error') => void;
}

export const useAppStore = create<AppState>((set) => ({
  userId: null,
  isOnline: navigator.onLine,
  syncStatus: 'synced',
  setUserId: (id) => set({ userId: id }),
  setOnline: (online) => set({ isOnline: online }),
  setSyncStatus: (status) => set({ syncStatus: status }),
}));
```

### `.env.example`
```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

## Acceptance criteria
- [ ] All migration files exist with valid SQL
- [ ] `supabase db push` (or equivalent) applies migrations without error
- [ ] All Supabase tables exist in the dashboard (profiles, customers, jobs, line_items, work_log, payments)
- [ ] All RLS policies are active
- [ ] `db.profiles.count()` returns 0 in browser console without error
- [ ] Dexie version 1 schema matches DATA-MODEL.md §4 exactly
- [ ] TypeScript compiles with no errors

## DO NOT
- Do not add any UI
- Do not use Supabase Realtime subscriptions (not in MVP scope)
- Do not add tables not in DATA-MODEL.md
```

---

## M05 — Auth (Phone OTP)

```
# Ticket M05 — Auth (Phone OTP)

[PREPEND HARD RULES BLOCK]
[PREPEND PROJECT CONTEXT BLOCK]

## You are building
The authentication screen — UK phone number entry + OTP verification via Supabase Auth.

## Reference wireframe
No wireframe file for this screen. See SCREEN-SPECS.md §1 (Auth) for full spec.

## Files to create / modify

### `src/screens/Auth.tsx`
Implement the Auth screen with two states:
1. Phone entry state
2. OTP entry state

### `src/App.tsx`
Add auth guard: check Supabase session on mount. If session exists, check if profile exists in Dexie. If profile exists → Home. If no profile → Onboarding. If no session → Auth.

## Key implementation notes

### Phone validation
UK mobile format: `^(\+44|0)7\d{9}$`
Normalise before calling Supabase: strip leading 0, add `+44` prefix.
Show inline error if format invalid (below input field, red border, "Enter a valid UK mobile number").

### OTP input
Use a single `<input type="text" inputMode="numeric" maxLength={6}>` field.
Style it to look like 6 separate boxes using CSS (flex + letter-spacing + monospace, or 6 separate inputs with auto-focus on fill).

### Supabase calls
```typescript
// Send OTP
await supabase.auth.signInWithOtp({ phone: '+447700900123' });

// Verify OTP
const { data, error } = await supabase.auth.verifyOtp({
  phone: '+447700900123',
  token: '123456',
  type: 'sms'
});
```

### After verify
- Store session (Supabase handles this automatically)
- Check if `profiles` row exists in Dexie for this user
- Navigate accordingly

## Acceptance criteria
- [ ] Invalid UK number shows inline error, does not call Supabase
- [ ] Valid number calls `supabase.auth.signInWithOtp` — confirm in Network tab
- [ ] OTP verify calls `supabase.auth.verifyOtp`
- [ ] Successful auth navigates to Onboarding (if no profile) or Home (if profile exists)
- [ ] Session persists on page refresh
- [ ] Resend link appears after 30s countdown
- [ ] Both screens pass the touch target rules (all elements ≥44px)

## DO NOT
- Do not implement email/password auth — phone OTP only
- Do not add social login (Google etc.)
- Do not show Supabase error codes to the user — map to human messages
```

---

## M06 — Onboarding Flow

```
# Ticket M06 — Onboarding Flow (4 screens)

[PREPEND HARD RULES BLOCK]
[PREPEND PROJECT CONTEXT BLOCK]

## You are building
The 4-screen onboarding flow for new users.

## ⚠️ WIREFRAME — PASTE BEFORE SENDING
Open `/wireframes/onboarding.html` and paste the ENTIRE file content below.
Kimi has no file system access. Without this the design cannot be matched.

```html
[PASTE FULL CONTENT OF onboarding.html HERE]
```

All 4 states are in the file (s1–s4). The HTML IS the visual spec — match it exactly.

## Reference spec
SCREEN-SPECS.md §2 (Onboarding) — business rules, state transitions, validation logic

## Files to create / modify

### `src/screens/Onboarding/index.tsx`
Manages state for which step is active (1–4). Uses local state only.

### `src/screens/Onboarding/Welcome.tsx` (Step 1)
### `src/screens/Onboarding/Business.tsx` (Step 2)
### `src/screens/Onboarding/Defaults.tsx` (Step 3)
### `src/screens/Onboarding/Done.tsx` (Step 4)

Each step is a separate component, composed in the parent index.tsx.

## Key implementation notes

### Data persistence
On completing Step 4 (tap "Go to home"):
1. Create profile in Dexie: `db.profiles.put({ ...profileData, _sync_status: 'pending' })`
2. Add to sync_queue: `db.sync_queue.add({ operation: 'insert', table_name: 'profiles', ... })`
3. Navigate to Home

### ProgressDots component
Use the `ProgressDots` component from M03. Pass `total={4}` and `current={stepNumber}`.

### Business name rule
If user skips Step 2 (business name empty), `profile.business_name` = null.
This is intentional. DO NOT default to any placeholder text in the DB.

### Phone field (Step 1)
Pre-fill from Supabase auth session: `supabase.auth.getUser()` → user.phone.
Make it read-only (non-editable on this screen).

### StickyFooter
Use the `StickyFooter` component from M03 for all footer CTAs.

## Acceptance criteria
- [ ] Step 1: Continue disabled until name is filled
- [ ] Step 2: Continue enabled even with empty fields; Skip link works
- [ ] Step 3: Continue enabled; Skip link works; default values pre-filled (£75, On completion, 30)
- [ ] Step 4: Shows first name from step 1 in "You're all set, {name}"
- [ ] ProgressDots advance correctly (step 1→2→3→4)
- [ ] Back navigation works between steps
- [ ] Profile saved to Dexie on completion
- [ ] Sync queue entry added
- [ ] Navigate to Home after Step 4 "Go to home"

## DO NOT
- Do not require business name
- Do not add email field
- Do not add photo upload
```

---

## M07 — Home Screen (Today + Tasks)

```
# Ticket M07 — Home Screen (Today tab + Tasks tab)

[PREPEND HARD RULES BLOCK]
[PREPEND PROJECT CONTEXT BLOCK]

## You are building
The full Home screen — both Today tab and Tasks tab — with all 12 states from the wireframe.

## ⚠️ WIREFRAME — PASTE BEFORE SENDING
Open `/wireframes/home.html` and paste the ENTIRE file content below.
Kimi has no file system access. Without this the design cannot be matched.

```html
[PASTE FULL CONTENT OF home.html HERE]
```

All 12 states are in the file (s1–s12). The HTML IS the visual spec — match it exactly.

## Reference spec
SCREEN-SPECS.md §3 (Home) — all states, all business rules, all CTA behaviours

## Files to create / modify

### `src/screens/Home/index.tsx`
Main Home screen component. Manages tab state (today/tasks).

### `src/screens/Home/TodayTab.tsx`
Today tab content — determines which state to render based on Dexie data.

### `src/screens/Home/TasksTab.tsx`
Tasks tab — L2 + L3 task cards.

### `src/screens/Home/RunningLateSheet.tsx`
Bottom sheet for "Running late" — message composer + WhatsApp/SMS deep link.

### `src/screens/Home/MarkDoneSheet.tsx`
Bottom sheet for "Mark Done" — payment method selection.

## State determination logic (TodayTab)

```typescript
// Determine which state to render
const activeJob = jobs.find(j => j.status === 'in_progress');
const todayJobs = jobs.filter(j =>
  j.scheduled_start >= todayStart &&
  j.scheduled_start <= todayEnd &&
  j.status === 'booked'
).sort(/* by scheduled_start */);

const nextUp = todayJobs[0];
const remainingJobs = todayJobs.slice(1); // for TodayStrip

if (activeJob) {
  // show ActiveBar + (nextUp JobCard without CTAs) + TodayStrip
} else if (nextUp) {
  // show JobCard (isNextUp=true) + TodayStrip (if remainingJobs.length > 0)
} else {
  // show empty state
}
```

## Dexie queries for Tasks tab

Use the flag derivation queries from DATA-MODEL.md §7:
- urgentNew (enquiries <2h)
- overdue (awaiting_payment, invoice sent 30+ days)
- chase (awaiting_payment, invoice sent 1-29 days)
- noShow (no_show status)
- staleQuote (quoted status, quote_sent_at set)

L2 = urgentNew + overdue + noShow (shown first, "CAN'T IGNORE" section)
L3 = chase + staleQuote + missed calls (shown second, "WHEN YOU GET A MINUTE" section)

Tasks badge = L2.length (red number on Tasks tab)

## "I'm Here" action
```typescript
async function markImHere(job: Job) {
  const now = new Date().toISOString();
  await db.jobs.update(job.id, {
    status: 'in_progress',
    actual_start: now,
    updated_at: now,
    _sync_status: 'pending'
  });
  await db.sync_queue.add({
    operation: 'update', table_name: 'jobs', record_id: job.id,
    payload: { status: 'in_progress', actual_start: now, updated_at: now },
    created_at: now, retry_count: 0
  });
  await db.work_log.add({
    id: crypto.randomUUID(), job_id: job.id,
    type: 'status_change', description: 'Job started',
    created_at: now, _sync_status: 'pending'
  });
}
```

## "Mark Done" action (no deposit)
When user selects Cash/Bank Transfer/Other:
```typescript
async function markDoneWithPayment(job: Job, method: string) {
  const total = await getJobTotal(job.id); // sum line_items
  const now = new Date().toISOString();
  const paymentId = crypto.randomUUID();
  await db.transaction('rw', [db.jobs, db.payments, db.work_log, db.sync_queue], async () => {
    await db.jobs.update(job.id, { status: 'paid', actual_end: now, updated_at: now, _sync_status: 'pending' });
    await db.payments.add({ id: paymentId, job_id: job.id, type: 'full', method, amount: total, recorded_at: now, created_at: now, _sync_status: 'pending' });
    await db.work_log.add({ id: crypto.randomUUID(), job_id: job.id, type: 'status_change', description: `Payment recorded — ${method} £${total.toFixed(2)}`, created_at: now, _sync_status: 'pending' });
    // add 3 sync_queue entries for jobs, payments, work_log
  });
}
```

## "Not yet" action
```typescript
async function markDoneNotYet(job: Job) {
  const now = new Date().toISOString();
  await db.jobs.update(job.id, { status: 'awaiting_payment', actual_end: now, invoice_sent_at: now, updated_at: now, _sync_status: 'pending' });
  // work_log entry: 'Job completed — payment pending'
  // sync queue entry
}
```

## Acceptance criteria
- [ ] Today tab renders correct state based on real Dexie data
- [ ] "I'm here" transitions job to in_progress in Dexie and UI updates immediately
- [ ] ActiveBar shows elapsed time, updates every 60s
- [ ] "Running late" opens bottom sheet with pre-filled WhatsApp/SMS message
- [ ] "Mark Done" opens correct sheet (no deposit / with deposit based on job.deposit_pct)
- [ ] Payment selection transitions job to paid and removes it from Today tab
- [ ] "Not yet" transitions job to awaiting_payment
- [ ] Tasks tab shows correct L2 and L3 items from Dexie
- [ ] Tasks badge count = L2 item count
- [ ] TaskCard actions (Send reminder, Mark as paid) fire correct Dexie updates
- [ ] Empty state shown when no jobs today

## DO NOT
- Do not use mock/hardcoded data — read from Dexie only
- Do not implement Supabase Realtime
- Do not add push notification logic here (that's M16)
```

---

## M08 — Jobs List

```
# Ticket M08 — Jobs List

[PREPEND HARD RULES BLOCK]
[PREPEND PROJECT CONTEXT BLOCK]

## You are building
The Jobs list screen — grouped by status, filter chips, empty state.

## ⚠️ WIREFRAME — PASTE BEFORE SENDING
Open `/wireframes/jobs.html` and paste the ENTIRE file content below.
Kimi has no file system access. Without this the design cannot be matched.

```html
[PASTE FULL CONTENT OF jobs.html HERE]
```

All 3 states are in the file (s1–s3). The HTML IS the visual spec — match it exactly.

## Reference spec
SCREEN-SPECS.md §6 (Jobs List)

## Files to create / modify
### `src/screens/Jobs/index.tsx`

## Key implementation notes

### Grouping
Query all jobs from Dexie, group by status in this order:
in_progress → booked → quoted → awaiting_payment → no_show → paid → cancelled → written_off

Terminal groups (paid, cancelled, written_off) collapsed by default.
Tap group header → toggle collapsed state.

### Filter chips
"All" = all groups
"Active" = only in_progress + booked groups
"Unpaid" = only awaiting_payment, sorted by urgency (overdue first, then by invoice_sent_at)

### Job row tap
Navigate to `/jobs/{job.id}` — Job Detail screen

### Flag derivation
Compute flag for each job row using the same logic as HOME Tasks tab.
Show FlagBadge inline on right side of the row.

### Context sub-line
Show per SCREEN-SPECS.md §6 S1 spec.

## Acceptance criteria
- [ ] Jobs grouped correctly in the right order
- [ ] Terminal groups collapsed by default; tap to expand
- [ ] Filter chips change visible groups correctly
- [ ] Flag badges appear on correct jobs
- [ ] Context sub-lines show correct content per status
- [ ] Tapping row navigates to Job Detail
- [ ] Empty state shown when Dexie has no jobs
- [ ] "Unpaid" filter sorts overdue jobs first

## DO NOT
- Do not add search functionality
- Do not add date range filter
```

---

## M09 — Job Detail: Booked + In Progress

```
# Ticket M09 — Job Detail: Booked + In Progress states

[PREPEND HARD RULES BLOCK]
[PREPEND PROJECT CONTEXT BLOCK]

## You are building
The Job Detail screen for two states: Booked (s1/s2) and In Progress (s3/s4/s5).

## ⚠️ WIREFRAME — PASTE BEFORE SENDING
Open `/wireframes/job-detail.html` and paste states s1–s5 only (Booked, Cancel sheet, In Progress, Add Charge sheet, Mark Done sheet). You can trim the file to those states to keep the prompt focused.
Kimi has no file system access. Without this the design cannot be matched.

```html
[PASTE job-detail.html STATES s1–s5 HERE]
```

The HTML IS the visual spec — match it exactly.

## Reference spec
SCREEN-SPECS.md §4 (Job Detail) — S1 through S5

## Files to create / modify

### `src/screens/JobDetail/index.tsx`
Route entry point. Reads `jobId` from route params. Loads job + customer + line_items + work_log from Dexie. Renders the correct state component based on `job.status`.

### `src/screens/JobDetail/Booked.tsx` — status: booked
### `src/screens/JobDetail/CancelSheet.tsx` — bottom sheet for cancel
### `src/screens/JobDetail/InProgress.tsx` — status: in_progress
### `src/screens/JobDetail/AddChargeSheet.tsx` — bottom sheet for add charge
### `src/screens/JobDetail/MarkDoneSheet.tsx` — reuse from M07 if possible

## HEADER RULE (critical)
Header shows customer.name + job.title ONLY. No address. No amount.
Contact buttons (Phone + MessageCircle) visible for Booked and In Progress.

## ADDRESS RULE
Address shown ONLY in MapPreview in Booked state. Nowhere else.

## AMOUNT RULE
Booked: amount shown once, in invoice items total row.
In Progress: amount shown once, in invoice items total row (updates live).

## Add Charge action (In Progress)
```typescript
async function addCharge(jobId: string, description: string, amount: number) {
  const now = new Date().toISOString();
  const lineItemId = crypto.randomUUID();
  await db.transaction('rw', [db.line_items, db.work_log, db.sync_queue], async () => {
    await db.line_items.add({ id: lineItemId, job_id: jobId, description, amount, sort_order: nextSortOrder, added_on_site: true, created_at: now, _sync_status: 'pending' });
    await db.work_log.add({ id: crypto.randomUUID(), job_id: jobId, type: 'charge', description: `${description} — £${amount.toFixed(2)}`, amount, line_item_id: lineItemId, created_at: now, _sync_status: 'pending' });
    // sync queue for both
  });
}
```

## Remove item action
Available only on Booked and In Progress states.
```typescript
await db.line_items.delete(lineItemId);
// Add to sync_queue as delete operation
```

## Acceptance criteria
- [ ] Booked state: MapPreview renders with address
- [ ] Booked state: Info card shows scheduled_start, payment terms
- [ ] Booked state: InvoiceItemRows with × remove, live total
- [ ] Booked state: Cancel sheet opens with 3 options; cancelling sets status='cancelled'
- [ ] In Progress state: Work log renders newest entries first
- [ ] In Progress state: "+ Add note" opens inline text input, saves on blur
- [ ] In Progress state: "+ Add charge" opens AddChargeSheet
- [ ] AddChargeSheet: amount field uses inputmode="decimal"
- [ ] AddChargeSheet: added charge appears in both work log (green) and invoice items (green) immediately
- [ ] Invoice total updates live after add/remove
- [ ] Mark Done opens correct payment sheet (M05 MarkDoneSheet)
- [ ] Header: ONLY customer name + job title — no address, no amount
- [ ] CTAs are in StickyFooter — NOT inline at bottom of scroll
- [ ] Back button is ≥44px touch target

## DO NOT
- Do not show address in header
- Do not show amount in header
- Do not allow item removal from non-Booked/non-InProgress states
```

---

## M10 — Job Detail: Awaiting Payment + Send Reminder

```
# Ticket M10 — Job Detail: Awaiting Payment + Send Reminder

[PREPEND HARD RULES BLOCK]
[PREPEND PROJECT CONTEXT BLOCK]

## You are building
Job Detail for Awaiting Payment state (s6) and the Send Reminder sheet (s7).

## ⚠️ WIREFRAME — PASTE BEFORE SENDING
Open `/wireframes/job-detail.html` and paste states s6–s7 only (Awaiting Payment, Send Reminder sheet).
Kimi has no file system access. Without this the design cannot be matched.

```html
[PASTE job-detail.html STATES s6–s7 HERE]
```

The HTML IS the visual spec — match it exactly.

## Reference spec
SCREEN-SPECS.md §4 S6 + S7

## Files to create / modify
### `src/screens/JobDetail/AwaitingPayment.tsx`
### `src/screens/JobDetail/SendReminderSheet.tsx`

## Mark as Paid action
When user taps "Mark as Paid" → open payment method sheet → on selection:
1. Create payment record in Dexie (type='full' or 'balance' if deposit was taken)
2. Update job.status = 'paid'
3. Write work_log: Payment recorded

## Send Reminder action
Pre-fill message template (see SCREEN-SPECS.md §4 S7).
On WhatsApp/SMS send:
1. Open deep link
2. Write work_log: type='status_change', description='Reminder sent via {method}'
3. Update job.invoice_sent_at = now() (resets the clock)

## Acceptance criteria
- [ ] AmountCard renders with hero amount and customer name
- [ ] Overdue badge appears on AmountCard if invoice_sent_at is 30+ days ago
- [ ] Invoice items locked (no × remove, no + add)
- [ ] Mark as Paid opens payment method sheet
- [ ] Payment recorded → job.status = 'paid' → navigate to Paid state (S10)
- [ ] Send Reminder opens sheet with pre-filled editable message
- [ ] WhatsApp deep link opens correctly
- [ ] invoice_sent_at updated on send (clock reset)

## DO NOT
- Do not allow adding/removing invoice items in this state
- Do not show "Customer not home?" link in this state
```

---

## M11 — Job Detail: No-Show + Terminal States

```
# Ticket M11 — Job Detail: No-Show + Paid + Cancelled + Written Off

[PREPEND HARD RULES BLOCK]
[PREPEND PROJECT CONTEXT BLOCK]

## You are building
Job Detail for No-Show (s8/s9) and all 3 terminal states: Paid (s10), Cancelled (s11), Written Off (s12).

## ⚠️ WIREFRAME — PASTE BEFORE SENDING
Open `/wireframes/job-detail.html` and paste states s8–s12 only (No-Show, Callout Charge sheet, Paid, Cancelled, Written Off).
Kimi has no file system access. Without this the design cannot be matched.

```html
[PASTE job-detail.html STATES s8–s12 HERE]
```

The HTML IS the visual spec — match it exactly.

## Reference spec
SCREEN-SPECS.md §4 S8 through S12

## Files to create / modify
### `src/screens/JobDetail/NoShow.tsx`
### `src/screens/JobDetail/CalloutChargeSheet.tsx`
### `src/screens/JobDetail/Paid.tsx`
### `src/screens/JobDetail/Cancelled.tsx`
### `src/screens/JobDetail/WrittenOff.tsx`

## Callout Charge Sheet
Creates a SEPARATE new job (not modifies existing):
1. Create new customer record if needed (use existing customer)
2. Create new job: status='awaiting_payment', title='Callout charge'
3. Create line_item for that job: { description, amount }
4. Set invoice_sent_at = now()
5. Navigate to that new job's detail (AwaitingPayment state)

## Reschedule
Date picker (native `<input type="datetime-local">`) → update job.scheduled_start → set status='booked'.

## Write off action
```typescript
await db.jobs.update(job.id, { status: 'written_off', updated_at: now(), _sync_status: 'pending' });
// work_log: 'Job written off — £{amount}'
```

## Terminal state rules
- NO contact buttons in header (Phone / MessageCircle hidden)
- NO sticky footer CTAs
- All invoice items expanded by default (not collapsed)
- Read-only — no editing

## Acceptance criteria
- [ ] No-Show: Reschedule opens date picker, updates job to booked
- [ ] No-Show: Charge callout opens sheet with pre-filled values (£75 default)
- [ ] Callout charge creates new separate job (not modifying original)
- [ ] Paid: Payment record card shows method + amount + date
- [ ] Paid: Work log shows all entries (newest first)
- [ ] Paid: Invoice items all expanded by default
- [ ] Paid: No contact buttons, no footer CTAs
- [ ] Cancelled: Shows cancellation reason
- [ ] Written Off: Shows amount in record card
- [ ] All terminal states: header has no contact buttons

## DO NOT
- Do not allow status changes from terminal states
- Do not show contact buttons on terminal states
- Do not collapse invoice items by default
```

---

## M12 — Quote Flow: Missed Call + Customer Details

```
# Ticket M12 — Quote Flow: Missed Call + Customer Details (QF-1 through QF-3)

[PREPEND HARD RULES BLOCK]
[PREPEND PROJECT CONTEXT BLOCK]

## You are building
The first half of the Quote flow: logging a missed call and capturing customer details.

## ⚠️ WIREFRAME — PASTE BEFORE SENDING
Open `/wireframes/quote.html` and paste states s1–s3 only (Log Missed Call, Missed call task card, Customer details).
Kimi has no file system access. Without this the design cannot be matched.

```html
[PASTE quote.html STATES s1–s3 HERE]
```

The HTML IS the visual spec — match it exactly.

## Reference spec
SCREEN-SPECS.md §5 QF-1 through QF-3

## Files to create / modify
### `src/screens/Quote/index.tsx` — route wrapper, manages flow state
### `src/screens/Quote/LogMissedCall.tsx` — QF-1
### `src/screens/Quote/CustomerDetails.tsx` — QF-3

## Flow management
Quote flow can be entered two ways:
1. From Home "Log Missed Call" → start at QF-1
2. From Home "+ New Quote" → start at QF-3
3. From TaskCard "Create quote" → start at QF-3 with customer pre-filled

Pass entry point as route state: `navigate('/quote', { state: { entryPoint: 'missed_call' | 'new_quote' | 'task', customerId? } })`

## Log Missed Call (QF-1)
On "Save & call back":
1. Validate phone (UK format)
2. Create customer in Dexie
3. Create job: status='enquiry'
4. Create work_log: 'Missed call logged'
5. Open `tel:{phone}` (triggers native dial)
6. Navigate to Home (Tasks tab shows new task card)

On "Save only":
1. Same steps 1-4
2. Navigate to Home (Tasks tab)

## Customer Details (QF-3)
- If customerId passed in route state: load customer from Dexie, pre-fill
- If no customerId: empty form
- "Edit" link in customer strip: refocuses name/phone fields

## Acceptance criteria
- [ ] Log Missed Call: UK phone validation blocks non-UK numbers
- [ ] Log Missed Call: "Save & call back" creates enquiry + dials phone
- [ ] Log Missed Call: "Save only" creates enquiry, no dial
- [ ] Created enquiry appears as TaskCard in Home Tasks tab (L2 if <2h)
- [ ] Customer Details: form is pre-filled when accessed from TaskCard
- [ ] Customer Details: [Next →] disabled until name + phone filled
- [ ] Address field: plain text only, no validation

## DO NOT
- Do not add postcode lookup API
- Do not add customer database search/autocomplete
```

---

## M13 — Quote Flow: Builder + Preview + Send

```
# Ticket M13 — Quote Flow: Builder + Preview + Send (QF-4 through QF-8)

[PREPEND HARD RULES BLOCK]
[PREPEND PROJECT CONTEXT BLOCK]

## You are building
The second half of the Quote flow: building the quote, previewing it, and sending it.

## ⚠️ WIREFRAME — PASTE BEFORE SENDING
Open `/wireframes/quote.html` and paste states s4–s8 only (Quote Builder, Deposit variant, Preview, Send sheet, Sent confirmation).
Kimi has no file system access. Without this the design cannot be matched.

```html
[PASTE quote.html STATES s4–s8 HERE]
```

The HTML IS the visual spec — match it exactly. Pay close attention to the dev comments at the top of the file — they contain implementation rules for deposit auto-scroll, amount field validation, and send method logic.

## Reference spec
SCREEN-SPECS.md §5 QF-4 through QF-8

## Files to create / modify
### `src/screens/Quote/QuoteBuilder.tsx` — QF-4/s5
### `src/screens/Quote/QuotePreview.tsx` — QF-6
### `src/screens/Quote/SendSheet.tsx` — QF-7
### `src/screens/Quote/QuoteSent.tsx` — QF-8

## Quote builder rules
1. Line items: all require amount. Block Preview if any amount empty.
2. Amount fields: `inputmode="decimal"`, no TBC items
3. Deposit auto-scroll: `depositSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })`
4. Total updates live as items change

## Preview: business name gate
```typescript
if (!profile.business_name) {
  // Show amber nudge banner
  // Disable [Send] button
  // Show "Add your business name in Settings first"
}
```

## Send message template
```
Hi {customerName}, here's your quote for {jobTitle}:

{line items: "• {description} — £{amount.toFixed(2)}"}

Total: £{total.toFixed(2)}
{if deposit: "Deposit: £{depositAmount.toFixed(2)} (due now)"}
Payment: {paymentTermsLabel}
Valid for {quoteValidDays} days.

{businessName}
```

## On send
1. Create/update job: status='quoted', quote_sent_at=now(), quote_expires_at=now()+validDays*86400000
2. Create customer record (if new)
3. Create line_items for the job
4. Create work_log: 'Quote sent via {method}'
5. Generate quote number: `Q-${(existingQuoteCount + 1001)}`
6. Navigate to QF-8

## On QF-8 "View job"
Navigate to Job Detail for this job (renders in Quoted state — new state to add to JobDetail router, read-only between Enquiry and Booked).

## Acceptance criteria
- [ ] Quote builder: [Preview] blocked if any line item has empty amount
- [ ] Quote builder: Total updates live
- [ ] Deposit selected: section auto-scrolls into view
- [ ] Deposit: amount calculated correctly (pct/100 × total)
- [ ] Preview: QuotePreviewCard renders correctly with all data
- [ ] Preview: business name gate shows nudge if business_name is null
- [ ] Preview: business name gate disables [Send] button
- [ ] Send sheet: WhatsApp deep link opens with pre-filled message
- [ ] Send sheet: message is editable before sending
- [ ] After send: job.status = 'quoted'
- [ ] QF-8: "View job" navigates to Job Detail

## DO NOT
- Do not generate PDF — plain text only
- Do not create hosted quote link
- Do not add email sending
```

---

## M14 — Settings

```
# Ticket M14 — Settings Screen

[PREPEND HARD RULES BLOCK]
[PREPEND PROJECT CONTEXT BLOCK]

## You are building
The Settings screen — inline edit, business profile, defaults, about section.

## ⚠️ WIREFRAME — PASTE BEFORE SENDING
Open `/wireframes/settings.html` and paste the ENTIRE file content below.
Kimi has no file system access. Without this the design cannot be matched.

```html
[PASTE FULL CONTENT OF settings.html HERE]
```

All 3 states are in the file (s1–s3). The HTML IS the visual spec — match it exactly.

## Reference spec
SCREEN-SPECS.md §7 (Settings)

## Files to create / modify
### `src/screens/Settings/index.tsx`

## Inline edit implementation
```typescript
const [editingField, setEditingField] = useState<string | null>(null);

// InlineEditRow: when tapped, set editingField = field key
// On blur or Done tap: save to Dexie + sync queue, set editingField = null
```

## Auto-save on blur
```typescript
async function saveProfileField(field: keyof Profile, value: string) {
  const now = new Date().toISOString();
  await db.profiles.update(userId, { [field]: value, updated_at: now, _sync_status: 'pending' });
  await db.sync_queue.add({ operation: 'update', table_name: 'profiles', record_id: userId, payload: { [field]: value, updated_at: now }, created_at: now, retry_count: 0 });
}
```

## Trade field
Trade is a segmented-style selection (not free text).
Tap "Trade" row → opens BottomSheet with 4 options: Plumber / Electrician / Builder / Other.

## Business name nudge
If `profile.business_name` is null or empty:
- Show amber banner at top: "Add your business name to send quotes"
- InlineEditRow for business_name has red border

## Log out
Tap Log out → show confirmation (native browser `confirm()` for MVP):
"Are you sure? You'll need to sign in again."
On confirm: `supabase.auth.signOut()` → navigate to /auth → clear Dexie

## Acceptance criteria
- [ ] Tapping any InlineEditRow value makes it editable in place
- [ ] Saves on blur (auto-save — no explicit save button needed)
- [ ] No sub-screens — all editing happens inline
- [ ] Business name nudge banner shown if business_name is empty
- [ ] Business name row has red border if empty
- [ ] Trade opens BottomSheet (not inline text edit)
- [ ] Payment terms opens BottomSheet with SegmentedControl
- [ ] Log out clears session and navigates to Auth
- [ ] All rows ≥52px touch target

## DO NOT
- Do not create sub-screens for any setting
- Do not add a master "Save" button
- Do not add delete account functionality
```

---

## M15 — Offline Support

```
# Ticket M15 — Offline Support + Sync

[PREPEND HARD RULES BLOCK]
[PREPEND PROJECT CONTEXT BLOCK]

## You are building
Full offline support: service worker, sync queue processing, and UI indicators.

## Reference
DATA-MODEL.md §5 (Sync Strategy) — syncWorker and initialSync implementations

## Files to create / modify

### `vite.config.ts`
Configure vite-plugin-pwa with Workbox:
```typescript
import { VitePWA } from 'vite-plugin-pwa'
// ... 
VitePWA({
  registerType: 'autoUpdate',
  workbox: {
    globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
    runtimeCaching: [{
      urlPattern: /^https:\/\/.*\.supabase\.co\/.*/i,
      handler: 'NetworkFirst',
      options: { networkTimeoutSeconds: 10, cacheName: 'supabase-cache' }
    }]
  }
})
```

### `src/lib/sync.ts`
Full implementation of syncWorker (see DATA-MODEL.md §5).
Also implement initialSync (see DATA-MODEL.md §5).

### `src/App.tsx`
Add:
```typescript
// On mount: run initialSync if online
// Register online/offline listeners
window.addEventListener('online', () => { store.setOnline(true); syncWorker(); });
window.addEventListener('offline', () => store.setOnline(false));

// Run syncWorker every 30s
setInterval(syncWorker, 30000);
```

### Sync status indicator (small component)
Add a subtle indicator in the header area of Home/Jobs/Settings:
- If `_sync_status` of any record is 'pending': show grey "Syncing..." badge (10px, #9CA3AF)
- If all synced: no indicator shown
- If error: show amber "Sync error" (tap to retry)

## Acceptance criteria
- [ ] App works with no network connection (turn off WiFi, test all core flows)
- [ ] Writes persist to Dexie immediately (no waiting for network)
- [ ] When reconnected, sync queue processes and Supabase tables update
- [ ] "Syncing..." indicator appears when pending records exist
- [ ] Service worker is registered (check DevTools > Application > Service Workers)
- [ ] App installs as PWA (Add to Home Screen prompt appears)
- [ ] Hard refresh while offline shows last-known state (not blank)

## DO NOT
- Do not block any UI action on network availability
- Do not show error modals for network failures
```

---

## M16 — Push Notifications

```
# Ticket M16 — Push Notifications (end-of-day unpaid nudge)

[PREPEND HARD RULES BLOCK]
[PREPEND PROJECT CONTEXT BLOCK]

## You are building
The end-of-day push notification for unpaid jobs.

## Reference
MASTER-PRD.md §16 (Notifications)

## Files to create / modify
### `src/lib/notifications.ts`

## Implementation

### Request permission
Request push permission on first Home visit after onboarding:
```typescript
async function requestNotificationPermission() {
  if ('Notification' in window && Notification.permission === 'default') {
    await Notification.requestPermission();
  }
}
```

### Schedule daily nudge (client-side for MVP)
```typescript
// Check at 6pm: any jobs in awaiting_payment with actual_end today?
async function checkEndOfDay() {
  const now = new Date();
  if (now.getHours() < 18) return; // only run after 6pm
  
  const unpaidToday = await db.jobs
    .where('status').equals('awaiting_payment')
    .filter(j => j.actual_end && j.actual_end >= todayStart)
    .count();
  
  if (unpaidToday > 0 && Notification.permission === 'granted') {
    new Notification('TradePad', {
      body: `${unpaidToday} job${unpaidToday > 1 ? 's' : ''} done today. Did you get paid?`,
      icon: '/icons/icon-192.png',
      tag: 'end-of-day-nudge'  // prevents duplicates
    });
  }
}

// Run every hour (client-side scheduling for MVP)
setInterval(checkEndOfDay, 60 * 60 * 1000);
```

### Notification tap → navigate
```typescript
// In service worker
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(clients.openWindow('/jobs?filter=unpaid'));
});
```

## Acceptance criteria
- [ ] Permission request appears on first home visit (not on auth screen)
- [ ] Notification fires after 6pm if unpaid jobs from today exist
- [ ] Notification does not fire if no unpaid jobs
- [ ] Tapping notification navigates to Jobs list with Unpaid filter active
- [ ] `tag: 'end-of-day-nudge'` prevents duplicate notifications

## DO NOT
- Do not use Supabase Edge Functions for notifications in MVP
- Do not add other notification types (review requests, auto-chasers — Phase 2)
```

---

## M17 — QA Pass

```
# Ticket M17 — Final QA Pass

[PREPEND HARD RULES BLOCK]
[PREPEND PROJECT CONTEXT BLOCK]

## You are doing
A final quality assurance pass against the 10 Simplicity Rules and the dirty-hands test.

## QA Checklist — 10 Simplicity Rules

- [ ] RULE 1: Send quote from home in ≤3 taps — test and confirm tap count
- [ ] RULE 1: Log missed call from home in ≤3 taps — test and confirm
- [ ] RULE 1: Mark job paid from home in ≤3 taps — test and confirm
- [ ] RULE 2: Customer name/phone pre-fill on all forms that have the data
- [ ] RULE 2: Quote defaults pre-fill from Settings values
- [ ] RULE 3: No explicit Save buttons anywhere in the app
- [ ] RULE 3: All edits auto-save on blur
- [ ] RULE 4: Defaults set in Onboarding appear in Quote builder without Dave retyping
- [ ] RULE 5: No CIS-related UI visible anywhere
- [ ] RULE 6: CTAs change correctly per job state — no generic "Actions" menus
- [ ] RULE 7: Quote builder is 3 steps (Customer → Build → Preview/Send), not one mega-form
- [ ] RULE 8: "Running late" sends message with 1 tap after composing
- [ ] RULE 9: No "IndexedDB", "Supabase", "PostgreSQL" text visible in UI
- [ ] RULE 10: Every error state has an inline recovery path visible on screen

## Dirty-Hands Test — 10 Critical Flows

Run each flow with one finger on a 375px viewport:

1. **Log missed call → create quote → send via WhatsApp**
   Time from tap to WhatsApp open: should be < 90 seconds

2. **Tap "I'm here" → add charge on site → mark done → record cash payment**
   All steps reachable, no tiny tap targets

3. **Home → Jobs → tap overdue job → send reminder → mark as paid**
   No more than 5 taps total

4. **Open app offline → view today's job → mark done**
   Works without network

5. **New user onboarding → first quote sent**
   Complete in under 3 minutes

6. **Cancel a booked job → view it in Jobs list under Cancelled**
   Cancelled group exists, job appears

7. **Customer no-show → charge callout £75 → view callout invoice**
   New job created correctly

8. **Change business name in Settings → immediately visible in quote preview**
   No reload required

9. **Tap back from Job Detail → correct screen (Home or Jobs based on where you came from)**
   Back navigation correct

10. **Install to home screen → launch from icon → land on Home**
    PWA install works, loads fast

## Visual QA

- [ ] All amounts show £ prefix, 2 decimal places (£150.00 not £150)
- [ ] All dates are formatted for UK (14 May not May 14)
- [ ] All times are 12-hour format (9:30am not 09:30)
- [ ] No overflowing text on 375px viewport
- [ ] Customer names truncate with ellipsis (not overflow)
- [ ] Job titles truncate correctly in headers and cards
- [ ] All status badges use correct colours per DESIGN-TOKENS.md
- [ ] No emoji in production UI (Lucide icons only)
- [ ] Tab bar visible on Home, Jobs, Settings only
- [ ] No tab bar on Job Detail, Quote flow, Onboarding

## Performance

- [ ] First Contentful Paint < 2s on 3G (Lighthouse)
- [ ] Home screen loads with jobs visible < 500ms (from Dexie)
- [ ] No layout shift during load

## Bugs to look for

- [ ] Mark Done sheet: "Not yet" correctly moves job to awaiting_payment (not leaves it in_progress)
- [ ] Deposit calculation: 20% of £350 = £70.00 deposit, £280.00 balance
- [ ] Multiple jobs today: TodayStrip shows "+N more" correctly
- [ ] Stale quote flag: only shows if job.quote_sent_at is set AND status is 'quoted'
- [ ] Cancel sheet: "Keep the job" does nothing (just closes sheet)
- [ ] Settings log out: clears session AND redirects to Auth

## When done
Produce a QA summary with:
- Any failing checklist items and what was done to fix them
- Any items that could not be tested (explain why)
- Confirmation that all 10 flows pass the dirty-hands test
```

---

## How to Hand Off to Kimi k2.6

### Step-by-step process

1. **Open a new Kimi k2.6 conversation** — start fresh for each milestone
2. **Copy the HARD RULES BLOCK** from §1 above
3. **Copy the PROJECT CONTEXT BLOCK** from §2 above
4. **Paste the milestone ticket** (M01, M02, etc. in order)
5. **Fill the wireframe placeholder** — each ticket with a screen has a `⚠️ WIREFRAME — PASTE BEFORE SENDING` block. Open the referenced HTML file from `/wireframes/`, copy the entire content (or the specified states), and replace `[PASTE ... HERE]` with the actual HTML. Do not skip this step — Kimi has no file system access.
6. **Attach the relevant handoff doc sections** referenced in the ticket
7. **Send** — wait for complete output
8. **Review output** against acceptance criteria
9. **If it passes** → copy code into project, run `npm run dev`, verify manually
10. **If it fails** → send a follow-up with specific failure, ask for correction
11. **Move to next milestone** — do not skip

### What to attach to each ticket

| Milestone | Wireframe to attach | Handoff doc sections |
|---|---|---|
| M01 | None | DESIGN-TOKENS.md §8-9, DATA-MODEL.md §4 |
| M02 | None | DESIGN-TOKENS.md §1-9 (full file) |
| M03 | home.html (for component reference) | COMPONENT-LIBRARY.md (full file), DESIGN-TOKENS.md |
| M04 | None | DATA-MODEL.md (full file) |
| M05 | None | SCREEN-SPECS.md §1 |
| M06 | onboarding.html (full) | SCREEN-SPECS.md §2, COMPONENT-LIBRARY.md (StickyFooter, ProgressDots) |
| M07 | home.html (full) | SCREEN-SPECS.md §3, COMPONENT-LIBRARY.md §5-7 §17-18 |
| M08 | jobs.html (full) | SCREEN-SPECS.md §6, COMPONENT-LIBRARY.md §4 |
| M09 | job-detail.html s1-s5 | SCREEN-SPECS.md §4 S1-S5, COMPONENT-LIBRARY.md §8 §11 §17 |
| M10 | job-detail.html s6-s7 | SCREEN-SPECS.md §4 S6-S7, COMPONENT-LIBRARY.md §9 |
| M11 | job-detail.html s8-s12 | SCREEN-SPECS.md §4 S8-S12 |
| M12 | quote.html s1-s3 | SCREEN-SPECS.md §5 QF-1-3 |
| M13 | quote.html s4-s8 | SCREEN-SPECS.md §5 QF-4-8, COMPONENT-LIBRARY.md §10 |
| M14 | settings.html (full) | SCREEN-SPECS.md §7, COMPONENT-LIBRARY.md §13 |
| M15 | None | DATA-MODEL.md §5 |
| M16 | None | MASTER-PRD.md §16 |
| M17 | All wireframes | All handoff docs |

---

*End of BUILD-SEQUENCE.md — Version 1.0*
