import React from 'react';
import { InvoiceItemRow, InvoiceTotalRow } from '../InvoiceItemRow';
import type { LineItem } from '../../lib/db';

export interface QuotePreviewCardProps {
  businessName: string;
  customerName: string;
  quoteNumber: string;
  jobTitle: string;
  lineItems: LineItem[];
  paymentTerms: string;
  depositPct?: number;
  quoteValidDays: number;
  quoteSentDate?: Date;
}

export const QuotePreviewCard: React.FC<QuotePreviewCardProps> = ({
  businessName,
  customerName,
  quoteNumber,
  jobTitle,
  lineItems,
  paymentTerms,
  depositPct,
  quoteValidDays,
  quoteSentDate,
}) => {
  const total = lineItems.reduce((sum, item) => sum + item.amount, 0);
  const depositAmount = depositPct ? total * (depositPct / 100) : 0;
  const balance = total - depositAmount;

  const termsLabel =
    paymentTerms === 'on_completion' ? 'On completion'
    : paymentTerms === 'deposit' ? 'Deposit + balance on completion'
    : 'Invoice after work';

  return (
    <div className="border border-[#E5E7EB] rounded-xl overflow-hidden">
      {/* Header */}
      <div className="bg-[#F9FAFB] border-b border-[#E5E7EB] px-4 py-4">
        <div className="text-[15px] font-bold text-[#111827]">{businessName}</div>
        <div className="text-[13px] text-[#6B7280] mt-0.5">{customerName}</div>
        <div className="text-xs text-[#9CA3AF] mt-0.5">{quoteNumber}</div>
      </div>

      {/* Body */}
      <div className="px-4 py-4">
        <div className="text-sm font-bold text-[#111827]">{jobTitle}</div>

        <div className="mt-4">
          {lineItems.map((item) => (
            <InvoiceItemRow key={item.id} item={item} />
          ))}
        </div>

        <InvoiceTotalRow total={total} />

        {depositPct !== undefined && depositPct > 0 && (
          <div className="mt-2 space-y-1">
            <div className="text-sm text-[#6B7280]">
              Deposit due now: <span className="font-bold text-[#111827]">£{depositAmount.toFixed(2)}</span>
            </div>
            <div className="text-sm text-[#6B7280]">
              Balance on completion: <span className="font-bold text-[#111827]">£{balance.toFixed(2)}</span>
            </div>
          </div>
        )}

        <div className="mt-3 text-sm text-[#6B7280]">
          Payment: <span className="font-bold text-[#111827]">{termsLabel}</span>
        </div>

        <div className="mt-2 text-sm text-[#6B7280]">
          Quote valid for {quoteValidDays} days
        </div>

        {quoteSentDate && (
          <div className="mt-2 text-xs text-[#9CA3AF]">
            Sent {quoteSentDate.toLocaleDateString('en-GB')}
          </div>
        )}
      </div>
    </div>
  );
};
