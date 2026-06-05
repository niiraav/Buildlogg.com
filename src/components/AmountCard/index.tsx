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
    <div className="bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl p-5">
      <span className="text-[11px] font-bold uppercase tracking-wider text-[#9CA3AF]">
        {label}
      </span>
      <div className="mt-1 text-[32px] font-extrabold text-[#111827] tracking-tight">
        £{amount.toFixed(2)}
      </div>
      <p className="mt-1.5 text-[13px] text-[#6B7280]">
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
