# Template Category Rendering Fix — Progress Log

> **Commit:** f2f60a2
> **Date:** 2026-06-28
> **Status:** Implemented, tsc + lint + vite build green

---

## Items

| # | Item | File | Status | Commit |
|---|------|------|--------|--------|
| 1 | Remove single-template special-case rendering branch | `src/screens/Settings/MessageTemplates.tsx` | ✅ Done | f2f60a2 |

---

## What Changed

Deleted the `if (catTemplates.length === 1)` branch that rendered single-template categories as bare cards without a category label header. All categories now use the collapsible section (chevron + label + count), which already handles 1 or N templates correctly. `expandedCategories` is initialized to `new Set(CATEGORY_ORDER)` so all categories start expanded.

**Net change:** -27 lines, +1 line.

## Problem Solved

When a user added a second template to a category that had 1, the UI switched from a bare card to a collapsed header — the template they just saw disappeared behind a chevron. Now all categories are always collapsible sections, so adding a template just adds a card inside the existing section with no layout switch.

---

## Build Verification

```
$ npx tsc --noEmit
EXIT: 0

$ npm run lint
EXIT: 0

$ npx vite build
✓ built — 99 precache entries
EXIT: 0
```

---

*Last updated: 2026-06-28*
*Author: Codex*
