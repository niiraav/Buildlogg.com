# M07 Correction — Home Screen Fixes

> COPY THIS ENTIRE FILE AND PASTE INTO KIMI. Everything is pre-assembled.

---

## HARD RULES (non-negotiable — read before writing any code)

1. MOBILE-FIRST: Target 375-430px viewport only. No desktop breakpoints.
2. TOUCH TARGETS: Primary CTAs 52px height. Secondary 44px. List rows 56px min. Icon buttons 40×40px.
3. FORM INPUTS: 48px min-height. font-size 16px.
4. NO SAVE BUTTONS: Auto-save on blur.
5. STICKY FOOTER: All CTAs on detail screens pinned to bottom. Never inline at end of scroll.
6. NO TAB BAR: Hide on all detail screens. Only show on Home, Jobs, Settings.
7. ICONS: Use Lucide React. No emoji in production code.
8. OFFLINE-FIRST: All writes → Dexie first → sync queue → Supabase background.
9. MVP ONLY: Do not build anything not in the wireframe states.
10. POSITION: Never use `position: fixed`. Use `position: absolute` within `#app-shell`.
11. WIREFRAMES: The wireframe is a visual reference — not a coding spec. Use it to understand screen layout, content hierarchy, component states, and interactions. Build using COMPONENT-LIBRARY.md for component patterns and DESIGN-TOKENS.md for all values. Translate wireframe visual intent into Tailwind classes. Never produce inline `style` attributes. Where DESIGN-TOKENS.md and the wireframe CSS disagree, DESIGN-TOKENS.md wins.

---

## PROJECT CONTEXT

PROJECT: TradePad — PWA for UK sole-trader tradespeople
STACK: React 18 + Vite + Tailwind CSS v3 + Zustand + Supabase + Dexie.js + Lucide React + React Router v6
FILE TO MODIFY: `src/screens/Home/index.tsx`

---

## What you are fixing

The Home screen was built in M07 but has 5 specific issues compared to the wireframe. Fix all 5. Do not change anything else.

---

## Issue 1 — Header is missing personalization and amount owed

**Current (wrong):** Header shows just "TradePad" wordmark + "+ New Quote" button.

**Required (from wireframe):**
- Left: User's first name as greeting ("Morning, Dave") — 18px, 700
- Left sub: Day + job count ("Wed · 3 jobs today") or "Wed · no jobs scheduled" — 12px, muted
- Right: Total owed amount ("£3,040") — 22px, 800
- Right sub: "owed to you" — 11px, muted

**Data sources:**
- First name: `profile.full_name.split(' ')[0]` from Dexie profiles table
- Day + job count: `new Date().toLocaleDateString('en-GB', { weekday: 'short' })` + count of today's booked/in_progress jobs
- Amount owed: `SUM of all jobs in awaiting_payment state line_items totals`

**Greeting logic:**
```typescript
function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Morning';
  if (h < 17) return 'Afternoon';
  return 'Evening';
}
// Display: "{greeting}, {firstName}"
```

---

## Issue 2 — Footer uses FAB, wireframe uses two footer buttons

**Current (wrong):** Floating Action Button (FAB) for "+ New Quote"

**Required (from wireframe):** Two equal-width footer buttons pinned above the tab bar:
- "+ New Quote" (left) → navigate('/quote')
- "Log Missed Call" (right) → navigate('/quote', { state: { entryPoint: 'missed_call' } })

```
[footer — flex, gap 8px, padding 10px 16px, border-top 1px #F3F4F6]
  [+ New Quote button — flex 1, height 44px, background #fff, border 1px #D1D5DB, border-radius 8px, font-size 13px, font-weight 600]
  [Log Missed Call button — flex 1, same style]
```

Remove the FAB entirely.

---

## Issue 3 — Tasks tab is a placeholder, not implemented

**Current (wrong):** Tasks tab shows "Nothing to do" placeholder.

**Required (from wireframe s12):** Full L2 + L3 task list implementation.

### Data queries (run against Dexie when Tasks tab is active):

```typescript
// L2 — Can't Ignore
const noShowJobs = await db.jobs.where('status').equals('no_show').toArray();
const overdueJobs = await db.jobs
  .where('status').equals('awaiting_payment')
  .filter(j => {
    if (!j.invoice_sent_at) return false;
    const days = (Date.now() - new Date(j.invoice_sent_at).getTime()) / 86400000;
    return days >= 30;
  }).toArray();
const urgentNew = await db.jobs
  .where('status').equals('enquiry')
  .filter(j => {
    const ageMs = Date.now() - new Date(j.created_at).getTime();
    return ageMs < 2 * 60 * 60 * 1000;
  }).toArray();

// L3 — When you get a minute
const chaseJobs = await db.jobs
  .where('status').equals('awaiting_payment')
  .filter(j => {
    if (!j.invoice_sent_at) return false;
    const days = (Date.now() - new Date(j.invoice_sent_at).getTime()) / 86400000;
    return days >= 1 && days < 30;
  }).toArray();
const staleQuotes = await db.jobs
  .where('status').equals('quoted')
  .filter(j => !!j.quote_sent_at).toArray();
```

### Tasks tab layout (structure reference — implement s12 using Tailwind, not inline CSS):

```
[body — scrollable]
  [if l2Items.length > 0]
    [section label — "CAN'T IGNORE" — 10px, 700, uppercase, #6B7280]
    [l2-group — border 1px #D1D5DB, border-radius 10px, overflow hidden]
      [for each l2 item — l2-row: min-height 52px, flex, padding 12px 14px, gap 10px]
        [tag chip — 10px, 700, uppercase, background #F3F4F6, border-radius 4px, padding 2px 7px]
          No-show → "No-show"
          Overdue → "Overdue"
          Urgent new → "New"
        [name — 14px, 600, #111827, flex 1, truncate]
          "{customerName} · {jobTitle}"
        [amount/time — 13px, #6B7280]
        [chevron — ChevronRight 18px, #D1D5DB]

  [if l3Items.length > 0]
    [section label — "WHEN YOU GET A MINUTE" + "See all" link right]
    [l3-group — border 1px #E5E7EB, border-radius 10px, overflow hidden]
      [for each l3 item — l3-row: min-height 48px]
        [tag chip — lighter style: background #F9FAFB, border 1px #E5E7EB, color #9CA3AF]
          Chase job → "Chase · {n}d"
          Stale quote → "Stale · {n}d"
        [name — 13px, 500, #374151]
        [amount — 12px, #9CA3AF]
        [chevron]

  [if no items in either section]
    [empty: "Nothing needs your attention" — center, 15px, #9CA3AF]
```

### Row tap → navigate to `/jobs/{job.id}`

---

## Issue 4 — Tasks badge count missing on tab

**Current (wrong):** Tasks tab shows no badge.

**Required:** Red badge on Tasks tab showing count of L2 items (noShow + overdue + urgentNew).

The `HomeTabSwitcher` component already accepts `tasksBadgeCount` prop. Pass `l2Count` to it:

```tsx
<HomeTabSwitcher
  activeTab={activeTab}
  tasksBadgeCount={l2Count}  // l2Count = noShowJobs.length + overdueJobs.length + urgentNew.length
  onChange={setActiveTab}
/>
```

---

## Issue 5 — Mark Done deposit sheet shows wrong payment options

**Current (wrong):** Deposit sheet shows Cash + Other + Not yet. Missing "Terminal" option. Doesn't exclude Bank Transfer correctly.

**Required (from wireframe s6):** Deposit sheet shows: Terminal / Cash / Not yet — chase later
No Bank Transfer on deposit sheet (deposit was likely already taken as cash/terminal).

---

## Wireframe reference — home.html (visual reference)

Use this file to understand: screen layout, content hierarchy, component states, labels, copy, and navigation flows.

**Implementation priority order — highest wins:**
1. HARD RULES above (touch targets, positioning, no inline styles)
2. `docs/handoff/COMPONENT-LIBRARY.md` — use the defined component pattern if one exists
3. `docs/handoff/DESIGN-TOKENS.md` — source of truth for all colour, spacing, and typography values
4. Ticket spec above (business logic, data queries, state conditions)
5. This wireframe — visual reference when the above don't resolve a layout question

**Never produce inline `style` attributes.** Translate wireframe CSS values into Tailwind classes:
- `background: #111827` → `bg-[#111827]`
- `height: 52px` → `h-[52px]`
- `border-radius: 12px` → `rounded-xl`
- `font-size: 13px; font-weight: 600` → `text-[13px] font-semibold`

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=390, initial-scale=1.0, user-scalable=no">
<title>TradePad — Home (Verified)</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    background: #E5E7EB;
    padding: 20px;
  }

  /* ── State switcher ── */
  .switcher { width: 390px; margin: 0 auto 16px; }
  .switcher-label { font-size: 11px; color: #9CA3AF; font-family: monospace; margin-bottom: 8px; display: block; }
  .switcher-row { display: flex; flex-wrap: wrap; gap: 6px; }
  .state-btn {
    padding: 5px 10px; font-size: 11px; background: #fff;
    border: 1px solid #D1D5DB; border-radius: 6px; cursor: pointer;
    color: #374151; font-family: -apple-system, sans-serif;
  }
  .state-btn.active { background: #111827; color: #fff; border-color: #111827; }

  /* ── Phone shell ── */
  .phone {
    width: 390px; height: 844px; margin: 0 auto; background: #fff;
    border-radius: 12px; overflow: hidden;
    box-shadow: 0 4px 32px rgba(0,0,0,.12);
    display: none; flex-direction: column; position: relative;
  }
  .phone.active { display: flex; }

  /* ── App header ── */
  .hdr {
    padding: 16px 16px 12px; display: flex;
    justify-content: space-between; align-items: flex-start;
    border-bottom: 1px solid #F3F4F6; flex-shrink: 0;
  }
  .hdr-name   { font-size: 18px; font-weight: 700; color: #111827; }
  .hdr-sub    { font-size: 12px; color: #9CA3AF; margin-top: 2px; }
  .hdr-right  { text-align: right; }
  .hdr-amount { font-size: 22px; font-weight: 800; color: #111827; }
  .hdr-label  { font-size: 11px; color: #9CA3AF; margin-top: 1px; }

  /* ── Home tabs (Today / Tasks) ── */
  .home-tabs {
    display: flex; flex-shrink: 0;
    border-bottom: 1px solid #F3F4F6;
  }
  .home-tab {
    flex: 1; height: 40px; display: flex; align-items: center; justify-content: center;
    font-size: 13px; font-weight: 500; color: #9CA3AF; cursor: pointer;
    gap: 6px;
  }
  .home-tab.active {
    color: #111827; font-weight: 700;
    box-shadow: inset 0 -2px 0 #111827;
  }
  .htab-badge {
    background: #EF4444; color: #fff;
    font-size: 10px; font-weight: 700; line-height: 1;
    border-radius: 10px; padding: 2px 6px;
  }

  /* ── Scrollable body ── */
  .body { flex: 1; overflow-y: auto; padding: 14px 16px; min-height: 0; }

  /* ── Layer 1 card ── */
  .l1 { border: 1.5px solid #111827; border-radius: 10px; padding: 14px; margin-bottom: 12px; }
  .l1-eyebrow {
    display: inline-block;
    font-size: 10px; font-weight: 700; color: #fff; background: #111827;
    padding: 2px 8px; border-radius: 4px;
    text-transform: uppercase; letter-spacing: .5px; margin-bottom: 8px;
  }
  .l1-title  { font-size: 16px; font-weight: 700; color: #111827; }
  .l1-meta   { font-size: 13px; color: #6B7280; margin-top: 3px; }
  .l1-divider { height: 1px; background: #F3F4F6; margin: 12px 0; }
  .l1-notified { font-size: 11px; color: #9CA3AF; margin-top: 10px; }
  .l1-secondary {
    text-align: center; margin-top: 10px; font-size: 12px;
    color: #9CA3AF; cursor: pointer;
    text-decoration: underline; text-underline-offset: 2px;
  }

  /* ── Message preview ── */
  .msg-preview {
    background: #F9FAFB; border: 1px solid #E5E7EB; border-radius: 8px;
    padding: 10px 12px; font-size: 13px; color: #374151;
    font-style: italic; line-height: 1.4;
  }

  /* ── Compact active bar ── */
  .active-bar {
    display: flex; align-items: center; gap: 10px;
    padding: 0 14px; height: 44px;
    border: 1.5px solid #111827; border-radius: 10px;
    margin-bottom: 12px; cursor: pointer;
  }
  .active-dot { width: 8px; height: 8px; border-radius: 50%; background: #111827; flex-shrink: 0; }
  .active-name {
    flex: 1; font-size: 13px; font-weight: 600; color: #111827;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .active-meta { font-size: 12px; color: #6B7280; flex-shrink: 0; }
  .btn-done {
    height: 30px; padding: 0 12px; background: #111827; color: #fff;
    border: none; border-radius: 6px; font-size: 11px; font-weight: 700;
    cursor: pointer; flex-shrink: 0; letter-spacing: .3px; font-family: inherit;
  }

  /* ── Today strip ── */
  .today-strip {
    display: flex; align-items: center; gap: 8px;
    padding: 0 12px; margin-bottom: 16px; font-size: 12px;
    color: #6B7280; border: 1px solid #E5E7EB; border-radius: 8px;
    cursor: pointer; height: 36px;
  }
  .today-next { font-weight: 600; color: #374151; flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .today-more { color: #9CA3AF; flex-shrink: 0; font-size: 11px; }

  /* ── Buttons ── */
  .btn-row { display: flex; gap: 8px; }
  .btn {
    flex: 1; height: 44px; border: 1px solid #D1D5DB; border-radius: 8px;
    background: #F9FAFB; font-size: 13px; font-weight: 600; color: #111827;
    cursor: pointer; display: flex; align-items: center; justify-content: center;
    font-family: inherit;
  }
  .btn.primary { background: #111827; color: #fff; border-color: #111827; }

  /* ── Section header ── */
  .section-hdr { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
  .section-label { font-size: 10px; font-weight: 700; color: #6B7280; text-transform: uppercase; letter-spacing: .7px; }
  .section-link { font-size: 12px; color: #6B7280; cursor: pointer; }

  /* ── Layer 2 ── */
  .l2-group { border: 1px solid #D1D5DB; border-radius: 10px; overflow: hidden; margin-bottom: 20px; }
  .l2-row {
    display: flex; align-items: center; padding: 12px 14px;
    gap: 10px; border-bottom: 1px solid #F3F4F6; cursor: pointer; min-height: 52px;
  }
  .l2-row:last-child { border-bottom: none; }
  .l2-tag {
    font-size: 10px; font-weight: 700; color: #111827; background: #F3F4F6;
    padding: 2px 7px; border-radius: 4px; text-transform: uppercase;
    letter-spacing: .3px; white-space: nowrap; flex-shrink: 0;
  }
  .l2-name   { font-size: 14px; font-weight: 600; color: #111827; flex: 1; min-width: 0; }
  .l2-amount { font-size: 13px; color: #6B7280; white-space: nowrap; flex-shrink: 0; }
  .chevron   { font-size: 18px; color: #D1D5DB; flex-shrink: 0; line-height: 1; }

  /* ── Layer 3 ── */
  .l3-group { border: 1px solid #E5E7EB; border-radius: 10px; overflow: hidden; margin-bottom: 20px; }
  .l3-row {
    display: flex; align-items: center; padding: 10px 14px;
    gap: 10px; border-bottom: 1px solid #F3F4F6; cursor: pointer; min-height: 48px;
  }
  .l3-row:last-child { border-bottom: none; }
  .l3-tag {
    font-size: 10px; font-weight: 600; color: #9CA3AF; background: #F9FAFB;
    border: 1px solid #E5E7EB; padding: 2px 7px; border-radius: 4px;
    text-transform: uppercase; white-space: nowrap; flex-shrink: 0;
  }
  .l3-name   { font-size: 13px; font-weight: 500; color: #374151; flex: 1; min-width: 0; }
  .l3-amount { font-size: 12px; color: #9CA3AF; white-space: nowrap; flex-shrink: 0; }

  /* ── No jobs today card ── */
  .no-jobs-card {
    background: #F9FAFB; border: 1px solid #E5E7EB;
    border-radius: 10px; padding: 36px 20px; text-align: center; margin-bottom: 16px;
  }
  .no-jobs-title { font-size: 20px; font-weight: 700; color: #111827; margin-bottom: 6px; }
  .no-jobs-sub   { font-size: 13px; color: #9CA3AF; }

  /* ── Bottom sheet ── */
  .sheet-overlay { position: absolute; inset: 0; background: rgba(0,0,0,0.25); z-index: 20; }
  .sheet {
    position: absolute; bottom: 0; left: 0; right: 0;
    background: #fff; border-radius: 14px 14px 0 0; z-index: 30;
  }
  .sheet-handle { width: 36px; height: 4px; background: #D1D5DB; border-radius: 2px; margin: 12px auto 16px; }
  .sheet-title  { font-size: 14px; font-weight: 700; color: #111827; padding: 0 16px 2px; }
  .sheet-sub    { font-size: 12px; color: #9CA3AF; padding: 0 16px 12px; }
  .sheet-opt {
    display: flex; align-items: center; padding: 0 16px;
    height: 52px; border-top: 1px solid #F3F4F6;
    font-size: 15px; font-weight: 500; color: #111827; cursor: pointer;
  }
  .sheet-opt.muted { color: #9CA3AF; font-size: 14px; }
  .sheet-note { font-size: 11px; color: #9CA3AF; padding: 4px 16px 14px; }

  /* ── Empty / all-clear state ── */
  .empty-card {
    border: 1px dashed #D1D5DB; border-radius: 10px;
    padding: 40px 16px; text-align: center; margin-bottom: 20px;
  }
  .empty-title { font-size: 16px; font-weight: 600; color: #111827; margin-bottom: 6px; }
  .empty-sub   { font-size: 13px; color: #9CA3AF; }

  /* ── Footer ── */
  .footer { flex-shrink: 0; padding: 10px 16px; border-top: 1px solid #F3F4F6; display: flex; gap: 8px; }
  .footer-btn {
    flex: 1; height: 44px; border: 1px solid #D1D5DB; border-radius: 8px;
    background: #fff; font-size: 13px; font-weight: 600; color: #111827;
    cursor: pointer; font-family: inherit;
  }

  /* ── App tab bar ── */
  .tab-bar { flex-shrink: 0; display: flex; border-top: 1px solid #E5E7EB; }
  .tab {
    flex: 1; height: 56px; display: flex; flex-direction: column;
    align-items: center; justify-content: center;
    gap: 3px; font-size: 11px; color: #9CA3AF; cursor: pointer;
  }
  .tab.active { color: #111827; font-weight: 600; }
  .tab-icon { width: 22px; height: 22px; background: #F3F4F6; border-radius: 4px; }
  .tab.active .tab-icon { background: #111827; }
</style>
</head>
<body>

<div class="switcher">
  <span class="switcher-label">home.html · v2 · low fidelity</span>
  <div class="switcher-row">
    <button class="state-btn active" onclick="show('s1',this)">1. Next Up</button>
    <button class="state-btn" onclick="show('s2',this)">2. Running Late (sheet)</button>
    <button class="state-btn" onclick="show('s3',this)">3. Customer Notified</button>
    <button class="state-btn" onclick="show('s4',this)">4. I'm Here</button>
    <button class="state-btn" onclick="show('s5',this)">5. Mark Done</button>
    <button class="state-btn" onclick="show('s6',this)">6. Mark Done (deposit)</button>
    <button class="state-btn" onclick="show('s7',this)">7. Today Strip</button>
    <button class="state-btn" onclick="show('s8',this)">8. No-Show Link</button>
    <button class="state-btn" onclick="show('s9',this)">9. No Jobs Today</button>
    <button class="state-btn" onclick="show('s10',this)">10. All Clear</button>
    <button class="state-btn" onclick="show('s11',this)">11. Multi-Day</button>
    <button class="state-btn" onclick="show('s12',this)">12. Tasks Tab</button>
  </div>
</div>

<!-- S1 · Next Up -->
<div class="phone active" id="s1">
  <div class="hdr">
    <div><div class="hdr-name">Morning, Dave</div><div class="hdr-sub">Wed · 3 jobs today</div></div>
    <div class="hdr-right"><div class="hdr-amount">£3,040</div><div class="hdr-label">owed to you</div></div>
  </div>
  <div class="home-tabs">
    <div class="home-tab active">Today</div>
    <div class="home-tab">Tasks <span class="htab-badge">2</span></div>
  </div>
  <div class="body">
    <div class="l1">
      <div class="l1-eyebrow">Next up</div>
      <div class="l1-title">Richards · New boiler</div>
      <div class="l1-meta">10am · 14 Birch Lane</div>
      <div class="l1-divider"></div>
      <div class="btn-row">
        <button class="btn primary">Running late</button>
        <button class="btn">I'm here</button>
      </div>
    </div>
  </div>
  <div class="footer">
    <button class="footer-btn">+ New Quote</button>
    <button class="footer-btn">Log Missed Call</button>
  </div>
  <div class="tab-bar">
    <div class="tab active"><div class="tab-icon"></div>Home</div>
    <div class="tab"><div class="tab-icon"></div>Jobs</div>
    <div class="tab"><div class="tab-icon"></div>Activity</div>
    <div class="tab"><div class="tab-icon"></div>Settings</div>
  </div>
</div>

<!-- S2 · Running Late sheet -->
<div class="phone" id="s2">
  <div class="hdr">
    <div><div class="hdr-name">Morning, Dave</div><div class="hdr-sub">Wed · 3 jobs today</div></div>
    <div class="hdr-right"><div class="hdr-amount">£3,040</div><div class="hdr-label">owed to you</div></div>
  </div>
  <div class="home-tabs">
    <div class="home-tab active">Today</div>
    <div class="home-tab">Tasks <span class="htab-badge">2</span></div>
  </div>
  <div class="body">
    <div class="l1">
      <div class="l1-eyebrow">Next up</div>
      <div class="l1-title">Richards · New boiler</div>
      <div class="l1-meta">10am · 14 Birch Lane</div>
      <div class="l1-divider"></div>
      <div class="btn-row">
        <button class="btn primary">Running late</button>
        <button class="btn">I'm here</button>
      </div>
    </div>
  </div>
  <div class="footer">
    <button class="footer-btn">+ New Quote</button>
    <button class="footer-btn">Log Missed Call</button>
  </div>
  <div class="tab-bar">
    <div class="tab active"><div class="tab-icon"></div>Home</div>
    <div class="tab"><div class="tab-icon"></div>Jobs</div>
    <div class="tab"><div class="tab-icon"></div>Activity</div>
    <div class="tab"><div class="tab-icon"></div>Settings</div>
  </div>
  <div class="sheet-overlay"></div>
  <div class="sheet">
    <div class="sheet-handle"></div>
    <div class="sheet-title">Running late to Richards?</div>
    <div class="msg-preview" style="margin: 8px 16px 0;">"Hi, running about 20–30 mins late. On my way to you now."</div>
    <div class="sheet-opt" style="margin-top: 8px;">Send via WhatsApp</div>
    <div class="sheet-opt">Send via SMS</div>
    <div class="sheet-opt muted">Cancel</div>
  </div>
</div>

<!-- S3 · Customer Notified -->
<div class="phone" id="s3">
  <div class="hdr">
    <div><div class="hdr-name">Morning, Dave</div><div class="hdr-sub">Wed · 3 jobs today</div></div>
    <div class="hdr-right"><div class="hdr-amount">£3,040</div><div class="hdr-label">owed to you</div></div>
  </div>
  <div class="home-tabs">
    <div class="home-tab active">Today</div>
    <div class="home-tab">Tasks <span class="htab-badge">2</span></div>
  </div>
  <div class="body">
    <div class="l1">
      <div class="l1-eyebrow">Next up</div>
      <div class="l1-title">Richards · New boiler</div>
      <div class="l1-meta">10am · 14 Birch Lane</div>
      <div class="l1-divider"></div>
      <div class="btn-row">
        <button class="btn primary">Running late</button>
        <button class="btn">I'm here</button>
      </div>
      <div class="l1-notified">✓ Customer notified · 9:14am</div>
    </div>
  </div>
  <div class="footer">
    <button class="footer-btn">+ New Quote</button>
    <button class="footer-btn">Log Missed Call</button>
  </div>
  <div class="tab-bar">
    <div class="tab active"><div class="tab-icon"></div>Home</div>
    <div class="tab"><div class="tab-icon"></div>Jobs</div>
    <div class="tab"><div class="tab-icon"></div>Activity</div>
    <div class="tab"><div class="tab-icon"></div>Settings</div>
  </div>
</div>

<!-- S4 · I'm Here -->
<div class="phone" id="s4">
  <div class="hdr">
    <div><div class="hdr-name">Morning, Dave</div><div class="hdr-sub">Wed · 3 jobs today</div></div>
    <div class="hdr-right"><div class="hdr-amount">£3,040</div><div class="hdr-label">owed to you</div></div>
  </div>
  <div class="home-tabs">
    <div class="home-tab active">Today</div>
    <div class="home-tab">Tasks <span class="htab-badge">2</span></div>
  </div>
  <div class="body">
    <div class="active-bar">
      <div class="active-dot"></div>
      <div class="active-name">Richards · New boiler</div>
      <div class="active-meta">2h in</div>
      <button class="btn-done" onclick="event.stopPropagation()">Done</button>
    </div>
    <div class="l1">
      <div class="l1-eyebrow">Next up</div>
      <div class="l1-title">Shah · Kitchen fit-out</div>
      <div class="l1-meta">2pm · 8 Oak Street</div>
      <div class="l1-divider"></div>
      <div class="btn-row">
        <button class="btn primary">Running late</button>
        <button class="btn">I'm here</button>
      </div>
    </div>
    <div class="today-strip">
      <span class="today-next">4pm · 8 Oak Street · Rewire</span>
      <span class="today-more">+1 more ›</span>
    </div>
  </div>
  <div class="footer">
    <button class="footer-btn">+ New Quote</button>
    <button class="footer-btn">Log Missed Call</button>
  </div>
  <div class="tab-bar">
    <div class="tab active"><div class="tab-icon"></div>Home</div>
    <div class="tab"><div class="tab-icon"></div>Jobs</div>
    <div class="tab"><div class="tab-icon"></div>Activity</div>
    <div class="tab"><div class="tab-icon"></div>Settings</div>
  </div>
</div>

<!-- S5 · Mark Done (no deposit) -->
<div class="phone" id="s5">
  <div class="hdr">
    <div><div class="hdr-name">Morning, Dave</div><div class="hdr-sub">Wed · 3 jobs today</div></div>
    <div class="hdr-right"><div class="hdr-amount">£3,040</div><div class="hdr-label">owed to you</div></div>
  </div>
  <div class="home-tabs">
    <div class="home-tab active">Today</div>
    <div class="home-tab">Tasks <span class="htab-badge">2</span></div>
  </div>
  <div class="body">
    <div class="active-bar">
      <div class="active-dot"></div>
      <div class="active-name">Richards · New boiler</div>
      <div class="active-meta">2h in</div>
      <button class="btn-done" onclick="event.stopPropagation()">Done</button>
    </div>
    <div class="l1">
      <div class="l1-eyebrow">Next up</div>
      <div class="l1-title">Shah · Kitchen fit-out</div>
      <div class="l1-meta">2pm · 8 Oak Street</div>
    </div>
  </div>
  <div class="footer">
    <button class="footer-btn">+ New Quote</button>
    <button class="footer-btn">Log Missed Call</button>
  </div>
  <div class="tab-bar">
    <div class="tab active"><div class="tab-icon"></div>Home</div>
    <div class="tab"><div class="tab-icon"></div>Jobs</div>
    <div class="tab"><div class="tab-icon"></div>Activity</div>
    <div class="tab"><div class="tab-icon"></div>Settings</div>
  </div>
  <div class="sheet-overlay"></div>
  <div class="sheet">
    <div class="sheet-handle"></div>
    <div class="sheet-title">How were you paid?</div>
    <div class="sheet-sub">Richards · New boiler · £1,200</div>
    <div class="sheet-opt">Cash</div>
    <div class="sheet-opt">Terminal</div>
    <div class="sheet-opt">Bank Transfer</div>
    <div class="sheet-opt muted">Not yet — chase later</div>
    <div class="sheet-note">→ Chase payment added to tasks</div>
  </div>
</div>

<!-- S6 · Mark Done (deposit) -->
<div class="phone" id="s6">
  <div class="hdr">
    <div><div class="hdr-name">Morning, Dave</div><div class="hdr-sub">Wed · 3 jobs today</div></div>
    <div class="hdr-right"><div class="hdr-amount">£3,040</div><div class="hdr-label">owed to you</div></div>
  </div>
  <div class="home-tabs">
    <div class="home-tab active">Today</div>
    <div class="home-tab">Tasks <span class="htab-badge">2</span></div>
  </div>
  <div class="body">
    <div class="active-bar">
      <div class="active-dot"></div>
      <div class="active-name">Shah · Kitchen fit-out</div>
      <div class="active-meta">3h in</div>
      <button class="btn-done" onclick="event.stopPropagation()">Done</button>
    </div>
  </div>
  <div class="footer">
    <button class="footer-btn">+ New Quote</button>
    <button class="footer-btn">Log Missed Call</button>
  </div>
  <div class="tab-bar">
    <div class="tab active"><div class="tab-icon"></div>Home</div>
    <div class="tab"><div class="tab-icon"></div>Jobs</div>
    <div class="tab"><div class="tab-icon"></div>Activity</div>
    <div class="tab"><div class="tab-icon"></div>Settings</div>
  </div>
  <div class="sheet-overlay"></div>
  <div class="sheet">
    <div class="sheet-handle"></div>
    <div class="sheet-title">Balance to collect: £800</div>
    <div class="sheet-sub">Shah · Kitchen fit-out · £400 deposit taken</div>
    <div class="sheet-opt">Terminal</div>
    <div class="sheet-opt">Cash</div>
    <div class="sheet-opt muted">Not yet — chase later</div>
    <div class="sheet-note">→ Chase payment added to tasks</div>
  </div>
</div>

<!-- S7–S11 omitted for brevity — focus on the fixes above -->

<!-- S12 · Tasks Tab — THIS IS THE KEY MISSING STATE -->
<div class="phone" id="s12">
  <div class="hdr">
    <div><div class="hdr-name">Morning, Dave</div><div class="hdr-sub">Wed · 3 jobs today</div></div>
    <div class="hdr-right"><div class="hdr-amount">£3,040</div><div class="hdr-label">owed to you</div></div>
  </div>
  <div class="home-tabs">
    <div class="home-tab">Today</div>
    <div class="home-tab active">Tasks</div>
  </div>
  <div class="body">
    <div class="section-hdr"><span class="section-label">Can't ignore</span></div>
    <div class="l2-group">
      <div class="l2-row"><span class="l2-tag">Disputed</span><span class="l2-name">Clarke · Bathroom reno</span><span class="l2-amount">£400</span><span class="chevron">›</span></div>
      <div class="l2-row"><span class="l2-tag">No-show</span><span class="l2-name">Thompson · Consumer unit</span><span class="l2-amount">9am</span><span class="chevron">›</span></div>
    </div>
    <div class="section-hdr"><span class="section-label">When you get a minute</span><span class="section-link">See all</span></div>
    <div class="l3-group">
      <div class="l3-row"><span class="l3-tag">Chase · 3d</span><span class="l3-name">Patel · Boiler service</span><span class="l3-amount">£160</span><span class="chevron">›</span></div>
      <div class="l3-row"><span class="l3-tag">Follow up</span><span class="l3-name">Anderson · Roof tiles</span><span class="l3-amount">£1,200</span><span class="chevron">›</span></div>
      <div class="l3-row"><span class="l3-tag">Stale · 8d</span><span class="l3-name">8 Oak Street · Rewire</span><span class="l3-amount">£1,400</span><span class="chevron">›</span></div>
      <div class="l3-row"><span class="l3-tag">Chase</span><span class="l3-name">Richards · New boiler</span><span class="l3-amount">£1,200</span><span class="chevron">›</span></div>
    </div>
  </div>
  <div class="footer">
    <button class="footer-btn">+ New Quote</button>
    <button class="footer-btn">Log Missed Call</button>
  </div>
  <div class="tab-bar">
    <div class="tab active"><div class="tab-icon"></div>Home</div>
    <div class="tab"><div class="tab-icon"></div>Jobs</div>
    <div class="tab"><div class="tab-icon"></div>Activity</div>
    <div class="tab"><div class="tab-icon"></div>Settings</div>
  </div>
</div>

<script>
function show(id, btn) {
  document.querySelectorAll('.phone').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.state-btn').forEach(b => b.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  btn.classList.add('active');
}
</script>
</body>
</html>
```

---

## Acceptance criteria

- [ ] Header shows "Morning/Afternoon/Evening, {firstName}" on left
- [ ] Header shows day + today's job count sub-line
- [ ] Header shows total owed amount (£X,XXX) on right
- [ ] Footer has two equal-width buttons: "+ New Quote" and "Log Missed Call" — no FAB
- [ ] Tasks tab shows L2 "CAN'T IGNORE" section with correct rows from Dexie
- [ ] Tasks tab shows L3 "WHEN YOU GET A MINUTE" section with correct rows
- [ ] Tasks tab shows empty state when no tasks
- [ ] Tasks badge = L2 item count, shown as red pill on Tasks tab
- [ ] Mark Done deposit sheet shows: Terminal / Cash / Not yet (no Bank Transfer)
- [ ] Mark Done standard sheet shows: Cash / Terminal / Bank Transfer / Not yet
- [ ] Tapping any task row navigates to that job's detail screen

## DO NOT
- Do not add any new features
- Do not change the Today tab (it's correct)
- Do not change routing, Dexie schema, or sync logic
- Do not rename any files
