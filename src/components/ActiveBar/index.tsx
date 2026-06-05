import React, { useEffect, useState } from 'react';
import type { Job, Customer } from '../../lib/db';

export interface ActiveBarProps {
  customer: Customer;
  job: Job;
  elapsedSeconds: number;
  dayNumber?: number;
  onTap?: () => void;
  onDone?: () => void;
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
  onDone,
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
      className="h-11 flex items-center px-4 gap-2.5 cursor-pointer border-[1.5px] border-[#111827] rounded-[10px] bg-white mx-4 mt-3"
    >
      <span
        className="w-2 h-2 rounded-full bg-[#111827] shrink-0"
      />
      <div className="flex-1 min-w-0">
        <span className="text-[13px] font-semibold text-[#111827] truncate block">
          {customer.name} · {job.title}
        </span>
      </div>
      <span className="text-xs font-medium text-[#6B7280] shrink-0">
        {job.is_multi_day && dayNumber !== undefined
          ? `Day ${dayNumber}`
          : displayTime}
      </span>
      {onDone && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDone();
          }}
          className="h-[30px] px-3 bg-[#111827] text-white rounded-md text-[11px] font-bold tracking-wide shrink-0 cursor-pointer"
        >
          Done
        </button>
      )}
    </div>
  );
};
