# Bug: Booking Settings — Tapping anywhere in working days section opens date picker

## Repro
1. Go to Settings > Online booking
2. Scroll to "Working days & hours" section
3. Tap anywhere in the container (e.g., on "M" pill, "Days you work" text, or empty space)
4. iOS opens the date/time picker instead of the expected action

## Root cause
`<label>` HTML elements were used for text labels ("Days you work", "Working hours", "Blocked dates (holidays)") without `htmlFor` attributes. On iOS Safari, a `<label>` without `for` associates with the nearest input in the same container. Tapping the label (or anything iOS considers part of the label's touch area) opens that input's picker. The `<input type="date">` in the blocked dates section was being triggered by taps on the "Days you work" label above it.

## Fix
Changed `<label>` to `<span>` for the three text labels in the working days & hours section. `<span>` has no form association behavior — taps go to the actual element being tapped.

## Files
- `src/screens/Settings/Booking.tsx` — 3 `<label>` → `<span>` replacements

## Commit
`fix(booking): root-cause <label> tags triggering iOS date picker on tap`
