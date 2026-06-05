import React from 'react';

export type FlagType = 'urgent_new' | 'chase' | 'overdue' | 'stale' | 'no_show';

export interface FlagBadgeProps {
  type: FlagType;
  days?: number;
}

const flagClasses: Record<FlagType, { bg: string; text: string; border: string }> = {
  urgent_new: { bg: 'bg-[#EFF6FF]', text: 'text-[#1D4ED8]', border: 'border-[#BFDBFE]' },
  chase:      { bg: 'bg-[#FFFBEB]', text: 'text-[#B45309]', border: 'border-[#FDE68A]' },
  overdue:    { bg: 'bg-[#FEF2F2]', text: 'text-[#DC2626]', border: 'border-[#FECACA]' },
  stale:      { bg: 'bg-[#F9FAFB]', text: 'text-[#6B7280]', border: 'border-[#E5E7EB]' },
  no_show:    { bg: 'bg-[#FEF3C7]', text: 'text-[#92400E]', border: 'border-[#FCD34D]' },
};

const flagLabels: Record<FlagType, (days?: number) => string> = {
  urgent_new: () => 'Urgent · New',
  chase:      (d) => d !== undefined ? `Chase · ${d}d` : 'Chase',
  overdue:    (d) => d !== undefined ? `Overdue · ${d}d` : 'Overdue',
  stale:      (d) => d !== undefined ? `Stale · ${d}d` : 'Stale',
  no_show:    () => 'No-show',
};

export const FlagBadge: React.FC<FlagBadgeProps> = ({ type, days }) => {
  const classes = flagClasses[type];
  const label = flagLabels[type](days);

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border ${classes.bg} ${classes.text} ${classes.border}`}
    >
      {label}
    </span>
  );
};
