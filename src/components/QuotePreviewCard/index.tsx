import React from 'react';
import type { LineItem } from '../../lib/db';

export interface QuotePreviewCardProps {
  businessName: string;
  customerName: string;
  customerPhone?: string;
  jobNumber: string;
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
    jobNumber,
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
    const startStr = s.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' });
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
    <div className="border border-brand-border rounded-xl overflow-hidden">
      {/* Header — white bg, ref + status badge */}
      <div className="px-4 pt-3.5 pb-2.5 border-b border-brand-borderLight">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-sm font-medium text-brand-muted">
            {jobNumber ? `Quote #${jobNumber}` : 'Quote'}
          </span>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-[3px] rounded-full bg-status-blueBg text-status-blue text-micro font-bold tracking-[0.4px]">
            <span className="w-[5px] h-[5px] rounded-full bg-status-blue" />
            Quoted
          </span>
        </div>
        <div className="text-lg font-bold text-brand-black">{jobTitle}</div>
        <div className="text-sm text-brand-mid mt-0.5">{customerDisplay}</div>
      </div>

      {/* Info rows */}
      <div className="border-b border-brand-borderLight">
        <div className="flex justify-between items-start gap-3 px-4 py-2.5 border-b border-brand-surface">
          <span className="text-sm text-brand-muted shrink-0">Date &amp; time</span>
          <span className="text-sm font-medium text-brand-black text-right break-words">
            {formatDateTime(scheduledStart, scheduledEnd)}
          </span>
        </div>
        <div className="flex justify-between items-center px-4 py-2.5 border-b border-brand-surface">
          <span className="text-sm text-brand-muted">Payment</span>
          <span className="text-sm font-medium text-brand-black text-right">{termsLabel}</span>
        </div>
        <div className="flex justify-between items-center px-4 py-2.5">
          <span className="text-sm text-brand-muted">Valid until</span>
          <span className="text-sm font-medium text-brand-black text-right">{validUntil()}</span>
        </div>
      </div>

      {/* Items block */}
      <div className="px-4 pt-3 pb-0">
        {lineItems.map((item, idx) => (
          <div
            key={item.id}
            className={`flex justify-between py-1.5 text-sm text-brand-dark ${
              idx < lineItems.length - 1 ? 'border-b border-brand-surface' : ''
            }`}
          >
            <div className="min-w-0 flex-1 pr-2">
              <span>{item.description}</span>
              {item.detail && item.detail.trim() && (
                <div className="text-xs text-brand-mid mt-0.5 leading-relaxed">{item.detail}</div>
              )}
            </div>
            <span className="font-medium text-brand-black shrink-0">£{item.amount.toFixed(2)}</span>
          </div>
        ))}
      </div>

      {/* Notes */}
      {notes && (
        <div className="px-4 py-2.5 border-t border-brand-surface">
          <p className="text-sm text-brand-mid leading-relaxed whitespace-pre-line">{notes}</p>
        </div>
      )}

      {/* Total row */}
      <div className="flex justify-between items-center px-4 py-3 border-t-[1.5px] border-brand-black mt-0">
        <span className="text-base font-bold text-brand-black">Total</span>
        <span className="text-title font-extrabold text-brand-black">£{total.toFixed(2)}</span>
      </div>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-brand-borderLight text-sm text-brand-muted leading-relaxed">
        {businessName}
      </div>
    </div>
  );
};
