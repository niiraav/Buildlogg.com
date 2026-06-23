import Dexie, { Table } from 'dexie';

export type SyncStatus = 'synced' | 'pending' | 'error';

export interface Profile {
  id: string;
  full_name: string;
  phone: string;
  business_name?: string;
  trade?: 'plumber' | 'electrician' | 'builder' | 'other';
  trade_other?: string;
  callout_charge: number;
  payment_terms: 'on_completion' | 'deposit' | 'invoice';
  default_labour_description: string;
  default_labour_charge: number;
  quote_valid_days: number;
  created_at: string;
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
  detail?: string;          // optional sub-text shown under description (e.g. what's included)
  amount: number;
  sort_order: number;
  added_on_site: boolean;
  created_at: string;
  _sync_status: SyncStatus;
}

export type WorkLogType = 'note' | 'charge' | 'status_change' | 'customer_notified' | 'running_late' | 'quote_sent';

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
  method: 'cash' | 'bank_transfer' | 'terminal' | 'other';
  method_description?: string;
  amount: number;
  recorded_at: string;
  created_at: string;
  _sync_status: SyncStatus;
}

export interface SyncQueueItem {
  id?: number;
  operation: 'insert' | 'update' | 'delete';
  table_name: string;
  record_id: string;
  payload: Record<string, unknown>;
  created_at: string;
  retry_count: number;
}

/* ─── R3: Photo Capture ─── */
export interface JobPhoto {
  id: string;
  job_id: string;
  user_id: string;
  data_url: string;
  caption?: string;
  taken_at: string;
  created_at: string;
  _sync_status: SyncStatus;
}

/* ─── R5: Custom Item Library ─── */
export interface CustomItem {
  id: string;
  user_id: string;
  description: string;
  detail?: string;          // optional sub-text for library items
  amount: number;
  sort_order: number;
  created_at: string;
  updated_at: string;
  _sync_status: SyncStatus;
}

/* ─── R19: Materials Inventory ─── */
export interface MaterialItem {
  id: string;
  job_id: string;
  user_id: string;
  description: string;
  quantity: number;
  unit_cost: number;
  markup_pct: number;
  unit_price: number;
  total_cost: number;
  total_price: number;
  added_on_site: boolean;
  created_at: string;
  _sync_status: SyncStatus;
}

class BuildloggDB extends Dexie {
  profiles!: Table<Profile>;
  customers!: Table<Customer>;
  jobs!: Table<Job>;
  line_items!: Table<LineItem>;
  work_log!: Table<WorkLogEntry>;
  payments!: Table<Payment>;
  sync_queue!: Table<SyncQueueItem>;
  job_photos!: Table<JobPhoto>;
  custom_items!: Table<CustomItem>;
  material_items!: Table<MaterialItem>;

  constructor() {
    super('BuildloggDB');
    this.version(1).stores({
      profiles:    'id, _sync_status',
      customers:   'id, user_id, _sync_status',
      jobs:        'id, user_id, customer_id, status, scheduled_start, _sync_status',
      line_items:  'id, job_id, sort_order, _sync_status',
      work_log:    'id, job_id, created_at, _sync_status',
      payments:    'id, job_id, _sync_status',
      sync_queue:  '++id, table_name, record_id, created_at'
    });
    this.version(2).stores({
      job_photos:    'id, job_id, user_id, created_at, _sync_status',
      custom_items:  'id, user_id, sort_order, [user_id+sort_order]',
      material_items:'id, job_id, user_id, created_at, _sync_status',
    });
  }
}

export const db = new BuildloggDB();
