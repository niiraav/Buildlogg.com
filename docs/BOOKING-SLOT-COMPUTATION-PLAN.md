# Booking Slot Computation — Use Longest Service Duration Plan

**Date:** 29 June 2026

---

## Problem

The booking page computes slots using the **combined (summed) duration** of all selected services. When a customer selects multiple services (e.g., 4 × 60 min = 240 min), only 1 slot per day shows because a 4-hour block rarely fits in a 9-5 working day with a lunch break. This loses leads.

## Solution

Compute slots based on the **longest single service duration**, not the combined total. The booking page becomes a lead-generation tool where the customer picks a time slot and Dave calls back to arrange the actual schedule.

---

## Current Flow (Broken)

### GET handler (server-side, lines 178-192)
1. Gets all services for the merchant
2. Builds `durations` array = unique durations of each service + the combined total
3. Computes `slotsByDuration` for each duration
4. Sends ALL slot sets to the client as `SLOTS` JSON

### Client-side JS (in rendered HTML)
1. When services are selected, sums their durations → `totalDur`
2. Looks up `SLOTS[totalDur]` (exact match, or next-larger key)
3. Displays those slots

### POST handler (lines 222-224, 247, 274)
1. Computes `totalDuration = sum of all service durations`
2. Uses `totalDuration` for:
   - Conflict check end time (line 247: `sE = slotStart + totalDuration`)
   - Working hours validation (line 274: `reqMinutes + totalDuration > endMin`)
   - Break overlap check (line 279: `reqMinutes + totalDuration > bStart`)

### App-side (booking.ts lines 19-40)
1. `getServiceDurationMinutes()` returns `total_duration` from DB, or sums `service_items`, or falls back to fuzzy match
2. Used for `scheduledEnd` when creating the job

---

## Amended Flow

### Change 1: GET handler — compute slots for each individual service duration only

**File:** `functions/book/[[slug]].js`, lines 178-185

**Current:**
```javascript
const durations = [...new Set((services||[]).map(s => s.duration_minutes || 60))];
if (durations.length === 0) durations.push(60);
const combinedDuration = (services||[]).reduce((sum, s) => sum + (s.duration_minutes || 60), 0);
if (combinedDuration > 0 && !durations.includes(combinedDuration)) {
  durations.push(combinedDuration);
}
```

**New:**
```javascript
const durations = [...new Set((services||[]).map(s => s.duration_minutes || 60))];
if (durations.length === 0) durations.push(60);
// Do NOT add combined duration — slots are computed per-service
// The customer picks a time based on the longest selected service,
// and Dave arranges the actual schedule when he calls back.
```

Remove the `combinedDuration` computation and the push to `durations`. This means `SLOTS` will only contain keys for individual service durations (e.g., `60`, `90`, `120`), not combined totals (e.g., `240`).

### Change 2: Client-side JS — use longest selected service duration

**File:** `functions/book/[[slug]].js`, in the rendered HTML template string

**Current (in service click handler):**
```javascript
let totalDur=0;sel.forEach(s=>{totalDur+=parseInt(s.dataset.duration||60)});
let curSlots=SLOTS[totalDur];
if(!curSlots){const keys=Object.keys(SLOTS).map(Number).sort((a,b)=>a-b);for(const k of keys){if(k>=totalDur){curSlots=SLOTS[k];break}}if(!curSlots)curSlots=SLOTS[Object.keys(SLOTS)[0]]}
```

**New:**
```javascript
let maxDur=0;sel.forEach(s=>{maxDur=Math.max(maxDur,parseInt(s.dataset.duration||60))});
let curSlots=SLOTS[maxDur];
if(!curSlots){const keys=Object.keys(SLOTS).map(Number).sort((a,b)=>a-b);for(const k of keys){if(k>=maxDur){curSlots=SLOTS[k];break}}if(!curSlots)curSlots=SLOTS[Object.keys(SLOTS)[0]]}
```

**Current (in updateSlots function):**
```javascript
let totalDur=0;sel.forEach(s=>{totalDur+=parseInt(s.dataset.duration||60)});
let curSlots=SLOTS[totalDur];
```

**New:**
```javascript
let maxDur=0;sel.forEach(s=>{maxDur=Math.max(maxDur,parseInt(s.dataset.duration||60))});
let curSlots=SLOTS[maxDur];
```

### Change 3: Summary bar — show advisory duration, not exact

**File:** `functions/book/[[slug]].js`, in `updateSummary()` function

**Current:**
```javascript
let total=0,dur=0;sel.forEach(s=>{total+=parseFloat(s.dataset.amount||0);dur+=parseInt(s.dataset.duration||60)});
const hrs=Math.round(dur/60*10)/10;const hrLabel=hrs===1?'1 hour':hrs+' hours';
```

**New:**
```javascript
let total=0,maxDur=0;sel.forEach(s=>{total+=parseFloat(s.dataset.amount||0);maxDur=Math.max(maxDur,parseInt(s.dataset.duration||60))});
const hrs=Math.round(maxDur/60*10)/10;const hrLabel=hrs===1?'~1 hour':'~'+hrs+' hours';
```

The `~` prefix signals this is an estimate. The total price is still the sum (correct — Dave charges for all services).

### Change 4: POST handler — use longest service duration for validation, store total as advisory

**File:** `functions/book/[[slug]].js`, lines 222-224, 247, 274, 279

**Current:**
```javascript
const totalAmount = services.reduce((sum, s) => sum + (s.amount || 0), 0);
const totalDuration = services.reduce((sum, s) => sum + (s.duration || 60), 0);
```

**New:**
```javascript
const totalAmount = services.reduce((sum, s) => sum + (s.amount || 0), 0);
const totalDuration = services.reduce((sum, s) => sum + (s.duration || 60), 0); // kept for storage
const slotDuration = Math.max(...services.map(s => s.duration || 60)); // used for slot validation
```

Then change all validation that uses `totalDuration` to use `slotDuration` instead:

**Line 247** (conflict check):
```javascript
// Current: const sE = new Date(slotStart.getTime()+totalDuration*60*1000);
const sE = new Date(slotStart.getTime()+slotDuration*60*1000);
```

**Line 274** (working hours check):
```javascript
// Current: if (reqMinutes < startMin || reqMinutes + totalDuration > endMin)
if (reqMinutes < startMin || reqMinutes + slotDuration > endMin)
```

**Line 279** (break overlap check):
```javascript
// Current: if (reqMinutes < bEnd && reqMinutes + totalDuration > bStart)
if (reqMinutes < bEnd && reqMinutes + slotDuration > bStart)
```

**The `totalDuration` is still stored** in the `insertBody` as `total_duration` (line 289) so Dave can see the full estimated time when reviewing the booking request. The `slotDuration` is only used for slot availability validation.

### Change 5: Pending request slot blocking — use longest service or total_duration from DB

**File:** `functions/book/[[slug]].js`, lines 169-174

**Current:**
```javascript
const pendingRequests = await supabaseQuery(SU, SK, 'booking_requests', `?merchant_id=eq.${merchant.id}&status=eq.pending&created_at=gte.${fourHoursAgo}&select=requested_date,requested_time,service_amount`);
for (const r of pendingRequests||[]) {
  if (!r.requested_date || !r.requested_time) continue;
  const start = londonToUtc(r.requested_date, r.requested_time).toISOString();
  const end = new Date(new Date(start).getTime()+60*60*1000).toISOString(); // hardcoded 60 min!
  bookedSlots.push({start,end});
}
```

**New:**
```javascript
const pendingRequests = await supabaseQuery(SU, SK, 'booking_requests', `?merchant_id=eq.${merchant.id}&status=eq.pending&created_at=gte.${fourHoursAgo}&select=requested_date,requested_time,total_duration`);
for (const r of pendingRequests||[]) {
  if (!r.requested_date || !r.requested_time) continue;
  const start = londonToUtc(r.requested_date, r.requested_time).toISOString();
  const dur = r.total_duration || 60; // Use stored total, fall back to 60
  const end = new Date(new Date(start).getTime()+dur*60*1000).toISOString();
  bookedSlots.push({start,end});
}
```

Note: Changed `service_amount` to `total_duration` in the SELECT. If `total_duration` column doesn't exist yet (migration not applied), the query will return null for that field and fall back to 60. This is safe.

### Change 6: POST conflict check — use slotDuration for the new booking, total_duration for existing pending

**File:** `functions/book/[[slug]].js`, lines 247-256

**Current:**
```javascript
const sE = new Date(slotStart.getTime()+totalDuration*60*1000);
// ...
const pDur = r.total_duration || 60;
```

**New:**
```javascript
const sE = new Date(slotStart.getTime()+slotDuration*60*1000);
// ...
const pDur = r.total_duration || 60; // keep — existing pending requests block based on their stored duration
```

The new booking uses `slotDuration` (longest service) for its end time. Existing pending requests still use their `total_duration` (which may be the combined total from the old logic). This is correct — we want to be conservative with existing bookings.

### Change 7: App-side — no change needed

**File:** `src/lib/booking.ts`

`getServiceDurationMinutes()` already handles `total_duration` and `service_items`. When Dave accepts a booking, the job is created with `scheduled_end = scheduledStart + totalDuration`. This is correct — Dave's calendar should show the full estimated duration, not just the slot duration. The job's time block in Dave's calendar should reflect the real time commitment.

No change needed here.

---

## Edge Cases

| # | Case | Handling |
|---|---|---|
| EC-1 | Single service selected | `maxDur = service.duration` — same as `totalDuration`. No change in behaviour. |
| EC-2 | All services same duration (e.g., 4 × 60 min) | `maxDur = 60`, `totalDuration = 240`. Slots show for 60 min (6-7 per day). POST validates for 60 min. `total_duration: 240` stored for Dave's reference. |
| EC-3 | Services with different durations (60, 90, 120 min) | `maxDur = 120`. Slots show for 120 min. POST validates for 120 min. `total_duration: 270` stored. |
| EC-4 | One service is 480 min (full day) | `maxDur = 480`. Slots show for 480 min (1 slot). Correct — Dave genuinely needs the full day. |
| EC-5 | Combined duration exceeds working hours (5 × 60 = 300 min, working day = 480 min) | `maxDur = 60`. Slots show for 60 min (7 per day). Customer books, Dave sees `total_duration: 300` and calls to arrange. |
| EC-6 | No services set up | `durations = [60]`. Default 60-min slots. No change. |
| EC-7 | Pending request from old logic (has `total_duration: 240`) | Blocks 240 min of slots. New booking uses `slotDuration` for its own check. Conservative — correct. |
| EC-8 | `total_duration` column doesn't exist in Supabase | `r.total_duration` returns undefined → falls back to 60. Safe. |
| EC-9 | Customer selects and deselects services | Client JS recalculates `maxDur` on each toggle. Slot grid updates correctly. |
| EC-10 | Old single-service booking format (backward compat) | `services = [{duration: 60}]`. `slotDuration = 60`, `totalDuration = 60`. Same behaviour. |
| EC-11 | Service with `duration_minutes: 0` or missing | `|| 60` fallback handles it. `maxDur` will be at least 60. |
| EC-12 | Dave's calendar (app-side job creation) | Job `scheduled_end` uses `totalDuration` (full estimate). Dave sees the real time commitment. Calendar blocking uses the full duration. Correct. |
| EC-13 | Rate limiting | Unchanged — uses phone number, not duration. |
| EC-14 | Deposit/Stripe flow | Unchanged — uses `totalAmount`, not duration. |

---

## File Changes Summary

| File | Change | Lines affected |
|---|---|---|
| `functions/book/[[slug]].js` | Remove combined duration from GET slot computation | 178-185 |
| `functions/book/[[slug]].js` | Client JS: use `maxDur` instead of `totalDur` in service click handler | In template string |
| `functions/book/[[slug]].js` | Client JS: use `maxDur` instead of `totalDur` in `updateSlots()` | In template string |
| `functions/book/[[slug]].js` | Summary bar: show `~maxDur` hours instead of total | In template string |
| `functions/book/[[slug]].js` | POST: add `slotDuration = Math.max(...)`, use for validation | 222-224, 247, 274, 279 |
| `functions/book/[[slug]].js` | Pending request blocking: use `total_duration` from DB instead of hardcoded 60 | 169-174 |
| `functions/book/[[slug]].js` | POST conflict check: use `slotDuration` for new booking end time | 247 |

**No app-side changes needed.** `src/lib/booking.ts` already handles `total_duration` correctly.

---

## Verification Plan

1. **Build + deploy** to production
2. **GET test:** Load booking page, extract SLOTS JSON — verify only individual service durations are present (no combined key)
3. **UI test:** Select all 4 services — verify 6-7 slots per day show (not 1)
4. **Summary bar test:** Verify it shows `~1 hour` (not `4 hours`)
5. **POST test:** Submit a booking with multiple services — verify 200 success (not 500 or 409)
6. **POST validation test:** Submit a booking at 16:30 for a 60-min service when working hours end at 17:00 — verify it passes (60 min fits). Then try 16:30 with a 120-min service — verify it's rejected (120 min doesn't fit)
7. **Pending blocking test:** After submitting a booking at 10:00, reload the page — verify 10:00 slot is no longer available
8. **App-side test:** Accept the booking in the app — verify the job's `scheduled_end` uses `total_duration` (full estimate), not `slotDuration`
