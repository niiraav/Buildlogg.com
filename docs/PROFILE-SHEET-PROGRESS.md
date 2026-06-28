# Profile Summary Card + Edit Sheet — Progress Log

> **Commit:** (this commit)
> **Date:** 2026-06-28
> **Status:** Implemented, tsc + vite build + lint green

---

## What Changed

Replaced the inline-edit business profile section on Settings with a tappable summary card that opens a BottomSheet form for editing all profile fields.

### Summary card
- Logo (48px circle) or placeholder initial (first letter of business name / full name in branded circle)
- Business name (or amber "Add business name" if empty)
- Trade label below
- Chevron right — tappable, opens profile sheet
- "PDF & invoice branding" kept as separate tappable row below

### Profile edit BottomSheet
- Logo upload area (reuse branding sheet pattern)
- Business name input (label above, full width)
- Your name input
- Phone input (with validation via `validateUKPhone`)
- Trade selection — inline SheetRow list (4 options: Plumber, Electrician, Builder, Other). "Other" shows text input inline. No stacked sheet — avoids body scroll lock conflict.
- Single "Save" button at bottom

### What was removed
- Inline editing for business name (the crammed "Business name [value] Done" pattern)
- InlineEditRow usage for Your name, Business name, Phone (still used for quote defaults + callout charge)
- Trade row that opened a separate trade sheet from within the business profile card

### What was kept
- `editingField` state (still used by quote defaults + callout charge)
- `InlineEditRow` import (still used)
- Existing trade BottomSheet (still rendered, for other entry points)
- Nudge banner (shows when business name empty)
- PDF & invoice branding sheet (unchanged)

---

## Build Verification

```
$ npx tsc --noEmit — zero errors
$ npx vite build — ✓ built, 99 precache entries
$ npm run lint — zero errors
```

---

*Last updated: 2026-06-28*
*Author: Codex*
