import React from 'react';
import { FlagBadge } from '../FlagBadge';

export interface AmountCardProps {
  amount: number;
  label?: string;
  daysOverdue?: number;
  customerName: string;
}

export const AmountCard: React.FC<AmountCardProps> = ({
  amount,
  label = 'Amount due',
  daysOverdue,
  customerName,
}) => {
  return (
    <div className="border border-brand-border rounded-xl p-4">
      <span className="text-label font-bold uppercase tracking-wider text-brand-muted">
        {label}
      </span>
      <div className="mt-1 text-hero font-extrabold text-brand-black tracking-tight">
        £{amount.toFixed(2)}
      </div>
      <p className="mt-1.5 text-xs text-brand-mid">
        for {customerName}
      </p>
      {daysOverdue !== undefined && (
        <div className="mt-3">
          <FlagBadge type="overdue" days={daysOverdue} />
        </div>
      )}
    </div>
  );
};
