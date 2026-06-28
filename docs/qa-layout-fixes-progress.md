# QA Layout Fixes — Progress Log

> Commit: afb6987

## Issues Fixed

| ID | Area | Issue | Fix | Commit |
|----|------|-------|-----|--------|
| 1 | Settings | Business name overflow — long names push chevron off-screen | Added `truncate max-w-[60vw]` to name span | afb6987 |
| 2 | Settings | InlineEditRow (Your name) also overflows | Added `truncate max-w-[50vw]` to display span | afb6987 |
| 3 | Reminders | Radio button ring never turns blue — broken template literal (double quotes instead of backticks) | Changed to backtick template literal | afb6987 |
| 4 | Reminders | Channel section uses bare dot, not radio button pattern | Replaced with radio ring + dot pattern matching mode section | afb6987 |
| 5 | Reminders | Push notification 'add to home screen' text has no padding, no CTA | Added py-1 padding + 'tap for help' link navigating to Settings | afb6987 |
| 6 | Home | Spacing between 'No jobs today' and 'Needs your attention' is 20px | Changed to mt-6 (24px) | afb6987 |
| 7 | Home | 'View all tasks →' is below the section, not inline | Merged into flex row with label, shortened to 'View all' | afb6987 |
| 8 | PDF | Column width 140mm + 42mm = 182mm = exact page width, causes horizontal scroll | Reduced to 138mm (all 5 autoTable calls), leaving 2mm buffer | afb6987 |

## Verification

| Check | Status |
|-------|--------|
| `tsc --noEmit` | ✅ Exit 0 |
| `vite build` | ✅ Exit 0 |

*Last updated: 2026-06-29*
