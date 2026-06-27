# Bug: Booking Settings — Tapping anywhere in working days section opens date picker

## Repro
1. Go to Settings > Online booking
2. Scroll to "Working days & hours" section
3. Tap anywhere in the container (e.g., on "M" pill, "Days you work" text, or empty space)
4. iOS opens the date/time picker instead of the expected action

## Root cause
globals.css has a `::-webkit-calendar-picker-indicator` rule that makes the native picker indicator invisible but covers the entire input with `position:absolute; top:0; left:0; right:0; bottom:0; width:100%; height:100%`. Without `position:relative` on the input itself, the absolute positioning is relative to the nearest positioned ancestor (the container div), not the input. On iOS Safari, this caused the invisible overlay to cover the entire "Working days & hours" container — any tap in the container hit the overlay and opened the date/time picker.

## Fix
Added `position: relative` to `input[type="date"]` and `input[type="time"]` in globals.css. Now the indicator overlay is contained within the input's bounds, not the parent container.

Also changed `<label>` to `<span>` for text labels in the working days section (previous fix, still valid — prevents form association on iOS).

## Files
- `src/styles/globals.css` — added `position: relative` to date/time input CSS rule
- `src/screens/Settings/Booking.tsx` — `<label>` → `<span>` for 3 text labels

## Commits
- `5be1aab` — fix(booking): <label> → <span> (partial fix)
- `2d0713e` — fix(booking): position:relative on date/time inputs (root cause fix)
