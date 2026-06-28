# Today Tab — Active Empty States + RecentActivity Gating

> **Branch:** codex/today-active-empty-states
> **Date:** 2026-06-28
> **Status:** Implemented, tsc + vite build + lint green

---

## What Changed

Transformed the Today tab's empty/few-jobs states from passive dead space into an action center.

### Inline tasks when no jobs + has tasks (`renderNoJobsToday`)
- Replaced the passive "No jobs today · Free day" box with an active section
- Shows top 5 urgent tasks inline (`inlineTasks = [...actTodayTasks, ...followUpTasks].slice(0, 5)`) as `TaskCard` components
- "View all {N} tasks →" link switches to Tasks tab when more tasks exist
- Heading: "No jobs today" + "{N} things need attention"
- Handles recurring_reminder-only edge case: if `inlineTasks.length === 0` but `tasks.length > 0`, shows "{N} recurring reminders due" + "View all" link without inline cards
- Extracted `handleTaskTap(task)` function for reuse (same onTap logic as Tasks tab)

### Proactive CTAs when no jobs + no tasks (`renderAllClear`)
- Replaced the passive "All clear · Nothing needs your attention" box
- "Free day" heading + proactive opportunity cards:
  - If `booking_enabled && booking_slug` → "Share your booking link" card with Copy/Open buttons
  - If `quotedJobs.length > 0` → "{N} quotes awaiting reply" card linking to Jobs
  - If neither: just heading + buttons (RecentActivity follows below)

### RecentActivity gating restructured
- **Busy day (≤3 jobs)**: shows as before (`todayState !== 'all_clear' && jobCountToday <= 3`)
- **No jobs + has tasks**: NOT shown (inline tasks are the focus)
- **No jobs + no tasks + has opportunities**: NOT shown (proactive CTAs are the focus)
- **No jobs + no tasks + no opportunities**: shown as last-resort fallback below `renderAllClear()`

### "Also: N tasks waiting →" strip
- When user has 1-3 jobs AND has pending tasks, a compact one-line strip appears below RecentActivity
- Links to Tasks tab via `setActiveTab('tasks')`
- Styled as muted text — doesn't compete with job content

---

## Files Changed

| File | Lines | What |
|------|-------|------|
| `src/screens/Home/index.tsx` | +176 / -33 | Import + computed values + handleTaskTap + renderNoJobsToday + renderAllClear + render block restructure + task strip |

---

## Build Verification

```
$ npx tsc --noEmit
(zero errors)

$ npx vite build
✓ built in 110ms
PWA v0.20.5 — 99 precache entries

$ npm run lint
(zero errors)
```

---

*Last updated: 2026-06-28*
*Author: Codex*
