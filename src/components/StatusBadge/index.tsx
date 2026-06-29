import React from 'react';
import type { JobStatus } from '../../lib/db';

export interface StatusBadgeProps {
  status: JobStatus;
  size?: 'sm' | 'md';
}

const statusLabelMap: Record<JobStatus, string> = {
  enquiry: 'Enquiry',
  quoted: 'Quoted',
  booked: 'Booked',
  in_progress: 'Active',
  awaiting_payment: 'Awaiting',
  paid: 'Paid',
  no_show: 'No-Show',
  cancelled: 'Cancelled',
  written_off: 'Written Off',
};

const statusClasses: Record<JobStatus, { bg: string; text: string; dot: string }> = {
  enquiry:       { bg: 'bg-status-slateBg', text: 'text-status-slate', dot: 'bg-status-slate' },
  quoted:        { bg: 'bg-status-violetBg', text: 'text-status-violet', dot: 'bg-status-violet' },
  booked:        { bg: 'bg-status-blueBg', text: 'text-status-blue', dot: 'bg-status-blue' },
  in_progress:   { bg: 'bg-status-blueBg', text: 'text-status-blue', dot: 'bg-status-blue' },
  awaiting_payment: { bg: 'bg-status-amberBg', text: 'text-status-amber', dot: 'bg-status-warning' },
  paid:          { bg: 'bg-status-greenBg', text: 'text-status-green', dot: 'bg-status-success' },
  no_show:       { bg: 'bg-status-amberMid', text: 'text-status-amberDark', dot: 'bg-status-orange' },
  cancelled:     { bg: 'bg-brand-surface', text: 'text-brand-mid', dot: 'bg-brand-muted' },
  written_off:   { bg: 'bg-brand-surface', text: 'text-brand-mid', dot: 'bg-brand-mid' },
};

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, size = 'md' }) => {
  const classes = statusClasses[status];
  const label = statusLabelMap[status];
  const sizeClass = size === 'sm' ? 'text-micro' : 'text-xs';

  return (
    <span
      className={`inline-flex items-center gap-1.5 shrink-0 px-2.5 py-1 rounded-full font-semibold tracking-wide ${classes.bg} ${classes.text} ${sizeClass}`}
    >
      <span className={`w-2 h-2 rounded-full shrink-0 ${classes.dot}`} />
      {label}
    </span>
  );
};
