# Buildlogg — Booking System Audit & Redesign Plan

**Date:** 27 June 2026  
**Author:** Nirav + Hermes  
**Scope:** Full audit of the online booking system — calendar sync, task management, notification infrastructure, information hierarchy, and high-volume handling.

---

## PART 1: Current State — What's Implemented

### 1.1 Public Booking Page (Cloudflare Function)

**File:** `functions/book/[[slug]].js`

**What works:**
- GET `/book/:slug` renders a server-side HTML page with merchant name, trade, phone (optional), and service list
- Services pulled from `custom_items` where `is_public = true`
- Available slots computed by checking booked jobs (`status = booked OR in_progress`) against 9am–5pm, 14 days ahead
- Slot computation respects `booking_buffer_hours` (minimum notice)
- POST handles booking submission with validation (UK phone regex, required fields)
- Duplicate prevention: checks for existing bookings at the same time slot before inserting
- Rate limiting: max 3 pending requests per phone number per hour
- Auto-expire: pending requests older than 72 hours are marked `expired`
- Referral source captured on submission

**What's missing:**
- No working hours configuration (hardcoded 9am–5pm)
- No weekend exclusion
- No service-specific duration display on the calendar (slots computed per duration but UI shows them flat)
- No deposit/payment integration on the booking page itself
- No confirmation email to the client after submission
- No "fully booked" per-day indicator (only shows "fully booked" if ALL 14 days are full)

### 1.2 Calendar Sync (Slot Availability)

**What works:**
- The booking page queries Supabase for `jobs` where `status IN (booked, in_progress)` and `scheduled_start >= now`
- Booked slots are excluded from available slots
- POST endpoint re-checks for conflicts before inserting (race condition protection)

**What's missing:**
- **No sync from the app to the booking page in real-time.** When Dave manually books a job in the app (not via a booking request), the booking page doesn't know until the job syncs to Supabase via the sync queue. If the sync is delayed (offline, slow connection), a client could book a slot Dave already filled.
- **No blocking of slots that have pending booking requests.** If Client A requests Tuesday 2pm and the request is pending, Client B can also request Tuesday 2pm. The system only checks `booked` and `in_progress` jobs, not `pending` booking requests.
- **No all-day event blocking.** If Dave marks himself as unavailable (sick day, holiday), there's no way to block all slots for that day.
- **No travel time buffer between jobs.** Back-to-back bookings are allowed with no gap.

### 1.3 Booking Request → Task Card (App Side)

**File:** `src/screens/Home/index.tsx` (lines 616-651, 1148-1199, 2034-2109)

**What works:**
- Booking requests sync from Supabase to Dexie via `initialSync` and `realtime` subscriptions
- Pending booking requests appear as task cards in the "Act today" section on Home
- Task card type: `booking_request` with Calendar icon, "Booking request" label, urgency: `high`
- Tapping a booking request task card opens a BottomSheet with:
  - Service description + amount
  - Requested date + time
  - Client phone
  - Client notes (if any)
  - Referral source (if any)
- Three actions: Accept booking, Reject — send reschedule, Call client, Close
- Accept creates a customer (or finds existing by phone), creates a job (status: booked), and opens SendSheet with confirmation message
- Reject marks request as rejected and opens SendSheet with reschedule message

**What's missing:**
- **No calendar conflict check on accept.** When Dave taps "Accept booking", the system creates a job without checking if he already has a job at that time. He could double-book himself.
- **No visual indicator of calendar conflicts** in the booking request sheet. Dave can't see if the requested time conflicts with an existing job.
- **No "suggest alternative time" flow.** Reject sends a generic "can we find another time?" message, but Dave can't propose specific alternative slots.
- **No batch handling.** Each booking request is a separate task card. With 10+ requests, the "Act today" section becomes a long scroll.

### 1.4 Notifications

**File:** `src/lib/notifications.ts`, `src/lib/realtime.ts`

**What works:**
- Realtime subscription on `booking_requests` table (Supabase Realtime) — when a new request is inserted, the app receives a push event and refreshes the task list
- In-app notification banner for notification permission
- End-of-day push notifications for in-progress jobs (if permission granted)

**What's missing:**
- **No email notifications.** When a booking request comes in, the merchant gets no email. If the app is closed, the request sits unseen until the merchant opens the app.
- **No push notifications for booking requests.** The realtime subscription only works while the app is open. No Web Push API integration.
- **No SMS notifications to the merchant.**
- **No notification to the client** that their request was received (other than the success page on the booking form).
- **No notification to the client** when the merchant accepts or rejects (other than the WhatsApp/SMS message the merchant manually sends via the SendSheet).

### 1.5 Task Card Information Hierarchy

**File:** `src/components/TaskCard/index.tsx`

**Current booking request task card shows:**
- Icon: Calendar (16px)
- Label: "Booking request"
- Urgency: high
- Title: (from Home/index.tsx line 627) — `b.service_description`
- Subtitle: client name
- Time ago: time since request was created

**Problems:**
- All booking requests look identical — same icon, same label, same colour
- No visual distinction between a £50 service and a £500 service
- No visual distinction between "requested for tomorrow" vs "requested for next week"
- No visual indication of calendar conflict (if the requested time is already booked)
- The "high" urgency styling is the same as missed calls — everything red/urgent
- With 10+ requests, there's no way to triage — which ones are most time-sensitive?

### 1.6 Stripe Integration

**File:** `functions/api/create-checkout-session.js`, `functions/api/stripe-webhook.js`

**What works:**
- Stripe checkout session creation endpoint exists
- Deposit/payment link generation from the app
- Webhook handler for payment status updates
- Success/cancel URLs redirect to `/book/payment-success` and `/book/payment-cancelled`

**What's missing:**
- No deposit collection on the booking page itself (client can't pay deposit during booking)
- No deposit requirement configuration per service
- Payment success/cancel pages may not exist as routes

---

## PART 2: Use Cases, Edge Cases & Requirements

### 2.1 Core Use Cases

**UC-1: Client books a service online**
1. Client finds merchant's booking link (QR code, Instagram bio, Google profile, word of mouth)
2. Opens booking page → sees merchant name, trade, available services
3. Selects a service → sees available dates and time slots
4. Enters name, phone, email (optional), referral source
5. Submits request → sees "Request sent" confirmation
6. Waits for merchant to accept/reject

**UC-2: Merchant receives and accepts a booking**
1. Merchant gets notification (app, email, push) — "New booking request from Sarah"
2. Opens app → sees booking request task card on Home
3. Taps card → sees details: service, date, time, client phone, notes, referral
4. Checks calendar — is this time free?
5. Taps "Accept" → job created, confirmation message sent to client
6. Client receives WhatsApp/SMS confirmation

**UC-3: Merchant receives and rejects a booking**
1. Merchant gets notification
2. Opens booking request
3. Sees the requested time conflicts with an existing job
4. Taps "Reject" → reschedule message sent to client
5. Client receives WhatsApp/SMS asking to pick another time

**UC-4: Merchant manually books a job, then online booking should update**
1. Merchant takes a phone call, books a job for Tuesday 2pm in the app
2. Job syncs to Supabase
3. Client opens booking page → Tuesday 2pm is no longer shown as available
4. Client picks a different slot

**UC-5: Multiple booking requests for the same slot**
1. Client A requests Tuesday 2pm (pending)
2. Client B opens booking page — Tuesday 2pm should NOT be available
3. Merchant accepts Client A → Client B never saw the slot, no conflict
4. OR: Merchant rejects Client A → Tuesday 2pm becomes available again

**UC-6: High volume — 10+ booking requests per day**
1. Merchant opens app → sees 12 booking requests
2. Needs to triage: which are most urgent? Which are for today? Which conflict?
3. Needs to batch-accept or batch-reject similar requests
4. Needs to see all requests in a list, not just as task cards

### 2.2 Edge Cases

**EC-1: App closed when booking request arrives**
- Merchant's phone is off, app not running
- Booking request sits in Supabase, no notification sent
- Merchant opens app next morning → sees 5 pending requests
- Some are now time-sensitive (requested for today, but it's already 10am)
- Solution: Email notification on booking request + push notification when app reopens

**EC-2: Client requests a slot that was just booked manually**
- Dave books a job for Wednesday 10am at 9:05am
- Client opens booking page at 9:06am — slot still shows as available (sync hasn't run yet)
- Client requests Wednesday 10am
- Dave sees the request — but he already has a job at that time
- Solution: Mark request as "conflict" in the booking sheet, show the existing job alongside

**EC-3: Two clients request the same slot simultaneously**
- Client A and Client B both request Tuesday 2pm within 30 seconds of each other
- The POST endpoint checks for booked jobs, not pending requests — both succeed
- Dave sees two requests for the same slot
- Solution: Block slots with pending requests (with a TTL — if pending > 2 hours, unblock)

**EC-4: Client requests a slot outside working hours**
- Current: hardcoded 9am–5pm
- But what if Dave works weekends? What if Sophie works evenings?
- Solution: Working hours configuration per day

**EC-5: Client requests a service that takes 2 hours, but only 1-hour slots are available**
- Current: slots are computed per service duration, but the UI shows them flat
- If a 2-hour service is selected, only slots with 2 consecutive free hours should show
- Solution: Filter slots by service duration (already computed but not clearly displayed)

**EC-6: Merchant goes on holiday**
- Dave takes a week off. He has 15 recurring jobs. He doesn't want any bookings.
- Solution: "Out of office" mode — blocks all slots for a date range

**EC-7: Client books, then needs to cancel or reschedule**
- Current: no client-side cancellation. Client has to call/text the merchant.
- Solution: Cancellation link in the confirmation message (future — deferred for now)

**EC-8: Merchant accepts a booking but then realises they can't do it**
- Dave accepts a booking, job is created
- Dave needs to cancel the job and notify the client
- Solution: Cancel job from job detail → sends cancellation message via SendSheet (already works)

**EC-9: Duplicate booking requests from the same client**
- Client submits the same request twice (accidental double-submit)
- Current: rate limited to 3 per hour per phone number
- Solution: Dedup by phone + date + time within 1 hour

**EC-10: Booking request for a date that has already passed**
- Current: buffer hours prevent this (minimum notice)
- But if merchant changes buffer to "Same day", a client could request a time that's already passed today
- Solution: Filter slots where slotStart < now, even with 0 buffer

### 2.3 Requirements Summary

| # | Requirement | Priority | Current Status |
|---|---|---|---|
| R1 | Calendar sync: booked jobs block slots on booking page | Critical | ✅ Works (via Supabase query) |
| R2 | Calendar sync: pending requests block slots | Critical | ❌ Missing — double-booking possible |
| R3 | Calendar conflict check on accept | Critical | ❌ Missing — merchant can double-book |
| R4 | Visual conflict indicator in booking sheet | High | ❌ Missing |
| R5 | Email notification to merchant on new request | Critical | ❌ Missing |
| R6 | Push notification for booking requests | High | ❌ Missing (realtime only works in-app) |
| R7 | Email to client on request received | Medium | ❌ Missing |
| R8 | Working hours configuration | High | ❌ Missing (hardcoded 9–5) |
| R9 | Out-of-office / holiday mode | Medium | ❌ Missing |
| R10 | Batch handling for 10+ requests | High | ❌ Missing |
| R11 | Task card information hierarchy redesign | High | ❌ Needs redesign |
| R12 | Task card colour coding by urgency/value | High | ❌ Needs redesign |
| R13 | Suggest alternative time on reject | Medium | ❌ Missing |
| R14 | Deposit collection on booking page | Medium | ❌ Missing (Stripe exists but not integrated) |
| R15 | Travel time buffer between jobs | Low | ❌ Missing |
| R16 | Weekend/holiday exclusion | Medium | ❌ Missing |
| R17 | Client cancellation link | Low | ❌ Deferred |
| R18 | Race condition: manual booking vs online booking | High | ❌ Partial (sync delay risk) |

---

## PART 3: Redesign Plan

### Phase 1: Calendar Conflict Prevention (Critical — Ship First)

**1.1 Block pending requests on the booking page**

Modify `functions/book/[[slug]].js` GET handler:
- Query `booking_requests` where `status = 'pending'` and `created_at >= now - 2 hours`
- Add pending request slots to the `bookedSlots` array
- This prevents two clients from requesting the same slot simultaneously
- TTL: pending requests older than 2 hours are ignored (merchant hasn't responded, slot reopens)

**1.2 Calendar conflict check on accept**

Modify `src/lib/booking.ts` `acceptBookingRequest()`:
- Before creating the job, query Dexie for existing jobs where:
  - `status IN (booked, in_progress)`
  - `scheduled_start` overlaps with the booking request's requested date/time
- If conflict found, return a conflict flag
- UI shows: "⚠ This time conflicts with an existing job: [customer name] · [job title] · [time]"
- Merchant can still accept (override) but is warned

**1.3 Visual conflict indicator in booking sheet**

Modify `src/screens/Home/index.tsx` booking request sheet:
- Add a conflict check when the sheet opens
- If the requested time overlaps with an existing job, show a warning banner:
  - Red border, warning icon
  - "Conflicts with: J-1029 · Nirav Arvinda · Boiler service · 12:00 pm"
- If no conflict, show a green "Available" indicator

**Build cost:** 2-3 days

---

### Phase 2: Notification Infrastructure (Critical — Ship Second)

**2.1 Email notification to merchant on new booking request**

Modify `functions/book/[[slug]].js` POST handler:
- After inserting the booking request, send an email to the merchant
- Use Supabase Edge Functions or Resend API (already set up for cold email)
- Email subject: "New booking request from [client name]"
- Email body: service, date, time, client phone, notes, link to open the app
- Link: `https://buildlogg.com/app/` (deep link to booking request if possible)

**2.2 Email to client on request received**

- After booking request submission, send a confirmation email to the client (if email provided)
- Subject: "Booking request received — [merchant name]"
- Body: "Your request for [service] on [date] at [time] has been received. [Merchant name] will confirm shortly."
- Include a "Add to calendar" placeholder link

**2.3 Push notification for booking requests (Web Push API)**

- Integrate Web Push API with Supabase
- On booking request insert → Supabase trigger → Web Push notification
- Merchant receives push even when app is closed
- Tapping notification opens the booking request in the app
- Requires: VAPID keys, service worker push handler, subscription management

**2.4 In-app notification banner for new booking requests**

- When realtime sync detects a new booking request, show a toast: "New booking request from [client name]"
- If app is in background and comes to foreground, show a banner: "3 new booking requests"

**Build cost:** 3-4 days (email: 1 day, push: 2 days, in-app: 0.5 days)

---

### Phase 3: Task Card & Information Hierarchy Redesign (High — Ship Third)

**3.1 Booking request task card redesign**

Current: All booking requests look identical — Calendar icon, "Booking request" label, high urgency.

Redesigned task card:

```
┌─────────────────────────────────────────┐
│ 📅 BOOKING REQUEST          £150 · 1hr  │
│ Sarah Jones                             │
│ Boiler service · Tue 2 Jul · 2:00 pm   │
│ ⚠ Conflicts with J-1029               │
│                          5 min ago      │
└─────────────────────────────────────────┘
```

**Colour coding by urgency:**
- **Red border** (urgent): requested date is today or tomorrow
- **Amber border** (soon): requested date is within 3 days
- **Grey border** (normal): requested date is more than 3 days away
- **Red warning stripe** (conflict): overlaps with an existing job

**Information hierarchy on the card:**
1. Label + service amount + duration (top row)
2. Client name (second row, bold)
3. Service description · date · time (third row)
4. Conflict warning (if any, fourth row, red)
5. Time ago (bottom right, muted)

**3.2 Booking request sheet redesign**

Current sheet shows: service, date, time, phone, notes, referral, then Accept/Reject/Call/Close buttons.

Redesigned sheet:

```
BOOKING REQUEST
Sarah Jones · Boiler service

┌─────────────────────────────────────────┐
│ ⚠ CONFLICT DETECTED                     │
│ You have a job at this time:            │
│ J-1029 · Nirav Arvinda · Boiler service │
│ Sun 28 Jun · 12:00 pm                   │
└─────────────────────────────────────────┘

Service     Boiler service · £150
Date        Tuesday 2 July · 2:00 pm
Duration    1 hour
Phone       📞 07123 456 789
Email       sarah@example.com
Notes       "Need it done before Friday"
Referral    Recommended by neighbour

Your calendar:
  Mon 1 Jul  ✅ Free all day
  Tue 2 Jul  ⚠ Busy 12-1pm (J-1029)
  Wed 3 Jul  ✅ Free all day

[ Accept booking      ] [ Reject            ]
[ Suggest new time    ] [ Call client       ]
```

Key changes:
- Conflict warning at the top (not buried)
- Calendar preview showing 3 days around the requested date
- "Suggest new time" button (not just generic "can we find another time?")
- Amount and duration prominent in the header

**3.3 Batch handling for high volume**

When 5+ booking requests are pending, switch from individual task cards to a "Booking requests" summary card:

```
┌─────────────────────────────────────────┐
│ 📅 12 BOOKING REQUESTS                  │
│ 3 urgent (today/tomorrow) · 2 conflicts │
│                         View all →       │
└─────────────────────────────────────────┘
```

Tapping "View all" opens a dedicated booking requests list view:
- Sorted by urgency (today first, then tomorrow, then this week)
- Conflict indicator on each row
- Swipe to accept/reject (mobile pattern)
- "Accept all non-conflicting" batch action
- Filter by: All / Urgent / Conflicts / This week

**Build cost:** 3-4 days (card redesign: 1 day, sheet redesign: 1 day, batch view: 2 days)

---

### Phase 4: Calendar Configuration (Medium — Ship Fourth)

**4.1 Working hours configuration**

Add to Settings → Booking page:
- Per-day working hours: Mon–Sun, start time, end time
- "I work weekends" toggle
- Default: Mon–Fri 9am–5pm
- Stored on profile: `working_hours: { mon: { start: '09:00', end: '17:00' }, ... }`
- Booking page reads working hours and only shows slots within them

**4.2 Out-of-office / holiday mode**

Add to Settings → Booking page:
- "Block dates" picker — select date ranges where no bookings are accepted
- Stored on profile or a new `blocked_dates` table
- Booking page checks blocked dates and shows "Not available" for those days
- Use case: holidays, sick days, pre-booked busy periods

**4.3 Travel time buffer**

- Add `travel_buffer_minutes` to profile (default: 0)
- Booking page adds buffer before and after each booked slot
- A job from 10–11am with a 30-min buffer blocks 9:30–11:30am

**Build cost:** 2-3 days

---

### Phase 5: Deposit on Booking (Medium — Ship Fifth)

**5.1 Deposit requirement per service**

- Add `deposit_amount` and `deposit_required` to `custom_items` (for public items)
- On the booking page, if a service requires a deposit:
  - Show "£X deposit required" on the service card
  - After slot selection, redirect to Stripe Checkout before creating the booking request
  - Only create the booking request after successful payment
- On the merchant side, the booking request shows "Deposit paid: £X"

**5.2 Deposit on accept**

- When merchant accepts a booking, if the service has a deposit and it wasn't paid during booking:
  - Generate a Stripe payment link
  - Include in the confirmation message: "Please pay the £X deposit here: [link]"

**Build cost:** 2-3 days (Stripe integration exists, needs wiring to booking flow)

---

## PART 4: Implementation Priority

| Phase | Features | Build Cost | Impact | Ship Order |
|---|---|---|---|---|
| **1** | Calendar conflict prevention (block pending, conflict check, visual indicator) | 2-3 days | Critical — prevents double-booking | 1st |
| **2** | Notification infrastructure (email to merchant, email to client, push, in-app) | 3-4 days | Critical — merchant never misses a request | 2nd |
| **3** | Task card & sheet redesign (colour coding, conflict display, batch handling, calendar preview) | 3-4 days | High — usability at scale | 3rd |
| **4** | Calendar configuration (working hours, OOO, travel buffer) | 2-3 days | Medium — flexibility | 4th |
| **5** | Deposit on booking (Stripe integration with booking flow) | 2-3 days | Medium — revenue protection | 5th |

**Total: 12-17 days for all 5 phases**

---

## PART 5: Data Model Changes

### New Fields on `profiles` table:
```sql
working_hours JSONB DEFAULT '{"mon":{"start":"09:00","end":"17:00"},"tue":...}'
travel_buffer_minutes INT DEFAULT 0
```

### New Table: `blocked_dates`
```sql
CREATE TABLE blocked_dates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id),
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  reason TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

### Modified `booking_requests` table:
```sql
-- Add conflict status
ALTER TABLE booking_requests ADD COLUMN has_conflict BOOLEAN DEFAULT false;
ALTER TABLE booking_requests ADD COLUMN conflict_job_id UUID REFERENCES jobs(id);
```

### Modified `custom_items` table:
```sql
-- Deposit support for public items
ALTER TABLE custom_items ADD COLUMN deposit_amount DECIMAL(10,2) DEFAULT 0;
ALTER TABLE custom_items ADD COLUMN deposit_required BOOLEAN DEFAULT false;
```

### New Table: `notification_log` (for email/push tracking)
```sql
CREATE TABLE notification_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id),
  type TEXT NOT NULL, -- 'booking_request_email', 'booking_request_push', etc.
  ref_id UUID, -- booking_request_id
  status TEXT, -- 'sent', 'failed', 'delivered'
  created_at TIMESTAMPTZ DEFAULT now()
);
```

---

## PART 6: Files to Modify

| File | Changes |
|---|---|
| `functions/book/[[slug]].js` | Block pending request slots, working hours, blocked dates, deposit redirect, email notifications |
| `src/lib/booking.ts` | Conflict check on accept, batch accept/reject |
| `src/screens/Home/index.tsx` | Booking request sheet redesign, batch summary card, conflict indicator |
| `src/components/TaskCard/index.tsx` | Colour coding, conflict display, urgency-based styling |
| `src/screens/Settings/Booking.tsx` | Working hours config, OOO mode, travel buffer |
| `src/lib/notifications.ts` | Push notification for booking requests, email trigger |
| `src/lib/db.ts` | New fields: working_hours, travel_buffer_minutes, blocked_dates table, notification_log table |
| `functions/api/create-checkout-session.js` | Deposit on booking flow |
| `src/lib/realtime.ts` | In-app toast on new booking request |
| New: `src/screens/BookingRequests/index.tsx` | Dedicated booking requests list view for high volume |
| New: `functions/api/send-booking-email.js` | Email notification Cloudflare Function |

---

*Plan created 27 June 2026 — based on full codebase audit of booking system (6 files, 500+ lines of booking-related code)*

---

## PART 7: Second-Pass Audit — Gaps, Faults & Missing Edge Cases

*Conducted by re-reading every booking-related file against the plan. Found 15 issues.*

### FAULTS IN THE PLAN ITSELF

**F1: Pending request TTL of 2 hours is too short**

The plan says "pending requests older than 2 hours are ignored (slot reopens)." But the existing code auto-expires pending requests after 72 hours. If we block slots for only 2 hours, a client could book a slot at 2:01pm that's still pending until 72h expiry. The TTL for slot blocking should match the pending expiry — or at least be configurable. **Recommend: 4 hours for slot blocking, 72 hours for request expiry (existing).**

**F2: "Block pending requests" query doesn't include the requested time range**

The plan says "query booking_requests where status = pending" and add them to bookedSlots. But `booking_requests` stores `requested_date` (DATE) and `requested_time` (TEXT like "14:00"), not ISO timestamps. The `computeAvailableSlots` function works with UTC Date objects. We need to convert `requested_date + requested_time` to UTC (using the same `londonToUtc` function) before comparing. **The plan doesn't mention this conversion — it would silently fail without it.**

**F3: Conflict check on accept queries Dexie, not Supabase**

The plan says "query Dexie for existing jobs" for the conflict check. But Dexie is local-first — if Dave just accepted a booking request on his phone, the job is in Dexie. But if he's on a new device (fresh sync), Dexie might not have all jobs yet. The conflict check should query **both** Dexie (fast, offline) and fall back to Supabase (authoritative) if Dexie returns no conflicts. **Add Supabase fallback.**

**F4: The plan's data model is missing `booking_request_id` on `checkout_sessions`**

The existing migration already has `booking_request_id uuid` on `checkout_sessions` (line 54). The plan's Phase 5 (deposit on booking) needs to reference this when creating a checkout session during booking. The plan doesn't mention this existing column — it would duplicate it.

**F5: The plan doesn't account for the `checkout_sessions` table already existing**

The plan proposes new tables (`blocked_dates`, `notification_log`) but doesn't acknowledge that `checkout_sessions` and `booking_requests` already exist with RLS policies. The data model section should note "existing tables" vs "new tables."

### MISSING EDGE CASES

**EC-11: Client selects a service but doesn't submit — slot isn't blocked**

When a client opens the booking page and selects a service + date + time, the slot is only blocked when they actually submit (POST). If they spend 5 minutes filling in the form, another client could book the same slot in that window. **Solution: Reserve the slot for 5 minutes after selection (client-side timer + server-side reservation with TTL). Or accept this race — it's rare and the POST re-check prevents actual double-booking.**

**EC-12: Merchant changes their booking slug while requests are pending**

If Dave changes his slug from "dave-plumber" to "dave-heating", the old link stops working. But existing pending requests were submitted against the old slug — they still have the correct `merchant_id` so they'll still appear in the app. **Current behaviour is correct** — slug change doesn't affect pending requests. But the booking page 404s for anyone using the old link. The plan's slug change confirmation sheet (already implemented) warns about this. **No change needed — already handled.**

**EC-13: Merchant disables booking page while requests are pending**

Dave turns off his booking page. New clients see "not found." But existing pending requests are still in the system. Dave can still accept/reject them. **Current behaviour is correct. No change needed.**

**EC-14: Client provides an international phone number**

The booking page validates with `UK_PHONE_REGEX = /^(\+44|0)[0-9]{10}$/`. This rejects:
- Numbers with spaces already stripped (OK — the code strips spaces before matching)
- But it rejects numbers like `+44 7123 456789` if spaces aren't fully stripped (the code does `.replace(/[\s-]/g, '')` so this is fine)
- It rejects non-UK numbers entirely (e.g., a client from Ireland with +353)

**For now this is intentional (UK-only product). But if Sophie (beauty vertical) has international clients, this will fail. Note for future.**

**EC-15: Booking page loaded by a crawler/bot**

The GET endpoint renders full HTML with all available slots. A bot could scrape all free slots for a merchant. This isn't a security issue (slots are public) but could be used for competitive intelligence. **Low risk — ignore for now.**

**EC-16: Client submits booking with a date more than 14 days ahead**

The slot computation only shows 14 days ahead. But the POST endpoint doesn't validate that the submitted date is within 14 days. A client could craft a POST request with a date 3 months ahead. **Solution: Add server-side validation that `requested_date` is within the 14-day window.**

**EC-17: Client submits booking for a past date**

The POST endpoint converts the date to UTC and checks against booked jobs, but doesn't check if the date is in the past. With "Same day" buffer (0 hours), a client could submit a booking for 9am when it's already 3pm. **Solution: Add server-side check that `londonToUtc(requestedDate, requestedTime) > now`.**

**EC-18: Multiple services with different durations selected**

The current booking page UI only allows selecting one service at a time (radio-button pattern). But the slot computation computes slots for all service durations. If a client selects a 2-hour service, the slots shown are for 2-hour blocks. **This works correctly — no issue.**

**EC-19: Merchant has no public custom items (no services configured)**

The booking page shows "hasn't set up their services yet" with a contact prompt. **This is handled correctly by the `renderBookingPage` function.**

**EC-20: Stripe webhook fires before the booking request is synced to the app**

If a deposit is collected during booking (Phase 5), the Stripe webhook fires and updates the job. But the booking request might not have synced to the merchant's Dexie yet. The merchant sees a payment notification for a job they haven't seen the booking request for. **Solution: The webhook should also update the booking_request status to 'accepted' with deposit_paid flag.**

### MISSING FROM THE PLAN

**M1: No "booking request accepted" email to client**

The plan includes "email to client on request received" (Phase 2.2) but doesn't include "email to client when booking is accepted." Currently, the merchant sends a WhatsApp/SMS confirmation manually via SendSheet. But if the client doesn't have WhatsApp or didn't provide a phone number that accepts WhatsApp, they never know their booking was accepted. **Add: automatic email to client on accept (if email provided).**

**M2: No "booking request rejected" email to client**

Same gap — the merchant sends a reschedule WhatsApp/SMS manually, but no automatic email. **Add: automatic email to client on reject (if email provided).**

**M3: No booking request expiry notification to client**

If a booking request expires (72 hours, no response), the client is never told. They're waiting for a confirmation that never comes. **Add: email to client on expiry ("Your booking request has expired. Please try booking another time.")**

**M4: No "request a different time" button on the booking page**

If a client wants a time that's not shown (e.g., they need an evening slot but only 9-5 is available), there's no way to request a custom time. They have to call the merchant. **Add: "Can't find a suitable time? Contact [merchant name]" link with phone/email.**

**M5: No deposit refund flow**

The plan mentions deposit collection but not refunds. If Dave cancels a job (not the client), he needs to refund the deposit. The Stripe webhook handles `checkout.session.completed` but not refund events. **Add: refund flow via Stripe API + `deposit_status: 'refunded'` on the job.**

**M6: No booking request count badge on tab bar**

When the merchant has 5 pending booking requests, there's no visual indicator on the Home tab or a notification badge. They have to open the app and check the Tasks tab. **Add: badge count on Home tab (or a floating indicator).**

**M7: No booking page analytics**

The merchant can't see how many people visited their booking page, how many started but didn't complete, conversion rate. **Add: PostHog events on the booking page (page_view, service_selected, slot_selected, form_submitted, submission_success, submission_error).**

**M8: No "preview booking page" from settings**

The settings page has "Open page" which opens the live booking page. But if the merchant wants to see how it looks without making it live (e.g., testing different services), they can't. **Add: "Preview" button that renders the page with a preview flag (no actual submissions allowed).**

**M9: The plan doesn't address the sync delay between manual booking and booking page**

The plan mentions this in Part 1.2 ("No sync from the app to the booking page in real-time") but doesn't include a solution in the phases. The sync queue runs every 30 seconds, so the maximum delay is ~30 seconds + network time. For most cases this is acceptable. But for the conflict indicator (Phase 1.3), the check uses Dexie (local), which is always up-to-date. **Add: document the 30-second sync window as an accepted limitation, with the conflict indicator (Phase 1.3) as the safety net.**

**M10: No timezone handling for international expansion**

The booking page uses `Europe/London` timezone for slot computation. This is correct for a UK-only product. But the plan's data model stores `working_hours` without timezone context. If Buildlogg expands to other countries, this will break. **Note for future — not a current issue.**

### CORRECTIONS TO EXISTING PLAN CONTENT

**C1: The plan says "No confirmation email to the client after submission" — but there's also no confirmation PAGE that persists**

The booking page shows a success message via JavaScript (`showSuccess()` function in the inline JS), but if the client refreshes or navigates away, the success state is lost. There's no dedicated `/book/success` page. **Add: redirect to a persistent success page after submission (like the Stripe payment-success page pattern).**

**C2: The plan's batch handling threshold (5+) should be configurable or dynamic**

Hardcoding "5+" as the threshold for switching to summary card is arbitrary. A merchant with 3 daily requests might want the summary view. A merchant with 8 might still want individual cards. **Consider: always show summary count, with "expand" to see individual cards. Let the user choose.**

**C3: The plan mentions "swipe to accept/reject" but this requires a gesture library**

The app doesn't currently use swipe gestures anywhere. Adding swipe for booking requests would require a gesture handling library (e.g., framer-motion drag) or custom touch handlers. **Correction: use tap-to-accept/reject buttons instead of swipe for consistency with the rest of the app.**

---

## Updated Requirements (additions from second-pass audit)

| # | Requirement | Priority | Source |
|---|---|---|---|
| R19 | Server-side validation: requested_date within 14-day window | High | EC-16 |
| R20 | Server-side validation: requested_date/time not in the past | High | EC-17 |
| R21 | Automatic email to client on accept (if email provided) | Medium | M1 |
| R22 | Automatic email to client on reject (if email provided) | Medium | M2 |
| R23 | Email to client on booking request expiry | Low | M3 |
| R24 | "Can't find a suitable time?" contact link on booking page | Low | M4 |
| R25 | Deposit refund flow | Medium | M5 |
| R26 | Booking request count badge on tab bar | Medium | M6 |
| R27 | Booking page PostHog analytics | Medium | M7 |
| R28 | Preview booking page from settings | Low | M8 |
| R29 | Convert requested_date + requested_time to UTC before slot blocking | Critical | F2 |
| R30 | Supabase fallback for conflict check on accept | High | F3 |
| R31 | Persistent success page after booking submission | Medium | C1 |
| R32 | Stripe webhook updates booking_request on deposit payment | High | EC-20 |

---

*Second-pass audit completed 27 June 2026 — 15 additional issues found (5 plan faults, 10 missing edge cases, 10 missing requirements, 3 corrections)*
