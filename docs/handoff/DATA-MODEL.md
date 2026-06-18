# TradePad — Data Model
## Version 1.0 — Supabase Schema + Dexie Local Schema

> **How to use this document**
> This defines every table, field, type, constraint, and relationship for TradePad MVP. Build the Supabase schema exactly as specified. Build the Dexie schema to mirror it. Do not add extra fields or tables for Phase 2 features — they are explicitly out of scope.

---

## 1. Architecture Overview

```
┌─────────────────────────┐
│       React App         │
│  (reads/writes Dexie)   │
└────────────┬────────────┘
             │ immediate (never blocks UI)
┌────────────▼────────────┐
│   Dexie.js (IndexedDB)  │  ← Source of truth for UI
│   Local on-device DB    │
└────────────┬────────────┘
             │ background sync (when online)
┌────────────▼────────────┐
│  Supabase (Postgres)    │  ← Persistent, cross-device
│  + Auth + Row-Level Sec │
└─────────────────────────┘
```

**Write path**: All writes go to Dexie first → queued to `sync_queue` → synced to Supabase in background.
**Read path**: Always read from Dexie. Never wait for network.
**Conflict resolution**: Last-write-wins. Most recent `updated_at` timestamp wins on merge.

---

## 2. Supabase Tables

### 2.1 `profiles`
One row per authenticated user. Created on first sign-in.

```sql
CREATE TABLE profiles (
  id              uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name       text NOT NULL,
  phone           text NOT NULL,
  business_name   text,                          -- nullable: optional at onboarding
  trade           text CHECK (trade IN (
                    'plumber', 'electrician',
                    'builder', 'other'
                  )),
  callout_charge  numeric(10,2) NOT NULL DEFAULT 75.00,
  payment_terms   text NOT NULL DEFAULT 'on_completion'
                  CHECK (payment_terms IN (
                    'on_completion', 'deposit', 'invoice'
                  )),
  quote_valid_days integer NOT NULL DEFAULT 30,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
```

**RLS Rules:**
```sql
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
-- Users can only read/write their own profile
CREATE POLICY "profiles: own row" ON profiles
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());
```

---

### 2.2 `customers`
One row per customer Dave has dealt with.

```sql
CREATE TABLE customers (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name        text NOT NULL,
  phone       text NOT NULL,
  address     text,                              -- plain text, nullable; postcode lookup Phase 2
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_customers_user_id ON customers(user_id);
```

**RLS Rules:**
```sql
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "customers: own records" ON customers
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
```

---

### 2.3 `jobs`
Core entity. One row per job, from Enquiry through terminal states.

```sql
CREATE TABLE jobs (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  customer_id         uuid NOT NULL REFERENCES customers(id),

  -- Identity
  title               text NOT NULL,
  job_number          text,                      -- auto-generated: J-1001, J-1002 etc.

  -- Status machine
  status              text NOT NULL DEFAULT 'enquiry'
                      CHECK (status IN (
                        'enquiry', 'quoted', 'booked', 'in_progress',
                        'awaiting_payment', 'paid', 'no_show',
                        'cancelled', 'written_off'
                      )),

  -- Scheduling
  scheduled_start     timestamptz,              -- nullable until Booked
  scheduled_end       timestamptz,              -- nullable; end of job window
  actual_start        timestamptz,              -- set when Dave taps "I'm here"
  actual_end          timestamptz,              -- set when Dave taps "Mark Done"

  -- Multi-day flag
  is_multi_day        boolean NOT NULL DEFAULT false,

  -- Quote / payment terms (set at quote creation, inherited by job)
  payment_terms       text NOT NULL DEFAULT 'on_completion'
                      CHECK (payment_terms IN (
                        'on_completion', 'deposit', 'invoice'
                      )),
  deposit_pct         integer CHECK (deposit_pct BETWEEN 0 AND 100),
                                                -- null unless payment_terms='deposit'
  -- Quote lifecycle
  quote_number        text,                     -- deprecated: job_number is the single canonical reference
  quote_sent_at       timestamptz,
  quote_send_method   text CHECK (quote_send_method IN ('whatsapp', 'sms', 'copy')),
  quote_expires_at    timestamptz,              -- quote_sent_at + quote_valid_days

  -- Invoice lifecycle
  invoice_number      text,                     -- e.g. INV-1001; generated at Awaiting Payment
  invoice_sent_at     timestamptz,

  -- Cancellation / no-show
  cancellation_reason text,                     -- 'customer_cancelled' | 'dave_cancelled'
  notes               text,                     -- free text notes field

  -- Timestamps
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_jobs_user_id   ON jobs(user_id);
CREATE INDEX idx_jobs_status    ON jobs(user_id, status);
CREATE INDEX idx_jobs_scheduled ON jobs(user_id, scheduled_start);
```

**RLS Rules:**
```sql
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "jobs: own records" ON jobs
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
```

---

### 2.4 `line_items`
Invoice/quote line items. Belong to a job. Ordered by `sort_order`.

```sql
CREATE TABLE line_items (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id          uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  description     text NOT NULL,
  amount          numeric(10,2) NOT NULL,        -- always has amount; no TBC items in MVP
  sort_order      integer NOT NULL DEFAULT 0,
  added_on_site   boolean NOT NULL DEFAULT false, -- true if added during In Progress
  created_at      timestamptz NOT NULL DEFAULT now()
  -- No updated_at: line items are immutable; remove and re-add to change
);

CREATE INDEX idx_line_items_job_id ON line_items(job_id);
```

**Business rules:**
- `amount` is always required. No null amounts. No TBC items.
- `added_on_site` = true for charges added via the "Add charge" sheet (In Progress state)
- Line items can be removed (DELETE) from Booked and In Progress states only
- Line items are read-only from Awaiting Payment onwards
- `sort_order` starts at 0, increments by 1 for each new item

**RLS Rules:**
```sql
ALTER TABLE line_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "line_items: own via job" ON line_items
  USING (EXISTS (
    SELECT 1 FROM jobs WHERE jobs.id = line_items.job_id AND jobs.user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM jobs WHERE jobs.id = line_items.job_id AND jobs.user_id = auth.uid()
  ));
```

---

### 2.5 `work_log`
Audit trail for a job. Dave's diary. Immutable (append-only).

```sql
CREATE TABLE work_log (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id        uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  type          text NOT NULL CHECK (type IN (
                  'note',             -- Dave added a text note
                  'charge',           -- Dave added a charge (links to line_item)
                  'status_change',    -- Job moved to a new status
                  'customer_notified',-- Dave sent "running late" message
                  'running_late'      -- Dave tapped "Running Late" button
                )),
  description   text NOT NULL,         -- human-readable log text
  amount        numeric(10,2),         -- only for type='charge'
  line_item_id  uuid REFERENCES line_items(id), -- only for type='charge'
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_work_log_job_id ON work_log(job_id);
```

**Auto-generated work_log entries (app generates these on status change):**

| Trigger | type | description |
|---|---|---|
| Dave taps "I'm here" | `status_change` | "Job started" |
| Dave taps "Running Late" | `running_late` | "Running late — customer notified" |
| Dave sends message | `customer_notified` | "Customer notified via WhatsApp/SMS · 9:14am" |
| Dave adds a charge | `charge` | "{description} — £{amount}" |
| Dave adds a note | `note` | "{note text}" |
| Job marked Done | `status_change` | "Job completed · {duration}" |
| Payment recorded | `status_change` | "Payment recorded — {method} £{amount}" |

**RLS Rules:**
```sql
ALTER TABLE work_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "work_log: own via job" ON work_log
  USING (EXISTS (
    SELECT 1 FROM jobs WHERE jobs.id = work_log.job_id AND jobs.user_id = auth.uid()
  ));
-- Work log is append-only — no UPDATE or DELETE policy
```

---

### 2.6 `payments`
Payment records. One row per payment recorded.

```sql
CREATE TABLE payments (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id              uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  type                text NOT NULL CHECK (type IN (
                        'deposit',       -- upfront deposit at booking
                        'balance',       -- remaining balance after deposit
                        'full'           -- full payment, no deposit
                      )),
  method              text NOT NULL CHECK (method IN (
                        'cash', 'bank_transfer', 'other'
                      )),
  method_description  text,             -- free text for method='other'
  amount              numeric(10,2) NOT NULL,
  recorded_at         timestamptz NOT NULL DEFAULT now(),
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_payments_job_id ON payments(job_id);
```

**Business rules:**
- When Dave taps "Mark Done" → Cash/Bank Transfer/Other → one `payments` row created
- If job had a deposit: type='balance', amount = total − deposit_amount
- If no deposit: type='full', amount = sum of all line_items
- "Not yet" → no payment row; job moves to Awaiting Payment

**RLS Rules:**
```sql
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "payments: own via job" ON payments
  USING (EXISTS (
    SELECT 1 FROM jobs WHERE jobs.id = payments.job_id AND jobs.user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM jobs WHERE jobs.id = payments.job_id AND jobs.user_id = auth.uid()
  ));
```

---

## 3. Computed Values (not stored)

These are calculated at query time, not stored in the DB:

| Value | How to compute |
|---|---|
| **Job total** | `SELECT SUM(amount) FROM line_items WHERE job_id = ?` |
| **Deposit amount** | `job.deposit_pct / 100 * job_total` |
| **Balance due** | `job_total - SUM(amount) FROM payments WHERE job_id = ? AND type = 'deposit'` |
| **Days overdue** | `now() - job.invoice_sent_at` in days |
| **Quote staleness** | `now() - job.quote_sent_at` in days |
| **Time on site** | `now() - job.actual_start` (if actual_start set, actual_end null) |

---

## 4. Dexie (IndexedDB) Local Schema

Mirror the Supabase schema exactly. Additional local-only field: `_sync_status`.

```typescript
// src/lib/db.ts

import Dexie, { Table } from 'dexie';

type SyncStatus = 'synced' | 'pending' | 'error';

export interface Profile {
  id: string;              // auth user UUID
  full_name: string;
  phone: string;
  business_name?: string;
  trade?: 'plumber' | 'electrician' | 'builder' | 'other';
  callout_charge: number;
  payment_terms: 'on_completion' | 'deposit' | 'invoice';
  quote_valid_days: number;
  created_at: string;      // ISO string
  updated_at: string;
  _sync_status: SyncStatus;
}

export interface Customer {
  id: string;
  user_id: string;
  name: string;
  phone: string;
  address?: string;
  created_at: string;
  updated_at: string;
  _sync_status: SyncStatus;
}

export type JobStatus =
  | 'enquiry' | 'quoted' | 'booked' | 'in_progress'
  | 'awaiting_payment' | 'paid' | 'no_show'
  | 'cancelled' | 'written_off';

export interface Job {
  id: string;
  user_id: string;
  customer_id: string;
  title: string;
  job_number?: string;
  status: JobStatus;
  scheduled_start?: string;
  scheduled_end?: string;
  actual_start?: string;
  actual_end?: string;
  is_multi_day: boolean;
  payment_terms: 'on_completion' | 'deposit' | 'invoice';
  deposit_pct?: number;
  quote_number?: string;       // deprecated: job_number is the single canonical reference
  quote_sent_at?: string;
  quote_send_method?: 'whatsapp' | 'sms' | 'copy';
  quote_expires_at?: string;
  invoice_number?: string;
  invoice_sent_at?: string;
  cancellation_reason?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
  _sync_status: SyncStatus;
}

export interface LineItem {
  id: string;
  job_id: string;
  description: string;
  amount: number;
  sort_order: number;
  added_on_site: boolean;
  created_at: string;
  _sync_status: SyncStatus;
}

export type WorkLogType = 'note' | 'charge' | 'status_change' | 'customer_notified' | 'running_late';

export interface WorkLogEntry {
  id: string;
  job_id: string;
  type: WorkLogType;
  description: string;
  amount?: number;
  line_item_id?: string;
  created_at: string;
  _sync_status: SyncStatus;
}

export interface Payment {
  id: string;
  job_id: string;
  type: 'deposit' | 'balance' | 'full';
  method: 'cash' | 'bank_transfer' | 'other';
  method_description?: string;
  amount: number;
  recorded_at: string;
  created_at: string;
  _sync_status: SyncStatus;
}

export interface SyncQueueItem {
  id?: number;            // auto-increment
  operation: 'insert' | 'update' | 'delete';
  table_name: string;
  record_id: string;
  payload: Record<string, unknown>;
  created_at: string;
  retry_count: number;
}

class TradePadDB extends Dexie {
  profiles!: Table<Profile>;
  customers!: Table<Customer>;
  jobs!: Table<Job>;
  line_items!: Table<LineItem>;
  work_log!: Table<WorkLogEntry>;
  payments!: Table<Payment>;
  sync_queue!: Table<SyncQueueItem>;

  constructor() {
    super('TradePadDB');
    this.version(1).stores({
      profiles:    'id, _sync_status',
      customers:   'id, user_id, _sync_status',
      jobs:        'id, user_id, customer_id, status, scheduled_start, _sync_status',
      line_items:  'id, job_id, sort_order, _sync_status',
      work_log:    'id, job_id, created_at, _sync_status',
      payments:    'id, job_id, _sync_status',
      sync_queue:  '++id, table_name, record_id, created_at'
    });
  }
}

export const db = new TradePadDB();
```

---

## 5. Sync Strategy

### Write flow

```
User action (e.g. "Mark Done")
  ↓
1. Generate uuid client-side for new record (if insert)
2. Write to Dexie immediately → _sync_status: 'pending'
3. Append to sync_queue: { operation, table_name, record_id, payload }
4. UI updates instantly (reads from Dexie)
5. syncWorker() picks up queue:
   a. POST/PATCH/DELETE to Supabase
   b. On success: update Dexie record _sync_status → 'synced', remove from queue
   c. On error: increment retry_count, keep in queue; retry after 30s backoff
```

### syncWorker
```typescript
// src/lib/sync.ts
// Call syncWorker() on: app foreground, network reconnect, every 30s
async function syncWorker() {
  if (!navigator.onLine) return;
  const pending = await db.sync_queue.orderBy('created_at').toArray();
  for (const item of pending) {
    try {
      await pushToSupabase(item);
      await db.sync_queue.delete(item.id!);
      await db[item.table_name].update(item.record_id, { _sync_status: 'synced' });
    } catch {
      await db.sync_queue.update(item.id!, { retry_count: item.retry_count + 1 });
    }
  }
}
```

### Pull / initial load
On first authenticated load, pull all user data from Supabase and populate Dexie:
```typescript
// Pull once on login, then use Dexie for everything
async function initialSync(userId: string) {
  const [profile, customers, jobs, lineItems, workLog, payments] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', userId).single(),
    supabase.from('customers').select('*').eq('user_id', userId),
    supabase.from('jobs').select('*').eq('user_id', userId),
    supabase.from('line_items').select('*, jobs!inner(user_id)').eq('jobs.user_id', userId),
    supabase.from('work_log').select('*, jobs!inner(user_id)').eq('jobs.user_id', userId),
    supabase.from('payments').select('*, jobs!inner(user_id)').eq('jobs.user_id', userId),
  ]);
  // Bulk put into Dexie (mark all as 'synced')
  await db.transaction('rw', [db.profiles, db.customers, db.jobs, db.line_items, db.work_log, db.payments], async () => {
    if (profile.data) await db.profiles.put({ ...profile.data, _sync_status: 'synced' });
    if (customers.data) await db.customers.bulkPut(customers.data.map(r => ({ ...r, _sync_status: 'synced' })));
    if (jobs.data) await db.jobs.bulkPut(jobs.data.map(r => ({ ...r, _sync_status: 'synced' })));
    if (lineItems.data) await db.line_items.bulkPut(lineItems.data.map(r => ({ ...r, _sync_status: 'synced' })));
    if (workLog.data) await db.work_log.bulkPut(workLog.data.map(r => ({ ...r, _sync_status: 'synced' })));
    if (payments.data) await db.payments.bulkPut(payments.data.map(r => ({ ...r, _sync_status: 'synced' })));
  });
}
```

---

## 6. Number Sequences

Auto-generated numbers are client-side sequential per user (not global).

**Rule:** one canonical reference follows the job from enquiry → quote → booked → invoice. A separate invoice number is generated only when the job becomes `awaiting_payment`.

| Type | Format | Example | Generated | Logic |
|---|---|---|---|---|
| Job reference (lifecycle) | `J-{n}` | J-1001 | At enquiry/job creation | Max existing `job_number` + 1, starting at 1001 |
| Invoice number | `INV-{n}` | INV-1001 | When status becomes `awaiting_payment` | Max existing `invoice_number` + 1, starting at 1001 |

The `quote_number` column is deprecated and no longer used; the same `J-{n}` reference appears on quotes and jobs.

---

## 7. Flag Derivation Queries

These queries power the flag badges. Run against Dexie.

```typescript
// Urgent · New — enquiry created < 2 hours ago
const urgentNew = await db.jobs
  .where('status').equals('enquiry')
  .filter(j => {
    const ageMs = Date.now() - new Date(j.created_at).getTime();
    return ageMs < 2 * 60 * 60 * 1000;
  })
  .toArray();

// Chase · Xd — awaiting_payment, invoice sent 1-29 days ago
const chase = await db.jobs
  .where('status').equals('awaiting_payment')
  .filter(j => {
    if (!j.invoice_sent_at) return false;
    const days = (Date.now() - new Date(j.invoice_sent_at).getTime()) / 86400000;
    return days >= 1 && days < 30;
  })
  .toArray();

// Overdue · Xd — awaiting_payment, invoice sent 30+ days ago
const overdue = await db.jobs
  .where('status').equals('awaiting_payment')
  .filter(j => {
    if (!j.invoice_sent_at) return false;
    const days = (Date.now() - new Date(j.invoice_sent_at).getTime()) / 86400000;
    return days >= 30;
  })
  .toArray();

// Stale · Xd — quoted, quote sent X+ days ago, not yet booked
const stale = await db.jobs
  .where('status').equals('quoted')
  .filter(j => !!j.quote_sent_at)
  .toArray();
```

---

## 8. Home Screen Data Queries

```typescript
// Layer 1 — Today's jobs
const todayStart = startOfDay(new Date()).toISOString();
const todayEnd   = endOfDay(new Date()).toISOString();

const todayJobs = await db.jobs
  .where('scheduled_start').between(todayStart, todayEnd)
  .and(j => ['booked', 'in_progress'].includes(j.status))
  .sortBy('scheduled_start');

// Active job (currently in_progress)
const activeJob = await db.jobs.where('status').equals('in_progress').first();

// Next up = first booked job today (or next future)
const nextUp = todayJobs.find(j => j.status === 'booked');

// L2 — Can't ignore (for Tasks tab badge count)
const l2Count = urgentNew.length + overdue.length + noShowJobs.length;
```

---

## 9. Supabase Migration Files

Save as numbered migrations in `supabase/migrations/`:

```
supabase/migrations/
  20260101000001_create_profiles.sql
  20260101000002_create_customers.sql
  20260101000003_create_jobs.sql
  20260101000004_create_line_items.sql
  20260101000005_create_work_log.sql
  20260101000006_create_payments.sql
  20260101000007_enable_rls.sql
  20260101000008_create_indexes.sql
```

Each migration file contains only the SQL for that table. The enable_rls migration adds all RLS policies.

---

## 10. Supabase Auth Setup

- Auth method: **Phone OTP** (Twilio SMS via Supabase)
- UK numbers only: validate format `^(\+44|0)7\d{9}$`
- On sign-in: check if `profiles` row exists; if not, redirect to Onboarding
- `profiles.id = auth.users.id` — guaranteed 1:1

```typescript
// src/lib/supabase.ts
import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);
```

Environment variables required:
```
VITE_SUPABASE_URL=https://xxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
```

---

*End of DATA-MODEL.md — Version 1.0*
