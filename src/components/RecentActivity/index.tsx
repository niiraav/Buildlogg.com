import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Banknote, CheckCircle, MessageCircle, Phone, AlertTriangle, ChevronRight } from 'lucide-react';
import { db, type Customer, type WorkLogEntry } from '../../lib/db';
import { useAppStore } from '../../store/useAppStore';
import { filterEvents, type ActivityEvent } from '../../lib/activityFilter';
import { haptic } from '../../lib/haptics';

const TYPE_CONFIG: Record<
  ActivityEvent['type'],
  { icon: React.ReactNode; label: string; colorClass: string; bgClass: string }
> = {
  payment: { icon: <Banknote size={16} />, label: 'Payment', colorClass: 'text-status-green', bgClass: 'bg-status-greenBg' },
  milestone: { icon: <CheckCircle size={16} />, label: 'Milestone', colorClass: 'text-brand-mid', bgClass: 'bg-brand-surface' },
  quote: { icon: <MessageCircle size={16} />, label: 'Quote sent', colorClass: 'text-brand-mid', bgClass: 'bg-brand-surface' },
  lead: { icon: <Phone size={16} />, label: 'New lead', colorClass: 'text-brand-mid', bgClass: 'bg-brand-surface' },
  cancellation: { icon: <AlertTriangle size={16} />, label: 'Cancelled', colorClass: 'text-status-red', bgClass: 'bg-red-50' },
};

function timeAgo(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'Yesterday';
  return `${days}d ago`;
}

export default function RecentActivity() {
  const navigate = useNavigate();
  const userId = useAppStore((s) => s.userId);
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      return;
    }

    const allJobs = await db.jobs.where('user_id').equals(userId).toArray();
    const jobIds = allJobs.map((j) => j.id);

    if (jobIds.length === 0) {
      setEvents([]);
      setLoading(false);
      return;
    }

    const CHUNK = 200;
    let allLogs: WorkLogEntry[] = [];
    for (let i = 0; i < jobIds.length; i += CHUNK) {
      const chunk = jobIds.slice(i, i + CHUNK);
      const logs = await db.work_log.where('job_id').anyOf(chunk).toArray();
      allLogs = allLogs.concat(logs);
    }

    const customerIds = [...new Set(allJobs.map((j) => j.customer_id))];
    const customers = await db.customers.bulkGet(customerIds);
    const customerMap = new Map<string, Customer>();
    customers.filter(Boolean).forEach((c) => customerMap.set(c!.id, c!));

    const jobMap = new Map<string, { title: string; customerName: string }>();
    allJobs.forEach((j) => {
      const customer = customerMap.get(j.customer_id);
      jobMap.set(j.id, {
        title: j.title || 'Untitled job',
        customerName: customer?.name ?? 'Unknown customer',
      });
    });

    const filtered = filterEvents(allLogs, jobMap, 30);
    setEvents(filtered.slice(0, 3));
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <div className="px-4 mt-5">
        <div className="h-24 rounded-xl border border-brand-border bg-brand-surface animate-pulse" />
      </div>
    );
  }

  if (events.length === 0) return null;

  return (
    <div className="mt-5">
      <div className="px-4 flex items-center justify-between mb-2">
        <h2 className="text-sm font-bold text-brand-black tracking-tight">Recent</h2>
        <button
          type="button"
          onClick={() => { haptic('light'); navigate('/activity'); }}
          className="inline-flex items-center gap-0.5 text-xs font-medium text-brand-mid hover:text-brand-black transition-colors"
        >
          View all
          <ChevronRight size={14} />
        </button>
      </div>

      <div className="px-4">
        <div className="rounded-xl border border-brand-border bg-[var(--app-shell-bg)] overflow-hidden">
          {events.map((event, index) => {
            const config = TYPE_CONFIG[event.type];
            const isLast = index === events.length - 1;

            return (
              <button
                key={event.id}
                type="button"
                onClick={() => { haptic('light'); navigate(`/jobs/${event.jobId}`); }}
                className={`w-full flex items-start gap-3 px-4 py-3.5 text-left transition-colors hover:bg-brand-surface ${
                  !isLast ? 'border-b border-brand-borderLight' : ''
                }`}
              >
                <div className={`w-8 h-8 rounded-full ${config.bgClass} flex items-center justify-center shrink-0 mt-0.5 ${config.colorClass}`}>
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
                  </p>
                  <p className="text-xs text-brand-muted mt-0.5">{timeAgo(event.timestamp)}</p>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
