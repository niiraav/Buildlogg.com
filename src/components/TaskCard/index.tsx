import React from 'react';
import { X } from 'lucide-react';
import type { Job, Customer } from '../../lib/db';
import { FlagBadge, type FlagType } from '../FlagBadge';
import { Button } from '../Button';

export type TaskType = 'overdue' | 'chase' | 'missed_call' | 'no_show' | 'stale_quote' | 'urgent_new';

export interface TaskCardProps {
  type: TaskType;
  job?: Job;
  customer?: Customer;
  flag?: FlagType;
  flagDays?: number;
  callerPhone?: string;
  callerName?: string;
  callTime?: string;
  primaryAction?: { label: string; onClick: () => void };
  secondaryAction?: { label: string; onClick: () => void };
  tertiaryAction?: { label: string; onClick: () => void };
  onDismiss?: () => void;
}

export const TaskCard: React.FC<TaskCardProps> = ({
  type,
  job,
  customer,
  flag,
  flagDays,
  callerPhone,
  callerName,
  callTime,
  primaryAction,
  secondaryAction,
  tertiaryAction,
  onDismiss,
}) => {
  const contextText =
    type === 'missed_call'
      ? callerName || callerPhone || 'Missed call'
      : customer && job
      ? `${customer.name} · ${job.title}`
      : customer?.name || 'Task';

  const subText =
    type === 'missed_call'
      ? callTime || 'Missed call'
      : type === 'overdue'
      ? 'Invoice payment overdue'
      : type === 'chase'
      ? 'Chase payment'
      : type === 'stale_quote'
      ? 'Quote still pending'
      : type === 'no_show'
      ? 'Customer did not show'
      : type === 'urgent_new'
      ? 'New enquiry'
      : '';

  const allActions = [primaryAction, secondaryAction, tertiaryAction].filter(Boolean) as Array<{
    label: string;
    onClick: () => void;
  }>;

  return (
    <div className="bg-white border border-[#E5E7EB] rounded-xl p-3.5 px-4">
      {/* Top row */}
      <div className="flex justify-between items-start">
        <div className="flex-1 min-w-0">
          {flag && (
            <div className="mb-1">
              <FlagBadge type={flag} days={flagDays} />
            </div>
          )}
          <div className="text-sm font-semibold text-[#111827] truncate">
            {contextText}
          </div>
          {subText && (
            <div className="text-xs text-[#9CA3AF] mt-1">{subText}</div>
          )}
        </div>
        {onDismiss && (
          <button
            onClick={onDismiss}
            className="w-7 h-7 flex items-center justify-center shrink-0"
            aria-label="Dismiss"
          >
            <X size={16} color="#9CA3AF" />
          </button>
        )}
      </div>

      {/* Action row */}
      {allActions.length > 0 && (
        <div className="mt-3 flex gap-2 flex-wrap">
          {allActions.map((action, i) => (
            <div key={i} className={allActions.length > 1 ? 'flex-1' : ''}>
              <Button
                variant={i === 0 ? 'secondary' : 'secondary'}
                onClick={action.onClick}
                fullWidth={allActions.length > 1}
              >
                {action.label}
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
