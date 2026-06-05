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

const statusStyles: Record<JobStatus, { bg: string; text: string; dot: string }> = {
  enquiry:       { bg: '#EFF6FF', text: '#1D4ED8', dot: '#93C5FD' },
  quoted:        { bg: '#F5F3FF', text: '#6D28D9', dot: '#8B5CF6' },
  booked:        { bg: '#EFF6FF', text: '#1D4ED8', dot: '#3B82F6' },
  in_progress:   { bg: '#F0FDF4', text: '#15803D', dot: '#16A34A' },
  awaiting_payment: { bg: '#FFFBEB', text: '#B45309', dot: '#F59E0B' },
  paid:          { bg: '#F0FDF4', text: '#15803D', dot: '#16A34A' },
  no_show:       { bg: '#FEF3C7', text: '#92400E', dot: '#F97316' },
  cancelled:     { bg: '#F9FAFB', text: '#6B7280', dot: '#9CA3AF' },
  written_off:   { bg: '#F9FAFB', text: '#6B7280', dot: '#6B7280' },
};

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, size = 'md' }) => {
  const style = statusStyles[status];
  const label = statusLabelMap[status];
  const fontSize = size === 'sm' ? '10px' : '12px';

  return (
    <span
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full capitalize"
      style={{ backgroundColor: style.bg, color: style.text, fontSize, fontWeight: 600 }}
    >
      <span
        className="rounded-full shrink-0"
        style={{ width: 8, height: 8, backgroundColor: style.dot }}
      />
      {label}
    </span>
  );
};
