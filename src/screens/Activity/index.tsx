import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { db, type Customer, type WorkLogEntry } from '../../lib/db';
import { useAppStore } from '../../store/useAppStore';
import { DaySummaryCard } from '../../components/ActivityCard';
import SyncIndicator from '../../components/SyncIndicator';
import { captureActivityViewed } from '../../lib/analytics';
import { ensureJobNumber } from '../../lib/jobNumbers';
import { filterEvents, groupByDay, type ActivityEvent, type DaySummary } from '../../lib/activityFilter';

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
  const [days, setDays] = useState<DaySummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    captureActivityViewed();
  }, []);

  const load = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      return;
    }

    // Fetch all jobs for this user and backfill missing job numbers
    const allJobs = await db.jobs.where('user_id').equals(userId).toArray();
    const jobsWithNumbers: typeof allJobs = [];
    for (const j of allJobs) {
      jobsWithNumbers.push(j.job_number ? j : await ensureJobNumber(j, userId));
    }
    const jobIds = jobsWithNumbers.map((j) => j.id);

    if (jobIds.length === 0) {
      setDays([]);
      setLoading(false);
      return;
    }

    // Fetch work logs for all jobs (chuncked to avoid Dexie limits)
    const CHUNK = 200;
    let allLogs: WorkLogEntry[] = [];
    for (let i = 0; i < jobIds.length; i += CHUNK) {
      const chunk = jobIds.slice(i, i + CHUNK);
      const logs = await db.work_log.where('job_id').anyOf(chunk).toArray();
      allLogs = allLogs.concat(logs);
    }

    // Sort by created_at descending (newest first)
    allLogs.sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );

    // Build job map with customer info
    const customerIds = [...new Set(allJobs.map((j) => j.customer_id))];
    const customers = await db.customers.bulkGet(customerIds);
    const customerMap = new Map<string, Customer>();
    customers.filter(Boolean).forEach((c) => customerMap.set(c!.id, c!));

    const jobMap = new Map<string, EnrichedJob>();
    jobsWithNumbers.forEach((j) => {
      const customer = customerMap.get(j.customer_id);
      jobMap.set(j.id, {
        id: j.id,
        title: j.title || 'Untitled job',
        customerName: customer?.name ?? 'Unknown customer',
        customerId: j.customer_id,
        jobNumber: j.job_number,
      });
    });

    // Filter and enrich
    const events = filterEvents(allLogs, jobMap, 30); // 30-day window
    const grouped = groupByDay(events);

    setDays(grouped);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

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
      <div className="h-full flex items-center justify-center bg-[var(--app-shell-bg)]">
        <div className="w-8 h-8 border-2 border-brand-border border-t-brand-black rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="bg-[var(--app-shell-bg)]">
      {/* Header */}
      <div className="sticky top-0 z-40 px-4 pt-4 pb-3 bg-[var(--app-shell-bg)] border-b border-brand-borderLight">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-extrabold text-brand-black">Activity</h1>
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
