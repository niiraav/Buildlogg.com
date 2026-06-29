# Booking Slot Computation — Progress

## Summary
Changed slot computation from combined (summed) duration to longest individual service duration. This prevents lost leads when customers select multiple services.

## Items

| # | Item | Status | Commit |
|---|------|--------|--------|
| 1 | GET: Remove combined duration from slot computation | ✅ Done | 2afe034 |
| 2 | Remove combinedDur dead code + COMBINED_DUR from template | ✅ Done | 2afe034 |
| 3a | Client JS: maxDur in updateSummary | ✅ Done | 2afe034 |
| 3b | Client JS: maxDur in service click handler | ✅ Done | 2afe034 |
| 3c | Client JS: maxDur in updateSlots | ✅ Done | 2afe034 |
| 4 | POST: add slotDuration, use for conflict/hours/break validation | ✅ Done | 2afe034 |
| 5 | Pending blocking: defensive total_duration fallback | ✅ Done | 2afe034 |
| 6 | Build + deploy + live test | ✅ Done | pushed to main |

## Live Test Results (production, 29 June 2026)

| Test | Result |
|---|---|
| SLOTS JSON has no combined key (240) | ✅ Only duration key: 60 |
| 8 dates with avg 7 slots per date | ✅ |
| Booking POST returns 200 | ✅ {"success":true} |
| TypeScript clean | ✅ |
| Vite build clean | ✅ |
| Deployed to production | ✅ |
