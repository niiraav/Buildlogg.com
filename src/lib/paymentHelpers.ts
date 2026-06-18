import type { Job, Payment } from './db';

export function formatAmount(n: number): string {
  return n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export interface PaymentSummary {
  totalPaid: number;
  amountDue: number;
  isFullyPaid: boolean;
  nextPaymentType: 'deposit' | 'balance' | 'full';
  depositAmount: number;
  balanceAmount: number;
}

export function paymentSummary(job: Job, payments: Payment[], total: number): PaymentSummary {
  const totalPaid = payments.reduce((sum, p) => sum + (p.amount || 0), 0);
  const depositAmount =
    job.payment_terms === 'deposit' && job.deposit_pct ? total * (job.deposit_pct / 100) : 0;
  const balanceAmount = total - depositAmount;

  let nextPaymentType: PaymentSummary['nextPaymentType'] = 'full';
  let amountDue = Math.max(0, total - totalPaid);

  if (job.payment_terms === 'deposit' && job.deposit_pct) {
    if (totalPaid < depositAmount) {
      nextPaymentType = 'deposit';
      amountDue = Math.max(0, depositAmount - totalPaid);
    } else {
      nextPaymentType = 'balance';
      amountDue = Math.max(0, total - totalPaid);
    }
  } else if (payments.length > 0) {
    nextPaymentType = 'balance';
  }

  return {
    totalPaid,
    amountDue,
    isFullyPaid: amountDue <= 0,
    nextPaymentType,
    depositAmount,
    balanceAmount,
  };
}

export function paymentMethodLabel(method: Payment['method']): string {
  switch (method) {
    case 'cash':
      return 'Cash';
    case 'bank_transfer':
      return 'Bank Transfer';
    case 'terminal':
      return 'Terminal';
    case 'other':
      return 'Other';
    default:
      return method;
  }
}
