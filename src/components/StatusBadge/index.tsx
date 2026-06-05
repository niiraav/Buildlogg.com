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
  enquiry:       { bg: 'bg-[#EFF6FF]', text: 'text-[#1D4ED8]', dot: 'bg-[#93C5FD]' },
  quoted:        { bg: 'bg-[#F5F3FF]', text: 'text-[#6D28D9]', dot: 'bg-[#8B5CF6]' },
  booked:        { bg: 'bg-[#EFF6FF]', text: 'text-[#1D4ED8]', dot: 'bg-[#3B82F6]' },
  in_progress:   { bg: 'bg-[#F0FDF4]', text: 'text-[#15803D]', dot: 'bg-[#16A34A]' },
  awaiting_payment: { bg: 'bg-[#FFFBEB]', text: 'text-[#B45309]', dot: 'bg-[#F59E0B]' },
  paid:          { bg: 'bg-[#F0FDF4]', text: 'text-[#15803D]', dot: 'bg-[#16A34A]' },
  no_show:       { bg: 'bg-[#FEF3C7]', text: 'text-[#92400E]', dot: 'bg-[#F97316]' },
  cancelled:     { bg: 'bg-[#F9FAFB]', text: 'text-[#6B7280]', dot: 'bg-[#9CA3AF]' },
  written_off:   { bg: 'bg-[#F9FAFB]', text: 'text-[#6B7280]', dot: 'bg-[#6B7280]' },
};

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, size = 'md' }) => {
  const classes = statusClasses[status];
  const label = statusLabelMap[status];
  const sizeClass = size === 'sm' ? 'text-[10px]' : 'text-xs';

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md capitalize font-semibold ${classes.bg} ${classes.text} ${sizeClass}`}
    >
      <span className={`w-2 h-2 rounded-full shrink-0 ${classes.dot}`} />
      {label}
    </span>
  );
};
