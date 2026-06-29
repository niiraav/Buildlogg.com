import React, { useEffect, useState } from 'react';
import { MapPin, Clock, Phone, MessageCircle, Check } from 'lucide-react';
import type { Job, Customer } from '../../lib/db';
import { normalizePhone } from '../../lib/phone';

export interface ActiveBarProps {
  customer: Customer;
  job: Job;
  elapsedSeconds: number;
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

  const startedTime = job.actual_start ? formatStartTime(job.actual_start) : '';

  const handleCall = () => {
    if (customer.phone) {
      window.location.href = `tel:${normalizePhone(customer.phone)}`;
    }
  };

  const handleMessage = () => {
    if (customer.phone) {
      window.location.href = `sms:${normalizePhone(customer.phone)}`;
    }
  };

  return (
    <div className="mt-3">
      {/* RIGHT NOW label */}
      <div className="mb-1.5">
        <span className="text-sm font-bold tracking-[0.7px] text-brand-muted">
          RIGHT NOW
        </span>
      </div>

      <div
        onClick={onTap}
        className="bg-white border-2 border-brand-border rounded-2xl overflow-hidden cursor-pointer"
      >
        {/* Status row: IN PROGRESS + dot on left, Started time on right */}
        <div className="flex items-center justify-between px-4 pt-4 pb-2">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-status-blue inline-block" />
            <span className="text-micro text-status-blue">
              IN PROGRESS
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <Clock size={14} className="text-brand-mid" />
            <span className="text-sm font-medium text-brand-mid">
              {startedTime ? `Started ${startedTime}` : displayTime}
            </span>
          </div>
        </div>

        {/* Customer + job title */}
        <div className="px-4 pb-1">
          <h3 className="text-base font-bold text-brand-black truncate">
            {customer.name}
          </h3>
          <p className="text-sm text-brand-mid mt-0.5 truncate">
            {job.title}
          </p>
        </div>

        {/* Address */}
        {customer.address && (
          <div className="px-4 pb-3">
            <div className="flex items-center gap-2">
              <MapPin size={14} className="text-brand-muted flex-shrink-0" />
              <span className="text-sm text-brand-mid truncate">
                {customer.address}
              </span>
            </div>
          </div>
        )}

        {/* Call + Message buttons */}
        <div className="px-4 pb-2.5 flex gap-2" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={handleCall}
            disabled={!customer.phone}
            className="flex-1 flex items-center justify-center gap-2 h-12 rounded-xl border-2 border-brand-border bg-white text-sm font-semibold text-brand-black cursor-pointer disabled:opacity-50"
          >
            <Phone size={16} className="text-brand-mid" />
            Call
          </button>
          <button
            onClick={handleMessage}
            disabled={!customer.phone}
            className="flex-1 flex items-center justify-center gap-2 h-12 rounded-xl border-2 border-brand-border bg-white text-sm font-semibold text-brand-black cursor-pointer disabled:opacity-50"
          >
            <MessageCircle size={16} className="text-brand-mid" />
            Message
          </button>
        </div>

        {/* Mark done button */}
        {onDone && (
          <div className="px-4 pb-4" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDone();
              }}
              className="w-full h-13 flex items-center justify-center gap-2 bg-brand-black text-brand-surface rounded-xl text-sm font-semibold cursor-pointer"
            >
              <Check size={16} />
              Mark done
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
