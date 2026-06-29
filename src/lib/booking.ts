/**
 * Booking request helpers — accept/reject flow for online booking requests.
 * When a client submits a booking via the public /book/:slug page, a
 * booking_requests row is created in Supabase and synced to Dexie.
 * The merchant sees it as a task card on Home and can accept or reject it.
 */
import { db, type BookingRequest, type Customer, type Job } from './db';
import { getFilledTemplateMessage } from './templateEngine';
import { findDuplicateByPhone } from './customers';
import { nextJobNumber } from './jobNumbers';
import { detectConflicts, type SchedulingConflict } from './scheduling';
import { supabase } from './supabase';
import { createCheckoutSession } from './stripe';

function now(): string {
  return new Date().toISOString();
}

function getServiceDurationMinutes(booking: BookingRequest): Promise<number> {
  // Multi-service: use total_duration or sum from service_items
  if (booking.total_duration && booking.total_duration > 0) {
    return Promise.resolve(booking.total_duration);
  }
  if (booking.service_items && booking.service_items.length > 0) {
    return Promise.resolve(booking.service_items.reduce((sum, s) => sum + (s.duration || 60), 0));
  }
  // Fallback: fuzzy match for old single-service booking requests
  if (!booking.service_amount || booking.service_amount <= 0) return Promise.resolve(60);
  const description = booking.service_description.toLowerCase().trim();
  return db.custom_items
    .where('user_id')
    .equals(booking.merchant_id)
    .filter((i) => {
      const itemDesc = i.description.toLowerCase().trim();
      return itemDesc === description || i.amount === booking.service_amount;
    })
    .first()
    .then((item) => item?.duration_minutes || 60)
    .catch(() => 60);
}

function bookingScheduledStart(booking: BookingRequest): string {
  return new Date(`${booking.requested_date}T${booking.requested_time}:00`).toISOString();
}

function bookingScheduledEnd(booking: BookingRequest, durationMinutes: number): string {
  return new Date(new Date(bookingScheduledStart(booking)).getTime() + durationMinutes * 60 * 1000).toISOString();
}

export interface ConflictJobInfo {
  jobNumber?: string;
  customerName: string;
  title: string;
  scheduledStart: string;
}

export interface BookingConflictResult {
  hasConflict: boolean;
  conflictJob?: ConflictJobInfo;
}

/**
 * Check whether a booking request overlaps with an existing booked/in_progress job.
 * Local Dexie check first; if no conflicts, falls back to Supabase for new-device cases.
 */
export async function checkBookingConflict(userId: string, bookingId: string): Promise<BookingConflictResult> {
  const booking = await db.booking_requests.get(bookingId);
  if (!booking) return { hasConflict: false };

  const start = new Date(bookingScheduledStart(booking));
  const end = new Date(bookingScheduledEnd(booking, await getServiceDurationMinutes(booking)));

  const conflicts = await db.jobs
    .where('user_id')
    .equals(userId)
    .filter((job) => {
      if (!['booked', 'in_progress'].includes(job.status)) return false;
      if (!job.scheduled_start || !job.scheduled_end) return false;
      const jobStart = new Date(job.scheduled_start);
      const jobEnd = new Date(job.scheduled_end);
      // Overlap: new start is before existing end AND new end is after existing start
      return start < jobEnd && end > jobStart;
    })
    .toArray();

  if (conflicts.length > 0) {
    const job = conflicts[0];
    const customer = await db.customers.get(job.customer_id);
    return {
      hasConflict: true,
      conflictJob: {
        jobNumber: job.job_number,
        customerName: customer?.name || 'Unknown',
        title: job.title,
        scheduledStart: job.scheduled_start as string,
      },
    };
  }

  // Supabase fallback for new-device scenarios where the local DB may be incomplete
  try {
    const { data, error } = await supabase
      .from('jobs')
      .select('id, job_number, customer_id, title, scheduled_start, scheduled_end, customers(name)')
      .eq('user_id', userId)
      .in('status', ['booked', 'in_progress'])
      .lt('scheduled_start', end.toISOString())
      .gt('scheduled_end', start.toISOString());

    if (error || !data || data.length === 0) return { hasConflict: false };

    const remote = data[0];
    return {
      hasConflict: true,
      conflictJob: {
        jobNumber: remote.job_number || undefined,
        customerName: (remote.customers as unknown as { name: string } | null)?.name || 'Unknown',
        title: remote.title,
        scheduledStart: remote.scheduled_start as string,
      },
    };
  } catch {
    return { hasConflict: false };
  }
}

/**
 * Get all pending booking requests for a merchant.
 * FIX: was querying .where('user_id') but the Dexie index is 'merchant_id'.
 */
export async function getPendingBookingRequests(userId: string): Promise<BookingRequest[]> {
  try {
    return await db.booking_requests
      .where('merchant_id')
      .equals(userId)
      .filter((b) => b.status === 'pending' || b.status === 'deposit_paid')
      .sortBy('created_at');
  } catch {
    return [];
  }
}

/**
 * Full conflict check for booking accept UI — includes overlap (with Supabase fallback)
 * plus back-to-back and travel time warnings (Dexie only).
 */
export async function checkBookingConflictsFull(
  userId: string,
  bookingId: string,
): Promise<{ overlap: ConflictJobInfo | null; soft: SchedulingConflict[] }> {
  // 1. Overlap check (with Supabase fallback for new devices)
  const overlapResult = await checkBookingConflict(userId, bookingId);
  const overlap = overlapResult.conflictJob || null;

  // 2. Soft warnings (back-to-back, travel time) — Dexie only
  const booking = await db.booking_requests.get(bookingId);
  let soft: SchedulingConflict[] = [];
  if (booking) {
    const start = bookingScheduledStart(booking);
    const duration = await getServiceDurationMinutes(booking);
    const end = bookingScheduledEnd(booking, duration);
    const allConflicts = await detectConflicts(userId, start, end);
    // Filter out overlaps — already handled by checkBookingConflict
    soft = allConflicts.filter((c) => c.conflictType !== 'overlap');
  }

  return { overlap, soft };
}

/**
 * Accept a booking request:
 * 1. Find or create a customer by phone number
 * 2. Create a new job (status 'booked') with the booking details
 * 3. Copy referral_source/referral_detail onto the job
 * 4. Update the booking request: status='accepted', accepted_job_id, responded_at
 * 5. Queue everything for Supabase sync
 * 6. Return a pre-filled confirmation message for the SendSheet
 */
export async function acceptBookingRequest(
  bookingId: string,
  userId: string,
): Promise<{
  jobId: string;
  customerId: string;
  confirmationMessage: string;
  customer: { name: string; phone: string };
  conflict?: ConflictJobInfo;
}> {
  const booking = await db.booking_requests.get(bookingId);
  if (!booking) throw new Error('Booking request not found');
  if (booking.status !== 'pending' && booking.status !== 'deposit_paid') throw new Error('Booking request is no longer pending');

  const n = now();
  const profile = await db.profiles.get(userId);
  if (!profile) throw new Error('Profile not found');

  // ─── 1. Find or create customer by phone ───
  let customer = await findDuplicateByPhone(userId, booking.client_phone);
  let customerId: string;

  if (customer) {
    customerId = customer.id;
    // Update name if the booking has a better one (not 'Unknown')
    if (booking.client_name && booking.client_name !== 'Unknown' && customer.name === 'Unknown') {
      await db.customers.update(customerId, { name: booking.client_name, updated_at: n, _sync_status: 'pending' });
      await db.sync_queue.add({
        operation: 'update', table_name: 'customers', record_id: customerId,
        payload: { name: booking.client_name, updated_at: n },
        created_at: n, retry_count: 0,
      });
    }
  } else {
    customerId = crypto.randomUUID();
    const newCustomer: Customer = {
      id: customerId,
      user_id: userId,
      name: booking.client_name || 'Unknown',
      phone: booking.client_phone,
      email: booking.client_email || undefined,
      created_at: n,
      updated_at: n,
      _sync_status: 'pending',
    };
    await db.customers.add(newCustomer);
    await db.sync_queue.add({
      operation: 'insert', table_name: 'customers', record_id: customerId,
      payload: {
        id: customerId, user_id: userId, name: booking.client_name || 'Unknown',
        phone: booking.client_phone, email: booking.client_email || null,
        created_at: n, updated_at: n,
      },
      created_at: n, retry_count: 0,
    });
  }

  // ─── 2. Conflict check (warning only, does not block accept) ───
  const durationMinutes = await getServiceDurationMinutes(booking);
  const scheduledStart = bookingScheduledStart(booking);
  const scheduledEnd = bookingScheduledEnd(booking, durationMinutes);
  const conflictCheck = await checkBookingConflict(userId, bookingId);

  // ─── 3. Create the job ───
  const jobId = crypto.randomUUID();
  const jobNumber = await nextJobNumber(userId);

  const newJob: Job = {
    id: jobId,
    user_id: userId,
    customer_id: customerId,
    title: booking.service_description,
    job_number: jobNumber,
    status: 'booked',
    scheduled_start: scheduledStart,
    scheduled_end: scheduledEnd,
    is_multi_day: false,
    payment_terms: profile.payment_terms || 'on_completion',
    notes: booking.notes || undefined,
    // Copy referral attribution from the booking request
    referral_source: booking.referral_source || undefined,
    referral_detail: booking.referral_detail || undefined,
    created_at: n,
    updated_at: n,
    _sync_status: 'pending',
  };

  // BU-5: If the booking request had a deposit paid via Stripe, mark the job's deposit as paid.
  if (booking.deposit_amount && booking.deposit_amount > 0) {
    newJob.deposit_status = 'paid';
    newJob.deposit_amount = booking.deposit_amount;
  }

  await db.jobs.add(newJob);
  await db.sync_queue.add({
    operation: 'insert', table_name: 'jobs', record_id: jobId,
    payload: {
      id: jobId, user_id: userId, customer_id: customerId,
      title: booking.service_description, job_number: jobNumber,
      status: 'booked', scheduled_start: scheduledStart, scheduled_end: scheduledEnd,
      is_multi_day: false, payment_terms: profile.payment_terms || 'on_completion',
      notes: booking.notes || null,
      referral_source: booking.referral_source || null,
      referral_detail: booking.referral_detail || null,
      created_at: n, updated_at: n,
    },
    created_at: n, retry_count: 0,
  });

  // ─── 2b. Create line item(s) from booking service amount ───
  if (booking.service_items && booking.service_items.length > 0) {
    // Multi-service: create one line item per service
    for (let idx = 0; idx < booking.service_items.length; idx++) {
      const si = booking.service_items[idx];
      if (si.amount > 0) {
        const itemId = crypto.randomUUID();
        await db.line_items.add({
          id: itemId,
          job_id: jobId,
          description: si.description,
          amount: si.amount,
          sort_order: idx,
          added_on_site: false,
          created_at: n,
          _sync_status: 'pending',
        });
        await db.sync_queue.add({
          operation: 'insert', table_name: 'line_items', record_id: itemId,
          payload: {
            id: itemId, job_id: jobId, description: si.description,
            amount: si.amount, sort_order: idx, added_on_site: false, created_at: n,
          },
          created_at: n, retry_count: 0,
        });
      }
    }
  } else if (booking.service_amount && booking.service_amount > 0) {
    // Single service (old format): create one line item
    const itemId = crypto.randomUUID();
    await db.line_items.add({
      id: itemId,
      job_id: jobId,
      description: booking.service_description,
      amount: booking.service_amount,
      sort_order: 0,
      added_on_site: false,
      created_at: n,
      _sync_status: 'pending',
    });
    await db.sync_queue.add({
      operation: 'insert', table_name: 'line_items', record_id: itemId,
      payload: {
        id: itemId, job_id: jobId, description: booking.service_description,
        amount: booking.service_amount, sort_order: 0, added_on_site: false,
        created_at: n,
      },
      created_at: n, retry_count: 0,
    });
  }

  // ─── BU-6: Auto-generate Stripe deposit link if payment_terms === 'deposit' and not already paid ───
  let depositLinkSuffix = '';
  if (profile.payment_terms === 'deposit' && profile.stripe_connected && booking.status !== 'deposit_paid' && booking.service_amount && booking.service_amount > 0) {
    const depositPct = profile.deposit_pct || 20;
    const depositAmount = booking.service_amount * (depositPct / 100);
    if (depositAmount >= 0.50) { // Stripe minimum charge
      try {
        const checkoutResult = await createCheckoutSession({
          merchantId: userId,
          jobId,
          amount: depositAmount,
          description: 'Deposit for ' + booking.service_description,
          type: 'deposit',
        });
        await db.jobs.update(jobId, {
          deposit_status: 'requested',
          deposit_amount: depositAmount,
          deposit_stripe_url: checkoutResult.url,
          deposit_stripe_link_id: checkoutResult.id,
          deposit_requested_at: n,
          updated_at: n,
          _sync_status: 'pending',
        });
        await db.sync_queue.add({
          operation: 'update', table_name: 'jobs', record_id: jobId,
          payload: {
            deposit_status: 'requested', deposit_amount: depositAmount,
            deposit_stripe_url: checkoutResult.url, deposit_stripe_link_id: checkoutResult.id,
            deposit_requested_at: n, updated_at: n,
          },
          created_at: n, retry_count: 0,
        });
        depositLinkSuffix = '\n\nPay your £' + depositAmount.toFixed(2) + ' deposit here: ' + checkoutResult.url;
      } catch (e) {
        console.error('[booking] Deposit link creation failed:', e);
      }
    }
  }

  // ─── 3. Update the booking request ───
  await db.booking_requests.update(bookingId, {
    status: 'accepted',
    accepted_job_id: jobId,
    responded_at: n,
    _sync_status: 'pending',
  });
  await db.sync_queue.add({
    operation: 'update', table_name: 'booking_requests', record_id: bookingId,
    payload: { status: 'accepted', accepted_job_id: jobId, responded_at: n },
    created_at: n, retry_count: 0,
  });

  // ─── 4. Build the confirmation message ───
  const businessName = profile.business_name || profile.full_name || 'Your business';
  const customerName = booking.client_name || 'there';
  const firstName = customerName.split(' ')[0] || 'there';
  const dateFormatted = new Date(`${booking.requested_date}T00:00:00`).toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long',
  });

  // XU-7: Use the user's saved "booking" template if available, fall back to hardcoded.
  const templateCustomer: Customer = {
    id: customerId,
    user_id: userId,
    name: customerName,
    phone: booking.client_phone,
    email: booking.client_email || undefined,
    created_at: n,
    updated_at: n,
    _sync_status: 'pending',
  };
  const fallbackMessage = `Hi ${firstName}, your booking is confirmed for ${dateFormatted} at ${booking.requested_time}. I'll be at the agreed location. See you then! — ${businessName}`;
  const confirmationMessage = await getFilledTemplateMessage(userId, 'booking', newJob, templateCustomer, profile, booking.service_amount || 0, fallbackMessage);

  return {
    jobId,
    customerId,
    confirmationMessage: confirmationMessage + depositLinkSuffix,
    customer: {
      name: customerName,
      phone: booking.client_phone,
    },
    conflict: conflictCheck.conflictJob,
  };
}

/**
 * Reject a booking request — marks it as rejected and queues a sync.
 */
export async function rejectBookingRequest(bookingId: string): Promise<void> {
  const n = now();
  await db.booking_requests.update(bookingId, {
    status: 'rejected',
    responded_at: n,
    _sync_status: 'pending',
  });
  await db.sync_queue.add({
    operation: 'update', table_name: 'booking_requests', record_id: bookingId,
    payload: { status: 'rejected', responded_at: n },
    created_at: n, retry_count: 0,
  });
}
