import React from 'react';
import { X } from 'lucide-react';
import type { LineItem } from '../../lib/db';

export interface InvoiceItemRowProps {
  item: LineItem;
  showRemove?: boolean;
  isAddedOnSite?: boolean;
  onRemove?: () => void;
}

export const InvoiceItemRow: React.FC<InvoiceItemRowProps> = ({
  item,
  showRemove = false,
  isAddedOnSite = false,
  onRemove,
}) => {
  const textColor = isAddedOnSite ? '#15803D' : '#374151';
  const amountColor = isAddedOnSite ? '#15803D' : '#111827';

  return (
    <div className="flex items-center gap-2 py-2.5 border-b border-[#F3F4F6]">
      <span className="flex-1 text-[13px] font-medium truncate" style={{ color: textColor }}>
        {item.description}
      </span>
      <span className="shrink-0 text-sm font-bold" style={{ color: amountColor }}>
        £{item.amount.toFixed(2)}
      </span>
      {showRemove && onRemove && (
        <button
          onClick={onRemove}
          className="w-7 h-7 rounded-full border border-[#E5E7EB] bg-[#F9FAFB] flex items-center justify-center shrink-0"
          aria-label="Remove item"
        >
          <X size={14} color="#9CA3AF" />
        </button>
      )}
    </div>
  );
};

export interface InvoiceTotalRowProps {
  total: number;
}

export const InvoiceTotalRow: React.FC<InvoiceTotalRowProps> = ({ total }) => {
  return (
    <div className="flex justify-between items-center py-3.5 border-t-[1.5px] border-[#111827]">
      <span className="text-[15px] font-bold text-[#111827]">Total</span>
      <span className="text-2xl font-extrabold text-[#111827] tracking-tight">
        £{total.toFixed(2)}
      </span>
    </div>
  );
};
