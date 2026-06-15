# Buildlogg — v2 Implementation Plan

> **Features**: Should Have + Could Have recommendations (8 + 3 = 11 features)
> **Target**: Polishing, efficiency, and differentiation beyond the core MVP loop
> **Timeline**: ~3–4 weeks after MVP is stable

---

## Table of Contents

1. [R8 — Job Timer Pause/Resume](#r8--job-timer-pauseresume)
2. [R9 — Tab Bar Active Indicator](#r9--tab-bar-active-indicator)
3. [R10 — Dismissible Desktop Banner](#r10--dismissible-desktop-banner)
4. [R11 — Skeleton Loading Screens](#r11--skeleton-loading-screens)
5. [R12 — Pull-to-Refresh](#r12--pull-to-refresh)
6. [R13 — Haptics on All Critical Actions](#r13--haptics-on-all-critical-actions)
7. [R15 — GPS Auto-Fill Address](#r15--gps-auto-fill-address)
8. [R16 — Dark Mode Onboarding Preview](#r16--dark-mode-onboarding-preview)
9. [R17 — Quote Send Success Animation](#r17--quote-send-success-animation)
10. [R18 — Search & Filter Jobs](#r18--search--filter-jobs)
11. [R20 — Bulk Job Actions](#r20--bulk-job-actions)

---

## R8 — Job Timer Pause/Resume

**Current state**: `ActiveBar` shows elapsed time but it's a static calculation based on `actual_start`. No play/pause controls. The `elapsedSeconds` prop comes from `Date.now() - actual_start` computed in Home.
**Goal**: Add play/pause controls to the `ActiveBar`. Show paused state. Store total active time on the job record.

### Files to Modify

1. `src/lib/db.ts` — Add `elapsed_seconds` to `Job` interface (or store in `work_log` as timer events)
2. `src/components/ActiveBar/index.tsx` — Add play/pause button, paused badge, timer display
3. `src/screens/Home/index.tsx` — Update timer logic to respect pause state
4. `src/screens/JobDetail/index.tsx` — Show timer status in job detail

### Implementation

**Option A (preferred — store in `work_log` as timer events):**

```typescript
// New work_log type
export type WorkLogType = 'note' | 'charge' | 'status_change' | 'customer_notified' | 'running_late' | 'timer_start' | 'timer_pause' | 'timer_resume';

// Timer events are stored in work_log:
// { type: 'timer_start', created_at: '2025-06-10T09:00:00Z', description: 'Timer started' }
// { type: 'timer_pause', created_at: '2025-06-10T12:30:00Z', description: 'Paused for lunch' }
// { type: 'timer_resume', created_at: '2025-06-10T13:00:00Z', description: 'Timer resumed' }
```

**Option B (simpler — add `elapsed_seconds` to Job):**

```typescript
// Add to Job interface:
interface Job {
  // ...existing fields
  elapsed_seconds: number; // total active time in seconds
  is_timer_paused: boolean;
  timer_paused_at?: string; // ISO timestamp when paused
}
```

**Recommended: Option A** (work_log events) — keeps the job record clean, provides an audit trail, and aligns with existing `work_log` architecture.

**UI Changes:**

```tsx
// In ActiveBar, add below the status row:
<div className="flex items-center justify-between px-4 py-2">
  <div className="flex items-center gap-2">
    <button
      onClick={isPaused ? onResume : onPause}
      className="w-8 h-8 rounded-full bg-brand-black text-white flex items-center justify-center"
    >
      {isPaused ? <Play size={14} /> : <Pause size={14} />}
    </button>
    <span className="text-sm font-bold text-brand-black">
      {isPaused ? 'Paused' : formatDuration(elapsedSeconds)}
    </span>
  </div>
  {isPaused && (
    <span className="text-xs text-status-amber font-medium bg-status-amberBg px-2 py-0.5 rounded">
      PAUSED
    </span>
  )}
</div>
```

### Acceptance Criteria

- [ ] Play/pause button visible on the ActiveBar for in-progress jobs
- [ ] Timer shows elapsed active time (excludes paused periods)
- [ ] Paused state shows "PAUSED" badge in amber
- [ ] Timer events recorded in `work_log` (audit trail)
- [ ] Resuming continues from where it left off
- [ ] Works offline (timer state in IndexedDB)
- [ ] Home screen updates timer every 60 seconds (or use `setInterval` with 1s for active feel)

---

## R9 — Tab Bar Active Indicator

**Current state**: `TabBar` receives `activeTab` prop but all four tabs look identical regardless of which is active. The icon and label don't change visually.
**Goal**: Add a visual active state — filled icon, bold label, or a small indicator dot/underline on the active tab.

### Files to Modify

1. `src/components/TabBar/index.tsx` — Add active state styling

### Implementation

```tsx
// In TabBar, change the tab rendering to:

const tabConfig = [
  { id: 'home', label: 'Home', icon: HomeIcon, path: '/' },
  { id: 'jobs', label: 'Jobs', icon: ClipboardList, path: '/jobs' },
  { id: 'activity', label: 'Activity', icon: Bell, path: '/activity' },
  { id: 'settings', label: 'Settings', icon: Settings, path: '/settings' },
];

{tabConfig.map((tab) => {
  const isActive = activeTab === tab.id;
  const Icon = tab.icon;
  return (
    <button
      key={tab.id}
      onClick={() => onNavigate(tab.id)}
      className={`flex flex-col items-center justify-center gap-0.5 flex-1 py-2 transition-colors ${
        isActive
          ? 'text-brand-black font-semibold'
          : 'text-brand-mid font-normal'
      }`}
    >
      <Icon
        size={22}
        strokeWidth={isActive ? 2.5 : 1.5}
        className={isActive ? 'text-brand-black' : 'text-brand-mid'}
      />
      <span className="text-[10px] leading-tight">
        {tab.label}
      </span>
      {isActive && (
        <div className="w-1 h-1 rounded-full bg-brand-black mt-0.5" />
      )}
    </button>
  );
})}
```

### Acceptance Criteria

- [ ] Active tab has filled/bold icon and label
- [ ] Inactive tabs have lighter stroke weight and color
- [ ] Small indicator dot or underline on active tab (subtle, not distracting)
- [ ] Animation: smooth transition on tab switch (300ms)
- [ ] Works in both light and dark mode

---

## R10 — Dismissible Desktop Banner

**Current state**: `DesktopNudge` component shows a permanent banner: "Buildlogg is designed for your phone — for the best experience, open it on mobile." It blocks the top of the desktop view and has a non-functional X button (or no X button).
**Goal**: Make the banner dismissible with a tap on the X button. Store dismissal in `localStorage` so it doesn't reappear on reload.

### Files to Modify

1. `src/components/DesktopNudge/index.tsx` — Add dismiss state and localStorage persistence

### Implementation

```tsx
// Add state:
const [dismissed, setDismissed] = useState(() => {
  try { return localStorage.getItem('tradepad_desktop_banner_dismissed') === 'true'; }
  catch { return false; }
});

const handleDismiss = () => {
  setDismissed(true);
  try { localStorage.setItem('tradepad_desktop_banner_dismissed', 'true'); }
  catch { /* ignore */ }
};

if (dismissed) return null;

// Add X button:
<button onClick={handleDismiss} className="absolute right-2 top-2 ...">
  <X size={16} />
</button>
```

### Acceptance Criteria

- [ ] Banner has a functional X (close) button
- [ ] Tapping X dismisses the banner immediately
- [ ] Dismissal persists across page reloads (localStorage)
- [ ] Banner reappears on a new device/browser (no cross-device sync needed)
- [ ] Smooth dismiss animation (fade out + slide up, 200ms)

---

## R11 — Skeleton Loading Screens

**Current state**: All screens show a static "Loading…" text or a spinner. Home, Jobs, Job Detail, Settings, and Activity all have basic loading states.
**Goal**: Replace with skeleton screens — shimmering placeholder shapes that mimic the actual layout. This creates a perception of speed and looks polished.

### Files to Modify

1. `src/components/Skeleton/index.tsx` — Enhance existing skeleton (or create new)
2. `src/screens/Home/index.tsx` — Replace loading state with skeleton
3. `src/screens/Jobs/index.tsx` — Add skeleton for job list
4. `src/screens/JobDetail/index.tsx` — Add skeleton for job detail
5. `src/screens/Settings/index.tsx` — Add skeleton for settings
6. `src/screens/Activity/index.tsx` — Add skeleton for activity (after R1 implementation)

### Implementation

**Skeleton component** (enhance `src/components/Skeleton/index.tsx`):

```tsx
// Reusable skeleton shapes
export function SkeletonText({ width = '100%', height = '16px', className = '' }: { width?: string; height?: string; className?: string }) {
  return <div className={`bg-brand-border rounded animate-pulse ${className}`} style={{ width, height }} />;
}

export function SkeletonCard({ className = '' }: { className?: string }) {
  return (
    <div className={`bg-white border border-brand-border rounded-xl p-4 animate-pulse ${className}`}>
      <div className="flex items-center justify-between mb-2">
        <SkeletonText width="60%" height="18px" />
        <SkeletonText width="40px" height="14px" />
      </div>
      <SkeletonText width="80%" height="14px" />
      <div className="flex justify-between mt-3">
        <SkeletonText width="40%" height="20px" />
        <SkeletonText width="30%" height="16px" />
      </div>
    </div>
  );
}

export function SkeletonHome() {
  return (
    <div className="flex flex-col h-full bg-brand-surface px-4 pt-4">
      {/* Greeting */}
      <SkeletonText width="50%" height="24px" className="mb-1" />
      <SkeletonText width="70%" height="14px" className="mb-4" />
      
      {/* Active bar placeholder */}
      <div className="bg-white border border-brand-border rounded-2xl p-4 animate-pulse mb-4">
        <SkeletonText width="100%" height="80px" />
      </div>
      
      {/* Task cards */}
      <SkeletonCard className="mb-3" />
      <SkeletonCard className="mb-3" />
      <SkeletonCard />
    </div>
  );
}
```

**Integration**: Replace each screen's loading state with the appropriate skeleton:

```tsx
// In Home/index.tsx:
if (loading) {
  return <SkeletonHome />;
}

// In Jobs/index.tsx:
if (loading) {
  return (
    <div className="flex flex-col h-full bg-brand-surface px-4 pt-4">
      <div className="flex gap-2 mb-4">
        <SkeletonText width="60px" height="32px" className="rounded-full" />
        <SkeletonText width="60px" height="32px" className="rounded-full" />
        <SkeletonText width="60px" height="32px" className="rounded-full" />
      </div>
      <SkeletonCard className="mb-3" />
      <SkeletonCard className="mb-3" />
      <SkeletonCard className="mb-3" />
      <SkeletonCard />
    </div>
  );
}
```

### Acceptance Criteria

- [ ] Skeleton screens match the actual layout of each screen (Home, Jobs, Job Detail, Settings, Activity)
- [ ] Shimmer/pulse animation on placeholder elements
- [ ] No layout shift when real content loads (skeleton placeholders match content dimensions)
- [ ] Works in dark mode (skeleton uses brand-border color which adapts)
- [ ] Loading state clears within 500ms of data being ready

---

## R12 — Pull-to-Refresh

**Current state**: No manual refresh mechanism. Sync happens automatically on focus, online event, and every 30 seconds (interval). Users have no way to manually trigger sync.
**Goal**: Add a pull-to-refresh gesture on Home (Today/Tasks), Jobs list, and Activity feed. Show a sync spinner and a "last synced X min ago" timestamp.

### Files to Modify

1. `src/screens/Home/index.tsx` — Add pull-to-refresh to the scrollable area
2. `src/screens/Jobs/index.tsx` — Add pull-to-refresh to the jobs list
3. `src/screens/Activity/index.tsx` — Add pull-to-refresh (after R1)
4. `src/hooks/usePullToRefresh.ts` — New reusable hook (create file)
5. `src/components/PullToRefresh/index.tsx` — New component (create file)

### Implementation

**Reusable hook** (new file: `src/hooks/usePullToRefresh.ts`):

```typescript
import { useState, useRef, useCallback } from 'react';

interface PullToRefreshState {
  isRefreshing: boolean;
  pullProgress: number; // 0 to 1
  lastSyncText: string;
}

export function usePullToRefresh(onRefresh: () => Promise<void>) {
  const [state, setState] = useState<PullToRefreshState>({
    isRefreshing: false,
    pullProgress: 0,
    lastSyncText: getLastSyncText(),
  });
  const startY = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);

  function getLastSyncText(): string {
    const lastSync = localStorage.getItem('tradepad_last_sync');
    if (!lastSync) return 'Never synced';
    const mins = Math.floor((Date.now() - parseInt(lastSync)) / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins} min ago`;
    return `${Math.floor(mins / 60)}h ago`;
  }

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (containerRef.current && containerRef.current.scrollTop === 0) {
      startY.current = e.touches[0].clientY;
    }
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (containerRef.current && containerRef.current.scrollTop === 0) {
      const diff = e.touches[0].clientY - startY.current;
      if (diff > 0 && diff < 150) {
        setState((prev) => ({ ...prev, pullProgress: diff / 100 }));
      }
    }
  }, []);

  const handleTouchEnd = useCallback(async () => {
    if (state.pullProgress >= 1 && !state.isRefreshing) {
      setState((prev) => ({ ...prev, isRefreshing: true, pullProgress: 0 }));
      await onRefresh();
      localStorage.setItem('tradepad_last_sync', Date.now().toString());
      setState({
        isRefreshing: false,
        pullProgress: 0,
        lastSyncText: getLastSyncText(),
      });
    } else {
      setState((prev) => ({ ...prev, pullProgress: 0 }));
    }
  }, [state.pullProgress, state.isRefreshing, onRefresh]);

  return { state, containerRef, handleTouchStart, handleTouchMove, handleTouchEnd };
}
```

**UI component**: Show a spinner that pulls down from the top of the scrollable area, with "Pull to refresh" / "Release to refresh" / "Syncing…" text and "Last synced X min ago".

### Acceptance Criteria

- [ ] Pull-to-refresh works on Home, Jobs, and Activity screens
- [ ] Pull threshold: 100px of downward pull triggers refresh
- [ ] Visual feedback: spinner scales up as user pulls, text changes at threshold
- [ ] "Last synced X min ago" text shown below the spinner
- [ ] Refresh triggers `syncWorker()` and re-fetches local data
- [ ] Works on touch devices (phones, tablets)
- [ ] No-op on desktop (no touch events, or use mouse drag)

---

## R13 — Haptics on All Critical Actions

**Current state**: The `Button` component has built-in haptic support (`hapticPattern` prop), but not all critical action buttons use it. Some buttons are custom `<button>` elements that don't call `haptic()`.
**Goal**: Ensure every primary action button has haptic feedback. Audit all buttons and add haptics where missing.

### Files to Audit & Modify

1. `src/screens/Quote/QuotePreview.tsx` — "Send quote" button, "Save draft" button
2. `src/screens/Quote/QuoteSent.tsx` — "View job", "Back to home" buttons
3. `src/screens/JobDetail/index.tsx` — All action buttons (mark done, collect payment, call, message, cancel, no-show, etc.)
4. `src/screens/Quote/QuoteBuilder.tsx` — "Preview quote", "Save draft", quick-add buttons
5. `src/screens/Quote/CustomerDetails.tsx` — "Continue" button
6. `src/screens/Auth.tsx` — "Send code", "Mock Sign In", "Fill Test Number" buttons
7. `src/screens/Onboarding/index.tsx` — All "Continue" buttons, trade selection buttons
8. `src/components/TaskCard/index.tsx` — Already has `haptic('light')` on tap — ✅
9. `src/components/JobCard/index.tsx` — Already has `haptic('light')` on tap — ✅

### Implementation

The fix is mechanical: add `haptic()` calls to every action button that doesn't have one. Use the `Button` component (which has built-in haptics) instead of raw `<button>` where possible.

**Priority buttons to add haptics (in order):**

```tsx
// QuotePreview.tsx
<Button variant="primary" onClick={handleOpenSend} hapticPattern="medium">
  Send quote →
</Button>

// QuoteBuilder.tsx — quick-add chips
<button onClick={() => { haptic('light'); addCustomItem(item); }} ...>

// JobDetail.tsx — all action buttons
// Mark done, Collect payment, Call, Message, Cancel, No-show, Add charge, Add note
// Each should have haptic('light') or haptic('medium')

// Onboarding.tsx — trade selection chips
<button onClick={() => { haptic('light'); toggleTrade(value); }} ...>
```

### Acceptance Criteria

- [ ] Every primary action button triggers haptic feedback
- [ ] Trade selection buttons (Plumber, Electrician, etc.) trigger haptic on tap
- [ ] Quick-add item buttons trigger haptic
- [ ] Payment method buttons trigger haptic
- [ ] Cancel / destructive actions trigger haptic with error pattern (optional)
- [ ] No buttons are silent when tapped
- [ ] Works on iOS (switch-based haptics) and Android (Vibration API)

---

## R15 — GPS Auto-Fill Address

**Current state**: Customer address is a plain text input. Dave must type the full address while standing at the customer's property.
**Goal**: Add a "Use current location" button next to the address field. Uses the Geolocation API to get lat/lng, then reverse-geocodes to a human-readable address using a free geocoding service (e.g., OpenStreetMap Nominatim).

### Files to Modify

1. `src/screens/Quote/CustomerDetails.tsx` — Add "Use current location" button to address field
2. `src/lib/geolocation.ts` — New utility (create file)

### Implementation

**Geolocation utility** (new file: `src/lib/geolocation.ts`):

```typescript
export async function getCurrentAddress(): Promise<string | null> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation not supported'));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const { latitude, longitude } = position.coords;
          // Use OpenStreetMap Nominatim (free, no API key needed)
          const response = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json&addressdetails=1`
          );
          const data = await response.json();
          
          // Build address from components
          const addr = data.address;
          const parts = [
            addr.house_number,
            addr.road,
            addr.suburb || addr.neighbourhood,
            addr.city || addr.town || addr.village,
            addr.postcode,
          ].filter(Boolean);
          
          resolve(parts.join(', '));
        } catch {
          reject(new Error('Reverse geocoding failed'));
        }
      },
      (error) => reject(new Error(error.message)),
      { timeout: 10000, maximumAge: 60000 }
    );
  });
}
```

**UI Integration**:

```tsx
// In CustomerDetails.tsx, next to the address input:

<div className="relative">
  <input
    type="text"
    value={address}
    onChange={(e) => setAddress(e.target.value)}
    placeholder="e.g. 14 Birch Lane, Holmfirth"
    className="..."
  />
  <button
    onClick={async () => {
      haptic('medium');
      try {
        const addr = await getCurrentAddress();
        if (addr) setAddress(addr);
      } catch {
        showError('Could not get location');
      }
    }}
    className="absolute right-2 top-1/2 -translate-y-1/2 text-brand-muted text-sm"
  >
    <MapPin size={16} />
  </button>
</div>
```

### Acceptance Criteria

- [ ] "Use current location" button next to the address input
- [ ] Button requests geolocation permission if not granted
- [ ] Reverse-geocodes lat/lng to a human-readable address
- [ ] Address auto-fills the input field
- [ ] Graceful fallback: if geolocation fails, show error toast and leave field untouched
- [ ] Works offline (geolocation may work offline, but reverse geocoding needs network — show error if offline)
- [ ] No external API keys required (uses Nominatim or similar free service)

---

## R16 — Dark Mode Onboarding Preview

**Current state**: Dark mode is only toggleable in Settings. User discovers it after onboarding.
**Goal**: Add a dark mode toggle during onboarding (Step 1 or 2) with a live preview of the home screen in the selected mode.

### Files to Modify

1. `src/screens/Onboarding/index.tsx` — Add dark mode toggle to Step 2 or Step 3
2. `src/hooks/useTheme.ts` — Already exists, may need export for use in Onboarding

### Implementation

Add a small toggle to the "Set your defaults" step (Step 3) of onboarding, since it's a preference setting:

```tsx
// In Onboarding Step 3, after the payment terms section:

<div className="mt-4">
  <div className="text-micro font-bold tracking-[0.7px] text-brand-muted mb-2">
    Appearance
  </div>
  <div className="flex items-center justify-between bg-brand-surface border border-brand-border rounded-xl p-3">
    <div className="flex items-center gap-2">
      {isDark ? <Moon size={18} /> : <Sun size={18} />}
      <span className="text-sm font-medium text-brand-dark">
        {isDark ? 'Dark mode' : 'Light mode'}
      </span>
    </div>
    <button
      onClick={() => { haptic('light'); toggleTheme(); }}
      className="w-12 h-7 rounded-full bg-brand-border relative transition-colors"
      style={{ backgroundColor: isDark ? 'var(--brand-black)' : undefined }}
    >
      <div
        className="absolute top-0.5 w-6 h-6 rounded-full bg-white shadow-sm transition-transform"
        style={{ transform: isDark ? 'translateX(20px)' : 'translateX(2px)' }}
      />
    </button>
  </div>
</div>
```

### Acceptance Criteria

- [ ] Dark mode toggle visible during onboarding (Step 3)
- [ ] Toggle reflects current system preference by default
- [ ] Toggle updates the app theme in real-time (preview)
- [ ] Haptic feedback on toggle
- [ ] Setting is persisted (localStorage) and applies immediately after onboarding
- [ ] Works alongside existing Settings toggle (both control the same state)

---

## R17 — Quote Send Success Animation

**Current state**: `QuoteSent` screen shows a static green checkmark and simple text. No animation or celebration.
**Goal**: Replace with a celebratory animation: a green checkmark that scales in with a spring animation, a subtle confetti burst, and the message "Quote sent to [Customer] via WhatsApp" fading out after 3 seconds. Use Framer Motion (already in the codebase).

### Files to Modify

1. `src/screens/Quote/QuoteSent.tsx` — Full animation rewrite

### Implementation

```tsx
// Replace the static green check with animated version:

import { motion, AnimatePresence } from 'framer-motion';

// Green check circle with spring animation:
<motion.div
  initial={{ scale: 0, opacity: 0 }}
  animate={{ scale: 1, opacity: 1 }}
  transition={{ type: 'spring', stiffness: 300, damping: 20, delay: 0.2 }}
  className="w-16 h-16 rounded-full bg-status-greenBg flex items-center justify-center mb-5"
>
  <motion.div
    initial={{ scale: 0 }}
    animate={{ scale: 1 }}
    transition={{ type: 'spring', stiffness: 400, damping: 15, delay: 0.4 }}
  >
    <Check size={28} strokeWidth={3} className="text-status-green" />
  </motion.div>
</motion.div>

// Title fade in:
<motion.h2
  initial={{ opacity: 0, y: 10 }}
  animate={{ opacity: 1, y: 0 }}
  transition={{ delay: 0.5, duration: 0.4 }}
  className="text-xl font-extrabold text-brand-black mb-2"
>
  {screenTitle}
</motion.h2>

// Details fade in:
<motion.p
  initial={{ opacity: 0, y: 10 }}
  animate={{ opacity: 1, y: 0 }}
  transition={{ delay: 0.6, duration: 0.4 }}
  className="text-md text-brand-mid leading-relaxed mb-7"
>
  {customerFirstName} · {job.title}<br />
  £{formatAmount(total)} · {methodLabel}
</motion.p>
```

**Optional confetti burst**: Use a simple CSS/Framer Motion confetti (5–8 small colored squares that burst outward and fade). Or use a lightweight confetti library if acceptable. For MVP simplicity, skip confetti and use the spring animation + checkmark scale-in.

### Acceptance Criteria

- [ ] Checkmark scales in with spring animation (not instant)
- [ ] Title and details fade in with staggered delay (0.5s, 0.6s)
- [ ] Animation uses existing Framer Motion dependency (no new libraries)
- [ ] Total animation duration < 1.5 seconds (doesn't delay user)
- [ ] Works in both light and dark mode
- [ ] Animation is subtle and professional (not playful/childish)

---

## R18 — Search & Filter Jobs

**Current state**: Jobs list is a flat scrollable list with no search or filtering. As job count grows, finding a specific job becomes tedious.
**Goal**: Add a text search bar that filters by customer name, job title, or address. Add a date range filter ("This week", "This month", "Last 30 days").

### Files to Modify

1. `src/screens/Jobs/index.tsx` — Add search bar and filter chips
2. `src/hooks/useJobSearch.ts` — New hook (create file, or inline)

### Implementation

```tsx
// Add to Jobs screen:

const [searchQuery, setSearchQuery] = useState('');
const [dateFilter, setDateFilter] = useState<'all' | 'this_week' | 'this_month' | 'last_30'>('all');

const filteredJobs = useMemo(() => {
  let result = jobsWithTotals;
  
  // Text search
  if (searchQuery.trim()) {
    const q = searchQuery.toLowerCase();
    result = result.filter((j) =>
      j.customer.name.toLowerCase().includes(q) ||
      j.job.title.toLowerCase().includes(q) ||
      (j.customer.address?.toLowerCase().includes(q) ?? false)
    );
  }
  
  // Date filter
  if (dateFilter !== 'all') {
    const now = new Date();
    result = result.filter((j) => {
      const jobDate = new Date(j.job.created_at);
      switch (dateFilter) {
        case 'this_week':
          return jobDate >= new Date(now.setDate(now.getDate() - now.getDay()));
        case 'this_month':
          return jobDate.getMonth() === now.getMonth() && jobDate.getFullYear() === now.getFullYear();
        case 'last_30':
          return jobDate >= new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        default: return true;
      }
    });
  }
  
  return result;
}, [jobsWithTotals, searchQuery, dateFilter]);
```

**UI**: Add a search input at the top of the Jobs list (collapsible, tap a search icon to expand). Add filter chips below: "All", "This week", "This month", "Last 30 days".

### Acceptance Criteria

- [ ] Search bar filters by customer name, job title, or address (fuzzy match, case-insensitive)
- [ ] Date filter chips: All, This week, This month, Last 30 days
- [ ] Search results update in real-time as user types (debounced, 200ms)
- [ ] Search bar is collapsible (tap icon to expand, tap X to collapse)
- [ ] No search = show all jobs (current behavior)
- [ ] Empty search state shows "No jobs match your search" message
- [ ] Works offline (searches IndexedDB data)

---

## R20 — Bulk Job Actions

**Current state**: Every job action (mark paid, send chase, archive) is done one at a time. At month-end, Dave has 5–10 jobs to mark as paid.
**Goal**: Add a long-press gesture to enter multi-select mode on the Jobs list. Allow bulk actions: "Mark all as paid", "Send chase reminders", "Archive old jobs".

### Files to Modify

1. `src/screens/Jobs/index.tsx` — Add multi-select mode, long-press handler, bulk action bar
2. `src/components/BulkActionBar/index.tsx` — New sticky bar component (create file)

### Implementation

```tsx
// State in Jobs screen:
const [selectMode, setSelectMode] = useState(false);
const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

// Long-press handler on JobCard:
const handleLongPress = (jobId: string) => {
  haptic('heavy');
  if (!selectMode) {
    setSelectMode(true);
    setSelectedIds(new Set([jobId]));
  } else {
    toggleSelection(jobId);
  }
};

// Bulk action bar (sticky bottom):
{selectMode && (
  <div className="sticky bottom-0 z-50 bg-white border-t border-brand-border px-4 py-3">
    <div className="flex items-center justify-between mb-2">
      <span className="text-sm font-bold">{selectedIds.size} selected</span>
      <button onClick={() => { setSelectMode(false); setSelectedIds(new Set()); }}>Done</button>
    </div>
    <div className="flex gap-2">
      <button onClick={bulkMarkPaid} className="flex-1 ...">Mark paid</button>
      <button onClick={bulkChase} className="flex-1 ...">Chase</button>
      <button onClick={bulkArchive} className="flex-1 ...">Archive</button>
    </div>
  </div>
)}
```

### Acceptance Criteria

- [ ] Long-press on any job card enters multi-select mode
- [ ] Selected jobs show a checkmark overlay or highlight border
- [ ] Tap to select/deselect additional jobs
- [ ] Bulk action bar shows: count selected, Mark paid, Chase, Archive buttons
- [ ] Bulk Mark Paid: opens payment sheet with total of all selected jobs
- [ ] Bulk Chase: generates one chase message per job, opens WhatsApp for each (or batch if possible)
- [ ] Bulk Archive: marks selected jobs as `written_off` with confirmation
- [ ] Exit multi-select mode with "Done" button or back gesture
- [ ] Haptic feedback on long-press (heavy pattern)

---

## Cross-Cutting Notes

### No Database Migrations Required

All v2 features can be implemented without new database tables (except R15 which is a client-side API call, and R20 which operates on existing data).

### No New Dependencies

- R17 uses existing Framer Motion
- R12, R18, R20 are pure React/state changes
- R15 uses browser Geolocation API (no library needed)
- R10, R16, R13 are CSS/state changes
- R8, R11 use existing components
- R9 uses existing `TabBar` component

### Implementation Order

| Order | Feature | Effort | Why This Order? |
|-------|---------|--------|-----------------|
| 1 | R13 — Haptics | 30 min | Quick win, affects all screens |
| 2 | R10 — Dismissible Banner | 1 hour | One-line fix, annoying in testing |
| 3 | R9 — Tab Bar Active | 2 hours | Basic navigation affordance |
| 4 | R11 — Skeletons | 1 day | Perceived performance, daily impact |
| 5 | R12 — Pull-to-Refresh | 1 day | Offline confidence, sync trust |
| 6 | R16 — Dark Mode Onboarding | 4 hours | First impression, onboarding polish |
| 7 | R17 — Send Animation | 4 hours | Emotional design, low effort |
| 8 | R8 — Job Timer | 1 day | Billing accuracy, daily use |
| 9 | R15 — GPS Auto-Fill | 1 day | On-site efficiency |
| 10 | R18 — Search & Filter | 2 days | Growing list findability |
| 11 | R20 — Bulk Actions | 2 days | Month-end efficiency |

**Total: ~2 weeks** (1 week if parallelized with MVP)
