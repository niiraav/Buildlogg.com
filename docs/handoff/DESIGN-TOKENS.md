# TradePad — Design Tokens
## Version 1.1 — Cal-aligned, mobile-first

> **How to use this document**
> Colour palette and border radius scale are aligned with the Cal design system (`DESIGN.md`). Typography uses **Inter** (not Cal Sans — that font is licensed to Cal.com). All mobile-specific sizes (touch targets, input heights, component heights) override Cal's desktop-first defaults and are non-negotiable. Add these to `tailwind.config.js` and `src/styles/tokens.css`.
>
> Reference file: `DESIGN.md` in the project root (Cal design system, installed via `npx getdesign@latest add cal`). Use DESIGN.md for colour names and surface hierarchy. Use THIS file for all sizing, spacing, and component measurements — Cal's values are desktop-only and must not be used for touch targets or input heights.

---

## 1. Colour Palette

### Neutral Scale (Primary Brand Palette)
Aligned with Cal `{colors.ink}` / `{colors.canvas}` system. Near-black on white — clean, professional tool aesthetic.

| Token | Hex | Cal equivalent | Usage |
|---|---|---|---|
| `color-black` | `#111827` | `{colors.primary}` / `{colors.ink}` | Primary text, buttons, borders-active, headings |
| `color-dark` | `#374151` | `{colors.body}` | Body text, secondary content |
| `color-mid` | `#6B7280` | `{colors.muted}` | Muted text, icons, secondary labels |
| `color-muted` | `#898989` | `{colors.muted-soft}` | Placeholder text, hints, disabled |
| `color-border` | `#E5E7EB` | `{colors.hairline}` | Default borders, dividers |
| `color-border-light` | `#F3F4F6` | `{colors.hairline-soft}` | Subtle dividers, section separators |
| `color-surface` | `#F8F9FA` | `{colors.surface-soft}` | Card backgrounds, secondary surfaces |
| `color-surface-card` | `#F5F5F5` | `{colors.surface-card}` | Alternate card surface |
| `color-white` | `#FFFFFF` | `{colors.canvas}` | App background, modal backgrounds |
| `color-dark-bg` | `#101010` | `{colors.surface-dark}` | Desktop shell background, DesktopNudge banner |

### Status Colours
Aligned with Cal's semantic set (`{colors.success}`, `{colors.warning}`, `{colors.error}`), extended with TradePad-specific flag variants.

| Token | Hex | Cal equivalent | Usage |
|---|---|---|---|
| `color-success` | `#10B981` | `{colors.success}` | Success states, confirmation |
| `color-green-dark` | `#15803D` | — | Charge items in work log, added charges (In Progress) |
| `color-green-bg` | `#F0FDF4` | — | Done screen icon bg, success tint |
| `color-green-mid` | `#16A34A` | — | Paid status badge dot |
| `color-warning` | `#F59E0B` | `{colors.warning}` | Warning states |
| `color-amber` | `#B45309` | — | Chase flag text |
| `color-amber-bg` | `#FFFBEB` | — | Chase flag background |
| `color-amber-dark` | `#92400E` | — | No-show flag text |
| `color-amber-mid` | `#FEF3C7` | — | No-show flag background |
| `color-error` | `#EF4444` | `{colors.error}` | Validation errors |
| `color-red` | `#DC2626` | — | Overdue flag text, Tasks tab badge |
| `color-red-bg` | `#FEF2F2` | — | Overdue flag background |
| `color-blue` | `#1D4ED8` | — | Urgent·New flag text |
| `color-blue-bg` | `#EFF6FF` | — | Urgent·New flag background |

### Status Dot Colours (Jobs list)

| Status | Dot colour | Hex |
|---|---|---|
| In Progress | Green | `#15803D` |
| Booked | Blue | `#3B82F6` |
| Quoted | Purple | `#8B5CF6` |
| Awaiting Payment | Amber | `#F59E0B` |
| No-Show | Orange | `#F97316` |
| Paid | Green (muted) | `#6EE7B7` |
| Cancelled | Grey | `#9CA3AF` |
| Written Off | Grey (dark) | `#6B7280` |
| Enquiry | Blue (light) | `#93C5FD` |

---

## 2. Typography Scale

**Font: Inter** — consistent cross-platform rendering, matches Cal design system's UI font. Load via `@fontsource/inter` (npm package, no Google Fonts network call, GDPR-safe).

```css
font-family: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
```

Add to `package.json`: `"@fontsource/inter": "^5.0.0"`
Import in `src/main.tsx`: `import '@fontsource/inter/400.css'; import '@fontsource/inter/500.css'; import '@fontsource/inter/600.css'; import '@fontsource/inter/700.css'; import '@fontsource/inter/800.css';`

**DO NOT use Cal Sans** — it is licensed exclusively to Cal.com and is not available as a public web font.
**DO NOT use Google Fonts** — privacy/GDPR concern for UK users; use `@fontsource` package instead.

### Text sizes

| Token | Size | Weight | Line-height | Usage |
|---|---|---|---|---|
| `text-hero` | `28px` | 800 | 1.15 | Amount card hero value, screen headings |
| `text-xl` | `26px` | 800 | 1.2 | Onboarding screen titles, Done screen title |
| `text-lg` | `22px` | 800 | 1.2 | Job detail customer name (L1 header) |
| `text-title` | `20px` | 700 | 1.3 | Section titles, bottom sheet titles |
| `text-base` | `16px` | 500 | 1.5 | Primary body, form inputs (MUST be 16px to prevent iOS auto-zoom) |
| `text-md` | `15px` | 400 | 1.5 | Secondary body, list row primary text |
| `text-sm` | `14px` | 500 | 1.4 | Sub-labels, secondary actions, step back labels |
| `text-xs` | `13px` | 400 | 1.4 | Quote item description, notes, helper text |
| `text-xxs` | `12px` | 500 | 1.3 | Meta info, time stamps, phone numbers in strips |
| `text-label` | `11px` | 700 | 1 | Form field labels, section labels (always uppercase + tracked) |
| `text-micro` | `10px` | 700 | 1 | Eyebrow labels (e.g. "NEXT UP", "TODAY") — uppercase + tracked |

### Label convention
All field labels and section headings:
```css
font-size: 10–11px;
font-weight: 700;
text-transform: uppercase;
letter-spacing: 0.5–0.7px;
color: #9CA3AF;
```

---

## 3. Spacing Scale

TradePad uses an 8px base unit. All spacing is multiples of 4px.

| Token | Value | Usage |
|---|---|---|
| `space-1` | `4px` | Tight gaps, icon-to-text |
| `space-2` | `8px` | Component internal padding, chip gaps |
| `space-3` | `12px` | Card internal padding (compact), badge gaps |
| `space-4` | `16px` | Standard card padding, section horizontal gutter |
| `space-5` | `20px` | Section vertical spacing |
| `space-6` | `24px` | Screen horizontal gutter (onboarding) |
| `space-7` | `28px` | Large section margins |
| `space-8` | `32px` | Screen bottom padding (above tab bar) |

### Layout
- **Screen horizontal gutter**: 16px (detail screens) / 24px (onboarding)
- **Card padding**: 16px
- **Bottom sheet padding**: 24px horizontal / 20px vertical
- **Tab bar height**: 56px (safe area add-on via `env(safe-area-inset-bottom)`)
- **Sticky footer padding**: 12px top, 32px bottom (or `safe-area-inset-bottom + 12px`)

---

## 4. Border Radii

Matches Cal's rounded scale exactly (`DESIGN.md` `rounded:` section).

| Token | Value | Cal token | Usage |
|---|---|---|---|
| `radius-xs` | `4px` | `{rounded.xs}` | Tiny chips, progress dots |
| `radius-sm` | `6px` | `{rounded.sm}` | State buttons, filter chips |
| `radius-md` | `8px` | `{rounded.md}` | Line item rows, segmented control, inputs |
| `radius-lg` | `12px` | `{rounded.lg}` | Primary cards, buttons, field inputs |
| `radius-xl` | `16px` | `{rounded.xl}` | Bottom sheet top corners, hero cards |
| `radius-full` | `9999px` | `{rounded.pill}` / `{rounded.full}` | Status badges, flag pills, avatar circles |

---

## 5. Shadow Values

| Token | Value | Usage |
|---|---|---|
| `shadow-card` | `0 4px 32px rgba(0,0,0,.12)` | Phone shell (wireframe host) |
| `shadow-sheet` | `0 -4px 12px rgba(0,0,0,.06)` | Sticky footer, bottom sheet |
| `shadow-active` | `inset 0 1px 3px rgba(0,0,0,.12)` | Active tab indicator |
| `shadow-seg` | `0 1px 3px rgba(0,0,0,.10)` | Segmented control active segment |
| `shadow-dropdown` | `0 4px 12px rgba(0,0,0,.08)` | Dropdowns, tooltips |

---

## 6. Touch Targets

These are **minimum** values. Non-negotiable per Rule #3.

| Component | Min height | Min width |
|---|---|---|
| Primary CTA button | 52px | 100% of container |
| Secondary CTA button | 46px | 100% of container |
| List/sheet row | 56px | 100% |
| Icon button (header) | 40px | 40px |
| Back button | 44px | 44px (padding-extended) |
| Tab bar item | 56px | auto |
| Segmented control | 34–36px | auto |
| Deposit % option | 40px | flex 1 |
| Filter chip | 32px | auto |
| Add item button | 44px | auto |

---

## 7. Component-Specific Tokens

### CTA Buttons
```css
/* Primary */
.cta-primary {
  height: 52px;
  width: 100%;
  background: #111827;
  color: #fff;
  border: none;
  border-radius: 12px;
  font-size: 16px;
  font-weight: 700;
}

/* Secondary */
.cta-secondary {
  height: 46px;
  width: 100%;
  background: #F9FAFB;
  color: #111827;
  border: 1px solid #D1D5DB;
  border-radius: 12px;
  font-size: 14px;
  font-weight: 600;
}

/* Destructive */
.cta-destructive {
  height: 46px;
  width: 100%;
  background: #FEF2F2;
  color: #DC2626;
  border: 1px solid #FECACA;
  border-radius: 12px;
  font-size: 14px;
  font-weight: 600;
}

/* Ghost / text link */
.cta-ghost {
  /* no background, no border */
  color: #6B7280;
  font-size: 13px;
  text-decoration: underline;
  text-underline-offset: 2px;
  min-height: 44px; /* still needs touch target */
}
```

### Status Badges
```css
/* Pill badge — used in job detail header */
.status-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: 9999px;
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.3px;
}
```

Status badge colours:

| Status | Background | Text | Dot |
|---|---|---|---|
| `booked` | `#EFF6FF` | `#1D4ED8` | `#3B82F6` |
| `in_progress` | `#F0FDF4` | `#15803D` | `#16A34A` |
| `awaiting_payment` | `#FFFBEB` | `#B45309` | `#F59E0B` |
| `paid` | `#F0FDF4` | `#15803D` | `#16A34A` |
| `quoted` | `#F5F3FF` | `#6D28D9` | `#8B5CF6` |
| `no_show` | `#FEF3C7` | `#92400E` | `#F97316` |
| `cancelled` | `#F9FAFB` | `#6B7280` | `#9CA3AF` |
| `written_off` | `#F9FAFB` | `#6B7280` | `#6B7280` |
| `enquiry` | `#EFF6FF` | `#1D4ED8` | `#93C5FD` |

### Flag Badges
```css
.flag-badge {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 9999px;
  font-size: 11px;
  font-weight: 600;
}
```

Flag badge colours:

| Flag | Background | Text |
|---|---|---|
| `urgent_new` | `#EFF6FF` | `#1D4ED8` |
| `chase` | `#FFFBEB` | `#B45309` |
| `overdue` | `#FEF2F2` | `#DC2626` |
| `stale` | `#F9FAFB` | `#6B7280` |
| `no_show` | `#FEF3C7` | `#92400E` |

### Active Bar (In Progress compact bar)
```css
.active-bar {
  height: 44px;
  background: #111827;
  color: #fff;
  display: flex;
  align-items: center;
  padding: 0 16px;
  gap: 10px;
}
.active-bar-pulse {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #4ADE80;
  animation: pulse 1.5s infinite;
}
```

### Today Strip
```css
.today-strip {
  height: 36px;
  background: #F9FAFB;
  border: 1px solid #E5E7EB;
  border-radius: 8px;
  padding: 0 12px;
  display: flex;
  align-items: center;
  font-size: 13px;
  color: #374151;
}
```

### Home Tab
```css
.home-tab {
  flex: 1;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  font-weight: 600;
  color: #6B7280;
  border-radius: 7px;
}
.home-tab.active {
  background: #fff;
  color: #111827;
  box-shadow: inset 0 1px 3px rgba(0,0,0,.12);
}
```

### Bottom Sheet Overlay
```css
.sheet-overlay {
  background: rgba(0,0,0,0.25);
}
.sheet-panel {
  background: #fff;
  border-radius: 16px 16px 0 0;
  padding: 0 24px 40px;
}
.sheet-handle {
  width: 36px;
  height: 4px;
  background: #E5E7EB;
  border-radius: 2px;
  margin: 12px auto 20px;
}
```

### Form Inputs
```css
.field-input {
  border: 1.5px solid #E5E7EB;
  border-radius: 10–12px;
  padding: 12–14px 14–16px;
  font-size: 16px;  /* critical: prevents iOS zoom */
  min-height: 48px;
  color: #111827;
}
.field-input:focus {
  border-color: #111827;
  outline: none;
}
.field-input::placeholder {
  color: #D1D5DB;
  font-style: italic;
}
```

### Segmented Control
```css
.seg-control {
  display: flex;
  background: #F3F4F6;
  border-radius: 8px;
  padding: 3px;
}
.seg-opt {
  flex: 1;
  height: 34–36px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12–13px;
  font-weight: 500;
  color: #6B7280;
  border-radius: 6px;
  cursor: pointer;
}
.seg-opt.active {
  background: #fff;
  color: #111827;
  font-weight: 700;
  box-shadow: 0 1px 3px rgba(0,0,0,.1);
}
```

### Progress Dots (Onboarding)
```css
.prog-bar {
  display: flex;
  gap: 6px;
}
.prog-dot {
  height: 4px;
  flex: 1;
  border-radius: 2px;
  background: #E5E7EB;
}
.prog-dot.done,
.prog-dot.active {
  background: #111827;
}
```

### Sticky Footer
```css
.sticky-footer {
  flex-shrink: 0;
  padding: 12px 16px calc(32px + env(safe-area-inset-bottom));
  border-top: 1px solid #F3F4F6;
  box-shadow: 0 -4px 12px rgba(0,0,0,.06);
  background: #fff;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
```

---

## 8. Tailwind Theme Extension

Add this to `tailwind.config.js`:

```javascript
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'sans-serif'],
      },
      colors: {
        // Aligned with Cal {colors.*} — see DESIGN.md
        brand: {
          black:       '#111827',   // Cal {colors.primary} / {colors.ink}
          dark:        '#374151',   // Cal {colors.body}
          mid:         '#6B7280',   // Cal {colors.muted}
          muted:       '#898989',   // Cal {colors.muted-soft}
          border:      '#E5E7EB',   // Cal {colors.hairline}
          borderLight: '#F3F4F6',   // Cal {colors.hairline-soft}
          surface:     '#F8F9FA',   // Cal {colors.surface-soft}
          surfaceCard: '#F5F5F5',   // Cal {colors.surface-card}
          darkBg:      '#101010',   // Cal {colors.surface-dark}
        },
        status: {
          success:     '#10B981',   // Cal {colors.success}
          green:       '#15803D',
          greenBg:     '#F0FDF4',
          warning:     '#F59E0B',   // Cal {colors.warning}
          amber:       '#B45309',
          amberBg:     '#FFFBEB',
          amberDark:   '#92400E',
          amberMid:    '#FEF3C7',
          error:       '#EF4444',   // Cal {colors.error}
          red:         '#DC2626',
          redBg:       '#FEF2F2',
          blue:        '#1D4ED8',
          blueBg:      '#EFF6FF',
        }
      },
      fontSize: {
        'hero':  ['28px', { lineHeight: '1.15', fontWeight: '800' }],
        'xl':    ['26px', { lineHeight: '1.2',  fontWeight: '800' }],
        'title': ['20px', { lineHeight: '1.3',  fontWeight: '700' }],
        'label': ['11px', { lineHeight: '1',    fontWeight: '700', letterSpacing: '0.5px' }],
        'micro': ['10px', { lineHeight: '1',    fontWeight: '700', letterSpacing: '0.7px' }],
      },
      borderRadius: {
        // Matches Cal rounded scale exactly — see DESIGN.md rounded:
        'xs':   '4px',   // {rounded.xs}
        'sm':   '6px',   // {rounded.sm}
        'md':   '8px',   // {rounded.md}
        'lg':   '12px',  // {rounded.lg}
        'xl':   '16px',  // {rounded.xl}
        'full': '9999px', // {rounded.pill} / {rounded.full}
      },
      boxShadow: {
        'card':   '0 1px 2px rgba(0,0,0,.05), 0 4px 12px rgba(0,0,0,.08)', // Cal elevation style
        'sheet':  '0 -4px 12px rgba(0,0,0,.06)',
        'active': 'inset 0 1px 3px rgba(0,0,0,.12)',
        'seg':    '0 1px 3px rgba(0,0,0,.10)',
      },
      spacing: {
        '11': '44px',   // touch target min
        '13': '52px',   // primary CTA height
        '14': '56px',   // tab bar / list row height
      }
    }
  },
  plugins: []
}
```

---

## 9. CSS Custom Properties

Add to `src/styles/tokens.css`, imported at top of `src/main.tsx`:

```css
:root {
  /* Colours */
  --color-black:        #111827;
  --color-dark:         #374151;
  --color-mid:          #6B7280;
  --color-muted:        #9CA3AF;
  --color-border:       #E5E7EB;
  --color-border-light: #F3F4F6;
  --color-surface:      #F9FAFB;

  /* Status */
  --color-green:        #15803D;
  --color-green-bg:     #F0FDF4;
  --color-amber:        #B45309;
  --color-amber-bg:     #FFFBEB;
  --color-red:          #DC2626;
  --color-red-bg:       #FEF2F2;
  --color-blue:         #1D4ED8;
  --color-blue-bg:      #EFF6FF;

  /* Touch targets */
  --touch-primary:      52px;
  --touch-secondary:    46px;
  --touch-min:          44px;
  --touch-row:          56px;

  /* Radii */
  --radius-card:        12px;
  --radius-input:       10px;
  --radius-sheet:       16px;
  --radius-chip:        9999px;

  /* Shadows */
  --shadow-sheet:       0 -4px 12px rgba(0,0,0,.06);
  --shadow-seg:         0 1px 3px rgba(0,0,0,.10);
}
```

---

*End of DESIGN-TOKENS.md — Version 1.0*

---

## 10. Dark Mode

### Architecture
- **Strategy**: Tailwind `darkMode: 'class'` — toggled by adding/removing `class="dark"` on `<html>`
- **Persistence**: `localStorage` key `tradepad_dark_mode` + system `prefers-color-scheme` as fallback
- **Hook**: `src/hooks/useTheme.ts` — `useTheme()` returns `{ isDark, toggle, setDark }`
- **No class duplication**: all brand colours are backed by CSS variables; Tailwind config references `var(--brand-*)` instead of hardcoded hex values. Dark mode swaps variables, components need zero `dark:` prefixes for brand colours

### Light / Dark Variable Map

| Token | Light (`:root`) | Dark (`.dark`) | Usage |
|---|---|---|---|
| `--brand-black` | `#111827` | `#F9FAFB` | Primary text, headings, button bg |
| `--brand-dark` | `#374151` | `#E5E7EB` | Body text, secondary |
| `--brand-mid` | `#6B7280` | `#9CA3AF` | Muted icons, labels |
| `--brand-muted` | `#9CA3AF` | `#6B7280` | Placeholders, disabled |
| `--brand-border` | `#E5E7EB` | `#374151` | Dividers, card borders |
| `--brand-border-light` | `#F3F4F6` | `#1F2937` | Subtle separators |
| `--brand-surface` | `#F9FAFB` | `#1F2937` | Card backgrounds, secondary surfaces |
| `--brand-surface-card` | `#F5F5F5` | `#111827` | Alternate card surface |
| `--brand-dark-bg` | `#101010` | `#030712` | Desktop shell / dark bg |
| `--app-bg` | `#F3F4F6` | `#030712` | Body background |
| `--app-shell-bg` | `#FFFFFF` | `#111827` | App shell (phone frame) |
| `--app-text` | `#111827` | `#F9FAFB` | Default text on shell |
| `--color-green-bg` | `#F0FDF4` | `#064E3B` | Success tint background |
| `--color-amber-bg` | `#FFFBEB` | `#451A03` | Warning tint background |
| `--color-red-bg` | `#FEF2F2` | `#450A0A` | Error tint background |
| `--color-blue-bg` | `#EFF6FF` | `#1E3A8A` | Info tint background |
| `--shadow-sheet` | `0 -4px 12px rgba(0,0,0,.06)` | `0 -4px 12px rgba(0,0,0,.40)` | Bottom sheet / footer shadow |
| `--shadow-seg` | `0 1px 3px rgba(0,0,0,.10)` | `0 1px 3px rgba(0,0,0,.30)` | Segmented control shadow |

### Hardcoded Tailwind overrides
`globals.css` remaps common hardcoded utility classes in dark mode so existing components don't require `dark:` prefixes everywhere:

```css
.dark .bg-white       { background-color: var(--app-shell-bg); }
.dark .bg-gray-50     { background-color: var(--brand-surface); }
.dark .bg-gray-200    { background-color: var(--brand-surface); }
.dark .text-gray-300  { color: var(--brand-muted); }
.dark .border-gray-200{ border-color: var(--brand-border); }
.dark .bg-red-50      { background-color: var(--color-red-bg); }
```

Elements that must stay white in dark mode (e.g. toggle knobs) use a `.switch-knob` class with `!important` or inline `style={{ backgroundColor: '#fff' }}`.

### Status badge dark mode tints
Status badge backgrounds auto-swap via `var(--color-*-bg)` CSS variables. Text colours remain semantic (e.g. `text-green-800` maps to light green on dark). If Tailwind's `text-*-800` classes look too dark, add a targeted `dark:text-green-400` override in the component.

### Toggle location
Settings → **Appearance** section → "Dark mode" row with icon (Sun/Moon) and switch.
