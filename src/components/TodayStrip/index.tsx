import React from 'react';
import { Clock, ChevronRight } from 'lucide-react';

export interface TodayStripProps {
  jobs: Array<{ time: string; customerName: string; jobTitle: string }>;
  onTap?: () => void;
}

export const TodayStrip: React.FC<TodayStripProps> = ({ jobs, onTap }) => {
  if (jobs.length === 0) return null;

  const first = jobs[0];
  const remaining = jobs.length - 1;

  const displayText = remaining > 0
    ? `${first.time} · ${first.customerName} · ${first.jobTitle}  +${remaining} more ›`
    : `${first.time} · ${first.customerName} · ${first.jobTitle}`;

  return (
    <div
      onClick={onTap}
      className="h-9 bg-[#F9FAFB] border border-[#E5E7EB] rounded-lg flex items-center px-3 gap-1.5 cursor-pointer"
    >
      <Clock size={13} color="#9CA3AF" />
      <span className="text-[13px] text-[#374151] truncate flex-1">
        {displayText}
      </span>
      {onTap && <ChevronRight size={13} color="#9CA3AF" className="shrink-0" />}
    </div>
  );
};
