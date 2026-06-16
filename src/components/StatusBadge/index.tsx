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
  in_progress: 'In Progress',
  awaiting_payment: 'Awaiting Payment',
  paid: 'Paid',
  no_show: 'No-Show',
  cancelled: 'Cancelled',
  written_off: 'Written Off',
};

const statusClasses: Record<JobStatus, { bg: string; text: string; dot: string }> = {
  enquiry:       { bg: 'bg-status-blueBg', text: 'text-status-blue', dot: 'bg-blue-300' },
  quoted:        { bg: 'bg-purple-50', text: 'text-purple-700', dot: 'bg-purple-500' },
  booked:        { bg: 'bg-status-blueBg', text: 'text-status-blue', dot: 'bg-blue-500' },
  in_progress:   { bg: 'bg-status-blueBg', text: 'text-status-blue', dot: 'bg-blue-500' },
  awaiting_payment: { bg: 'bg-status-amberBg', text: 'text-status-amber', dot: 'bg-status-warning' },
  paid:          { bg: 'bg-status-greenBg', text: 'text-status-green', dot: 'bg-green-500' },
  no_show:       { bg: 'bg-status-amberMid', text: 'text-status-amberDark', dot: 'bg-orange-500' },
  cancelled:     { bg: 'bg-brand-surface', text: 'text-brand-mid', dot: 'bg-brand-muted' },
  written_off:   { bg: 'bg-brand-surface', text: 'text-brand-mid', dot: 'bg-brand-mid' },
};

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, size = 'md' }) => {
  const classes = statusClasses[status];
  const label = statusLabelMap[status];
  const sizeClass = size === 'sm' ? 'text-micro' : 'text-xs';

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full font-semibold tracking-wide ${classes.bg} ${classes.text} ${sizeClass}`}
    >
      <span className={`w-2 h-2 rounded-full shrink-0 ${classes.dot}`} />
      {label}
    </span>
  );
};
