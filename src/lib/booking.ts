/**
 * Booking request helpers — stub for wave-1 branch.
 * The wave-2 branch will replace this with the full implementation.
 */
import { db, type BookingRequest } from './db';

export async function getPendingBookingRequests(userId: string): Promise<BookingRequest[]> {
  try {
    return await db.booking_requests
      .where('user_id').equals(userId)
      .filter((b) => b.status === 'pending')
      .toArray();
  } catch {
    return [];
  }
}

export async function acceptBookingRequest(
  _bookingId: string,
  _userId: string,
): Promise<{ jobId: string; customerId: string; confirmationMessage: string; customer: { name: string; phone: string } }> {
  // Stub — wave-2 will implement the full accept flow
  throw new Error('Not implemented — booking accept is a wave-2 feature');
}

export async function rejectBookingRequest(_bookingId: string): Promise<void> {
  // Stub — wave-2 will implement the full reject flow
  try {
    await db.booking_requests.update(_bookingId, { status: 'rejected' });
  } catch {
    // Table might not exist yet
  }
}
