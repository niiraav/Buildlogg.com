/**
 * Stripe Checkout helper — calls the Cloudflare Pages Function to create
 * a Stripe Checkout Session and returns the payment URL.
 *
 * The Function at /api/create-checkout-session handles:
 *   - Creating the Stripe Checkout Session (single-account mode)
 *   - Storing the session in the checkout_sessions table
 *   - Returning { url, id }
 *
 * The webhook at /api/stripe-webhook handles payment completion:
 *   - Updates job.deposit_status = 'paid' + job.status
 *   - Creates a payments record with method: 'card'
 */
export interface CheckoutSessionResult {
  url: string;
  id: string;
}

export async function createCheckoutSession(params: {
  merchantId: string;
  jobId: string;
  amount: number;
  description: string;
  type: 'deposit' | 'full';
}): Promise<CheckoutSessionResult> {
  const { merchantId, jobId, amount, description, type } = params;

  if (!merchantId || !amount || amount <= 0) {
    throw new Error('Invalid parameters');
  }

  const resp = await fetch('/api/create-checkout-session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ merchantId, jobId, amount, description, type }),
  });

  const data = await resp.json();

  if (!resp.ok) {
    throw new Error(data.error || 'Could not create payment link');
  }

  return data as CheckoutSessionResult;
}
