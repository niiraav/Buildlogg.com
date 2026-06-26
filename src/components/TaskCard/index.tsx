import React from 'react';
import type { Job, Customer } from '../../lib/db';
import { Phone, AlertTriangle, FileText, Banknote, Clock, ArrowRight, Calendar } from 'lucide-react';
import { haptic } from '../../lib/haptics';

export type TaskType = 'overdue' | 'chase' | 'missed_call' | 'no_show' | 'stale_quote' | 'urgent_new' | 'draft_quote' | 'quote_follow_up' | 'recurring_reminder' | 'payment_chase';

export interface TaskCardProps {
  type: TaskType;
  job?: Job;
  customer?: Customer;
  timeAgo?: string;
  amount?: string;
  staleNote?: string;
  title?: string;
  subtitle?: string;
  jobNumber?: string;
  contextLine?: string; // e.g. "Quote saved 2h ago · £450 · No message sent"
  onTap: () => void;
}

const typeConfig: Record<TaskType, { icon: React.ReactNode; label: string; urgency: 'high' | 'medium' | 'low' }> = {
  missed_call: { icon: <Phone size={16} />, label: 'Missed call', urgency: 'high' },
  overdue: { icon: <AlertTriangle size={16} />, label: 'Payment overdue', urgency: 'high' },
  stale_quote: { icon: <FileText size={16} />, label: 'Quote pending', urgency: 'medium' },
  chase: { icon: <Banknote size={16} />, label: 'Chase payment', urgency: 'medium' },
  no_show: { icon: <Clock size={16} />, label: 'No-show', urgency: 'medium' },
  urgent_new: { icon: <Phone size={16} />, label: 'New enquiry', urgency: 'medium' },
  draft_quote: { icon: <FileText size={16} />, label: 'Draft quote', urgency: 'low' },
  quote_follow_up: { icon: <FileText size={16} />, label: 'Follow up quote', urgency: 'medium' },
  recurring_reminder: { icon: <Calendar size={16} />, label: 'Recurring due', urgency: 'low' },
  payment_chase: { icon: <Banknote size={16} />, label: 'Chase payment', urgency: 'medium' },
};

export const TaskCard: React.FC<TaskCardProps> = ({
  type,
  job,
  customer,
  timeAgo,
  amount,
  title: titleOverride,
  subtitle: subtitleOverride,
  jobNumber,
  contextLine,
  onTap,
}) => {
  const config = typeConfig[type];
  const urgencyBorder = {
    high: 'border-l-status-red',
    medium: 'border-l-amber-400',
    low: 'border-l-brand-mid',
  }[config.urgency];

  const title = titleOverride || customer?.name || 'Task';
  const subtitle = subtitleOverride || config.label;
  const displayJobNumber = jobNumber || job?.job_number;

  return (
    <div
      onClick={() => { haptic('light'); onTap(); }}
      className={`bg-white border border-brand-border rounded-2xl overflow-hidden mb-3 cursor-pointer active:scale-[0.98] active:bg-brand-borderLight/50 transition-all duration-150 border-l-4 ${urgencyBorder}`}
    >
      {/* Header row: icon + name, time + chevron */}
      <div className="flex items-center justify-between px-4 pt-3 pb-2.5">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-brand-mid flex-shrink-0">{config.icon}</span>
          <h3 className="text-base font-bold text-brand-black truncate">{title}</h3>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0 ml-2">
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
            {displayJobNumber && <span className="text-brand-muted"> · {displayJobNumber}</span>}
          </p>
          {amount && (
            <span className="text-sm font-bold text-brand-black ml-2 flex-shrink-0">{amount}</span>
          )}
        </div>
        {contextLine && (
          <p className="text-sm text-brand-mid mt-1 truncate">{contextLine}</p>
        )}
      </div>
    </div>
  );
};
