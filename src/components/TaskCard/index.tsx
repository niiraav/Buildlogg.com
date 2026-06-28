import React from 'react';
import type { Job, Customer } from '../../lib/db';
import { Phone, FileText, Banknote, Clock, ArrowRight, Calendar, AlertTriangle } from 'lucide-react';
import { haptic } from '../../lib/haptics';

export type TaskType = 'missed_call' | 'no_show' | 'urgent_new' | 'draft_quote' | 'quote_follow_up' | 'recurring_reminder' | 'payment_chase' | 'booking_request';

export interface TaskCardProps {
  type: TaskType;
  job?: Job;
  customer?: Customer;
  timeAgo?: string;
  amount?: string;
  duration?: string;
  conflictText?: string;
  requestedDate?: string;
  staleNote?: string;
  title?: string;
  subtitle?: string;
  jobNumber?: string;
  contextLine?: string;
  isSummary?: boolean;
  summaryCount?: number;
  summaryStats?: string;
  onTap: () => void;
}

const typeConfig: Record<TaskType, { icon: React.ReactNode; label: string; urgency: 'high' | 'medium' | 'low' }> = {
  missed_call: { icon: <Phone size={16} />, label: 'Missed call', urgency: 'high' },
  no_show: { icon: <Clock size={16} />, label: 'No-show', urgency: 'medium' },
  urgent_new: { icon: <Phone size={16} />, label: 'New enquiry', urgency: 'medium' },
  draft_quote: { icon: <FileText size={16} />, label: 'Draft quote', urgency: 'low' },
  quote_follow_up: { icon: <FileText size={16} />, label: 'Follow up quote', urgency: 'medium' },
  recurring_reminder: { icon: <Calendar size={16} />, label: 'Recurring due', urgency: 'low' },
  payment_chase: { icon: <Banknote size={16} />, label: 'Chase payment', urgency: 'medium' },
  booking_request: { icon: <Calendar size={16} />, label: 'Booking request', urgency: 'high' },
};

const urgencyChip: Record<'high' | 'medium' | 'low', { label: string; bg: string; text: string }> = {
  high: { label: 'Urgent', bg: 'bg-status-redBg', text: 'text-status-red' },
  medium: { label: 'Follow up', bg: 'bg-status-amberBg', text: 'text-status-amber' },
  low: { label: 'Later', bg: 'bg-brand-borderLight', text: 'text-brand-mid' },
};

function getDaysUntil(dateString?: string): number | null {
  if (!dateString) return null;
  const [y, m, d] = dateString.split('-').map(Number);
  if (!y || !m || !d) return null;
  const target = new Date(y, m - 1, d, 0, 0, 0, 0);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  return Math.floor((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

export const TaskCard: React.FC<TaskCardProps> = ({
  type,
  job,
  customer,
  timeAgo,
  amount,
  duration,
  conflictText,
  requestedDate,
  title: titleOverride,
  subtitle: subtitleOverride,
  jobNumber,
  contextLine,
  isSummary,
  summaryCount,
  summaryStats,
  onTap,
}) => {
  if (isSummary) {
    return (
      <div
        onClick={() => { haptic('light'); onTap(); }}
        className="bg-white border border-status-amber rounded-2xl overflow-hidden cursor-pointer active:scale-[0.98] active:bg-brand-borderLight/50 transition-all duration-150"
      >
        <div className="px-4 py-3.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-brand-mid flex-shrink-0"><Calendar size={16} /></span>
              <h3 className="text-base font-bold text-brand-black truncate">
                {summaryCount} {typeConfig[type].label.toUpperCase()}S
              </h3>
            </div>
            <ArrowRight size={16} className="text-brand-muted flex-shrink-0 ml-2" />
          </div>
          {summaryStats && (
            <p className="text-sm text-brand-mid mt-1 truncate">{summaryStats}</p>
          )}
        </div>
      </div>
    );
  }

  const config = typeConfig[type];
  const daysUntil = type === 'booking_request' ? getDaysUntil(requestedDate) : null;
  const urgencyBorder = (() => {
    if (type !== 'booking_request') {
      return {
        high: 'border-l-status-red',
        medium: 'border-l-amber-400',
        low: 'border-l-brand-mid',
      }[config.urgency];
    }
    if (conflictText) return 'border-l-status-red';
    if (daysUntil === null) return 'border-l-brand-mid';
    if (daysUntil <= 1) return 'border-l-status-red';
    if (daysUntil <= 3) return 'border-l-amber-400';
    return 'border-l-brand-mid';
  })();

  const title = titleOverride || customer?.name || 'Task';
  const subtitle = subtitleOverride || config.label;
  const displayJobNumber = jobNumber || job?.job_number;

  return (
    <div
      onClick={() => { haptic('light'); onTap(); }}
      className={`bg-white border border-brand-border rounded-2xl overflow-hidden cursor-pointer active:scale-[0.98] active:bg-brand-borderLight/50 transition-all duration-150 border-l-4 ${urgencyBorder}`}
    >
      {/* Header row: icon + name, urgency chip, time + chevron */}
      <div className="flex items-center justify-between px-4 pt-3 pb-2.5">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-brand-mid flex-shrink-0">{config.icon}</span>
          <h3 className="text-base font-bold text-brand-black truncate">{title}</h3>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0 ml-2">
          <span className={`inline-flex items-center px-2 py-0.5 rounded-full font-semibold text-micro ${urgencyChip[config.urgency].bg} ${urgencyChip[config.urgency].text}`}>
            {urgencyChip[config.urgency].label}
          </span>
          {timeAgo && (
            <span className="text-sm font-medium text-brand-mid">{timeAgo}</span>
          )}
          <ArrowRight size={16} className="text-brand-muted" />
        </div>
      </div>

      {/* Type + ref, amount */}
      <div className="px-4 pb-3">
        <div className="flex items-center justify-between mt-0.5">
          <p className="text-sm text-brand-mid truncate">
            {subtitle}
            {duration && <span className="text-brand-muted"> · {duration}</span>}
            {displayJobNumber && <span className="text-brand-muted"> · {displayJobNumber}</span>}
          </p>
          {amount && (
            <span className="text-sm font-bold text-brand-black ml-2 flex-shrink-0">{amount}</span>
          )}
        </div>
        {conflictText && (
          <p className="text-sm font-medium text-status-red mt-1 truncate flex items-center gap-1">
            <AlertTriangle size={14} />
            {conflictText}
          </p>
        )}
        {contextLine && (
          <p className="text-sm text-brand-mid mt-1 truncate">{contextLine}</p>
        )}
      </div>
    </div>
  );
};
