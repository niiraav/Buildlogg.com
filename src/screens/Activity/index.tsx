import { useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type Customer } from '../../lib/db';
import { useAppStore } from '../../store/useAppStore';
import { DaySummaryCard } from '../../components/ActivityCard';
import SyncIndicator from '../../components/SyncIndicator';
import { captureActivityViewed } from '../../lib/analytics';
import { ensureJobNumber } from '../../lib/jobNumbers';
import { filterEvents, groupByDay, type ActivityEvent, type DaySummary } from '../../lib/activityFilter';
import { SkeletonInline } from '../../components/Skeleton';

interface EnrichedJob {
  id: string;
  title: string;
  customerName: string;
  customerId: string;
  jobNumber?: string;
}

export default function Activity() {
  const navigate = useNavigate();
  const userId = useAppStore((s) => s.userId);

  // Reactive data via useLiveQuery
  const rawJobs = useLiveQuery(() => userId ? db.jobs.where('user_id').equals(userId).toArray() : [], [userId]);
  const rawWorkLog = useLiveQuery(() => db.work_log.toArray(), []);
  const rawCustomers = useLiveQuery(() => userId ? db.customers.where('user_id').equals(userId).toArray() : [], [userId]);

  const loading = rawJobs === undefined || rawWorkLog === undefined || rawCustomers === undefined;

  useEffect(() => {
    captureActivityViewed();
  }, []);

  // Backfill missing job numbers (side effect — can't be in useLiveQuery)
  useEffect(() => {
    if (!userId || !rawJobs) return;
    const needsNumbers = rawJobs.filter((j) => !j.job_number);
    if (needsNumbers.length === 0) return;
    Promise.all(needsNumbers.map((j) => ensureJobNumber(j, userId))).catch(() => {});
  }, [userId, rawJobs]);

  // Derive activity days from raw data
  const days: DaySummary[] = useMemo(() => {
    if (!rawJobs || !rawWorkLog || !rawCustomers) return [];
    if (rawJobs.length === 0) return [];

    // Build customer map
    const customerMap = new Map<string, Customer>();
    rawCustomers.forEach((c) => customerMap.set(c.id, c));

    // Build job map
    const jobMap = new Map<string, EnrichedJob>();
    rawJobs.forEach((j) => {
      const customer = customerMap.get(j.customer_id);
      jobMap.set(j.id, {
        id: j.id,
        title: j.title || 'Untitled job',
        customerName: customer?.name ?? 'Unknown customer',
        customerId: j.customer_id,
        jobNumber: j.job_number,
      });
    });

    // Sort work logs by created_at descending
    const sortedLogs = [...rawWorkLog].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );

    // Filter and enrich
    const events = filterEvents(sortedLogs, jobMap, 30);
    return groupByDay(events);
  }, [rawJobs, rawWorkLog, rawCustomers]);

  const handleEventTap = useCallback(
    (event: ActivityEvent) => {
      if (event.jobId) {
        navigate(`/jobs/${event.jobId}`);
      }
    },
    [navigate]
  );

  const totalDays = days.length;
  const totalEarned = days.reduce((sum, d) => sum + d.totalEarned, 0);
  const totalJobs = days.reduce((sum, d) => sum + d.jobsCompleted, 0);

  if (loading) {
    return (
      <div className="bg-[var(--app-shell-bg)] min-h-[100dvh]">
        <div className="px-4 pt-5 pb-3 border-b border-brand-borderLight">
          <SkeletonInline />
        </div>
      </div>
    );
  }

  return (
    <div className="bg-[var(--app-shell-bg)] flex flex-col min-h-[100dvh]">
      {/* Header */}
      <div className="sticky top-0 z-40 px-4 pt-5 pb-3 bg-[var(--app-shell-bg)] border-b border-brand-borderLight">
        <div className="flex items-center justify-between">
          <h1 className="screen-title text-brand-black">Activity</h1>
          <SyncIndicator />
        </div>
      </div>

      {/* Weekly summary banner (only when there is data) */}
      {days.length > 0 && (
        <div className="px-4 py-3 bg-[var(--app-shell-bg)] border-b border-brand-borderLight">
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <p className="text-xs text-brand-muted">Total earned</p>
              <p className="text-lg font-extrabold text-brand-black">£{totalEarned.toFixed(2)}</p>
            </div>
            <div className="flex-1">
              <p className="text-xs text-brand-muted">Jobs done</p>
              <p className="text-lg font-extrabold text-brand-black">{totalJobs}</p>
            </div>
            <div className="flex-1">
              <p className="text-xs text-brand-muted">Days with activity</p>
              <p className="text-lg font-extrabold text-brand-black">{totalDays}</p>
            </div>
          </div>
          <button
            onClick={() => navigate('/dashboard')}
            className="text-xs font-semibold text-brand-dark mt-2 cursor-pointer"
          >
            View full stats →
          </button>
        </div>
      )}

      {/* Activity list */}
      <div className="px-4 md:px-6 pt-4 md:pt-6 pb-[calc(44px + env(safe-area-inset-bottom))]">
        {days.length === 0 ? (
          <div className="min-h-[50dvh] flex flex-col items-center justify-center text-brand-muted">
            <p className="text-sm">No activity yet</p>
            <p className="text-sm mt-1">Send quotes, mark jobs as paid, or log new leads</p>
          </div>
        ) : (
          <div>
            {days.map((day) => (
              <DaySummaryCard
                key={day.date.toISOString()}
                day={day}
                onEventTap={handleEventTap}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
