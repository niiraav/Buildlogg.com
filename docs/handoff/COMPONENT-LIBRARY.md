# TradePad — Component Library Specification
## Version 1.0 — All Reusable Components

> **How to use this document**
> Each component listed here has a specific API (props), visual spec, and behaviour. Build each component exactly as specified. Do not add props that don't exist here. Do not combine components. Do not deviate from the wireframe token values in DESIGN-TOKENS.md.
>
> All components live in `src/components/`. File structure: `src/components/ComponentName/index.tsx`.

---

## Component Index

1. Button
2. BottomSheet
3. StatusBadge
4. FlagBadge
5. JobCard (Next Up L1 card)
6. ActiveBar
7. TodayStrip
8. InvoiceItemRow
9. AmountCard
10. QuotePreviewCard
11. MapPreview
12. SegmentedControl
13. InlineEditRow
14. ProgressDots
15. TabBar
16. HomeTabSwitcher
17. StickyFooter
18. TaskCard

---

## 1. Button

**File:** `src/components/Button/index.tsx`

### Props
```typescript
interface ButtonProps {
  variant: 'primary' | 'secondary' | 'destructive' | 'ghost';
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  fullWidth?: boolean;   // default true
  type?: 'button' | 'submit';  // default 'button'
}
```

### Visual spec

| Variant | Height | Background | Text colour | Border |
|---|---|---|---|---|
| primary | 52px | `#111827` | `#fff` | none |
| secondary | 46px | `#F9FAFB` | `#111827` | `1px solid #D1D5DB` |
| destructive | 46px | `#FEF2F2` | `#DC2626` | `1px solid #FECACA` |
| ghost | auto (min 44px) | transparent | `#6B7280` | none; underlined text |

All variants:
- `border-radius: 12px` (ghost: none)
- `font-size: 16px` (primary) / `14px` (secondary/destructive) / `13px` (ghost)
- `font-weight: 700` (primary) / `600` (secondary/destructive) / `500` (ghost)
- `width: 100%` when `fullWidth` true
- `cursor: pointer`
- `opacity: 0.5` when `disabled` true
- Ghost: `text-decoration: underline; text-underline-offset: 2px`

### Behaviour
- Disabled: pointer-events: none, opacity 0.5
- No loading state for MVP

---

## 2. BottomSheet

**File:** `src/components/BottomSheet/index.tsx`

### Props
```typescript
interface BottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
}
```

### Structure
```
[overlay — rgba(0,0,0,0.25) — covers #app-shell only — tapping closes sheet]
  [panel — white, border-radius 16px 16px 0 0, pinned to bottom of shell]
    [handle — 36px wide, 4px tall, #E5E7EB, centered, margin 12px auto 20px]
    [title — 18px, 700, #111827] (if provided)
    [subtitle — 13px, #6B7280, margin-top 4px] (if provided)
    [children]
```

### Behaviour
- Animated: slides up from bottom on `isOpen: true`, slides down on `false`
- Animation: `transition: transform 300ms ease` (translateY 100% → 0)
- Overlay tap calls `onClose`
- Keyboard: close on Escape

### CRITICAL — Scoped positioning (not viewport-fixed)
**Do NOT use `ReactDOM.createPortal` to `document.body`.** The sheet must render inside `#app-shell` so it is contained within the 430px shell on desktop.

```css
/* Overlay — covers shell, not viewport */
.sheet-overlay {
  position: absolute;   /* NOT fixed */
  inset: 0;
  background: rgba(0,0,0,0.25);
  z-index: 50;
}

/* Panel — pinned to bottom of shell */
.sheet-panel {
  position: absolute;   /* NOT fixed */
  bottom: 0;
  left: 0;
  right: 0;
  background: #fff;
  border-radius: 16px 16px 0 0;
  z-index: 51;
}
```

`#app-shell` must have `position: relative; overflow: hidden` for this to work correctly.

### Sheet row pattern (used inside sheets)
Standard option row inside a bottom sheet:
```typescript
interface SheetRowProps {
  icon?: React.ReactNode;   // Lucide icon
  label: string;
  sublabel?: string;
  onTap: () => void;
  variant?: 'default' | 'destructive'; // default: default
}
```
```
height: 56px
display: flex, align-items: center, gap: 14px
padding: 0 0 (sheet handles horizontal padding)
border-bottom: 1px solid #F3F4F6 (no bottom border on last row)
label: 15px, 500, #111827
sublabel: 12px, #9CA3AF
icon: 20×20, #374151 (or #DC2626 for destructive)
```

---

## 3. StatusBadge

**File:** `src/components/StatusBadge/index.tsx`

### Props
```typescript
interface StatusBadgeProps {
  status: JobStatus;  // see DATA-MODEL.md type JobStatus
  size?: 'sm' | 'md'; // default 'md'
}
```

### Visual spec
```
display: inline-flex
align-items: center
gap: 6px
padding: 4px 10px
border-radius: 9999px
font-size: 12px (md) / 10px (sm)
font-weight: 600
text-transform: capitalize
```

Dot: `8px × 8px`, `border-radius: 50%`

Colour table: see DESIGN-TOKENS.md §7 "Status badge colours"

### Label map
| Status code | Display label |
|---|---|
| `enquiry` | Enquiry |
| `quoted` | Quoted |
| `booked` | Booked |
| `in_progress` | In Progress |
| `awaiting_payment` | Awaiting Payment |
| `paid` | Paid |
| `no_show` | No-Show |
| `cancelled` | Cancelled |
| `written_off` | Written Off |

---

## 4. FlagBadge

**File:** `src/components/FlagBadge/index.tsx`

### Props
```typescript
type FlagType = 'urgent_new' | 'chase' | 'overdue' | 'stale' | 'no_show';

interface FlagBadgeProps {
  type: FlagType;
  days?: number;   // for chase, overdue, stale — shows "Chase · 3d", "Overdue · 32d"
}
```

### Display labels
| Type | Label format |
|---|---|
| `urgent_new` | "Urgent · New" |
| `chase` | "Chase · {days}d" |
| `overdue` | "Overdue · {days}d" |
| `stale` | "Stale · {days}d" |
| `no_show` | "No-show" |

Colour table: see DESIGN-TOKENS.md §7 "Flag badge colours"

```
padding: 2px 8px
border-radius: 9999px
font-size: 11px
font-weight: 600
```

---

## 5. JobCard (Next Up L1 Card)

**File:** `src/components/JobCard/index.tsx`

The card shown in the Today tab as "Next Up" or for upcoming jobs.

### Props
```typescript
interface JobCardProps {
  job: Job;
  customer: Customer;
  lineItemsTotal: number;
  isNextUp?: boolean;         // shows "NEXT UP" eyebrow pill
  flag?: FlagType;
  flagDays?: number;
  onRunningLate?: () => void; // shows [Running late] CTA
  onImHere?: () => void;      // shows [I'm here] CTA
  onBodyTap?: () => void;     // navigate to Job Detail
}
```

### Structure
```
[card — white, border 1px #E5E7EB, border-radius 12px, padding 16px]
  [eyebrow row]
    "NEXT UP" pill (10px, 700, uppercase, background #111827, white text, border-radius 999px, padding 3px 10px)
    [flag badge if present]
  
  [customer row — margin-top 10px]
    customer.name — 18px, 800, #111827
    job.title — 13px, #6B7280, margin-top 2px
  
  [meta row — margin-top 10px]
    📍 (MapPin icon 14px #9CA3AF) address or "No address" — 13px #6B7280
    🕐 (Clock icon 14px #9CA3AF) scheduled_start formatted — 13px #6B7280
    (show only if scheduled_start set)
  
  [amount row — margin-top 10px]
    "£{lineItemsTotal}" — 15px, 700, #111827
    payment terms label — 13px, #9CA3AF
  
  [CTA row — margin-top 14px, flex, gap 8px]
    [Running late] — Button variant=secondary (left)
    [I'm here] — Button variant=primary (right)
```

### Tap behaviour
- Tapping card body → `onBodyTap()` (navigate to Job Detail)
- CTA buttons stop propagation

---

## 6. ActiveBar

**File:** `src/components/ActiveBar/index.tsx`

The compact 44px dark bar shown when a job is In Progress (replaces the full JobCard).

### Props
```typescript
interface ActiveBarProps {
  customer: Customer;
  job: Job;
  elapsedSeconds: number;   // live-updating elapsed time
  dayNumber?: number;        // if is_multi_day, shows "Day 2" instead of duration
  onTap?: () => void;        // navigate to Job Detail
}
```

### Structure
```
[bar — height 44px, background #111827, flex, align-items center, padding 0 16px, gap 10px]
  [pulse dot — 8px, border-radius 50%, background #4ADE80, animation pulse]
  [text block — flex 1]
    customer.name + " · " + job.title — 14px, 600, white
    (truncated with ellipsis if overflow)
  [time — 12px, 500, #9CA3AF]
    if is_multi_day: "Day {dayNumber}"
    else: formatted elapsed time "2h 14m"
  [chevron icon — ChevronRight 16px #6B7280]
```

### Behaviour
- Entire bar is tappable → `onTap()`
- `elapsedSeconds` updates every 60 seconds (not live per second — reduces re-renders)
- Pulse animation: `@keyframes pulse { 0%,100% { opacity:1 } 50% { opacity:0.4 } }` 1.5s infinite

---

## 7. TodayStrip

**File:** `src/components/TodayStrip/index.tsx`

The 36px strip showing remaining scheduled jobs after the active/next-up job.

### Props
```typescript
interface TodayStripProps {
  jobs: Array<{ time: string; customerName: string; jobTitle: string }>;
  onTap?: () => void;  // navigate to Jobs list filtered to today
}
```

### Display logic
- If 1 remaining job: "{time} · {customerName} · {jobTitle}"
- If 2+ remaining: "{time} · {customerName} · {jobTitle}  +{n-1} more ›"
- All text: 13px, `#374151`
- Time is formatted: "2pm", "10:30am" etc.

### Structure
```
[strip — height 36px, background #F9FAFB, border 1px solid #E5E7EB, border-radius 8px]
  [padding 0 12px, flex, align-items center, gap 6px]
  [Clock icon 13px #9CA3AF]
  [text] — truncate if overflow
  [ChevronRight 13px #9CA3AF] (if onTap provided)
```

---

## 8. InvoiceItemRow

**File:** `src/components/InvoiceItemRow/index.tsx`

A single line item in the invoice/quote. Appears in Job Detail and Quote Preview.

### Props
```typescript
interface InvoiceItemRowProps {
  item: LineItem;
  showRemove?: boolean;    // shows × button (Booked, In Progress states only)
  isAddedOnSite?: boolean; // green colour for charges added In Progress
  onRemove?: () => void;
}
```

### Structure
```
[row — flex, align-items center, gap 8px, padding 10px 0, border-bottom 1px #F3F4F6]
  [description — flex 1]
    text — 13px, 500
    colour: #15803D if isAddedOnSite, else #374151
  [amount — flex-shrink 0]
    "£{item.amount.toFixed(2)}" — 14px, 700
    colour: #15803D if isAddedOnSite, else #111827
  [× button — only if showRemove]
    28×28px, border 1px #E5E7EB, border-radius 50%, background #F9FAFB
    X icon 14px #9CA3AF
    onTap → onRemove()
```

### Total row
Always shown after all items:
```
[total row — flex, justify-content space-between, padding 14px 0, border-top 1.5px #111827]
  "Total" — 15px, 700, #111827
  "£{total}" — 24px, 800, #111827, letter-spacing -0.5px
```

---

## 9. AmountCard

**File:** `src/components/AmountCard/index.tsx`

The hero amount display used in Awaiting Payment state.

### Props
```typescript
interface AmountCardProps {
  amount: number;
  label?: string;           // default "Amount due"
  daysOverdue?: number;     // if set, shows overdue warning
  customerName: string;
}
```

### Structure
```
[card — background #F9FAFB, border 1px #E5E7EB, border-radius 12px, padding 20px]
  [label — 11px, 700, uppercase, #9CA3AF]
    "AMOUNT DUE" or custom label
  [amount — 32px, 800, #111827, letter-spacing -1px, margin-top 4px]
    "£{amount.toFixed(2)}"
  [sub — 13px, #6B7280, margin-top 6px]
    "for {customerName}"
  [overdue warning — if daysOverdue set]
    [amber pill — background #FEF3C7, border-radius 999px, padding 4px 10px]
      "Overdue · {daysOverdue} days" — 11px, 600, #92400E
```

---

## 10. QuotePreviewCard

**File:** `src/components/QuotePreviewCard/index.tsx`

The styled quote preview shown in QF-6 (Quote flow Preview screen) and quote-sent confirmation.

### Props
```typescript
interface QuotePreviewCardProps {
  businessName: string;
  customerName: string;
  quoteNumber: string;
  jobTitle: string;
  lineItems: LineItem[];
  paymentTerms: string;
  depositPct?: number;
  quoteValidDays: number;
  quoteSentDate?: Date;
}
```

### Structure
```
[card — border 1px #E5E7EB, border-radius 12px, overflow hidden]
  [header — background #111827, padding 16px]
    business name — 15px, 700, white
    customer name — 13px, #9CA3AF
    quote number — 12px, #6B7280
  [body — padding 16px]
    job title — 14px, 700, #111827
    [line items — InvoiceItemRow for each, showRemove=false]
    [total row]
    [if deposit_pct set]
      "Deposit due now: £{depositAmount}"
      "Balance on completion: £{balance}"
    [payment terms row]
      "Payment: {payment_terms_label}"
    [validity row]
      "Quote valid for {quote_valid_days} days"
```

---

## 11. MapPreview

**File:** `src/components/MapPreview/index.tsx`

Static map thumbnail for the Booked state in Job Detail. Tappable to open maps app.

### Props
```typescript
interface MapPreviewProps {
  address: string;   // plain text address
  onTap?: () => void;
}
```

### Behaviour
- Display: `height: 120px`, `border-radius: 10px`, `overflow: hidden`
- MVP: Use a static Google Maps embed or a placeholder image with the address overlaid
- On tap: open `https://maps.google.com/?q={encodeURIComponent(address)}` in new tab / native maps
- If address is empty or undefined: do not render this component

### Note for developer
For MVP, a static grey rectangle with a 📍 icon and the address text is acceptable. Full map tile integration is Phase 2.

---

## 12. SegmentedControl

**File:** `src/components/SegmentedControl/index.tsx`

### Props
```typescript
interface SegmentedControlProps {
  options: Array<{ value: string; label: string }>;
  value: string;
  onChange: (value: string) => void;
  size?: 'sm' | 'md';   // both sizes: min-height 44px (touch compliance). sm: 12px font, md: 13px font (default md)
}
```

### Structure
```
[container — background #F3F4F6, border-radius 8px, padding 3px, display flex]
  [for each option]
    [option — flex 1, min-height 44px, display flex, align-items center, justify-content center]
      font-size: 12px (sm) / 13px (md)
      font-weight: 500 (inactive) / 700 (active)
      color: #6B7280 (inactive) / #111827 (active)
      border-radius: 6px
      [if active] background #fff, box-shadow: 0 1px 3px rgba(0,0,0,.1)
```

---

## 13. InlineEditRow

**File:** `src/components/InlineEditRow/index.tsx`

Used in Settings screen. Tapping the value makes it editable in-place.

### Props
```typescript
interface InlineEditRowProps {
  label: string;
  value: string;
  onSave: (newValue: string) => void;
  inputType?: 'text' | 'tel' | 'number';  // default 'text'
  inputMode?: 'text' | 'numeric' | 'decimal' | 'tel';
  placeholder?: string;
  isEditing?: boolean;
  onEditStart?: () => void;
  onEditEnd?: () => void;
}
```

### Structure (view state)
```
[row — min-height 52px, flex, align-items center, justify-content space-between]
  [left]
    label — 14px, 500, #374151
  [right — flex, align-items center, gap 8px]
    value — 14px, 500, #111827
    [Pencil icon — 14px, #9CA3AF] (only on hover/focus for accessibility)
  [bottom border — 1px #F3F4F6]
```

### Structure (edit state — after tap)
```
[row — same layout]
  [left]
    label — same
  [right]
    <input> — font-size 16px (prevents iOS auto-zoom), no border, text-align right, min-width 120px, min-height 48px
    [Done button — 13px, 600, #111827, underlined]
```

### Behaviour
- Tap row → `onEditStart()`, focus input
- Blur or tap [Done] → `onSave(inputValue)`, `onEditEnd()`
- Auto-save on blur (no explicit save button — [Done] is just a focused tap target)
- Show [Done] button while input is focused

---

## 14. ProgressDots

**File:** `src/components/ProgressDots/index.tsx`

Onboarding step indicator.

### Props
```typescript
interface ProgressDotsProps {
  total: number;       // e.g. 4
  current: number;     // 1-indexed; e.g. 2 means step 2 of 4
}
```

### Structure
```
[container — display flex, gap 6px, padding 20px 24px 0]
  [for each step 1..total]
    [dot — height 4px, flex 1, border-radius 2px]
      background #111827 if step <= current
      background #E5E7EB if step > current
```

---

## 15. TabBar

**File:** `src/components/TabBar/index.tsx`

Bottom navigation bar. Only shown on top-level screens (Home, Jobs, Settings). Hidden on all detail/flow screens.

### Props
```typescript
interface TabBarProps {
  activeTab: 'home' | 'jobs' | 'settings';
  onNavigate: (tab: 'home' | 'jobs' | 'settings') => void;
}
```

### Structure
```
[bar — height 56px + safe-area-inset-bottom, background #fff, border-top 1px #E5E7EB]
  [inner — height 56px, display flex]
    [Home tab — flex 1, min-height 44px]
      Home icon (Lucide Home 22px)
      "Home" 10px, 500
      colour: #111827 (active) / #9CA3AF (inactive)
    [Jobs tab — flex 1, min-height 44px]
      Briefcase icon (22px)
      "Jobs" 10px, 500
    [Settings tab — flex 1, min-height 44px]
      Settings icon (22px)
      "Settings" 10px, 500
```

### Note on Activity tab
Activity tab is OUT OF SCOPE for MVP. Only 3 tabs.

---

## 16. HomeTabSwitcher

**File:** `src/components/HomeTabSwitcher/index.tsx`

The Today / Tasks tab switcher at the top of the Home screen. Different from TabBar.

### Props
```typescript
interface HomeTabSwitcherProps {
  activeTab: 'today' | 'tasks';
  tasksBadgeCount?: number;   // red badge on Tasks tab
  onChange: (tab: 'today' | 'tasks') => void;
}
```

### Structure
```
[container — background #F3F4F6, border-radius 10px, padding 3px, margin 12px 16px 0, display flex]
  [Today tab — flex 1, min-height 44px, display flex, align-items center, justify-content center]
    "Today" — 13px, 600
    active: background #fff, box-shadow inset 0 1px 3px rgba(0,0,0,.12), color #111827
    inactive: color #6B7280
  [Tasks tab — flex 1, same structure]
    "Tasks" + [badge if tasksBadgeCount > 0]
    [badge — 16px wide min, height 16px, background #DC2626, color #fff, border-radius 8px, font-size 10px, font-weight 700]
```

---

## 17. StickyFooter

**File:** `src/components/StickyFooter/index.tsx`

Wrapper for CTAs on detail screens. Pins to bottom, floats above scroll content.

### Props
```typescript
interface StickyFooterProps {
  children: React.ReactNode;  // Button components or raw elements
}
```

### Structure
```
[footer — position sticky, bottom 0]
  [inner — padding 12px 16px calc(32px + env(safe-area-inset-bottom))]
    border-top: 1px solid #F3F4F6
    box-shadow: 0 -4px 12px rgba(0,0,0,.06)
    background: #fff
    display: flex, flex-direction: column, gap: 8px
    children
```

---

## 18. TaskCard

**File:** `src/components/TaskCard/index.tsx`

Cards shown in the Tasks tab (L2 and L3 items).

### Props
```typescript
type TaskType = 'overdue' | 'chase' | 'missed_call' | 'no_show' | 'stale_quote' | 'urgent_new';

interface TaskCardProps {
  type: TaskType;
  job?: Job;
  customer?: Customer;
  flag?: FlagType;
  flagDays?: number;
  // For missed_call type only
  callerPhone?: string;
  callerName?: string;
  callTime?: string;
  // Actions
  primaryAction?: { label: string; onClick: () => void };
  secondaryAction?: { label: string; onClick: () => void };
  tertiaryAction?: { label: string; onClick: () => void };
  onDismiss?: () => void;
}
```

### Structure
```
[card — background #fff, border 1px #E5E7EB, border-radius 12px, padding 14px 16px]
  [top row — flex, justify-content space-between, align-items flex-start]
    [left]
      [FlagBadge]
      context text — 14px, 600, #111827, margin-top 6px
        e.g. "Richard · New boiler" or "07700 900123"
      sub text — 12px, #9CA3AF
        e.g. "Invoice sent 3 days ago" or "Missed call · 47 min ago"
    [dismiss × — 28×28px, no border, background transparent, X icon 16px #9CA3AF]
  [action row — margin-top 12px, flex, gap 8px, flex-wrap wrap]
    [each action — Button variant=secondary, auto width (not full-width)]
```

---

## Component Usage Notes

### What components are NOT built for MVP
- Tooltip
- Toast / Snackbar (use browser alert for now — Phase 2 refine)
- Skeleton loaders (show empty state instead)
- Photo attachment picker
- Date/time picker (use native `<input type="datetime-local">`)
- Dropdown menus
- Accordion
- Data charts / graphs

### Icon mapping (wireframe emoji → Lucide React)
```
📞 → Phone
💬 → MessageCircle
📍 → MapPin
🕐 → Clock
✕ / × → X
‹ → ChevronLeft
› / ❯ → ChevronRight
💵 → Banknote
🏦 → Building2
✏️ → Pencil
💾 → Save
📋 → Clipboard
📱 → Phone
✓ → Check
⚠️ → AlertTriangle
+ → Plus
```

### How to use icons
```tsx
import { Phone, MessageCircle, MapPin } from 'lucide-react';

// Usage
<Phone size={20} color="#374151" />
<MessageCircle size={20} className="text-brand-mid" />
```

---

*End of COMPONENT-LIBRARY.md — Version 1.0*
