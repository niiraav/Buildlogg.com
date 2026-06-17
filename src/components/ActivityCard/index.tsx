import React, { useState } from 'react';
import { CheckCircle, MessageCircle, Phone, Banknote, AlertTriangle, ChevronDown, ChevronRight } from 'lucide-react';
import type { ActivityEvent, DaySummary } from '../../lib/activityFilter';
import { haptic } from '../../lib/haptics';

/* ─── icon / color config ─── */

const TYPE_CONFIG: Record<
  ActivityEvent['type'],
  { icon: React.ReactNode; label: string; colorClass: string; bgClass: string }
> = {
  payment: { icon: <Banknote size={14} />, label: 'Payment', colorClass: 'text-status-green', bgClass: 'bg-status-greenBg' },
  milestone: { icon: <CheckCircle size={14} />, label: 'Milestone', colorClass: 'text-brand-mid', bgClass: 'bg-brand-surface' },
  quote: { icon: <MessageCircle size={14} />, label: 'Quote sent', colorClass: 'text-brand-mid', bgClass: 'bg-brand-surface' },
  lead: { icon: <Phone size={14} />, label: 'New lead', colorClass: 'text-brand-mid', bgClass: 'bg-brand-surface' },
  cancellation: { icon: <AlertTriangle size={14} />, label: 'Cancelled', colorClass: 'text-status-red', bgClass: 'bg-red-50' },
};

/* ─── helpers ─── */

function timeAgo(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

/* ─── single event card ─── */

export const ActivityEventCard: React.FC<{
  event: ActivityEvent;
  onTap?: () => void;
}> = ({ event, onTap }) => {
  const config = TYPE_CONFIG[event.type];

  return (
    <div
      onClick={() => { haptic('light'); onTap?.(); }}
      className="flex items-start gap-3 py-2.5 px-1 cursor-pointer active:opacity-60 transition-opacity"
    >
      <div className={`w-7 h-7 rounded-full ${config.bgClass} flex items-center justify-center shrink-0 mt-0.5 ${config.colorClass}`}>
        {config.icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium text-brand-black leading-snug truncate">
            {event.description}
          </p>
          {event.amount > 0 && event.type === 'payment' && (
            <p className="text-sm font-bold text-status-green shrink-0 whitespace-nowrap">
              £{event.amount.toFixed(2)}
            </p>
          )}
        </div>
        <p className="text-xs text-brand-mid mt-0.5">
          {event.customerName} · {event.jobTitle}
          {event.jobNumber && <span className="text-brand-muted"> · {event.jobNumber}</span>}
        </p>
        <p className="text-xs text-brand-muted mt-0.5">{timeAgo(event.timestamp)}</p>
      </div>
    </div>
  );
};

/* ─── day summary (collapsible) ─── */

export const DaySummaryCard: React.FC<{
  day: DaySummary;
  onEventTap?: (event: ActivityEvent) => void;
}> = ({ day, onEventTap }) => {
  const [expanded, setExpanded] = useState(true);

  const hasPayments = day.totalEarned > 0;
  const hasCompleted = day.jobsCompleted > 0;
  const hasQuotes = day.quotesSent > 0;
  const hasLeads = day.newLeads > 0;
  const hasCancellations = day.cancellations > 0;

  const summaryParts: string[] = [];
  if (hasPayments) summaryParts.push(`£${day.totalEarned.toFixed(0)} earned`);
  if (hasCompleted) summaryParts.push(`${day.jobsCompleted} completed`);
  if (hasQuotes) summaryParts.push(`${day.quotesSent} quote${day.quotesSent > 1 ? 's' : ''} sent`);
  if (hasLeads) summaryParts.push(`${day.newLeads} new lead${day.newLeads > 1 ? 's' : ''}`);
  if (hasCancellations) summaryParts.push(`${day.cancellations} cancelled`);

  const summaryText = summaryParts.join(' · ') || `${day.events.length} events`;

  return (
    <div className="mb-4">
      {/* Day header — always visible, tap to expand/collapse */}
      <button
        onClick={() => { haptic('light'); setExpanded((e) => !e); }}
        className="w-full flex items-center justify-between py-2 px-1 cursor-pointer"
      >
        <div className="text-left">
          <h2 className="text-sm font-bold text-brand-black">{day.label}</h2>
          <p className="text-xs text-brand-mid mt-0.5">{summaryText}</p>
        </div>
        {expanded ? <ChevronDown size={18} className="text-brand-muted" /> : <ChevronRight size={18} className="text-brand-muted" />}
      </button>

      {/* Events list — collapsible */}
      {expanded && (
        <div className="border-l-2 border-brand-borderLight ml-3.5 pl-3">
          {day.events.map((event) => (
            <ActivityEventCard
              key={event.id}
              event={event}
              onTap={() => onEventTap?.(event)}
            />
          ))}
        </div>
      )}
    </div>
  );
};
