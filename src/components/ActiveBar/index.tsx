import React, { useEffect, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import type { Job, Customer } from '../../lib/db';

export interface ActiveBarProps {
  customer: Customer;
  job: Job;
  elapsedSeconds: number;
  dayNumber?: number;
  onTap?: () => void;
}

function formatDuration(totalSeconds: number): string {
  if (totalSeconds < 60) return '< 1m';
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (hours === 0) return `${minutes}m`;
  return `${hours}h ${minutes}m`;
}

export const ActiveBar: React.FC<ActiveBarProps> = ({
  customer,
  job,
  elapsedSeconds,
  dayNumber,
  onTap,
}) => {
  const [displayTime, setDisplayTime] = useState(formatDuration(elapsedSeconds));

  useEffect(() => {
    const interval = setInterval(() => {
      setDisplayTime(formatDuration(elapsedSeconds + Math.floor((Date.now() - Date.now()) / 1000)));
    }, 60000);
    return () => clearInterval(interval);
  }, [elapsedSeconds]);

  return (
    <div
      onClick={onTap}
      className="h-11 bg-[#111827] flex items-center px-4 gap-2.5 cursor-pointer"
    >
      <span
        className="w-2 h-2 rounded-full bg-[#4ADE80] animate-pulse-dot shrink-0"
      />
      <div className="flex-1 min-w-0">
        <span className="text-sm font-semibold text-white truncate block">
          {customer.name} · {job.title}
        </span>
      </div>
      <span className="text-xs font-medium text-[#9CA3AF] shrink-0">
        {job.is_multi_day && dayNumber !== undefined
          ? `Day ${dayNumber}`
          : displayTime}
      </span>
      <ChevronRight size={16} color="#6B7280" className="shrink-0" />
    </div>
  );
};
