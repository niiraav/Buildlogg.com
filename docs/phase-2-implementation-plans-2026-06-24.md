# Buildlogg Phase 2 — Feature Implementation Plans

> **Date:** 2026-06-24
> **Grounded in:** Actual codebase architecture (Dexie v2, Zustand store, TaskCard system, FlagBadge, jobStaleness engine, paymentHelpers, analytics.ts, QuotePreview send mechanism)
> **Method:** Each plan specifies exact file changes, new interfaces, Dexie schema bumps, UI components, edge case handling, and analytics events.

---

## Codebase Architecture Summary (Reference)

### Dexie Tables (v2)
```
profiles, customers, jobs, line_items, work_log, payments,
sync_queue, job_photos, custom_items, material_items
```

### Key Interfaces
- **Job**: `id, user_id, customer_id, title, job_number, status (9 states), scheduled_start/end, actual_start/end, is_multi_day, payment_terms, deposit_pct, quote_sent_at, quote_send_method, quote_expires_at, invoice_number, invoice_sent_at, cancellation_reason, notes`
- **Customer**: `id, user_id, name, phone, address`
- **Payment**: `id, job_id, type (deposit|balance|full), method (cash|bank_transfer|terminal|other), amount, recorded_at`
- **WorkLogEntry**: `id, job_id, type (note|charge|status_change|customer_notified|running_late|quote_sent), description, amount?`
- **TaskCard**: `type (overdue|chase|missed_call|no_show|stale_quote|urgent_new|draft_quote), urgency (high|medium|low)`

### Quote Send Mechanism (QuotePreview.tsx)
```ts
// WhatsApp
window.open(`https://wa.me/${phone}?text=${encoded}`, '_blank');
// SMS
window.open(`sms:${phone}?body=${encoded}`, '_self');
```

### Analytics Pattern
PostHog via `capture(event, properties)` — all events typed in `analytics.ts`

---

## P2-01: Automated Quote Follow-Up

### Problem
Dave sends a quote, customer says "let me think about it," Dave forgets to follow up, loses 2-3 jobs/month (£400-600).

### User Stories
1. As Dave, after I send a quote, I want a task card to appear 48h later reminding me to follow up.
2. As Dave, I want the follow-up card to pre-fill a WhatsApp message so I can chase with one tap.
3. As Dave, I want to snooze a follow-up if the customer said "call me next week."
4. As Dave, I want to mark a quote as "customer responded" so the follow-up stops.

### Data Model Changes

**New Dexie table: `quote_follow_ups`** (schema v3)
```ts
export interface QuoteFollowUp {
  id: string;
  job_id: string;
  user_id: string;
  status: 'pending' | 'snoozed' | 'responded' | 'dismissed';
  first_nudge_at: string;      // ISO timestamp — when first follow-up should appear
  last_nudge_at?: string;      // last time a nudge was shown/acted on
  nudge_count: number;         // how many times nudged
  snooze_until?: string;       // ISO timestamp — when snooze expires
  snooze_reason?: string;      // optional note
  created_at: string;
  updated_at: string;
  _sync_status: SyncStatus;
}
```

**Dexie v3 schema addition:**
```ts
this.version(3).stores({
  quote_follow_ups: 'id, job_id, user_id, status, first_nudge_at, _sync_status',
});
```

**New WorkLogType additions:**
```ts
export type WorkLogType = '...' | 'quote_follow_up_sent' | 'quote_follow_up_snoozed' | 'quote_follow_up_responded';
```

### Implementation Steps

#### Step 1: Create follow-up engine (`src/lib/quoteFollowUp.ts`)
```ts
// Constants
const FOLLOW_UP_DELAY_HOURS = 48;
const MAX_NUDGES = 3;
const SNOOZE_OPTIONS = { '1d': 24*60*60*1000, '1w': 7*24*60*60*1000, '2w': 14*24*60*60*1000 };

// Create follow-up record when quote is sent
export async function createQuoteFollowUp(jobId: string, userId: string): Promise<void>

// Get all pending follow-ups that are due (first_nudge_at <= now, not snoozed)
export async function getDueQuoteFollowUps(userId: string): Promise<QuoteFollowUp[]>

// Snooze a follow-up
export async function snoozeFollowUp(id: string, duration: keyof typeof SNOOZE_OPTIONS, reason?: string): Promise<void>

// Mark as responded (stops all future nudges)
export async function markQuoteResponded(jobId: string): Promise<void>

// Dismiss permanently
export async function dismissFollowUp(id: string): Promise<void>
```

#### Step 2: Hook into quote send flow (`src/screens/Quote/QuoteSent.tsx`)
- After `captureQuoteSent()` is called, also call `createQuoteFollowUp(job.id, userId)`
- This fires once per quote send, not per re-send

#### Step 3: Add `quote_follow_up` TaskType to TaskCard system
- `src/components/TaskCard/index.tsx`: Add `'quote_follow_up'` to `TaskType` union
- Add config: `{ icon: <FileText size={16} />, label: 'Follow up quote', urgency: 'medium' }`
- Add to `TaskItem` interface in Home/index.tsx

#### Step 4: Generate task cards in Home screen
- In `src/screens/Home/index.tsx`, add a `useEffect` that calls `getDueQuoteFollowUps(userId)` on mount and on refresh
- Map each due follow-up to a `TaskItem` with `type: 'quote_follow_up'`, `isL2: false` (L3 layer)
- Tapping the card → open BottomSheet with:
  - Pre-filled WhatsApp message: "Hi {name}, just following up on the quote I sent ({date}). Happy to answer any questions. — {businessName}"
  - "Send via WhatsApp" button → `window.open(wa.me link)` + log `quote_follow_up_sent` work log + increment nudge_count
  - "Snooze" buttons: 1 day / 1 week / 2 weeks
  - "Mark as responded" button → `markQuoteResponded(jobId)`
  - "Dismiss" button → `dismissFollowUp(id)`

#### Step 5: Auto-detect customer response (best-effort)
- When a job transitions from `quoted` → `booked` (Dave taps "Mark as Booked"), automatically call `markQuoteResponded(jobId)` to clear any pending follow-up
- This handles the common case where the customer confirmed verbally

### UI/UX Design
- **Task card appearance**: Same as `stale_quote` but with a distinct label: "Follow up quote" + subtitle "Quote sent 2d ago · £{amount}"
- **Action sheet**: BottomSheet with 3 sections — Send / Snooze / Close
- **No push notification for v1**: Follow-ups appear as task cards only (same as stale quotes). Push notification integration is a Phase 2.5 enhancement.

### Edge Cases
| Case | Handling |
|------|----------|
| Customer responds on WhatsApp but Dave doesn't update the app | Follow-up card stays. Dave taps "Mark as responded" manually. |
| Dave sends quote to multiple contacts (landlord + tenant) | Follow-up tracks per-job, not per-recipient. One nudge per job. |
| Weekend — Dave doesn't work Sundays | First nudge_at calculates as 48h regardless of weekends. Dave can snooze. Configurable "skip Sundays" in Settings is a v2 enhancement. |
| Customer says "call me next month" | Snooze 2 weeks. Snooze reason optional. |
| Quote expires before follow-up | If `quote_expires_at` < now, change task card label to "Quote expired — resend or close" |
| Dave re-sends the same quote | Reset `nudge_count` to 0, update `first_nudge_at` to now + 48h. Don't create a duplicate follow-up record. |
| MAX_NUDGES reached (3) | Auto-dismiss the follow-up, log work_log entry "Follow-up abandoned after 3 attempts" |

### Analytics Events
```ts
export function captureQuoteFollowUpShown(data: { jobId: string; nudgeCount: number }) {
  capture('quote_follow_up_shown', data);
}
export function captureQuoteFollowUpSent(data: { jobId: string; nudgeCount: number; method: 'whatsapp' | 'sms' }) {
  capture('quote_follow_up_sent', data);
}
export function captureQuoteFollowUpSnoozed(data: { jobId: string; duration: string }) {
  capture('quote_follow_up_snoozed', data);
}
export function captureQuoteFollowUpResponded(data: { jobId: string }) {
  capture('quote_follow_up_responded', data);
}
```

### Testing Checklist
- [ ] Send a quote → follow-up record created with first_nudge_at = now + 48h
- [ ] Wait 48h (or mock time) → task card appears on Home screen L3
- [ ] Tap card → BottomSheet opens with pre-filled WhatsApp message
- [ ] Send WhatsApp → work_log entry created, nudge_count incremented
- [ ] Snooze 1 week → card disappears, reappears after 7 days
- [ ] Mark as responded → card disappears permanently
- [ ] Job transitions to "booked" → follow-up auto-cleared
- [ ] 3 nudges sent → follow-up auto-dismissed
- [ ] Offline: follow-up creation works (writes to Dexie, sync queue)
- [ ] Quote expires → card label changes to "Quote expired"

### Dependencies
- None — works entirely with existing Dexie + WhatsApp deep link infrastructure

---

## P2-02: Recurring / Repeat Job Reminders

### Problem
Dave services the same boiler annually for 12 customers. Half forget to call him. He loses £480+/year in repeat business.

### User Stories
1. As Dave, when I mark a job "Paid," I want to be asked if this is a recurring job.
2. As Dave, I want to set a reminder for "next year" or "6 months" with one tap.
3. As Dave, I want a task card 2 weeks before the recurrence is due.
4. As Dave, I want to see all upcoming recurring jobs in one list.
5. As Dave, I want to cancel or edit a recurrence if the customer moves or changes frequency.

### Data Model Changes

**New Dexie table: `recurring_jobs`** (schema v4)
```ts
export type RecurrenceInterval = 'monthly' | 'quarterly' | 'six_monthly' | 'annual';

export interface RecurringJob {
  id: string;
  user_id: string;
  original_job_id: string;      // the job that spawned this recurrence
  customer_id: string;
  title: string;                 // e.g. "Boiler service"
  address?: string;
  interval: RecurrenceInterval;
  next_due_at: string;           // ISO date — next expected date
  reminder_lead_days: number;    // default 14 (2 weeks before)
  status: 'active' | 'dormant' | 'cancelled';
  last_completed_at?: string;    // last time Dave did the job
  contact_attempts: number;      // times Dave tried to contact customer about this
  suggested_month?: number;      // 1-12, for seasonal jobs
  notes?: string;
  created_at: string;
  updated_at: string;
  _sync_status: SyncStatus;
}
```

**Dexie v4 schema:**
```ts
this.version(4).stores({
  recurring_jobs: 'id, user_id, customer_id, status, next_due_at, _sync_status',
});
```

### Implementation Steps

#### Step 1: Create recurrence engine (`src/lib/recurringJobs.ts`)
```ts
const LEAD_DAYS_DEFAULT = 14;
const DORMANT_THRESHOLD = 3; // contact_attempts >= 3 → dormant

export async function createRecurringJob(
  fromJob: Job, interval: RecurrenceInterval, options?: { suggestedMonth?: number }
): Promise<string>

export async function getUpcomingRecurringJobs(userId: string, withinDays?: number): Promise<RecurringJob[]>

export async function advanceRecurrence(id: string): Promise<void>
// Calculates next next_due_at based on interval from today

export async function cancelRecurrence(id: string, reason?: string): Promise<void>

export async function updateRecurrenceInterval(id: string, newInterval: RecurrenceInterval): Promise<void>

export async function incrementContactAttempt(id: string): Promise<void>
// If contact_attempts >= DORMANT_THRESHOLD, set status to 'dormant'

export async function reactivateDormant(id: string): Promise<void>
// Reset contact_attempts to 0, status to 'active'
```

**Interval calculation:**
```ts
function calculateNextDue(from: Date, interval: RecurrenceInterval): string {
  const next = new Date(from);
  switch (interval) {
    case 'monthly': next.setMonth(next.getMonth() + 1); break;
    case 'quarterly': next.setMonth(next.getMonth() + 3); break;
    case 'six_monthly': next.setMonth(next.getMonth() + 6); break;
    case 'annual': next.setFullYear(next.getFullYear() + 1); break;
  }
  return next.toISOString();
}
```

#### Step 2: Post-payment recurrence prompt
- In `src/screens/Home/index.tsx` (or `JobDetail`), after a job is marked "Paid," show a BottomSheet:
  - "Is this a recurring job?"
  - Options: One-off / Annual / 6-monthly / Quarterly / Monthly
  - Tapping any recurring option → `createRecurringJob(job, interval)`
  - Optional: "Suggested month" picker for seasonal jobs

#### Step 3: Add `recurring_reminder` TaskType
- `TaskCard/index.tsx`: Add `'recurring_reminder'` to TaskType
- Config: `{ icon: <Calendar size={16} />, label: 'Recurring job due', urgency: 'low' }`

#### Step 4: Generate recurring task cards in Home
- `useEffect` calls `getUpcomingRecurringJobs(userId, 14)` on mount
- Map to TaskItem: `type: 'recurring_reminder'`, `isL2: false` (L3)
- Tapping card → BottomSheet:
  - "Call {customerName}" → opens `tel:{phone}` deep link
  - "Send WhatsApp" → pre-filled: "Hi {name}, your {title} is due soon. Want me to book you in? — {businessName}"
  - "Mark as done" → advance recurrence to next cycle
  - "No response" → increment contact_attempt
  - "Cancel recurrence" → with reason prompt

#### Step 5: Upcoming recurring jobs list view
- Add a new section in Jobs screen or a filter: "Recurring"
- Shows all active recurring jobs sorted by `next_due_at`
- Each row: customer name, job title, next due date, interval badge

### UI/UX Design
- **Post-payment prompt**: Non-intrusive BottomSheet that appears after payment is recorded. Default to "One-off" so Dave can dismiss quickly.
- **Task card**: Green/left-border brand-mid (low urgency). Shows "Boiler service due in 12 days · Sarah · 12 High St"
- **Recurring list**: Simple list with interval badges (Annual/6mo/3mo/Monthly)

### Edge Cases
| Case | Handling |
|------|----------|
| Customer moves house | "Cancel recurrence" → prompt: "Ask for new address?" → if yes, cancel and create new recurrence with new address when Dave logs a job there |
| Seasonal work (boiler service = autumn) | `suggested_month` field. When advancing, if suggested_month is set, next_due_at targets that month rather than +12 months from now. |
| Customer changes frequency | `updateRecurrenceInterval(id, newInterval)` — recalculates next_due_at from today |
| 30+ recurring jobs | "Recurring" filter in Jobs list handles volume. Task cards only show for jobs due within 14 days. |
| No response after 2 contact attempts | After 3rd attempt, auto-move to "dormant" status. Dormant jobs don't generate task cards. Dave can reactivate. |
| Dave does the job but forgets to mark it in the app | Recurrence stays "active" with past due date. Next time Dave opens the app, the task card says "Overdue by X days" |
| Customer has multiple recurring jobs (boiler + gutter clear) | Separate recurring_job records per job type, same customer_id |
| Beauty vertical: 4-weekly nail refill | "Monthly" interval. Works the same. |

### Analytics Events
```ts
export function captureRecurringJobCreated(data: { interval: string; hasSuggestedMonth: boolean }) {
  capture('recurring_job_created', data);
}
export function captureRecurringReminderShown(data: { recurringId: string; daysUntilDue: number }) {
  capture('recurring_reminder_shown', data);
}
export function captureRecurringReminderActed(data: { recurringId: string; action: 'call' | 'whatsapp' | 'done' | 'no_response' | 'cancel' }) {
  capture('recurring_reminder_acted', data);
}
export function captureRecurringJobDormant(data: { recurringId: string }) {
  capture('recurring_job_dormant', data);
}
```

### Testing Checklist
- [ ] Mark job as paid → recurrence prompt appears
- [ ] Select "Annual" → recurring_job record created with next_due_at = +1 year
- [ ] Wait until 14 days before due → task card appears on Home
- [ ] Tap "Call" → tel: deep link opens
- [ ] Tap "Mark as done" → next_due_at advances by interval
- [ ] Tap "No response" 3 times → status becomes "dormant"
- [ ] Reactivate dormant job → contact_attempts reset to 0
- [ ] Cancel recurrence → status = "cancelled", no more task cards
- [ ] Suggested month set → next_due targets that month, not +12 months
- [ ] Offline: all operations write to Dexie + sync queue

### Dependencies
- None — uses existing Dexie + deep link infrastructure
- P2-07 (Customer Database) would enhance this by showing customer history, but is not a blocker

---

## P2-03: Overdue Payment Escalation Ladder

### Problem
Dave marks a job "Awaiting Payment," sends one reminder, gets no response, feels embarrassed to chase 3 months later, writes off £200-400, 3-4 times/year.

### User Stories
1. As Dave, I want overdue invoices to escalate automatically through gentle → firm → final stages.
2. As Dave, I want each stage to draft a WhatsApp message I can review before sending (not auto-send).
3. As Dave, I want to pause the escalation if the customer is disputing or needs more time.
4. As Dave, I want to see the total amount overdue across all jobs in one place.

### Data Model Changes

**New Dexie table: `payment_chases`** (schema v5)
```ts
export type ChaseStage = 'gentle' | 'firm' | 'final' | 'small_claims';

export interface PaymentChase {
  id: string;
  job_id: string;
  user_id: string;
  stage: ChaseStage;
  due_at: string;              // when this stage should activate
  sent_at?: string;            // when Dave actually sent the message
  status: 'pending' | 'sent' | 'paused' | 'resolved';
  pause_reason?: string;
  message_method?: 'whatsapp' | 'sms';
  created_at: string;
  updated_at: string;
  _sync_status: SyncStatus;
}
```

**Dexie v5 schema:**
```ts
this.version(5).stores({
  payment_chases: 'id, job_id, user_id, stage, status, due_at, _sync_status',
});
```

**Escalation schedule:**
| Stage | Trigger | Message Tone |
|-------|---------|--------------|
| gentle | 7 days overdue | Friendly reminder, offer payment timing |
| firm | 14 days overdue | Firmer, offer payment plan |
| final | 30 days overdue | Final reminder, mention small claims |
| small_claims | 60 days overdue | Task card only — "Consider small claims court for £{amount}" |

### Implementation Steps

#### Step 1: Create escalation engine (`src/lib/paymentChase.ts`)
```ts
const STAGE_SCHEDULE = {
  gentle: 7 * 24 * 60 * 60 * 1000,      // 7 days
  firm: 14 * 24 * 60 * 60 * 1000,       // 14 days
  final: 30 * 24 * 60 * 60 * 1000,      // 30 days
  small_claims: 60 * 24 * 60 * 60 * 1000, // 60 days
};

const STAGE_MESSAGES = {
  gentle: (name: string, amount: string) =>
    `Hi ${name}, just a friendly reminder about the £${amount} for the work completed. Let me know if you need to talk about payment timing. — {businessName}`,
  firm: (name: string, amount: string) =>
    `Hi ${name}, the balance of £${amount} is now 2 weeks overdue. Happy to set up a payment plan if that helps. — {businessName}`,
  final: (name: string, amount: string) =>
    `Hi ${name}, the balance of £${amount} is now 30 days overdue. This is my final reminder before I consider further action. Please get in touch to arrange payment. — {businessName}`,
  small_claims: null, // Task card only, no message template
};

// Create chase records when invoice is sent (job → awaiting_payment)
export async function createPaymentChases(jobId: string, userId: string, invoiceSentAt: string): Promise<void>
// Creates 4 chase records with escalating due_at timestamps

export async function getDuePaymentChases(userId: string): Promise<PaymentChase[]>
// Returns all chases where status='pending' and due_at <= now

export async function markChaseSent(id: string, method: 'whatsapp' | 'sms'): Promise<void>

export async function pauseChase(jobId: string, reason: string): Promise<void>
// Pauses ALL pending chases for this job

export async function resumeChase(jobId: string): Promise<void>

export async function resolveChases(jobId: string): Promise<void>
// Called when job → paid. Sets all chases to 'resolved'.
```

#### Step 2: Hook into invoice creation
- In `Home/index.tsx` or `JobDetail/index.tsx`, when a job transitions to `awaiting_payment` and `invoice_sent_at` is set, call `createPaymentChases(job.id, userId, job.invoice_sent_at)`
- Also hook into `autoCompleteJob()` in `jobStaleness.ts` — it sets `invoice_sent_at`

#### Step 3: Add `payment_chase` TaskType
- TaskCard: `{ icon: <Banknote size={16} />, label: 'Chase payment', urgency: 'high' }` for final/small_claims
- For gentle/firm: urgency = 'medium'
- The existing `chase` and `overdue` TaskTypes handle basic payment reminders. The new `payment_chase` type replaces them with the escalation system.

#### Step 4: Generate escalation task cards in Home
- `useEffect` calls `getDuePaymentChases(userId)` on mount
- Map to TaskItem with `type: 'payment_chase'`, urgency based on stage
- Tapping card → BottomSheet:
  - **gentle/firm/final stages**: Show pre-drafted WhatsApp message (from STAGE_MESSAGES)
  - "Send via WhatsApp" → `window.open(wa.me link)` + `markChaseSent(id, 'whatsapp')`
  - "Send via SMS" → `window.open(sms: link)` + `markChaseSent(id, 'sms')`
  - "Pause chase" → prompt for reason, `pauseChase(jobId, reason)`
  - **small_claims stage**: No message. Task card text: "£{amount} — 60 days overdue. Consider small claims court (MONEYCLAIMONLINE)." + "Mark as resolved" or "Write off"

#### Step 5: Update existing chase/overdue flags
- The existing `chase_Xd` and `overdue_Xd` flags (from FlagBadge) should be deprecated in favor of the escalation system
- Or: keep flags as visual indicators on job cards, but use the escalation system for active task card generation
- **Decision:** Keep flags as passive indicators. Use escalation system for active task cards. They complement, not replace.

### UI/UX Design
- **gentle stage**: Amber border task card, "Payment reminder · 7 days" subtitle
- **firm stage**: Amber border, "Payment overdue · 14 days" subtitle
- **final stage**: Red border (high urgency), "Final reminder · 30 days" subtitle
- **small_claims stage**: Red border, "60 days overdue · £{amount}" — no WhatsApp button, just "Write off" or "Mark resolved"
- **Pause flow**: Simple BottomSheet with reason text input + "Pause all reminders for this job"

### Edge Cases
| Case | Handling |
|------|----------|
| Customer disputes the invoice | "Pause chase" with reason "dispute." Chases stay paused until Dave taps "Resume." |
| Partial payment | When Dave records a partial payment, recalculate: if amountDue < original, update all pending chase messages to show remaining balance, not original. If amountDue = 0, resolve all chases. |
| Customer is a landlord with multiple jobs | Chases are per-job, not per-customer. A landlord being chased for one job doesn't affect another job's chases. |
| Dave doesn't want auto-drafts | All chases are "draft for review" by default. Dave taps to review → then sends. Configurable "auto-send" toggle in Settings (default OFF). |
| WhatsApp delivery failure | SMS fallback. If both fail, log a work_log entry "Chase message failed to send." Dave can call manually. |
| Customer responds to a reminder | Dave manually taps "Pause chase" → reason "customer responded." The escalation stops. |
| Job is written off | `resolveChases(jobId)` called → all pending chases set to 'resolved'. |
| Multiple chases due at once | Task cards stack in L2 layer, sorted by overdue amount descending (biggest financial risk first). |
| Invoice sent_at is null (cash job marked awaiting_payment) | Use `actual_end` date as the baseline for escalation timing instead of `invoice_sent_at`. |

### Analytics Events
```ts
export function capturePaymentChaseShown(data: { jobId: string; stage: ChaseStage; amount: number }) {
  capture('payment_chase_shown', data);
}
export function capturePaymentChaseSent(data: { jobId: string; stage: ChaseStage; method: 'whatsapp' | 'sms' }) {
  capture('payment_chase_sent', data);
}
export function capturePaymentChasePaused(data: { jobId: string; reason: string }) {
  capture('payment_chase_paused', data);
}
export function capturePaymentChaseResolved(data: { jobId: string; stage: ChaseStage }) {
  capture('payment_chase_resolved', data);
}
export function capturePaymentWrittenOff(data: { jobId: string; amount: number; daysOverdue: number }) {
  capture('payment_written_off', data);
}
```

### Testing Checklist
- [ ] Job → awaiting_payment with invoice_sent_at → 4 chase records created
- [ ] 7 days later → gentle chase task card appears
- [ ] Send WhatsApp → chase marked 'sent', next stage (firm) due in 7 more days
- [ ] 14 days → firm chase appears (if gentle was sent) OR both appear (if gentle was ignored)
- [ ] Pause chase → all pending chases for job set to 'paused'
- [ ] Resume chase → chases reactivate from current stage
- [ ] Job → paid → all chases resolved
- [ ] Job → written_off → all chases resolved
- [ ] Partial payment → chase messages show remaining balance
- [ ] small_claims stage → no WhatsApp button, only "Write off" / "Mark resolved"
- [ ] Offline: all operations work via Dexie + sync queue

### Dependencies
- None — uses existing Dexie + WhatsApp/SMS deep link infrastructure
- P2-07 (Customer Database) would improve customer context but is not a blocker

---

## P2-04: Deposit Collection at Booking

### Problem
Customer cancels day-before. Dave has no deposit. He lost the slot + bought materials. Also: beauty vertical requires deposits as a core booking mechanic, not an add-on.

### User Stories
1. As Dave, when I mark a job "Booked," I want to optionally take a deposit.
2. As Dave, I want to generate a Stripe payment link and send it via WhatsApp.
3. As Dave, I want the app to show whether the deposit has been paid.
4. As Dave, if the customer cancels, I want to retain/refund the deposit based on policy.
5. As Sophie (beauty), I want deposits to be mandatory for all bookings, not optional.

### Data Model Changes

**Job interface additions:**
```ts
// Add to existing Job interface
deposit_amount?: number;           // calculated deposit amount
deposit_status?: 'none' | 'requested' | 'partial' | 'paid' | 'refunded';
deposit_stripe_link_id?: string;   // Stripe payment link ID
deposit_stripe_url?: string;       // Stripe payment URL
deposit_requested_at?: string;     // when link was sent
deposit_paid_at?: string;          // when payment was confirmed
deposit_refunded_at?: string;      // when refund was processed
```

**Payment interface additions:**
```ts
// Add to existing Payment interface
stripe_payment_intent_id?: string; // Stripe PI ID for online payments
```

**New Supabase table: `stripe_payment_links`** (server-side, for webhook → job matching)
```sql
CREATE TABLE stripe_payment_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  job_id TEXT NOT NULL,
  stripe_link_id TEXT,
  stripe_url TEXT,
  amount INTEGER NOT NULL,          // in pence
  status TEXT DEFAULT 'pending',    -- pending, paid, expired, refunded
  created_at TIMESTAMPTZ DEFAULT now(),
  paid_at TIMESTAMPTZ,
  refunded_at TIMESTAMPTZ
);
```

### Implementation Steps

#### Step 1: Stripe backend setup
- **Supabase Edge Function: `create-deposit-link`**
  - Input: `job_id`, `amount` (in pence), `user_id`
  - Creates Stripe Payment Link via Stripe API
  - Saves to `stripe_payment_links` table
  - Returns: `{ url, stripe_link_id }`
- **Supabase Edge Function: `stripe-webhook`**
  - Receives `checkout.session.completed` webhook from Stripe
  - Updates `stripe_payment_links.status = 'paid'`
  - Triggers a Supabase Realtime event or push notification to the app
  - The app's sync layer picks up the status change on next sync

#### Step 2: Deposit UI at booking
- In `Home/index.tsx` or `JobDetail/index.tsx`, when Dave taps "Mark as Booked":
  - Show BottomSheet: "Take a deposit for this job?"
  - Options: "No deposit" / "£50" / "£100" / "Custom amount"
  - Percentage option: "10%" / "25%" / "Custom %"
  - If deposit selected → call `create-deposit-link` edge function
  - On success → show WhatsApp deep link with message: "Hi {name}, your booking is confirmed for {date}. Please pay the £{amount} deposit here: {stripe_url}. — {businessName}"
  - Update job: `deposit_status = 'requested'`, `deposit_stripe_url = url`

#### Step 3: Deposit status tracking
- On app open / sync, check `stripe_payment_links` table for status changes
- If status changed to 'paid' → update Job: `deposit_status = 'paid'`, `deposit_paid_at = now`
- Add a deposit badge to JobCard: "Deposit paid ✓" (green) or "Deposit pending" (amber)
- Add to Payment table: `type: 'deposit', method: 'other', method_description: 'Stripe'`

#### Step 4: Refund flow
- In JobDetail, if `deposit_status === 'paid'`:
  - Show "Refund deposit" button
  - Calls Supabase Edge Function `refund-deposit` → Stripe refund API
  - Updates `deposit_status = 'refunded'`, `deposit_refunded_at = now`

#### Step 5: Cancellation policy display
- When deposit link is generated, include a policy line in the WhatsApp message:
  - "Deposit is non-refundable for cancellations within 24 hours of the appointment."
- Configurable in Settings: "Deposit policy text" (default template provided)
- Beauty vertical: "Cancellation within 48 hours forfeits deposit."

#### Step 6: Beauty vertical deposit enforcement
- In Settings, add a toggle: "Require deposit for all bookings" (default OFF for trades, ON for beauty)
- When ON, the "Mark as Booked" flow requires a deposit — "No deposit" option shows a warning: "No deposit held — no cancellation protection"

### UI/UX Design
- **Booking BottomSheet**: Clean amount picker with quick-select buttons (£50/£100/custom/%)
- **Deposit badge on JobCard**: Small green checkmark + "Deposit" or amber clock + "Deposit pending"
- **Job Detail**: Deposit section showing amount, status, payment link, refund button
- **Stripe checkout**: Hosted Stripe page (no custom UI needed for v1)

### Edge Cases
| Case | Handling |
|------|----------|
| Customer doesn't have a card / prefers cash | "Mark deposit as cash received" manual option. Skips Stripe. Records Payment with `method: 'cash'`. |
| Customer refuses to pay deposit | Dave can skip. App shows warning: "No deposit held — no cancellation protection." For beauty (enforced), skipping shows a harder warning. |
| Deposit amount vs total | Configurable: fixed amount, percentage, or custom. No validation against total (Dave might take £50 deposit on a £800 job). |
| Refund processing | Only available if `deposit_status === 'paid'`. Refund via Stripe API. Updates job + payment records. |
| Partial deposit (customer pays £50 of £100) | Stripe payment links don't support partial payments. If Dave needs partial, he creates a new link for the remaining amount. Track via Payment records. |
| Stripe webhook delay | App shows "Deposit pending" until webhook confirms. Dave can manually mark "Deposit received" if customer shows payment confirmation. |
| Stripe link expires | Payment links expire after 24h by default. Configurable. If expired, Dave can generate a new link. |
| Beauty: deposit as core mechanic | "Require deposit" setting ON. Booking flow forces deposit selection. No "skip" option without override. |
| Offline: can't generate Stripe link | Queue the deposit request. When online, generate and send. Show "Deposit link queued" status. |
| Currency | UK only → GBP. No multi-currency needed for v1. |

### Analytics Events
```ts
export function captureDepositRequested(data: { jobId: string; amount: number; method: 'stripe' | 'cash' }) {
  capture('deposit_requested', data);
}
export function captureDepositPaid(data: { jobId: string; amount: number; source: 'webhook' | 'manual' }) {
  capture('deposit_paid', data);
}
export function captureDepositRefunded(data: { jobId: string; amount: number }) {
  capture('deposit_refunded', data);
}
export function captureDepositSkipped(data: { jobId: string; isEnforced: boolean }) {
  capture('deposit_skipped', data);
}
```

### Testing Checklist
- [ ] Mark job as booked → deposit prompt appears
- [ ] Select £100 → Stripe link generated → WhatsApp message with link
- [ ] Customer pays via Stripe → webhook → app shows "Deposit paid ✓"
- [ ] Manually mark deposit as cash → Payment record created
- [ ] Refund deposit → Stripe refund processed → status = 'refunded'
- [ ] Beauty mode: "Require deposit" ON → can't skip deposit without override
- [ ] Deposit link expired → generate new link
- [ ] Offline: deposit request queued, generated when online
- [ ] Job cancelled with deposit paid → deposit retained (or refunded per policy)
- [ ] Sync: deposit status syncs between Dexie and Supabase

### Dependencies
- **Stripe account** — Dave needs a Stripe account (or Buildlogg provides a platform-level Stripe Connect account)
- **Supabase Edge Functions** — 2 new functions (create-deposit-link, stripe-webhook)
- **Stripe webhook setup** — configure webhook endpoint in Stripe dashboard
- **GTM §4 caveat**: "Payment integration is deprioritised until core PMF is established." This feature is the minimal viable payment integration — deposit only, not full payment processing. It should be built for the beauty vertical launch, not for trades alone.

---

## P2-05: PDF Quote & Invoice Generation

### Problem
WhatsApp text quotes look amateur. Customers (especially landlords, businesses) ask for a "proper PDF." Dave loses jobs to competitors who send professional documents.

### User Stories
1. As Dave, I want to generate a branded PDF quote alongside the existing WhatsApp text option.
2. As Dave, I want the PDF to include my business name, logo (Pro), quote number, itemised breakdown, and T&Cs.
3. As Dave, I want to generate a PDF invoice with payment details and due date.
4. As Dave, I want to share the PDF via WhatsApp, Files, or AirDrop.

### Data Model Changes

**Profile interface additions:**
```ts
// Add to existing Profile interface
logo_data_url?: string;           // base64 logo (Pro tier)
vat_registered?: boolean;
vat_number?: string;
terms_and_conditions?: string;    // default T&Cs text
bank_name?: string;
bank_account_name?: string;
bank_account_number?: string;     // last 4 only for display
bank_sort_code?: string;
```

**New Dexie table: `generated_documents`** (schema v6)
```ts
export type DocumentType = 'quote' | 'invoice';

export interface GeneratedDocument {
  id: string;
  job_id: string;
  user_id: string;
  type: DocumentType;
  version: number;                // 1, 2, 3... (revisions)
  blob_key: string;               // key in IndexedDB blob storage
  file_name: string;
  created_at: string;
  _sync_status: SyncStatus;
}
```

**Dexie v6 schema:**
```ts
this.version(6).stores({
  generated_documents: 'id, job_id, user_id, type, created_at, _sync_status',
});
```

### Implementation Steps

#### Step 1: Install PDF library
```bash
npm install jspdf jspdf-autotable
```

#### Step 2: Create PDF generator (`src/lib/pdfGenerator.ts`)
```ts
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface QuotePDFData {
  profile: Profile;
  customer: Customer;
  job: Job;
  lineItems: LineItem[];
  total: number;
  validUntil: string;
  isPro: boolean;
}

export function generateQuotePDF(data: QuotePDFData): Blob {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  // Header: business name, logo (if Pro), quote number, date
  // Customer block: name, address
  // Line items table: description, detail, amount
  // Total
  // T&Cs
  // Footer: "Powered by Buildlogg" (Free) or nothing (Pro)
  // If VAT registered: VAT breakdown
  return doc.output('blob');
}

export function generateInvoicePDF(data: InvoicePDFData): Blob {
  // Similar layout but with:
  // Invoice number, invoice date, due date
  // Payment details (bank transfer info)
  // Outstanding balance (deposit paid → remaining)
}
```

#### Step 3: PDF preview & share screen (`src/screens/Quote/PDFPreview.tsx`)
- New screen accessible from QuotePreview: "Share as PDF" button alongside WhatsApp/SMS
- Shows PDF in an `<iframe>` or `<embed>` for preview
- Share options:
  - "Share via WhatsApp" → convert blob to data URL, use `navigator.share()` if available, otherwise download + manual share
  - "Download" → save to device
  - "AirDrop" → `navigator.share()` with files API

#### Step 4: Hook into Quote Preview
- In `src/screens/Quote/QuotePreview.tsx`, add a third button in the send sheet:
  - "WhatsApp" (existing)
  - "SMS" (existing)
  - "PDF" (new) → generates PDF → navigates to PDFPreview

#### Step 5: Invoice PDF from JobDetail
- In `JobDetail/index.tsx`, when job status is `awaiting_payment`:
  - Add "Send Invoice PDF" button
  - Generates invoice PDF with payment details
  - Share via same mechanism

#### Step 6: Logo upload in Settings
- In `src/screens/Settings/index.tsx`:
  - "Business Logo" section (Pro tier gate)
  - File input → resize/compress to max 200x200px → store as base64 in Profile
  - Preview of how logo appears on PDF

### UI/UX Design
- **PDF template**: Clean, minimal, A4. White background, black text, brand-colour accents.
- **Free tier**: Footer "Powered by Buildlogg" (small, grey)
- **Pro tier**: No footer, Dave's logo in header
- **Quote PDF**: Title "QUOTE" + quote number, itemised table, total, "Valid for 30 days"
- **Invoice PDF**: Title "INVOICE" + invoice number, itemised table, total, payment details, "Due in 7 days"
- **VAT**: If `vat_registered`, show "Subtotal / VAT (20%) / Total" and VAT number

### Edge Cases
| Case | Handling |
|------|----------|
| No logo (Free tier) | Clean template with "Powered by Buildlogg" footer |
| Quote modified after PDF sent | Generate new PDF with "Revised Quote v2" label. Don't overwrite original. Store as new GeneratedDocument with incremented version. |
| Customer wants invoice, not quote | Separate invoice template with payment details, due date |
| VAT-registered tradesperson | Show VAT breakdown + VAT number on PDF |
| Large quotes (20+ line items) | jsPDF autoTable handles pagination automatically. Summary on first page. |
| Dark mode app | PDF is always light-mode (white background) regardless of app theme |
| Offline | PDF generation is client-side (jsPDF). No server needed. Works offline. |
| File sharing on iOS vs Android | `navigator.share()` with files is supported on iOS 13+ and Android. Fallback: download file. |
| Customer can't open PDF | Extremely rare. Fallback: the WhatsApp text quote still exists as the default send method. PDF is an enhancement. |
| Receipt for cash payment | Generate a "Receipt" PDF when cash payment is recorded. (Future enhancement, not v1.) |

### Analytics Events
```ts
export function capturePDFGenerated(data: { jobId: string; type: 'quote' | 'invoice'; isPro: boolean; hasLogo: boolean }) {
  capture('pdf_generated', data);
}
export function capturePDFShared(data: { jobId: string; type: 'quote' | 'invoice'; method: 'whatsapp' | 'download' | 'share' }) {
  capture('pdf_shared', data);
}
```

### Testing Checklist
- [ ] Generate quote PDF → correct layout, line items, total
- [ ] Generate invoice PDF → includes payment details, due date
- [ ] Free tier → "Powered by Buildlogg" footer present
- [ ] Pro tier → logo in header, no footer
- [ ] VAT registered → VAT breakdown shown
- [ ] 20+ line items → pagination works
- [ ] Revised quote → v2 label, original preserved
- [ ] Share via WhatsApp → file sends correctly
- [ ] Download → file saves to device
- [ ] Offline → PDF generates without network
- [ ] Dark mode → PDF is always light-mode

### Dependencies
- `jspdf` + `jspdf-autotable` npm packages
- `navigator.share()` API for file sharing (or download fallback)
- Pro tier gating (logo upload is Pro-only)

---

## P2-06: Smart Scheduling & Calendar View

### Problem
Dave double-books himself. Drives 40 minutes to a job only to find he's already booked that morning. No time conflict detection in the MVP.

### User Stories
1. As Dave, I want a week view calendar showing all scheduled jobs.
2. As Dave, when I book a new job, I want conflict detection: "You already have a job at 10am in Manchester."
3. As Dave, I want to drag jobs to reschedule them.
4. As Dave, I want unscheduled jobs in a sidebar so I can slot them in.

### Data Model Changes

No new tables — uses existing `jobs` table with `scheduled_start` and `scheduled_end` fields.

**New utility: `src/lib/scheduling.ts`**
```ts
export interface SchedulingConflict {
  job: Job;
  conflictType: 'overlap' | 'back_to_back' | 'travel_time';
  message: string;
}

export async function detectConflicts(
  userId: string,
  newStart: string,
  newEnd: string,
  excludeJobId?: string
): Promise<SchedulingConflict[]>

export async function getJobsForDateRange(
  userId: string,
  startDate: string,
  endDate: string
): Promise<Job[]>

export function groupUnscheduledJobs(jobs: Job[]): Job[]
// Jobs with no scheduled_start
```

### Implementation Steps

#### Step 1: Create scheduling utilities (`src/lib/scheduling.ts`)
- `detectConflicts()` — query Dexie for jobs on the same date, check for time overlaps
- `getJobsForDateRange()` — query Dexie for jobs where `scheduled_start` falls within range
- Conflict detection logic:
  - **Overlap**: new job's time range intersects an existing job's time range
  - **Back-to-back**: new job ends < 15 min before another starts (tight scheduling warning)
  - **Travel time**: if two jobs are on the same day with < 30 min gap (rough heuristic — no maps API for v1)

#### Step 2: Install calendar component
```bash
npm install react-big-calendar moment
# or build custom (lighter weight for mobile)
```
**Decision:** Build custom — react-big-calendar is desktop-oriented. A mobile-first week/day view is better custom-built with flexbox.

#### Step 3: Create Calendar screen (`src/screens/Calendar/index.tsx`)
- **Week view**: 7 columns (Mon-Sun), jobs plotted as blocks by time
- **Day view**: single column with hour grid, jobs as timed blocks
- **Unscheduled sidebar**: horizontal scroll strip of jobs with no scheduled_start
- Tap a job block → navigate to JobDetail
- Drag a job block → update `scheduled_start`/`scheduled_end` + sync queue
- Long-press → BottomSheet: "Reschedule" / "Cancel" / "Add to calendar" (ICS export)

#### Step 4: Conflict detection at booking
- When Dave taps "Mark as Booked" and sets a date/time:
  - Call `detectConflicts(userId, newStart, newEnd, currentJobId)`
  - If conflicts found → show warning BottomSheet:
    - "You already have a job at 10am (Boiler repair · John Smith). This one is 45 min drive away. Keep both?"
    - "Keep both" / "Reschedule new job" / "Cancel new booking"
  - If no conflicts → proceed as normal

#### Step 5: Add Calendar tab to TabBar
- Add a "Calendar" tab between "Home" and "Jobs"
- Lucide icon: `Calendar`

### UI/UX Design
- **Week view**: Compact day columns, job blocks coloured by status (booked = brand-blue, in_progress = amber, paid = green)
- **Day view**: Hour grid (8am-6pm default, configurable), jobs as blocks
- **Unscheduled strip**: Horizontal scroll of small job cards at bottom
- **Drag to reschedule**: Touch and drag vertically to change time, horizontally to change day
- **Conflict warning**: Red-bordered BottomSheet with conflict details

### Edge Cases
| Case | Handling |
|------|----------|
| No scheduled time (many jobs are "sometime Tuesday") | Jobs without scheduled_start appear in "Unscheduled" strip. Dave can drag them onto the calendar to assign a time. |
| Customer changes time on the morning of | Drag to move. App sends "Your appointment has been moved to 2pm" WhatsApp automatically if "Auto-notify on reschedule" is enabled in Settings (default OFF). |
| All-day jobs | Show as full-day block spanning the column. |
| Multi-day jobs (bathroom refit = 3 days) | Span across multiple days in the week view. Show start/end indicators. |
| 10+ jobs per day | Day view handles it — blocks stack. If too many, show "+3 more" at the bottom. |
| Beauty: precise appointment slots | Same mechanism — `scheduled_start` and `scheduled_end` are precise times. Calendar view naturally handles this. |
| Drag-and-drop on mobile | Use touch events (onTouchStart, onTouchMove, onTouchEnd). Calculate new time from Y position. Snap to 15-min intervals. |
| Past jobs | Greyed out in calendar view. Can't drag to reschedule past jobs. |

### Analytics Events
```ts
export function captureCalendarViewed(view: 'week' | 'day') {
  capture('calendar_viewed', { view });
}
export function captureJobRescheduled(data: { jobId: string; fromSchedule: boolean }) {
  capture('job_rescheduled', data);
}
export function captureConflictDetected(data: { jobId: string; conflictCount: number; action: 'keep_both' | 'reschedule' | 'cancel' }) {
  capture('conflict_detected', data);
}
export function captureUnscheduledAssigned(data: { jobId: string }) {
  capture('unscheduled_assigned', data);
}
```

### Testing Checklist
- [ ] Open Calendar → week view shows scheduled jobs
- [ ] Tap day → day view with hour grid
- [ ] Tap job block → navigate to JobDetail
- [ ] Drag job → time updates + sync queue
- [ ] Book new job with overlapping time → conflict warning appears
- [ ] "Keep both" → both jobs stay scheduled
- [ ] Unscheduled jobs appear in horizontal strip
- [ ] Drag unscheduled job onto calendar → scheduled_start set
- [ ] Multi-day job spans multiple columns
- [ ] Past jobs are greyed, can't be dragged
- [ ] Offline: calendar loads from Dexie, drag updates work offline

### Dependencies
- Custom calendar component (no npm dependency — build with flexbox + touch events)
- Existing `scheduled_start` / `scheduled_end` fields in Job interface
- Existing ICS export (`calendar.ts`) for "Add to phone calendar"

---

## P2-07: Customer Database & History

### Problem
Dave gets a call from "John" — doesn't remember which John. Has to ask "which property?" Looks unprofessional. Can't check last service date without scrolling WhatsApp.

### User Stories
1. As Dave, when I type a customer name in the quote builder, I want autocomplete from my customer database.
2. As Dave, I want to see all past jobs, quotes, payments, and notes for a customer in one view.
3. As Dave, I want to see total spent, outstanding balance, and recurring jobs per customer.
4. As Dave, I want to merge duplicate customer entries.

### Data Model Changes

The `customers` table already exists in Dexie v1. The MVP uses it per-job but doesn't have a proper customer directory UI.

**Customer interface additions:**
```ts
// Add to existing Customer interface
email?: string;
business_name?: string;           // for B2B customers (landlords)
notes?: string;                   // general notes about the customer
is_archived?: boolean;
merged_into?: string;             // ID of the customer this was merged into
```

### Implementation Steps

#### Step 1: Create customer helpers (`src/lib/customers.ts`)
```ts
export async function searchCustomers(userId: string, query: string): Promise<Customer[]>
// Fuzzy search on name, phone, address, business_name

export async function getCustomerStats(customerId: string): Promise<CustomerStats>
// Returns: totalSpent, outstandingBalance, jobCount, lastJobDate, recurringJobs

export async function getCustomerJobs(customerId: string): Promise<Job[]>
// All jobs for this customer, sorted by created_at desc

export async function getCustomerPayments(customerId: string): Promise<Payment[]>
// All payments across all jobs for this customer

export async function mergeCustomers(sourceId: string, targetId: string): Promise<void>
// Moves all jobs from source to target, marks source as merged

export async function archiveCustomer(id: string): Promise<void>
```

#### Step 2: Customer directory screen (`src/screens/Customers/index.tsx`)
- New tab in TabBar: "Customers" (Lucide: `Users`)
- Search bar at top
- List of customers sorted by most recent job
- Each row: name, phone, address, job count, last job date, outstanding badge
- Tap → navigate to Customer Detail

#### Step 3: Customer detail screen (`src/screens/Customers/CustomerDetail.tsx`)
- **Header**: Name, phone (tap to call), address (tap to open maps)
- **Stats cards**: Total spent, outstanding, jobs completed, recurring jobs
- **Job history**: Chronological list of all jobs with status badges and amounts
- **Payment history**: All payments recorded across jobs
- **Notes**: General notes about the customer (editable)
- **Actions**: "New quote" / "New job" / "Merge with another customer" / "Archive"

#### Step 4: Autocomplete in quote builder
- In `src/screens/Quote/QuoteBuilder.tsx` (or `LogMissedCall.tsx`):
  - When typing customer name, debounce 300ms → `searchCustomers(userId, query)`
  - Show dropdown of matches: "John Smith — 12 High St, Didsbury — 3 past jobs"
  - Tapping a match → fill name, phone, address from existing customer record
  - If no match → create new customer (existing behavior)

#### Step 5: Merge flow
- In CustomerDetail: "Merge with another customer" → search for target customer → confirm
- `mergeCustomers(sourceId, targetId)`:
  - Update all jobs where `customer_id = sourceId` → `customer_id = targetId`
  - Mark source customer: `merged_into = targetId, is_archived = true`
  - Add sync queue entries for all updated jobs

### UI/UX Design
- **Customer list**: Clean rows, search bar with instant results, outstanding badge (red dot with amount)
- **Customer detail**: Stats cards at top, then chronological job list (reuse JobCard component)
- **Autocomplete dropdown**: Appears below name field in quote builder, semi-transparent backdrop

### Edge Cases
| Case | Handling |
|------|----------|
| Two customers named "John Smith" | Disambiguate by address + phone in search results. "John Smith — 12 High St" vs "John Smith — 45 Park Rd" |
| Customer changes address | Update address field. Job history stays linked to customer, not address. Old jobs show old address in their own data. |
| Customer with multiple properties (landlord) | One customer record, multiple job addresses. Each job has its own address. Customer record has primary address. |
| Business customers | `business_name` field. Display "ABC Properties (contact: John)" in list. |
| Customer not seen in 2 years | Archive. Archived customers don't appear in search by default but can be found with "Show archived" toggle. GDPR: keep for tax records. |
| Merge duplicates | Source customer is archived (not deleted). All jobs reassigned. No data loss. |
| Customer created without phone | Phone is optional. They appear in the list but can't be called from the app. |
| Customer referenced in a recurring job | If customer is archived, recurring jobs for that customer are also cancelled. |

### Analytics Events
```ts
export function captureCustomerSearched(data: { resultCount: number }) {
  capture('customer_searched', data);
}
export function captureCustomerSelected(data: { customerId: string; jobCount: number }) {
  capture('customer_selected', data);
}
export function captureCustomerDetailViewed(data: { customerId: string }) {
  capture('customer_detail_viewed', data);
}
export function captureCustomersMerged(data: { sourceJobCount: number }) {
  capture('customers_merged', data);
}
```

### Testing Checklist
- [ ] Search "John" → all Johns appear with addresses
- [ ] Tap customer → detail shows stats, job history, payment history
- [ ] Type name in quote builder → autocomplete appears
- [ ] Select existing customer → name/phone/address auto-filled
- [ ] Merge two customers → all jobs reassigned, source archived
- [ ] Archive customer → disappears from default search
- [ ] "Show archived" → archived customers appear
- [ ] Customer with no phone → appears in list, no call button
- [ | Offline: all operations work via Dexie + sync queue

### Dependencies
- Existing `customers` table in Dexie
- Existing `jobs.customer_id` foreign key
- No new external dependencies

---

## P2-08: Customisable Message Templates

### Problem
Dave types the same WhatsApp messages daily. Each time from memory. Sometimes forgets details, tone varies.

### User Stories
1. As Dave, I want 5 default message templates I can edit.
2. As Dave, I want templates to auto-fill with job data ({firstName}, {date}, {amount}).
3. As Dave, I want to pick a template when sending a message from a job.

### Data Model Changes

**New Dexie table: `message_templates`** (schema v7)
```ts
export type TemplateCategory = 'booking' | 'reminder' | 'invoice' | 'follow_up' | 'review' | 'custom';

export interface MessageTemplate {
  id: string;
  user_id: string;
  category: TemplateCategory;
  name: string;                   // e.g. "Booking confirmation"
  body: string;                   // with {placeholders}
  is_default: boolean;            // true for the 5 system defaults
  sort_order: number;
  created_at: string;
  updated_at: string;
  _sync_status: SyncStatus;
}
```

**Dexie v7 schema:**
```ts
this.version(7).stores({
  message_templates: 'id, user_id, category, [user_id+sort_order], _sync_status',
});
```

**Placeholder system:**
```ts
const PLACEHOLDERS = {
  '{firstName}': (job, customer) => customer.name.split(' ')[0],
  '{lastName}': (job, customer) => customer.name.split(' ').slice(1).join(' '),
  '{jobTitle}': (job) => job.title,
  '{date}': (job) => job.scheduled_start ? formatDate(job.scheduled_start) : '[date not set]',
  '{time}': (job) => job.scheduled_start ? formatTime(job.scheduled_start) : '[time not set]',
  '{address}': (job, customer) => customer.address || '[no address]',
  '{amount}': (job, _, total) => formatAmount(total),
  '{businessName}': (job, customer, _, profile) => profile.business_name || profile.full_name,
  '{jobNumber}': (job) => job.job_number || '',
};
```

### Implementation Steps

#### Step 1: Seed default templates on first login
- In Auth screen, after profile creation, seed 5 default templates:
  1. **Booking confirmation**: "Hi {firstName}, your {jobTitle} is confirmed for {date} at {time}. I'll be at {address}. See you then! — {businessName}"
  2. **Day-before reminder**: "Hi {firstName}, just a reminder I'm coming tomorrow at {time} for the {jobTitle}. — {businessName}"
  3. **Invoice reminder**: "Hi {firstName}, the balance of £{amount} is now due for the {jobTitle}. Bank transfer details: {bankName}, {bankAccountName}, Sort {bankSortCode}, Acc {bankAccountNumber}. Thanks! — {businessName}"
  4. **Follow-up (stale quote)**: "Hi {firstName}, just following up on the quote I sent for the {jobTitle}. Happy to answer any questions. — {businessName}"
  5. **Review request**: "Hi {firstName}, glad the {jobTitle} is sorted! If you were happy with the work, a quick Google review helps me a lot: [review link]. Only takes 30 seconds. Thanks! — {businessName}"

#### Step 2: Template management screen (`src/screens/Settings/MessageTemplates.tsx`)
- Accessible from Settings → "Message Templates"
- List of templates with category badges
- Tap to edit: name, body (with placeholder picker)
- "Insert placeholder" dropdown showing available {placeholders}
- Preview: shows template with a sample job's data filled in
- Reset to default button per template

#### Step 3: Template picker in message flows
- Wherever Dave sends a WhatsApp/SMS message (QuotePreview, Home task cards, JobDetail):
  - Add a "Templates" button above the message text
  - Tapping shows a BottomSheet with relevant templates (filtered by context: booking → booking templates, payment chase → invoice templates)
  - Selecting a template → fills the message field with auto-replaced placeholders
  - Dave reviews and edits before sending

### UI/UX Design
- **Template list**: Clean rows with category icon + name + preview (first 50 chars)
- **Editor**: Textarea for body, placeholder picker dropdown, live preview
- **Template picker**: BottomSheet with categorized templates, tap to fill

### Edge Cases
| Case | Handling |
|------|----------|
| Template references empty field (no scheduled time) | Show "[time not set]" in place of {time}. Dave sees it before sending and can edit. |
| Dave wants different templates for plumbing vs electrical | Trade-tagged templates: add optional `trade` field. Templates with no trade tag show for all. |
| Multi-language customers | Templates in different languages. Dave can create a "Booking confirmation (Polish)" template. No auto-translation. |
| WhatsApp character limits | Warn if template + filled data exceeds 4096 chars (WhatsApp limit). |
| Legal: templates are operational, not marketing | PECR/GDPR (GTM §11). Default templates are operational/service messages. Dave is responsible for not creating marketing templates. Add a warning in the editor: "Only use templates for operational messages to existing customers." |
| Template deleted that's in use | Templates are not "in use" — they're just pre-filled text. Deleting a template doesn't affect past messages. |
| Default templates updated by app update | Only seed defaults if they don't exist (check by `is_default: true`). Dave's edits are preserved. |

### Analytics Events
```ts
export function captureTemplateCreated(data: { category: string }) {
  capture('template_created', data);
}
export function captureTemplateUsed(data: { templateId: string; category: string; context: string }) {
  capture('template_used', data);
}
export function captureTemplateEdited(data: { templateId: string }) {
  capture('template_edited', data);
}
```

### Testing Checklist
- [ ] First login → 5 default templates seeded
- [ ] Edit template body → saved correctly
- [ ] Insert placeholder → appears in body
- [ ] Preview → placeholders filled with sample data
- [ ] Send message from QuotePreview → template picker appears
- [ ] Select template → message auto-filled with job data
- [ ] Empty field → "[field not set]" shown
- [ ] Reset to default → template body reverts
- [ ] Offline: all CRUD works via Dexie + sync queue

### Dependencies
- None — uses existing Dexie infrastructure

---

## P2-09: Revenue & Business Dashboard

### Problem
Dave doesn't know his numbers. "How much did I earn this month?" requires scrolling WhatsApp. No win rate. No top job type. Running blind.

### User Stories
1. As Dave, I want a dashboard showing this month's earnings, outstanding, win rate, and top job type.
2. As Dave, I want to tap a card for a breakdown.
3. As Dave, I want to export monthly data for my accountant.

### Data Model Changes

No new tables. Uses existing `jobs`, `payments`, `line_items` data.

**New utility: `src/lib/dashboard.ts`**
```ts
export interface DashboardStats {
  monthEarnings: number;
  monthQuoted: number;
  winRate: number;                 // quoted → booked %
  outstandingTotal: number;
  outstandingCount: number;
  topJobType: { title: string; earnings: number; count: number } | null;
  paymentMethodBreakdown: { cash: number; bank_transfer: number; other: number };
  lastMonthEarnings: number;       // for trend comparison
}

export async function getDashboardStats(userId: string, month?: Date): Promise<DashboardStats>

export async function getEarningsBreakdown(userId: string, month: Date): Promise<{ title: string; earnings: number; count: number }[]>

export async function exportMonthlyData(userId: string, month: Date): Promise<string>
// Returns CSV string
```

### Implementation Steps

#### Step 1: Create dashboard utilities (`src/lib/dashboard.ts`)
- `getDashboardStats()`:
  - Query all `paid` jobs where `updated_at` is in the current month → sum payments
  - Query all `quoted` + `booked` + `paid` + `cancelled` jobs this month → calculate win rate
  - Query all `awaiting_payment` jobs → sum outstanding
  - Group paid jobs by `title` (fuzzy match) → top job type
  - Compare with last month's earnings for trend

#### Step 2: Dashboard screen (`src/screens/Dashboard/index.tsx`)
- New tab in TabBar: "Stats" (Lucide: `BarChart3`)
- **4 stat cards** (2x2 grid):
  - This Month: £{earnings} (↑/↓ vs last month)
  - Outstanding: £{amount} ({count} jobs)
  - Win Rate: {%} (quoted → booked)
  - Top Job: {title} (£{earnings}, {count} jobs)
- **Earnings breakdown** (tap "Top Job" card):
  - Bar chart or list of job types with earnings
- **Outstanding list** (tap "Outstanding" card):
  - Reuse existing Jobs list filtered to `awaiting_payment`
- **Export button**: "Export this month (CSV)" → generates CSV → download/share

#### Step 3: CSV export
```ts
function generateMonthlyCSV(jobs: Job[], payments: Payment[], customers: Customer[]): string {
  // Columns: Date, Job Number, Customer, Title, Status, Total Quoted, Amount Paid, Payment Method, Outstanding
  // One row per job
}
```

### UI/UX Design
- **Stat cards**: 2x2 grid, large numbers, trend arrow (green ↑ / red ↓)
- **Breakdown**: Simple horizontal bars or sorted list (no chart library for v1)
- **Export**: Single button, generates CSV, shares via `navigator.share()` or download

### Edge Cases
| Case | Handling |
|------|----------|
| First month of use | No historical comparison. Show "Building your baseline" instead of trend arrow. |
| Cash payments not recorded | Dashboard shows "X jobs marked paid (cash) — record payments for accurate totals" prompt |
| Seasonal variation | Show rolling 3-month average alongside monthly figure |
| VAT-registered | Show net vs gross separately |
| Part-time sole traders | Dashboard reflects all jobs in Dexie regardless of working pattern |
| Export | CSV with all monthly jobs, payments, customer names |
| No paid jobs this month | Show £0 with "No completed jobs yet this month" |
| All jobs one type | "Top job type" is that type with 100% of earnings |

### Analytics Events
```ts
export function captureDashboardViewed() {
  capture('dashboard_viewed');
}
export function captureDashboardCardTapped(card: string) {
  capture('dashboard_card_tapped', { card });
}
export function captureDataExported(format: string) {
  capture('data_exported', { format });
}
```

### Testing Checklist
- [ ] Open Dashboard → 4 stat cards with correct numbers
- [ ] Tap "Top Job" → earnings breakdown by job type
- [ ] Tap "Outstanding" → filtered jobs list
- [ ] Export CSV → file downloads with correct data
- [ ] First month → "Building your baseline" shown
- [ ] No paid jobs → £0 with message
- [ ] Trend arrow correct (↑ if higher than last month)
- [ ] Offline: all data from Dexie, no network needed

### Dependencies
- No new npm packages (charts are custom SVG or simple bars)
- Existing Dexie data

---

## P2-10: Google Review Request

### Problem
Dave has 3 Google reviews. Competitor has 47. Loses jobs because customers check Google first. Feels awkward asking.

### User Stories
1. As Dave, when I mark a job "Paid," I want a prompt to request a Google review.
2. As Dave, I want a pre-filled WhatsApp message with my Google review link.
3. As Dave, I want to skip the prompt if the job went poorly.
4. As Dave, I want to see how many reviews I've requested.

### Data Model Changes

**Profile interface additions:**
```ts
// Add to Profile
google_business_url?: string;     // Google Business Profile review URL
```

**Job interface additions:**
```ts
// Add to Job
review_requested_at?: string;     // when review request was sent
```

### Implementation Steps

#### Step 1: Google Business URL setup in Settings
- In `Settings/index.tsx`:
  - "Google Reviews" section
  - Input: "Paste your Google Business review link"
  - Helper text: "Go to Google Maps → find your business → right-click → 'Share' → copy link"
  - Validate URL format (starts with `https://maps.google.com` or `https://search.google.com`)

#### Step 2: Review request prompt after payment
- In `Home/index.tsx` or `JobDetail/index.tsx`, after job is marked "Paid":
  - If `profile.google_business_url` is set:
    - Show BottomSheet: "Ask {firstName} for a Google review?"
    - "Send review request" → WhatsApp message with review link
    - "Skip" → dismiss (no judgment)
  - If not set: skip prompt entirely

#### Step 3: WhatsApp message template
```
"Hi {firstName}, glad the {jobTitle} is sorted! If you were happy with the work, a quick Google review helps me a lot: {google_business_url}. Only takes 30 seconds. Thanks! — {businessName}"
```

#### Step 4: Track review requests
- When sent: set `job.review_requested_at = now` + log work_log entry
- Dashboard card: "Review requests sent: {count} this month"

### Edge Cases
| Case | Handling |
|------|----------|
| Customer doesn't have Google account | Google allows reviews with any email. Friction is higher but link still works. |
| Job went poorly | "Skip" button. No guilt language. Just "Skip" and move on. |
| No Google Business URL set | Prompt doesn't appear. Dave sets it up in Settings when ready. |
| Review link format wrong | Validate URL in Settings. Show warning if not a valid Google Maps URL. |
| Dave sends review request then cancels | review_requested_at is already set. That's fine — it's a record of the attempt, not the outcome. |
| Customer leaves a negative review | No way to prevent this. Dave should only send review requests after positive jobs. The "skip" option handles this. |

### Analytics Events
```ts
export function captureReviewRequestShown(data: { jobId: string }) {
  capture('review_request_shown', data);
}
export function captureReviewRequestSent(data: { jobId: string }) {
  capture('review_request_sent', data);
}
export function captureReviewRequestSkipped(data: { jobId: string }) {
  capture('review_request_skipped', data);
}
```

### Testing Checklist
- [ ] Set Google Business URL in Settings → saved to Profile
- [ ] Mark job as Paid → review prompt appears
- [ ] "Send review request" → WhatsApp opens with pre-filled message + link
- [ ] "Skip" → prompt dismisses
- [ ] No Google URL set → prompt doesn't appear
- [ ] review_requested_at set on job → work_log entry created
- [ ] Dashboard shows review request count
- [ ] Offline: WhatsApp deep link works offline (opens WhatsApp app)

### Dependencies
- Google Business Profile URL (Dave sets this up manually)
- Existing WhatsApp deep link mechanism

---

## P2-11: Material Price Tracking & Supplier Price Comparison

### Problem
Dave overpays for materials. Always goes to same supplier out of habit. Doesn't track material costs per job.

### User Stories
1. As Dave, when I add a material to a job, I want to log the supplier and price.
2. As Dave, when I add the same material next time, I want to see the price history.
3. As Dave, I want to see average price and trend across purchases.

### Data Model Changes

**MaterialItem interface additions (existing table):**
```ts
// Add to existing MaterialItem
supplier?: string;                // Screwfix, Toolstation, etc.
unit_cost_at_time?: number;       // cost when purchased (for price history)
```

**New Dexie table: `material_price_history`** (schema v8)
```ts
export interface MaterialPriceHistory {
  id: string;
  user_id: string;
  description: string;             // material name (normalized)
  supplier: string;
  unit_cost: number;
  quantity: number;
  purchased_at: string;            // date of purchase
  job_id: string;                  // link to job
  created_at: string;
  _sync_status: SyncStatus;
}
```

**Dexie v8 schema:**
```ts
this.version(8).stores({
  material_price_history: 'id, user_id, description, supplier, purchased_at, _sync_status',
});
```

### Implementation Steps

#### Step 1: Extend MaterialsList component
- In `src/components/MaterialsList/index.tsx`:
  - Add "Supplier" field to the material add/edit form
  - When saving, also create a `material_price_history` record

#### Step 2: Price history lookup (`src/lib/materialPrices.ts`)
```ts
export async function getPriceHistory(userId: string, description: string): Promise<MaterialPriceHistory[]>
// Fuzzy match on description (case-insensitive, trim)

export async function getMaterialStats(description: string, history: MaterialPriceHistory[]): Promise<{
  lastPrice: number;
  averagePrice: number;
  minPrice: number;
  maxPrice: number;
  purchaseCount: number;
}>
```

#### Step 3: Price hint when adding materials
- When Dave types a material description in MaterialsList:
  - Debounce 500ms → `getPriceHistory(userId, description)`
  - If matches found → show inline hint: "Last bought: £850 (Screwfix, 3 months ago). Average: £820."
  - If no matches → no hint

### Edge Cases
| Case | Handling |
|------|----------|
| Material prices fluctuate (copper pipe) | Show trend, not just average. "Last 4 purchases: £8.50 → £9.20 → £10.10 → £9.80" |
| Dave buys from independent merchants | Manual supplier entry. Free-text field, not a dropdown. |
| Bulk discounts | Track unit price (unit_cost / quantity). Show "Unit: £8.50 (bulk: 10x)" |
| Same product, different model numbers | Fuzzy matching or manual linking. v1: simple case-insensitive contains match. |
| No receipt scanning | Manual entry is the primary input. Receipt scanning is a future enhancement. |
| No API integration with suppliers | This is a manual tracking tool, not automated price comparison. Value is in Dave seeing his own patterns. |

### Analytics Events
```ts
export function captureMaterialPriceLogged(data: { hasHistory: boolean; priceDiff?: number }) {
  capture('material_price_logged', data);
}
export function capturePriceHistoryViewed(data: { matchCount: number }) {
  capture('price_history_viewed', data);
}
```

### Testing Checklist
- [ ] Add material with supplier → price history record created
- [ ] Add same material description → price hint appears
- [ ] Price hint shows last price, average, and trend
- [ ] Different supplier for same material → both tracked
- [ ] Offline: all operations work via Dexie + sync queue

### Dependencies
- Existing `material_items` Dexie table
- Extended MaterialsList component

---

## P2-12: Referral & Word-of-Mouth Engine

### Problem
Dave's customers recommend him in conversation. He can't capture or amplify it. Word-of-mouth is his best channel but it's completely passive.

### User Stories
1. As Dave, after a paid job, I want to share a professional contact card.
2. As Dave, I want a shareable web page with my trade, area, and reviews.
3. As Dave, I want to track which customers refer me.

### Data Model Changes

**Profile interface additions:**
```ts
// Add to Profile
referral_slug?: string;           // buildlogg.com/dave-plumbing
service_area?: string;            // e.g. "South Manchester"
trades_offered?: string;          // free text list of services
```

**Job interface additions:**
```ts
// Add to Job
referral_source?: string;         // "Recommended by {customerName}"
```

### Implementation Steps

#### Step 1: Referral profile page (server-side)
- Static page hosted on Cloudflare Pages: `buildlogg.com/{referral_slug}`
- Generated from Profile data: business name, trade, service area, phone, Google reviews link
- Simple, clean design. No login required to view.
- "Contact {businessName}" button → WhatsApp deep link

#### Step 2: vCard generation (`src/lib/vCard.ts`)
```ts
export function generateVCard(profile: Profile): string {
  // Standard vCard 3.0 format
  // FN: Dave Plumbing
  // TEL: +44...
  // ADR: ...
  // URL: buildlogg.com/dave-plumbing
}

export function shareVCard(profile: Profile): void {
  // Create blob, navigator.share() or download
}
```

#### Step 3: Share prompt after paid job
- After job is paid + review requested (P2-10):
  - Show: "Know someone who needs a good {trade}? Share your card."
  - "Share contact card" → vCard via `navigator.share()`
  - "Share referral link" → `buildlogg.com/{slug}` via WhatsApp

#### Step 4: Referral tracking in enquiry flow
- In `LogMissedCall.tsx` or new job creation:
  - "How did you hear about me?" dropdown: "Google" / "Facebook" / "Recommended by..." / "Other"
  - If "Recommended by" → text input for referrer name
  - Saved as `job.referral_source`

### Edge Cases
| Case | Handling |
|------|----------|
| Dave doesn't want a public profile | vCard sharing works without a web page. Referral link is optional. |
| Referral tracking | "How did you hear about me?" is optional. Dave can skip. |
| Privacy — customer's name on shared link | No customer names on referral pages. Only Dave's business info. |
| Abuse — link shared in FB group | Rate-limit: referral page shows contact button but no email harvest. Phone number visible only if Dave opted in. |
| Pro tier feature | vCard sharing = Free. Tracked referral page = Pro. |

### Analytics Events
```ts
export function captureReferralCardShared(data: { method: 'vcard' | 'link' }) {
  capture('referral_card_shared', data);
}
export function captureReferralSourceTracked(data: { source: string }) {
  capture('referral_source_tracked', data);
}
```

### Testing Checklist
- [ ] Set referral slug in Settings → web page accessible
- [ ] Share vCard → contact card downloads/shares
- [ ] Share referral link → WhatsApp opens with link
- [ ] New job: "How did you hear about me?" → select "Recommended by" → enter name
- [ ] referral_source saved to job + sync queue
- [ ] Offline: vCard generation works (client-side)

### Dependencies
- Cloudflare Pages for hosting referral profiles (static HTML)
- Profile setup (referral_slug, service_area, trades_offered)

---

## Implementation Wave Summary

| Wave | Features | Timeline | New Dexie Versions | External Deps |
|------|----------|----------|-------------------|---------------|
| **1 — Revenue Protection** | P2-01, P2-02, P2-03 | Week 1-2 | v3, v4, v5 | None |
| **2 — Professionalism** | P2-05, P2-08, P2-07 | Week 3-4 | v6, v7, (v7) | jspdf |
| **3 — Booking & Deposits** | P2-04, P2-06 | Week 5-6 | (Job fields) | Stripe, Supabase Edge Functions |
| **4 — Intelligence & Growth** | P2-09, P2-10, P2-12 | Week 7-8 | (no new tables) | Cloudflare Pages (P2-12) |
| **Deferred** | P2-11 | Post-Wave 4 | v8 | None |

### Dexie Schema Version Map
| Version | Feature | New Table(s) |
|---------|---------|-------------|
| v1 (existing) | MVP core | profiles, customers, jobs, line_items, work_log, payments, sync_queue |
| v2 (existing) | Photos, custom items, materials | job_photos, custom_items, material_items |
| v3 | P2-01 Quote Follow-Up | quote_follow_ups |
| v4 | P2-02 Recurring Reminders | recurring_jobs |
| v5 | P2-03 Payment Escalation | payment_chases |
| v6 | P2-05 PDF Documents | generated_documents |
| v7 | P2-08 Message Templates | message_templates |
| v8 | P2-11 Material Price Tracking | material_price_history |

### New Screens
| Screen | Feature | TabBar? |
|--------|---------|---------|
| Calendar | P2-06 | Yes (Calendar icon) |
| Customers | P2-07 | Yes (Users icon) |
| Dashboard | P2-09 | Yes (BarChart3 icon) |
| PDFPreview | P2-05 | No (navigated to) |
| MessageTemplates | P2-08 | No (in Settings) |

### TabBar Evolution
**MVP:** Home | Jobs | Activity | Settings
**Phase 2:** Home | Calendar | Jobs | Customers | Stats | Settings
*(6 tabs may require a "More" overflow — consider grouping)*

---

*Plan date: 2026-06-24*
*Author: Hermes (Lumos)*
*Codebase: TradePad/Buildlogg at commit HEAD*
