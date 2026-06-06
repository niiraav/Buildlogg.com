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
  return (
    <div className={`flex items-center gap-2.5 py-2.5 px-3.5 border-b border-brand-borderLight ${isAddedOnSite ? 'bg-status-greenBg' : ''}`}>
      {showRemove && onRemove && (
        <button
          onClick={onRemove}
          className="w-7 h-7 rounded-full border border-brand-border bg-brand-surface flex items-center justify-center shrink-0"
          aria-label="Remove item"
        >
          <X size={14} color="#9CA3AF" />
        </button>
      )}
      <span className="flex-1 text-xs font-medium truncate text-brand-dark">
        {item.description}
      </span>
      <span className={`shrink-0 text-xs font-bold ${isAddedOnSite ? 'text-status-green' : 'text-brand-black'}`}>
        £{item.amount.toFixed(2)}
      </span>
    </div>
  );
};

export interface InvoiceTotalRowProps {
  total: number;
}

export const InvoiceTotalRow: React.FC<InvoiceTotalRowProps> = ({ total }) => {
  return (
    <div className="flex justify-between items-center py-3 px-3.5 border-t border-brand-border">
      <span className="text-md font-bold text-brand-black">Total</span>
      <span className="text-md font-bold text-brand-black">
        £{total.toFixed(2)}
      </span>
    </div>
  );
};
