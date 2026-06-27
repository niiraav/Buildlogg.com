/**
 * Booking request helpers — accept/reject flow for online booking requests.
 * When a client submits a booking via the public /book/:slug page, a
 * booking_requests row is created in Supabase and synced to Dexie.
 * The merchant sees it as a task card on Home and can accept or reject it.
 */
import { db, type BookingRequest, type Customer, type Job } from './db';
import { findDuplicateByPhone } from './customers';
import { nextJobNumber } from './jobNumbers';

function now(): string {
  return new Date().toISOString();
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
      .filter((b) => b.status === 'pending')
      .sortBy('created_at');
  } catch {
    return [];
  }
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
}> {
  const booking = await db.booking_requests.get(bookingId);
  if (!booking) throw new Error('Booking request not found');
  if (booking.status !== 'pending') throw new Error('Booking request is no longer pending');

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

  // ─── 2. Create the job ───
  const jobId = crypto.randomUUID();
  const jobNumber = await nextJobNumber(userId);

  // Convert the requested date+time to ISO for scheduled_start.
  // The app runs on the user's phone (UK timezone), so new Date("YYYY-MM-DDTHH:MM:SS")
  // without a Z suffix is interpreted as UK local time → correct.
  const scheduledStart = new Date(`${booking.requested_date}T${booking.requested_time}:00`).toISOString();
  const scheduledEnd = new Date(new Date(scheduledStart).getTime() + 60 * 60 * 1000).toISOString();

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

  const confirmationMessage = `Hi ${firstName}, your booking is confirmed for ${dateFormatted} at ${booking.requested_time}. I'll be at the agreed location. See you then! — ${businessName}`;

  return {
    jobId,
    customerId,
    confirmationMessage,
    customer: {
      name: customerName,
      phone: booking.client_phone,
    },
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
