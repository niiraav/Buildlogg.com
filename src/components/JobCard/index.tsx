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
    ? 'border-2 border-brand-black'
    : 'border border-brand-border';

  return (
    <div
      className={`bg-white ${cardBorderClass} rounded-xl p-4`}
      onClick={onBodyTap}
    >
      {/* Eyebrow row */}
      <div className="flex items-center gap-2">
        {isNextUp && (
          <span className="text-micro font-bold uppercase tracking-wider text-brand-surface bg-brand-black px-2.5 py-0.5 rounded-xs">
            NEXT UP
          </span>
        )}
        {flag && <FlagBadge type={flag} days={flagDays} />}
      </div>

      {/* Customer row */}
      <div className="mt-2">
        <h3 className="text-lg font-extrabold text-brand-black truncate">{customer.name}</h3>
        <p className="text-xs text-brand-mid mt-0.5 truncate">{job.title}</p>
      </div>

      {/* Meta row */}
      <div className="mt-2.5 flex flex-col gap-1">
        {showAddress && customer.address && (
          <div className="flex items-center gap-2">
            <MapPin size={14} className="text-brand-muted" />
            <span className="text-xs text-brand-mid">{customer.address}</span>
          </div>
        )}
        {showAddress && !customer.address && (
          <div className="flex items-center gap-2">
            <MapPin size={14} className="text-brand-muted" />
            <span className="text-xs text-brand-mid">No address</span>
          </div>
        )}
        {formattedTime && (
          <div className="flex items-center gap-2">
            <Clock size={14} className="text-brand-muted" />
            <span className="text-xs text-brand-mid">{formattedTime}</span>
          </div>
        )}
      </div>

      {/* Amount row */}
      <div className="mt-2.5 flex items-center justify-between">
        <span className="text-md font-bold text-brand-black">
          £{lineItemsTotal.toFixed(2)}
        </span>
        <span className="text-xs text-brand-muted">
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
            className="text-xxs text-brand-muted underline underline-offset-2 cursor-pointer"
          >
            Customer not home?
          </button>
        </div>
      )}
    </div>
  );
};
