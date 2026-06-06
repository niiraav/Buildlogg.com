import React from 'react';
import type { LineItem } from '../../lib/db';

export interface QuotePreviewCardProps {
  businessName: string;
  customerName: string;
  customerPhone?: string;
  quoteNumber: string;
  jobTitle: string;
  lineItems: LineItem[];
  paymentTerms: string;
  depositPct?: number;
  quoteValidDays: number;
  quoteSentDate?: Date;
  scheduledStart?: string;
  scheduledEnd?: string;
  notes?: string;
}

export const QuotePreviewCard: React.FC<QuotePreviewCardProps> = (props) => {
  const {
    businessName,
    customerName,
    customerPhone,
    quoteNumber,
    jobTitle,
    lineItems,
    paymentTerms,
    quoteValidDays,
    quoteSentDate,
    scheduledStart,
    scheduledEnd,
    notes,
  } = props;

  const total = lineItems.reduce((sum, item) => sum + item.amount, 0);

  const termsLabel =
    paymentTerms === 'on_completion' ? 'On completion'
    : paymentTerms === 'deposit' ? 'Deposit + balance on completion'
    : 'Invoice after work';

  const formatTime = (d: Date): string => {
    const str = d.toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit', hour12: true }).toLowerCase();
    return str.replace(':00', '');
  };

  const formatDateTime = (start?: string, end?: string): string => {
    if (!start) return 'TBC';
    const s = new Date(start);
    const startStr = s.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
    const startTime = formatTime(s);
    if (!end) return `${startStr} · ${startTime}`;
    const e = new Date(end);
    const endTime = formatTime(e);
    return `${startStr} · ${startTime}–${endTime}`;
  };

  const validUntil = () => {
    if (quoteSentDate) {
      const d = new Date(quoteSentDate);
      d.setDate(d.getDate() + quoteValidDays);
      return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    }
    const d = new Date();
    d.setDate(d.getDate() + quoteValidDays);
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  const customerDisplay = customerPhone
    ? `${customerName} · ${customerPhone}`
    : customerName;

  return (
    <div className="border border-[#E5E7EB] rounded-xl overflow-hidden">
      {/* Header — white bg, ref + status badge */}
      <div className="px-4 pt-3.5 pb-2.5 border-b border-[#F3F4F6]">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[12px] font-medium text-[#9CA3AF]">
            {quoteNumber ? `Quote #${quoteNumber}` : 'Quote'}
          </span>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-[3px] rounded-md bg-[#EFF6FF] text-[#1D4ED8] text-[10px] font-bold uppercase tracking-[0.4px]">
            <span className="w-[5px] h-[5px] rounded-full bg-[#1D4ED8]" />
            Quoted
          </span>
        </div>
        <div className="text-[18px] font-bold text-[#111827]">{jobTitle}</div>
        <div className="text-[13px] text-[#6B7280] mt-0.5">{customerDisplay}</div>
      </div>

      {/* Info rows */}
      <div className="border-b border-[#F3F4F6]">
        <div className="flex justify-between items-center px-4 py-2.5 border-b border-[#F9FAFB]">
          <span className="text-[13px] text-[#9CA3AF]">Date &amp; time</span>
          <span className="text-[13px] font-medium text-[#111827] text-right">
            {formatDateTime(scheduledStart, scheduledEnd)}
          </span>
        </div>
        <div className="flex justify-between items-center px-4 py-2.5 border-b border-[#F9FAFB]">
          <span className="text-[13px] text-[#9CA3AF]">Payment</span>
          <span className="text-[13px] font-medium text-[#111827] text-right">{termsLabel}</span>
        </div>
        <div className="flex justify-between items-center px-4 py-2.5">
          <span className="text-[13px] text-[#9CA3AF]">Valid until</span>
          <span className="text-[13px] font-medium text-[#111827] text-right">{validUntil()}</span>
        </div>
      </div>

      {/* Items block */}
      <div className="px-4 pt-3 pb-0">
        {lineItems.map((item, idx) => (
          <div
            key={item.id}
            className={`flex justify-between py-1.5 text-[13px] text-[#374151] ${
              idx < lineItems.length - 1 ? 'border-b border-[#F9FAFB]' : ''
            }`}
          >
            <span>{item.description}</span>
            <span className="font-medium text-[#111827]">£{item.amount.toFixed(2)}</span>
          </div>
        ))}
      </div>

      {/* Notes */}
      {notes && (
        <div className="px-4 py-2.5 border-t border-[#F9FAFB]">
          <p className="text-[12px] text-[#6B7280] leading-relaxed whitespace-pre-line">{notes}</p>
        </div>
      )}

      {/* Total row */}
      <div className="flex justify-between items-center px-4 py-3 border-t-[1.5px] border-[#111827] mt-0">
        <span className="text-[16px] font-bold text-[#111827]">Total</span>
        <span className="text-[20px] font-extrabold text-[#111827]">£{total.toFixed(2)}</span>
      </div>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-[#F3F4F6] text-[12px] text-[#9CA3AF] leading-relaxed">
        {businessName}
      </div>
    </div>
  );
};
