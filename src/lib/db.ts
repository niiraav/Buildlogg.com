import Dexie, { Table } from 'dexie';

export type SyncStatus = 'synced' | 'pending' | 'error';

export interface Profile {
  id: string;
  full_name: string;
  phone: string;
  business_name?: string;
  trade?: 'plumber' | 'electrician' | 'builder' | 'other';
  trade_other?: string;
  business_type?: 'trades' | 'beauty' | 'home_services' | 'professional' | 'other';
  specialty?: string;
  callout_charge: number;
  payment_terms: 'on_completion' | 'deposit' | 'invoice';
  default_labour_description: string;
  default_labour_charge: number;
  quote_valid_days: number;
  // P2-01: PDF branding
  logo_data_url?: string;
  vat_registered?: boolean;
  vat_number?: string;
  bank_name?: string;
  bank_account_name?: string;
  bank_account_number?: string;
  bank_sort_code?: string;
  terms_and_conditions?: string;
  // W2-3: Referral tracking
  referral_source?: string;
  referral_detail?: string;
  // P2-08: Google reviews
  google_business_url?: string;
  reviews_enabled?: boolean;
  // W2-1: Booking page
  booking_slug?: string;
  booking_enabled?: boolean;
  booking_buffer_hours?: number;
  booking_show_phone?: boolean;
  // W2-2: Stripe
  stripe_account_id?: string;
  stripe_connected?: boolean;
  // Entitlements
  subscription_status?: 'active' | 'trialing' | 'expired' | 'canceled' | null;
  subscription_ends_at?: string;
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
  // P2-06: CRM fields
  email?: string;
  business_name?: string;
  notes?: string;
  is_archived?: boolean;
  merged_into?: string;
  is_sample?: boolean;
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
  // P2-03: Deposit collection
  deposit_amount?: number;
  deposit_status?: 'none' | 'requested' | 'paid' | 'refunded';
  deposit_stripe_link_id?: string;
  deposit_stripe_url?: string;
  deposit_requested_at?: string;
  deposit_paid_at?: string;
  cancellation_policy_hours?: number;
  // W2-3: Referral tracking
  referral_source?: string;
  referral_detail?: string;
  // P2-08: Google reviews
  review_requested_at?: string;
  is_sample?: boolean;
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
  is_sample?: boolean;
  created_at: string;
  _sync_status: SyncStatus;
}

export type WorkLogType =
  | 'note' | 'charge' | 'status_change' | 'customer_notified'
  | 'running_late' | 'quote_sent'
  | 'expense'
  | 'quote_follow_up_sent' | 'quote_follow_up_snoozed' | 'quote_follow_up_responded'
  | 'recurring_reminder_sent' | 'recurring_reminder_no_response'
  | 'payment_chase_sent' | 'payment_chase_paused' | 'payment_chase_resumed'
  | 'recurring_job_created' | 'recurring_job_cancelled';

export interface WorkLogEntry {
  id: string;
  job_id: string;
  type: WorkLogType;
  description: string;
  amount?: number;
  line_item_id?: string;
  is_sample?: boolean;
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
  is_public?: boolean;
  duration_minutes?: number;
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

/* ─── P2-01: Generated Documents (PDF) ─── */
export type DocumentType = 'quote' | 'invoice';

export interface GeneratedDocument {
  id: string;
  job_id: string;
  user_id: string;
  type: DocumentType;
  version: number;
  blob_key: string;
  file_name: string;
  created_at: string;
  _sync_status: SyncStatus;
}

/* ─── P2-02: Message Templates ─── */
export type TemplateCategory = 'booking' | 'reminder' | 'invoice' | 'follow_up' | 'review' | 'receipt' | 'update' | 'custom';

export interface MessageTemplate {
  id: string;
  user_id: string;
  category: TemplateCategory;
  name: string;
  body: string;
  is_default: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
  _sync_status: SyncStatus;
}

export interface QuoteFollowUp {
  id: string;
  job_id: string;
  user_id: string;
  status: 'pending' | 'snoozed' | 'responded' | 'dismissed';
  first_nudge_at: string;
  last_nudge_at?: string;
  nudge_count: number;
  snooze_until?: string;
  snooze_reason?: string;
  created_at: string;
  updated_at: string;
  _sync_status: SyncStatus;
}

export type RecurrenceInterval = 'monthly' | 'quarterly' | 'six_monthly' | 'annual';

export interface RecurringJob {
  id: string;
  user_id: string;
  original_job_id: string;
  customer_id: string;
  title: string;
  address?: string;
  interval: RecurrenceInterval;
  next_due_at: string;
  reminder_lead_days: number;
  status: 'active' | 'dormant' | 'cancelled';
  last_completed_at?: string;
  contact_attempts: number;
  suggested_month?: number;
  notes?: string;
  created_at: string;
  updated_at: string;
  _sync_status: SyncStatus;
}

export type ChaseStage = 'gentle' | 'firm' | 'final' | 'small_claims';

export interface PaymentChase {
  id: string;
  job_id: string;
  user_id: string;
  stage: ChaseStage;
  due_at: string;
  sent_at?: string;
  status: 'pending' | 'sent' | 'paused' | 'resolved';
  pause_reason?: string;
  message_method?: 'whatsapp' | 'sms';
  created_at: string;
  updated_at: string;
  _sync_status: SyncStatus;
}

export type BookingStatus = 'pending' | 'accepted' | 'rejected' | 'expired';

export interface BookingRequest {
  id: string;
  merchant_id: string;
  service_description: string;
  service_amount: number;
  client_name: string;
  client_phone: string;
  client_email?: string;
  requested_date: string;
  requested_time: string;
  notes?: string;
  status: BookingStatus;
  referral_source?: string;
  referral_detail?: string;
  stripe_checkout_session_id?: string;
  deposit_amount?: number;
  created_at: string;
  responded_at?: string;
  accepted_job_id?: string;
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
  generated_documents!: Table<GeneratedDocument>;
  message_templates!: Table<MessageTemplate>;
  quote_follow_ups!: Table<QuoteFollowUp>;
  recurring_jobs!: Table<RecurringJob>;
  payment_chases!: Table<PaymentChase>;
  booking_requests!: Table<BookingRequest>;

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
    this.version(3).stores({
      generated_documents: 'id, job_id, user_id, type, created_at, _sync_status',
    });
    this.version(4).stores({
      message_templates: 'id, user_id, category, [user_id+sort_order], _sync_status',
    });
    this.version(5).stores({
      quote_follow_ups: 'id, job_id, user_id, status, first_nudge_at, _sync_status',
    });
    this.version(6).stores({
      recurring_jobs: 'id, user_id, customer_id, status, next_due_at, _sync_status',
    });
    this.version(7).stores({
      payment_chases: 'id, job_id, user_id, stage, status, due_at, _sync_status',
    });
    this.version(8).stores({
      booking_requests: 'id, merchant_id, status, created_at, _sync_status',
    });
  }
}

export const db = new BuildloggDB();
