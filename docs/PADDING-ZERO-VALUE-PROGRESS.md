# Padding Fix + £0.00 Job Warning — Progress

## Summary
Two changes: (1) Remove double padding from RecentActivity component (32px → 16px), (2) Add pre-start warning BottomSheet when starting a booked job with £0.00 total, plus fix acceptBookingRequest to create a line item from the booking's service amount.

## Items

| # | Item | Status | Commit |
|---|------|--------|--------|
| 1 | RecentActivity padding fix — remove px-4 from wrapper divs | ✅ Done | 3c840ef |
| 2 | Home: doStartJob extraction + £0.00 check in handleImHere | ✅ Done | 3c840ef |
| 3 | Home: zero_value_warning BottomSheet with Add items / Start anyway | ✅ Done | 3c840ef |
| 4 | JobDetail: doStartJob extraction + £0.00 check in handleStartJob | ✅ Done | 3c840ef |
| 5 | JobDetail: autoStart route handler calls doStartJob directly (skips warning) | ✅ Done | 3c840ef |
| 6 | JobDetail: zero_value_warning BottomSheet with Add items / Start anyway | ✅ Done | 3c840ef |
| 7 | booking.ts: create line item from service_amount when > 0 | ✅ Done | 3c840ef |
| 8 | TSC clean (0 errors) + build passes | ✅ Done | 3c840ef |

## Files Changed
- `src/components/RecentActivity/index.tsx` — removed 3× px-4 wrapper padding
- `src/screens/Home/index.tsx` — doStartJob extraction + £0.00 warning sheet
- `src/screens/JobDetail/index.tsx` — doStartJob extraction + autoStart fix + £0.00 warning sheet
- `src/lib/booking.ts` — line item creation from service_amount

## Verification
- `npx tsc --noEmit` — 0 errors
- `npx vite build` — passes, SW built successfully
- RecentActivity: only internal card row px-4 remains (correct)
- Home: doStartJob extracted, handleImHere checks total === 0 before starting
- JobDetail: doStartJob extracted, handleStartJob checks total === 0 && !is_sample
- JobDetail: autoStart calls doStartJob directly (skips warning)
- booking.ts: line item created without updated_at (matches LineItem interface)
- BottomSheet renders in both screens with Add items / Start anyway / Cancel
