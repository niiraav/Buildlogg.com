import React, { useEffect, useState } from 'react';
import { MapPin, Clock } from 'lucide-react';
import type { Job, Customer } from '../../lib/db';
import { StatusBadge } from '../StatusBadge';

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

function formatStartTime(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleTimeString('en-GB', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).toLowerCase();
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
      className="bg-white border-2 border-brand-black rounded-lg mx-4 mt-3 cursor-pointer overflow-hidden"
    >
      {/* Row 1: status badge + elapsed time + Done */}
      <div className="flex items-center justify-between px-4 py-2.5 gap-2.5">
        <StatusBadge status="in_progress" size="sm" />
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs font-medium text-brand-mid flex items-center gap-1">
            <Clock size={12} className="text-brand-mid" />
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
              className="h-13 px-4 bg-brand-black text-brand-surface rounded-xl text-sm font-semibold tracking-wide shrink-0 cursor-pointer"
            >
              Done
            </button>
          )}
        </div>
      </div>

      {/* Row 2: customer name + job title (wireframe l1-title: 16px/700) */}
      <div className="px-4 pb-1">
        <span className="text-base font-bold text-brand-black truncate block">
          {customer.name} · {job.title}
        </span>
      </div>

      {/* Row 3: address + start time */}
      {(customer.address || job.actual_start) && (
        <div className="flex items-center gap-4 px-4 pb-2.5 pt-0">
          {customer.address && (
            <div className="flex items-center gap-1.5 min-w-0">
              <MapPin size={12} className="shrink-0 text-brand-muted" />
              <span className="text-label text-brand-mid truncate">
                {customer.address}
              </span>
            </div>
          )}
          {job.actual_start && (
            <span className="text-label text-brand-muted shrink-0">
              Started {formatStartTime(job.actual_start)}
            </span>
          )}
        </div>
      )}
    </div>
  );
};
