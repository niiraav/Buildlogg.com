import React from 'react';
import { MapPin, Clock } from 'lucide-react';
import type { Job, Customer } from '../../lib/db';
import { FlagBadge, type FlagType } from '../FlagBadge';
import { Button } from '../Button';

export interface JobCardProps {
  job: Job;
  customer: Customer;
  lineItemsTotal: number;
  isNextUp?: boolean;
  flag?: FlagType;
  flagDays?: number;
  showAddress?: boolean;
  showNotHome?: boolean;
  onRunningLate?: () => void;
  onImHere?: () => void;
  onNotHome?: () => void;
  onBodyTap?: () => void;
}

export const JobCard: React.FC<JobCardProps> = ({
  job,
  customer,
  lineItemsTotal,
  isNextUp = false,
  flag,
  flagDays,
  showAddress = true,
  showNotHome = false,
  onRunningLate,
  onImHere,
  onNotHome,
  onBodyTap,
}) => {
  const formattedTime = job.scheduled_start
    ? new Date(job.scheduled_start).toLocaleTimeString('en-GB', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      }).toLowerCase()
    : null;

  const cardBorderClass = isNextUp
    ? 'border-[1.5px] border-[#111827]'
    : 'border border-[#E5E7EB]';

  return (
    <div
      className={`bg-white ${cardBorderClass} rounded-xl p-4`}
      onClick={onBodyTap}
    >
      {/* Eyebrow row */}
      <div className="flex items-center gap-2">
        {isNextUp && (
          <span className="text-[10px] font-bold uppercase tracking-wider text-white bg-[#111827] px-2.5 py-[2px] rounded-[4px]">
            NEXT UP
          </span>
        )}
        {flag && <FlagBadge type={flag} days={flagDays} />}
      </div>

      {/* Customer row */}
      <div className="mt-2">
        <h3 className="text-[18px] font-extrabold text-[#111827]">{customer.name}</h3>
        <p className="text-[13px] text-[#6B7280] mt-0.5">{job.title}</p>
      </div>

      {/* Meta row */}
      <div className="mt-2.5 flex flex-col gap-1">
        {showAddress && customer.address && (
          <div className="flex items-center gap-2">
            <MapPin size={14} color="#9CA3AF" />
            <span className="text-[13px] text-[#6B7280]">{customer.address}</span>
          </div>
        )}
        {showAddress && !customer.address && (
          <div className="flex items-center gap-2">
            <MapPin size={14} color="#9CA3AF" />
            <span className="text-[13px] text-[#6B7280]">No address</span>
          </div>
        )}
        {formattedTime && (
          <div className="flex items-center gap-2">
            <Clock size={14} color="#9CA3AF" />
            <span className="text-[13px] text-[#6B7280]">{formattedTime}</span>
          </div>
        )}
      </div>

      {/* Amount row */}
      <div className="mt-2.5 flex items-center justify-between">
        <span className="text-[15px] font-bold text-[#111827]">
          £{lineItemsTotal.toFixed(2)}
        </span>
        <span className="text-[13px] text-[#9CA3AF]">
          {job.payment_terms === 'on_completion' ? 'On completion'
            : job.payment_terms === 'deposit' ? 'Deposit'
            : 'Invoice'}
        </span>
      </div>

      {/* CTA row */}
      {(onRunningLate || onImHere) && (
        <div className="mt-3.5 flex gap-2" onClick={(e) => e.stopPropagation()}>
          {onRunningLate && (
            <div className="flex-1">
              <Button variant="primary" onClick={onRunningLate} fullWidth>
                Running late
              </Button>
            </div>
          )}
          {onImHere && (
            <div className="flex-1">
              <Button variant="secondary" onClick={onImHere} fullWidth>
                I'm here
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Customer not home link */}
      {showNotHome && onNotHome && (
        <div className="mt-3 text-center">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onNotHome();
            }}
            className="text-[12px] text-[#9CA3AF] underline underline-offset-2 cursor-pointer"
          >
            Customer not home?
          </button>
        </div>
      )}
    </div>
  );
};
