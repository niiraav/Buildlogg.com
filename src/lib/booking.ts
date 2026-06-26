/**
 * Booking accept helper — when a merchant accepts a booking request,
 * creates a customer (or matches by phone) + job + line item + work log.
 */
import { db, type BookingRequest, type Job, type Customer } from './db';
import { normalizePhone, findDuplicateByPhone } from './customers';
import { addToSyncQueue } from './syncQueue';
import { nextJobNumber, ensureJobNumber } from './jobNumbers';
import { getFilledTemplateMessage } from './templateEngine';

function now(): string { return new Date().toISOString(); }

export async function acceptBookingRequest(requestId: string, userId: string): Promise<{ job: Job; customer: Customer; confirmationMessage: string }> {
  const request = await db.booking_requests.get(requestId);
  if (!request || request.status !== 'pending') throw new Error('Request not pending');

  const normalizedPhone = normalizePhone(request.client_phone);

  // 1. Find or create customer
  let customer = await findDuplicateByPhone(userId, normalizedPhone);
  if (!customer) {
    const customerId = crypto.randomUUID();
    const n = now();
    customer = {
      id: customerId,
      user_id: userId,
      name: request.client_name,
      phone: normalizedPhone,
      created_at: n,
      updated_at: n,
      _sync_status: 'pending',
    };
    await db.customers.add(customer);
    await addToSyncQueue('customers', customerId, { ...customer }, 'insert');
  }

  // 2. Create job
  const jobId = crypto.randomUUID();
  const jobNumber = await nextJobNumber(userId);
  const scheduledStart = `${request.requested_date}T${request.requested_time}:00`;
  const n = now();
  const job: Job = {
    id: jobId,
    user_id: userId,
    customer_id: customer.id,
    title: request.service_description,
    job_number: jobNumber,
    status: 'booked',
    scheduled_start: scheduledStart,
    is_multi_day: false,
    payment_terms: 'on_completion',
    referral_source: request.referral_source,
    referral_detail: request.referral_detail,
    created_at: n,
    updated_at: n,
    _sync_status: 'pending',
  };
  await db.jobs.add(job);
  await ensureJobNumber(job, userId);
  await addToSyncQueue('jobs', jobId, { ...job }, 'insert');

  // 3. Create line item for the service
  if (request.service_amount > 0) {
    const liId = crypto.randomUUID();
    await db.line_items.add({
      id: liId,
      job_id: jobId,
      description: request.service_description,
      amount: request.service_amount,
      sort_order: 0, added_on_site: false,
      created_at: n,
      _sync_status: 'pending',
    });
    await addToSyncQueue('line_items', liId, {
      id: liId, job_id: jobId, description: request.service_description,
      amount: request.service_amount, sort_order: 0, added_on_site: false, created_at: n,
    }, 'insert');
  }

  // 4. Work log
  const logId = crypto.randomUUID();
  await db.work_log.add({
    id: logId,
    job_id: jobId,
    type: 'status_change',
    description: `[Booking accepted from ${request.client_name}] Service: ${request.service_description}, Date: ${request.requested_date} at ${request.requested_time}`,
    created_at: n,
    _sync_status: 'pending',
  });
  await addToSyncQueue('work_log', logId, {
    id: logId, job_id: jobId, type: 'status_change',
    description: `[Booking accepted from ${request.client_name}] Service: ${request.service_description}, Date: ${request.requested_date} at ${request.requested_time}`,
    created_at: n,
  }, 'insert');

  // 5. Update booking request
  await db.booking_requests.update(requestId, {
    status: 'accepted',
    responded_at: n,
    accepted_job_id: jobId,
    _sync_status: 'pending',
  });
  await addToSyncQueue('booking_requests', requestId, {
    status: 'accepted', responded_at: n, accepted_job_id: jobId,
  }, 'update');

  // 6. Build confirmation message using booking template
  const profile = await db.profiles.get(userId);
  let confirmationMessage = '';
  if (profile) {
    const dateLabel = new Date(scheduledStart).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' });
    const timeLabel = request.requested_time;
    const fallback = `Hi ${customer.name.split(' ')[0]}, your booking for ${job.title} is confirmed for ${dateLabel} at ${timeLabel}. See you then! — ${profile.business_name || profile.full_name}`;
    confirmationMessage = await getFilledTemplateMessage(userId, 'booking', job, customer, profile, request.service_amount, fallback);
  }

  return { job, customer, confirmationMessage };
}

export async function rejectBookingRequest(requestId: string): Promise<void> {
  const n = now();
  await db.booking_requests.update(requestId, {
    status: 'rejected',
    responded_at: n,
    _sync_status: 'pending',
  });
  await addToSyncQueue('booking_requests', requestId, {
    status: 'rejected', responded_at: n,
  }, 'update');
}

export async function getPendingBookingRequests(userId: string): Promise<BookingRequest[]> {
  return db.booking_requests
    .where('merchant_id')
    .equals(userId)
    .filter(r => r.status === 'pending')
    .sortBy('created_at');
}
