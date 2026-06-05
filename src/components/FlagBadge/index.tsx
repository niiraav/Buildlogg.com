import React from 'react';

export type FlagType = 'urgent_new' | 'chase' | 'overdue' | 'stale' | 'no_show';

export interface FlagBadgeProps {
  type: FlagType;
  days?: number;
}

const flagStyles: Record<FlagType, { bg: string; text: string }> = {
  urgent_new: { bg: '#EFF6FF', text: '#1D4ED8' },
  chase:      { bg: '#FFFBEB', text: '#B45309' },
  overdue:    { bg: '#FEF2F2', text: '#DC2626' },
  stale:      { bg: '#F9FAFB', text: '#6B7280' },
  no_show:    { bg: '#FEF3C7', text: '#92400E' },
};

const flagLabels: Record<FlagType, (days?: number) => string> = {
  urgent_new: () => 'Urgent · New',
  chase:      (d) => d !== undefined ? `Chase · ${d}d` : 'Chase',
  overdue:    (d) => d !== undefined ? `Overdue · ${d}d` : 'Overdue',
  stale:      (d) => d !== undefined ? `Stale · ${d}d` : 'Stale',
  no_show:    () => 'No-show',
};

export const FlagBadge: React.FC<FlagBadgeProps> = ({ type, days }) => {
  const style = flagStyles[type];
  const label = flagLabels[type](days);

  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold"
      style={{ backgroundColor: style.bg, color: style.text }}
    >
      {label}
    </span>
  );
};
