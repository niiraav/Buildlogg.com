import React from 'react';

export type FlagType = 'urgent_new' | 'chase' | 'overdue' | 'stale' | 'no_show';

export interface FlagBadgeProps {
  type: FlagType;
  days?: number;
}

const flagClasses: Record<FlagType, { bg: string; text: string; border: string }> = {
  urgent_new: { bg: 'bg-status-blueBg', text: 'text-status-blue', border: 'border-blue-200' },
  chase:      { bg: 'bg-status-amberBg', text: 'text-status-amber', border: 'border-amber-200' },
  overdue:    { bg: 'bg-status-redBg', text: 'text-status-red', border: 'border-red-200' },
  stale:      { bg: 'bg-brand-surface', text: 'text-brand-mid', border: 'border-brand-border' },
  no_show:    { bg: 'bg-status-amberMid', text: 'text-status-amberDark', border: 'border-amber-300' },
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
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-label font-semibold border ${classes.bg} ${classes.text} ${classes.border}`}
    >
      {label}
    </span>
  );
};
