import React from 'react';
import { Clock, MapPin, ArrowRight, Phone, MessageCircle } from 'lucide-react';
import type { Job, Customer } from '../../lib/db';
import { FlagBadge, type FlagType } from '../FlagBadge';
import { haptic } from '../../lib/haptics';

export interface JobCardProps {
  job: Job;
  customer: Customer;
  lineItemsTotal: number;
  isNextUp?: boolean;
  flag?: FlagType;
  flagDays?: number;
  onRunningLate?: () => void;
  onImHere?: () => void;
  onBodyTap?: () => void;
}

export const JobCard: React.FC<JobCardProps> = ({
  job,
  customer,
  lineItemsTotal,
  isNextUp = false,
  flag,
  flagDays,
  onRunningLate: _onRunningLate,
  onImHere,
  onBodyTap,
}) => {
  const formattedTime = job.scheduled_start
    ? new Date(job.scheduled_start).toLocaleTimeString('en-GB', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      }).toLowerCase()
    : null;

  if (!isNextUp) {
    return (
      <div
        className="bg-white border border-brand-border rounded-xl p-4 cursor-pointer active:scale-[0.98] active:bg-brand-borderLight/50 transition-all duration-150"
        onClick={() => { haptic('light'); onBodyTap?.(); }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            {flag && <FlagBadge type={flag} days={flagDays} />}
            <h3 className="text-base font-bold text-brand-black truncate">{customer.name}</h3>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0 ml-2">
            {formattedTime && (
              <div className="flex items-center gap-1.5">
                <Clock size={14} className="text-brand-muted" />
                <span className="text-sm text-brand-mid font-medium">{formattedTime}</span>
              </div>
            )}
            <ArrowRight size={16} className="text-brand-muted" />
          </div>
        </div>
        <div className="flex items-center justify-between mt-1">
          <p className="text-sm text-brand-mid truncate">{job.title}</p>
          <span className="text-md font-bold text-brand-black ml-2 flex-shrink-0">£{lineItemsTotal.toFixed(2)}</span>
        </div>
        <div className="flex items-center justify-between mt-1">
          {job.job_number && <p className="text-xs text-brand-muted">{job.job_number}</p>}
          <span className="text-sm text-brand-muted ml-auto">
            {job.payment_terms === 'on_completion' ? 'On completion'
              : job.payment_terms === 'deposit' ? 'Deposit'
              : 'Invoice'}
          </span>
        </div>
      </div>
    );
  }

  // NextUp card
  const address = customer.address;

  const handleCall = () => {
    haptic('light');
    if (customer.phone) window.open(`tel:${customer.phone}`, '_self');
  };

  const handleMessage = () => {
    haptic('light');
    const phone = customer.phone?.replace(/\D/g, '');
    if (!phone) return;
    const text = encodeURIComponent(`Hi ${customer.name}, I'm on my way to you now for the ${job.title}.`);
    window.open(`https://wa.me/${phone}?text=${text}`, '_blank');
  };

  const handleNavigate = () => {
    haptic('light');
    if (address) {
      window.open(`https://maps.google.com/?q=${encodeURIComponent(address)}`, '_blank');
    }
  };

  return (
    <div className="bg-white border-2 border-brand-border rounded-2xl p-4 overflow-hidden">
      <div onClick={() => { haptic('light'); onBodyTap?.(); }} className="cursor-pointer active:opacity-80 transition-opacity duration-100">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-blue-500 inline-block" />
            <span className="text-micro font-bold tracking-[0.7px] text-blue-600">
              NEXT UP
            </span>
          </div>
          {formattedTime && (
            <div className="flex items-center gap-1.5">
              <Clock size={12} className="text-brand-mid" />
              <span className="text-xxs font-medium text-brand-mid">{formattedTime}</span>
            </div>
          )}
        </div>

        <div className="mt-2.5">
          <h3 className="text-base font-bold text-brand-black truncate">{customer.name}</h3>
          <p className="text-sm text-brand-mid mt-0.5 truncate">{job.title}</p>
          {job.job_number && <p className="text-xs text-brand-muted mt-0.5">{job.job_number}</p>}
        </div>

        {address && (
          <button
            onClick={(e) => { e.stopPropagation(); handleNavigate(); }}
            className="mt-2 flex items-center gap-1.5 text-left w-full cursor-pointer active:opacity-70 transition-opacity duration-100"
          >
            <MapPin size={14} className="text-blue-500 shrink-0" />
            <span className="text-sm text-blue-600 underline underline-offset-2 truncate">{address}</span>
          </button>
        )}

        <div className="mt-2 flex items-center justify-between">
          <span className="text-base font-bold text-brand-black">£{lineItemsTotal.toFixed(2)}</span>
          <span className="text-sm text-brand-muted">
            {job.payment_terms === 'on_completion' ? 'On completion'
              : job.payment_terms === 'deposit' ? 'Deposit'
              : 'Invoice'}
          </span>
        </div>
      </div>

      <div className="mt-3 flex gap-2" onClick={(e) => e.stopPropagation()}>
        <button
          onClick={handleCall}
          className="flex-1 h-12 flex items-center justify-center gap-2 rounded-xl bg-white border-2 border-brand-border text-brand-black text-sm font-semibold cursor-pointer active:bg-brand-borderLight transition-colors duration-100"
        >
          <Phone size={16} />
          Call
        </button>
        <button
          onClick={handleMessage}
          className="flex-1 h-12 flex items-center justify-center gap-2 rounded-xl bg-white border-2 border-brand-border text-brand-black text-sm font-semibold cursor-pointer active:bg-brand-borderLight transition-colors duration-100"
        >
          <MessageCircle size={16} />
          Message
        </button>
      </div>

      {onImHere && (
        <div className="mt-2" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={() => { haptic('medium'); onImHere(); }}
            className="w-full h-12 flex items-center justify-center gap-2 rounded-xl bg-brand-black text-brand-surface text-sm font-semibold cursor-pointer active:brightness-90 transition-all duration-100"
          >
            I&apos;m here
            <ArrowRight size={16} />
          </button>
        </div>
      )}
    </div>
  );
};
