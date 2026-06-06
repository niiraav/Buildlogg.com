import React from 'react';
import { ChevronRight } from 'lucide-react';

export interface TodayStripProps {
  jobs: Array<{ time: string; customerName: string; jobTitle: string }>;
  onTap?: () => void;
}

export const TodayStrip: React.FC<TodayStripProps> = ({ jobs, onTap }) => {
  if (jobs.length === 0) return null;

  const first = jobs[0];
  const remaining = jobs.length - 1;

  return (
    <div
      onClick={onTap}
      className="h-11 bg-brand-surface border border-brand-border rounded-lg flex items-center px-3 cursor-pointer"
    >
      <span className="text-xs text-brand-dark truncate flex-1">
        {first.time} · {first.customerName} · {first.jobTitle}
      </span>
      {remaining > 0 && (
        <span className="text-label text-brand-muted flex items-center gap-0.5 shrink-0 ml-1.5">
          +{remaining} more <ChevronRight size={11} color="#9CA3AF" />
        </span>
      )}
    </div>
  );
};
