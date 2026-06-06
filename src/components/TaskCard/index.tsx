import React from 'react';
import { Phone } from 'lucide-react';
import type { Job, Customer } from '../../lib/db';
import { FlagBadge, type FlagType } from '../FlagBadge';

export type TaskType = 'overdue' | 'chase' | 'missed_call' | 'no_show' | 'stale_quote' | 'urgent_new';

export interface TaskCardProps {
  type: TaskType;
  job?: Job;
  customer?: Customer;
  flag?: FlagType;
  flagDays?: number;
  // For missed_call type only
  callerPhone?: string;
  callerName?: string;
  callTime?: string;
  // Actions
  primaryAction?: { label: string; onClick: () => void };
  secondaryAction?: { label: string; onClick: () => void };
  tertiaryAction?: { label: string; onClick: () => void };
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

  /* ── Missed call card (wireframe S2 mc-card) ── */
  if (type === 'missed_call') {
    const actions = [
      primaryAction,
      secondaryAction,
      tertiaryAction,
    ].filter(Boolean) as Array<{ label: string; onClick: () => void }>;

    return (
      <div className="bg-white border border-gray-300 rounded-lg overflow-hidden mb-5">
        {/* Header row */}
        <div className="flex items-center gap-2.5 px-3.5 py-3">
          <Phone size={18} className="text-brand-mid shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-brand-black truncate">
              {callerPhone || 'Missed call'}
            </div>
            {subText && (
              <div className="text-label text-brand-muted mt-0.5">{subText}</div>
            )}
          </div>
        </div>

        {/* Action row with border separators */}
        {actions.length > 0 && (
          <div className="flex border-t border-brand-borderLight">
            {actions.map((action, i) => {
              const isPrimary = i === 0 || i === 1;
              const isMuted = i === 2;
              return (
                <button
                  key={i}
                  onClick={action.onClick}
                  className={`
                    flex-1 h-11.5 flex items-center justify-center
                    text-xs font-semibold cursor-pointer
                    border-r border-brand-borderLight last:border-r-0
                    ${isPrimary ? 'text-brand-black' : ''}
                    ${isMuted ? 'text-brand-muted font-normal' : ''}
                  `}
                >
                  {action.label}
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  /* ── Generic card (non-missed_call types) ── */
  const allActions = [primaryAction, secondaryAction, tertiaryAction].filter(Boolean) as Array<{
    label: string;
    onClick: () => void;
  }>;

  return (
    <div className="bg-white border border-brand-border rounded-xl px-4 py-3.5">
      <div className="flex justify-between items-start">
        <div className="flex-1 min-w-0">
          {flag && (
            <div className="mb-1">
              <FlagBadge type={flag} days={flagDays} />
            </div>
          )}
          <div className="text-sm font-semibold text-brand-black truncate">
            {contextText}
          </div>
          {subText && (
            <div className="text-xs text-brand-muted mt-1">{subText}</div>
          )}
        </div>
      </div>

      {allActions.length > 0 && (
        <div className="mt-3 flex gap-2 flex-wrap">
          {allActions.map((action, i) => (
            <button
              key={i}
              onClick={action.onClick}
              className="h-11.5 px-4 rounded-lg border border-gray-300 text-xs font-semibold text-brand-black bg-white cursor-pointer"
            >
              {action.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
