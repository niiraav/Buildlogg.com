import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Check, MessageCircle, Banknote, CreditCard, AlertTriangle, ChevronRight } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { db, type Job, type Customer, type LineItem, type WorkLogEntry, type Profile } from '../../lib/db';
import { HomeTabSwitcher } from '../../components/HomeTabSwitcher';
import { JobCard } from '../../components/JobCard';
import { ActiveBar } from '../../components/ActiveBar';
import { TodayStrip } from '../../components/TodayStrip';
import { TabBar } from '../../components/TabBar';
import SyncIndicator from '../../components/SyncIndicator';
import { BottomSheet, SheetRow } from '../../components/BottomSheet';
import { Button } from '../../components/Button';
import { TaskCard } from '../../components/TaskCard';

/* --- helpers --- */
import { requestNotificationPermission } from '../../lib/notifications';

const now = () => new Date().toISOString();

function isToday(dateStr: string): boolean {
  const d = new Date(dateStr);
  const t = new Date();
  return d.toDateString() === t.toDateString();
}

function daysSince(dateStr: string): number {
  const d = new Date(dateStr);
  const now = new Date();
  return Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
}

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Morning";
  if (h < 17) return "Afternoon";
  return "Evening";
}

function formatAmount(n: number): string {
  return n.toFixed(2);
}

function jobTotal(items: LineItem[]): number {
  return items.reduce((sum, i) => sum + (i.amount || 0), 0);
}

function getDayName(d: Date): string {
  return d.toLocaleDateString('en-GB', { weekday: 'short' });
}

function formatShortDate(d: Date): string {
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

function timeAgo(minutes: number): string {
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} min ago`;
  return `${Math.floor(minutes / 60)}h ago`;
}

/* --- types --- */

type Tab = 'today' | 'tasks';

type SheetState =
  | null
  | 'running_late'
  | 'mark_done'
  | 'mark_done_deposit'
  | 'not_home';

type TaskType = 'overdue' | 'chase' | 'missed_call' | 'no_show' | 'stale_quote' | 'urgent_new';

interface TaskItem {
  id: string;
  jobId: string;
  customerName: string;
  jobTitle: string;
  tag: string;
  amount: string;
  isL2: boolean;
  type: TaskType;
  phone?: string;
  callTime?: string;
  flag?: 'urgent_new' | 'overdue' | 'chase' | 'stale' | 'no_show';
  flagDays?: number;
}

/* --- component --- */

export default function Home() {
  const navigate = useNavigate();
  const location = useLocation();
  const userId = useAppStore((s) => s.userId);

  /* tabs — read initialTab from route state */
  const routeState = (location.state as { initialTab?: Tab } | null) || {};
  const [activeTab, setActiveTab] = useState<Tab>(routeState.initialTab || 'today');

  /* data */
  const [jobs, setJobs] = useState<Job[]>([]);
  const [customers, setCustomers] = useState<Record<string, Customer>>({});
  const [lineItems, setLineItems] = useState<Record<string, LineItem[]>>({});
  const [workLog, setWorkLog] = useState<Record<string, WorkLogEntry[]>>({});
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  /* UI state */
  const [sheet, setSheet] = useState<SheetState>(null);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [lateMsg, setLateMsg] = useState('');
  const [notifiedMap, setNotifiedMap] = useState<Record<string, boolean>>({});

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [tick, setTick] = useState(0);

  /* --- fetch data --- */
  const refresh = useCallback(async () => {
    if (!userId) return;
    const allJobs = await db.jobs.where('user_id').equals(userId).toArray();
    const allCustomers = await db.customers.where('user_id').equals(userId).toArray();
    const allItems = await db.line_items.toArray();
    const allWorkLog = await db.work_log.toArray();
    const prof = await db.profiles.get(userId);

    const custMap: Record<string, Customer> = {};
    allCustomers.forEach((c) => { custMap[c.id] = c; });

    const itemsMap: Record<string, LineItem[]> = {};
    allItems.forEach((i) => {
      if (!itemsMap[i.job_id]) itemsMap[i.job_id] = [];
      itemsMap[i.job_id].push(i);
    });

    const logMap: Record<string, WorkLogEntry[]> = {};
    allWorkLog.forEach((w) => {
      if (!logMap[w.job_id]) logMap[w.job_id] = [];
      logMap[w.job_id].push(w);
    });

    setJobs(allJobs);
    setCustomers(custMap);
    setLineItems(itemsMap);
    setWorkLog(logMap);
    setProfile(prof || null);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    refresh();
    // Request notification permission on first home visit (after onboarding)
    requestNotificationPermission();
  }, [refresh]);

  /* tick for elapsed timer */
  useEffect(() => {
    timerRef.current = setInterval(() => setTick((t) => t + 1), 60000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  /* --- derived --- */
  const activeJob = useMemo(
    () => jobs.find((j) => j.status === 'in_progress' && j.user_id === userId),
    [jobs, userId]
  );

  const bookedToday = useMemo(
    () =>
      jobs
        .filter(
          (j) =>
            j.status === 'booked' &&
            j.user_id === userId &&
            j.scheduled_start &&
            isToday(j.scheduled_start)
        )
        .sort(
          (a, b) =>
            new Date(a.scheduled_start!).getTime() - new Date(b.scheduled_start!).getTime()
        ),
    [jobs, userId]
  );

  const nextUpJob = bookedToday[0] || null;
  const remainingTodayJobs = bookedToday.slice(1);

  const todayState = useMemo(() => {
    if (activeJob) return activeJob.is_multi_day ? 'multi_day' : 'in_progress';
    if (nextUpJob) return 'next_up';
    return 'all_clear';
  }, [activeJob, nextUpJob]);

  const activeElapsed = useMemo(() => {
    if (!activeJob?.actual_start) return 0;
    return Math.floor((Date.now() - new Date(activeJob.actual_start).getTime()) / 1000);
  }, [activeJob, tick]);

  const activeDayNumber = useMemo(() => {
    if (!activeJob?.actual_start || !activeJob.is_multi_day) return undefined;
    const start = new Date(activeJob.actual_start);
    const diff = Math.floor((Date.now() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    return diff;
  }, [activeJob, tick]);

  const totalOwed = useMemo(() => {
    let owed = 0;
    jobs.forEach((j) => {
      if (j.status === 'awaiting_payment') {
        const items = lineItems[j.id] || [];
        owed += items.reduce((sum, i) => sum + (i.amount || 0), 0);
      }
    });
    return owed;
  }, [jobs, lineItems]);

  const tasks = useMemo<TaskItem[]>(() => {
    const items: TaskItem[] = [];

    jobs.forEach((j) => {
      if (j.user_id !== userId) return;
      const c = customers[j.customer_id];
      if (!c) return;
      const total = jobTotal(lineItems[j.id] || []);

      // L2: Can't ignore
      if (j.status === 'no_show') {
        items.push({
          id: `no_show_${j.id}`,
          jobId: j.id,
          customerName: c.name,
          jobTitle: j.title,
          tag: 'No-show',
          amount: j.scheduled_start
            ? new Date(j.scheduled_start).toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit', hour12: true }).toLowerCase()
            : '',
          isL2: true,
          type: 'no_show',
        });
      }

      if (j.status === 'awaiting_payment' && j.invoice_sent_at && daysSince(j.invoice_sent_at) >= 30) {
        items.push({
          id: `overdue_${j.id}`,
          jobId: j.id,
          customerName: c.name,
          jobTitle: j.title,
          tag: 'Overdue',
          amount: `£${formatAmount(total)}`,
          isL2: true,
          type: 'overdue',
          flag: 'overdue',
          flagDays: daysSince(j.invoice_sent_at),
        });
      }

      if (j.status === 'enquiry' && j.created_at) {
        const ageMs = Date.now() - new Date(j.created_at).getTime();
        const ageMinutes = Math.floor(ageMs / (1000 * 60));

        if (j.title === 'Missed call') {
          // Missed calls go to L3 per SCREEN-SPECS.md
          const isUrgent = ageMs < 2 * 60 * 60 * 1000;
          items.push({
            id: `missed_${j.id}`,
            jobId: j.id,
            customerName: c.name,
            jobTitle: j.title,
            tag: 'Missed call',
            amount: c.phone || '',
            isL2: false,
            type: 'missed_call',
            phone: c.phone,
            callTime: timeAgo(ageMinutes),
            flag: isUrgent ? 'urgent_new' : undefined,
          });
        } else if (ageMs < 2 * 60 * 60 * 1000) {
          // Urgent new enquiries (not missed calls) go to L2
          items.push({
            id: `urgent_${j.id}`,
            jobId: j.id,
            customerName: c.name,
            jobTitle: j.title,
            tag: 'New',
            amount: `£${formatAmount(total)}`,
            isL2: true,
            type: 'urgent_new',
            flag: 'urgent_new',
          });
        }
      }

      // L3: When you get a minute
      if (j.status === 'awaiting_payment' && j.invoice_sent_at) {
        const days = daysSince(j.invoice_sent_at);
        if (days >= 1 && days < 30) {
          items.push({
            id: `chase_${j.id}`,
            jobId: j.id,
            customerName: c.name,
            jobTitle: j.title,
            tag: `Chase · ${days}d`,
            amount: `£${formatAmount(total)}`,
            isL2: false,
            type: 'chase',
            flag: 'chase',
            flagDays: days,
          });
        }
      }

      if (j.status === 'quoted' && j.quote_sent_at) {
        const days = daysSince(j.quote_sent_at);
        items.push({
          id: `stale_${j.id}`,
          jobId: j.id,
          customerName: c.name,
          jobTitle: j.title,
          tag: `Stale · ${days}d`,
          amount: `£${formatAmount(total)}`,
          isL2: false,
          type: 'stale_quote',
          flag: 'stale',
          flagDays: days,
        });
      }
    });

    return items;
  }, [jobs, customers, lineItems, userId]);

  const l2Tasks = tasks.filter((t) => t.isL2);
  const l3Tasks = tasks.filter((t) => !t.isL2);
  const missedCallTasks = tasks.filter((t) => t.type === 'missed_call');
  const l3ListTasks = l3Tasks.filter((t) => t.type !== 'missed_call');
  const l2Count = l2Tasks.length;

  /* --- helpers --- */
  const customerFor = (jobId: string) => {
    const j = jobs.find((x) => x.id === jobId);
    return j ? customers[j.customer_id] : undefined;
  };
  const itemsFor = (jobId: string) => lineItems[jobId] || [];
  const totalFor = (jobId: string) => jobTotal(itemsFor(jobId));
  const logFor = (jobId: string) => workLog[jobId] || [];

  const firstName = profile?.full_name?.split(' ')[0] || 'there';
  const today = new Date();
  const todayLabel = `${getDayName(today)}`;
  const jobCountToday = bookedToday.length + (activeJob ? 1 : 0);
  const subLabel = jobCountToday > 0
    ? `${jobCountToday} job${jobCountToday !== 1 ? 's' : ''} today`
    : 'no jobs scheduled';

  /* --- actions --- */

  const handleImHere = async () => {
    if (!nextUpJob || !userId) return;
    const n = now();
    await db.jobs.update(nextUpJob.id, {
      status: 'in_progress',
      actual_start: n,
      updated_at: n,
      _sync_status: 'pending',
    });
    await db.work_log.add({
      id: crypto.randomUUID(),
      job_id: nextUpJob.id,
      type: 'status_change',
      description: 'Job started',
      created_at: n,
      _sync_status: 'pending',
    });
    await db.sync_queue.add({
      operation: 'update',
      table_name: 'jobs',
      record_id: nextUpJob.id,
      payload: { status: 'in_progress', actual_start: n, updated_at: n },
      created_at: n,
      retry_count: 0,
    });
    refresh();
  };

  const handleRunningLate = () => {
    if (!nextUpJob) return;
    const c = customerFor(nextUpJob.id);
    const name = c?.name || 'the customer';
    const time = nextUpJob.scheduled_start
      ? new Date(nextUpJob.scheduled_start).toLocaleTimeString('en-GB', {
          hour: 'numeric',
          minute: '2-digit',
          hour12: true,
        }).toLowerCase()
      : 'soon';
    setLateMsg(
      `Hi ${name}, just a heads up — I'm running a bit late. I should be with you around ${time}. Sorry for any inconvenience!`
    );
    setSelectedJobId(nextUpJob.id);
    setSheet('running_late');
  };

  const handleSendLate = async (method: 'whatsapp' | 'sms') => {
    if (!selectedJobId) return;
    const c = customerFor(selectedJobId);
    if (!c?.phone) return;

    const encoded = encodeURIComponent(lateMsg);
    const url =
      method === 'whatsapp'
        ? `https://wa.me/${c.phone.replace(/\D/g, '')}?text=${encoded}`
        : `sms:${c.phone}?body=${encoded}`;
    window.open(url, '_blank');

    const n = now();
    await db.work_log.add({
      id: crypto.randomUUID(),
      job_id: selectedJobId,
      type: 'customer_notified',
      description: `Customer notified via ${method === 'whatsapp' ? 'WhatsApp' : 'SMS'} · ${new Date().toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit', hour12: true })}`,
      created_at: n,
      _sync_status: 'pending',
    });
    setNotifiedMap((prev) => ({ ...prev, [selectedJobId]: true }));
    setSheet(null);
    refresh();
  };

  const handleNotHome = async () => {
    if (!nextUpJob || !userId) return;
    const n = now();
    await db.jobs.update(nextUpJob.id, {
      status: 'no_show',
      actual_end: n,
      updated_at: n,
      _sync_status: 'pending',
    });
    await db.work_log.add({
      id: crypto.randomUUID(),
      job_id: nextUpJob.id,
      type: 'status_change',
      description: 'Customer not home — no-show logged',
      created_at: n,
      _sync_status: 'pending',
    });
    await db.sync_queue.add({
      operation: 'update',
      table_name: 'jobs',
      record_id: nextUpJob.id,
      payload: { status: 'no_show', actual_end: n, updated_at: n },
      created_at: n,
      retry_count: 0,
    });
    setSheet(null);
    refresh();
  };

  const handleDone = () => {
    if (!activeJob) return;
    setSelectedJobId(activeJob.id);
    if (activeJob.payment_terms === 'deposit' && activeJob.deposit_pct) {
      setSheet('mark_done_deposit');
    } else {
      setSheet('mark_done');
    }
  };

  const handlePayment = async (method: 'cash' | 'terminal' | 'bank_transfer' | 'not_yet') => {
    if (!selectedJobId) return;
    const j = jobs.find((x) => x.id === selectedJobId);
    if (!j) return;
    const total = totalFor(selectedJobId);
    const n = now();

    if (method === 'not_yet') {
      await db.jobs.update(selectedJobId, {
        status: 'awaiting_payment',
        actual_end: n,
        updated_at: n,
        _sync_status: 'pending',
      });
      await db.work_log.add({
        id: crypto.randomUUID(),
        job_id: selectedJobId,
        type: 'status_change',
        description: 'Job completed — payment pending',
        created_at: n,
        _sync_status: 'pending',
      });
    } else {
      const paymentType = j.payment_terms === 'deposit' ? 'balance' : 'full';
      const paymentAmount = j.payment_terms === 'deposit'
        ? total - (j.deposit_pct ? (j.deposit_pct / 100) * total : 0)
        : total;

      await db.payments.add({
        id: crypto.randomUUID(),
        job_id: selectedJobId,
        type: paymentType,
        method,
        amount: paymentAmount,
        recorded_at: n,
        created_at: n,
        _sync_status: 'pending',
      });
      await db.jobs.update(selectedJobId, {
        status: 'paid',
        actual_end: n,
        updated_at: n,
        _sync_status: 'pending',
      });
      await db.work_log.add({
        id: crypto.randomUUID(),
        job_id: selectedJobId,
        type: 'status_change',
        description: `Payment recorded — ${method === 'cash' ? 'Cash' : method === 'terminal' ? 'Terminal' : 'Bank Transfer'} · £${formatAmount(paymentAmount)}`,
        created_at: n,
        _sync_status: 'pending',
      });
    }

    setSheet(null);
    refresh();
  };

  const handleNavigate = (tab: 'home' | 'jobs' | 'activity' | 'settings') => {
    if (tab === 'home') return;
    navigate('/' + tab);
  };

  /* --- render helpers --- */

  const renderNextUpCard = () => {
    if (!nextUpJob) return null;
    const c = customerFor(nextUpJob.id);
    if (!c) return null;
    const total = totalFor(nextUpJob.id);
    const wasNotified = notifiedMap[nextUpJob.id];
    const lastNotify = logFor(nextUpJob.id).filter(
      (w) => w.type === 'customer_notified'
    )[0];
    const showNotify = wasNotified || lastNotify;

    return (
      <div className="px-4 mt-3">
        <JobCard
          job={nextUpJob}
          customer={c}
          lineItemsTotal={total}
          isNextUp={true}
          showAddress={false}
          showNotHome={true}
          onRunningLate={handleRunningLate}
          onImHere={handleImHere}
          onNotHome={handleNotHome}
          onBodyTap={() => navigate(`/jobs/${nextUpJob.id}`)}
        />
        {showNotify && (
          <div className="mt-2 flex items-center gap-1.5">
            <Check size={12} strokeWidth={2.5} className="text-[#15803D]" />
            <span className="text-xs text-[#15803D]">
              Customer notified · {lastNotify?.description.split(' · ')[1] || 'just now'}
            </span>
          </div>
        )}
      </div>
    );
  };

  const renderActiveBar = () => {
    if (!activeJob) return null;
    const c = customerFor(activeJob.id);
    if (!c) return null;
    return (
      <ActiveBar
        customer={c}
        job={activeJob}
        elapsedSeconds={activeElapsed}
        dayNumber={activeDayNumber}
        onTap={() => navigate(`/jobs/${activeJob.id}`)}
        onDone={handleDone}
      />
    );
  };

  const renderRemainingStrip = () => {
    if (remainingTodayJobs.length === 0) return null;
    const stripJobs = remainingTodayJobs.map((j) => {
      const c = customerFor(j.id);
      return {
        time: j.scheduled_start
          ? new Date(j.scheduled_start).toLocaleTimeString('en-GB', {
              hour: 'numeric',
              minute: '2-digit',
              hour12: true,
            }).toLowerCase()
          : '',
        customerName: c?.name || 'Customer',
        jobTitle: j.title,
      };
    });
    return (
      <div className="px-4 mt-3">
        <TodayStrip jobs={stripJobs} onTap={() => navigate('/jobs')} />
      </div>
    );
  };

  const renderNextJobNoCtas = () => {
    if (todayState !== 'in_progress' && todayState !== 'multi_day') return null;
    if (!nextUpJob) return null;
    const c = customerFor(nextUpJob.id);
    if (!c) return null;
    return (
      <div className="px-4 mt-3">
        <JobCard
          job={nextUpJob}
          customer={c}
          lineItemsTotal={totalFor(nextUpJob.id)}
          showAddress={false}
          onBodyTap={() => navigate(`/jobs/${nextUpJob.id}`)}
        />
      </div>
    );
  };

  const renderNoJobsToday = () => (
    <div className="px-4 mt-6">
      <div className="bg-[#F9FAFB] border border-[#E5E7EB] rounded-[10px] p-9 text-center">
        <p className="text-[20px] font-bold text-[#111827]">No jobs today</p>
        <p className="text-[13px] text-[#9CA3AF] mt-1.5">
          {formatShortDate(today)} · Free day
        </p>
        <div className="flex gap-2 mt-5">
          <button
            onClick={() => navigate('/quote')}
            className="flex-1 h-[46px] bg-white border border-[#D1D5DB] rounded-lg text-[13px] font-semibold text-[#111827] cursor-pointer"
          >
            + New Quote
          </button>
          <button
            onClick={() => navigate('/quote', { state: { entryPoint: 'missed_call' } })}
            className="flex-1 h-[46px] bg-white border border-[#D1D5DB] rounded-lg text-[13px] font-semibold text-[#111827] cursor-pointer"
          >
            Log Missed Call
          </button>
        </div>
      </div>
    </div>
  );

  const renderAllClear = () => (
    <div className="px-4 mt-6">
      <div className="border border-dashed border-[#D1D5DB] rounded-[10px] p-8 text-center">
        <p className="text-[16px] font-semibold text-[#111827]">All clear</p>
        <p className="text-[13px] text-[#9CA3AF] mt-1.5">
          Nothing needs your attention today
        </p>
        <div className="flex gap-2 mt-5">
          <button
            onClick={() => navigate('/quote')}
            className="flex-1 h-[46px] bg-white border border-[#D1D5DB] rounded-lg text-[13px] font-semibold text-[#111827] cursor-pointer"
          >
            + New Quote
          </button>
          <button
            onClick={() => navigate('/quote', { state: { entryPoint: 'missed_call' } })}
            className="flex-1 h-[46px] bg-white border border-[#D1D5DB] rounded-lg text-[13px] font-semibold text-[#111827] cursor-pointer"
          >
            Log Missed Call
          </button>
        </div>
      </div>
    </div>
  );

  const renderTasks = () => {
    return (
      <div className="flex-1 px-4 pt-4 pb-4 overflow-y-auto">
        {/* L2 list rows */}
        {l2Tasks.length > 0 && (
          <>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-bold text-[#6B7280] uppercase tracking-[0.7px]">
                Can't ignore
              </span>
            </div>
            <div className="border border-[#D1D5DB] rounded-[10px] overflow-hidden mb-5">
              {l2Tasks.map((task) => (
                <div
                  key={task.id}
                  onClick={() => navigate(`/jobs/${task.jobId}`)}
                  className="flex items-center px-4 py-3 gap-2.5 border-b border-[#F3F4F6] cursor-pointer min-h-[56px] last:border-b-0"
                >
                  <span className="text-[10px] font-bold text-[#111827] bg-[#F3F4F6] px-[7px] py-[2px] rounded-[4px] uppercase tracking-wide whitespace-nowrap shrink-0">
                    {task.tag}
                  </span>
                  <span className="text-[14px] font-semibold text-[#111827] flex-1 min-w-0 truncate">
                    {task.customerName} · {task.jobTitle}
                  </span>
                  <span className="text-[13px] text-[#6B7280] whitespace-nowrap shrink-0">
                    {task.amount}
                  </span>
                  <ChevronRight size={16} color="#D1D5DB" className="shrink-0" />
                </div>
              ))}
            </div>
          </>
        )}

        {/* L3: Missed call TaskCards */}
        {missedCallTasks.length > 0 && (
          <>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-bold text-[#6B7280] uppercase tracking-[0.7px]">
                When you get a minute
              </span>
            </div>
            <div className="flex flex-col gap-3 mb-5">
              {missedCallTasks.map((task) => (
                <TaskCard
                  key={task.id}
                  type="missed_call"
                  callerPhone={task.phone}
                  callerName={task.customerName === 'Unknown' ? undefined : task.customerName}
                  callTime={`Missed call · ${task.callTime || ''}`}
                  flag={task.flag}
                  flagDays={task.flagDays}
                  primaryAction={{
                    label: 'Call back',
                    onClick: () => {
                      if (task.phone) window.open(`tel:${task.phone}`, '_self');
                    }
                  }}
                  secondaryAction={{
                    label: 'Create quote',
                    onClick: () => {
                      const job = jobs.find(j => j.id === task.jobId);
                      if (job) {
                        navigate('/quote', { state: { entryPoint: 'task', customerId: job.customer_id } });
                      }
                    }
                  }}
                  tertiaryAction={{
                    label: 'Dismiss',
                    onClick: async () => {
                      await db.jobs.delete(task.jobId);
                      await db.work_log.where('job_id').equals(task.jobId).delete();
                      await db.line_items.where('job_id').equals(task.jobId).delete();
                      refresh();
                    }
                  }}
                />
              ))}
            </div>
          </>
        )}

        {/* L3 list rows (non-missed-call) */}
        {l3ListTasks.length > 0 && (
          <>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-bold text-[#6B7280] uppercase tracking-[0.7px]">
                When you get a minute
              </span>
              {missedCallTasks.length === 0 && (
                <button
                  onClick={() => navigate('/jobs')}
                  className="text-[12px] text-[#6B7280] cursor-pointer"
                >
                  See all
                </button>
              )}
            </div>
            <div className="border border-[#E5E7EB] rounded-[10px] overflow-hidden mb-5">
              {l3ListTasks.map((task) => (
                <div
                  key={task.id}
                  onClick={() => navigate(`/jobs/${task.jobId}`)}
                  className="flex items-center px-4 py-2.5 gap-2.5 border-b border-[#F3F4F6] cursor-pointer min-h-[56px] last:border-b-0"
                >
                  <span className="text-[10px] font-semibold text-[#9CA3AF] bg-[#F9FAFB] border border-[#E5E7EB] px-[7px] py-[2px] rounded-[4px] uppercase whitespace-nowrap shrink-0">
                    {task.tag}
                  </span>
                  <span className="text-[13px] font-medium text-[#374151] flex-1 min-w-0 truncate">
                    {task.customerName} · {task.jobTitle}
                  </span>
                  <span className="text-[12px] text-[#9CA3AF] whitespace-nowrap shrink-0">
                    {task.amount}
                  </span>
                  <ChevronRight size={16} color="#D1D5DB" className="shrink-0" />
                </div>
              ))}
            </div>
          </>
        )}

        {tasks.length === 0 && (
          <div className="flex items-center justify-center h-40">
            <p className="text-[15px] text-[#9CA3AF]">Nothing needs your attention</p>
          </div>
        )}
      </div>
    );
  };

  /* --- selected for sheets --- */
  const selectedCustomer = selectedJobId ? customerFor(selectedJobId) : null;
  const selectedJob = selectedJobId ? jobs.find((j) => j.id === selectedJobId) : null;

  /* --- main render --- */
  if (loading) {
    return (
      <div className="flex flex-col min-h-[100svh]">
        <div className="flex-1 flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-[#E5E7EB] border-t-[#111827] rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-[100svh] relative">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 flex items-start justify-between border-b border-[#F3F4F6]">
        <div>
          <span className="text-[18px] font-bold text-[#111827] block">
            {getGreeting()}, {firstName}
          </span>
          <span className="text-[12px] text-[#9CA3AF] block mt-0.5">
            {todayLabel} · {subLabel}
          </span>
        </div>
        {totalOwed > 0 && (
          <div className="text-right">
            <span className="text-[22px] font-extrabold text-[#111827] block">
              £{Number(totalOwed).toFixed(2)}
            </span>
            <span className="text-[11px] text-[#9CA3AF] block mt-0.5">
              owed to you
            </span>
          </div>
        )}
      </div>

      {/* Sync indicator */}
      <div className="px-4 flex justify-end -mt-1 mb-1">
        <SyncIndicator />
      </div>

      {/* Tab switcher */}
      <HomeTabSwitcher activeTab={activeTab} tasksBadgeCount={l2Count} onChange={setActiveTab} />

      {/* Today tab content */}
      {activeTab === 'today' && (
        <div className="flex-1 pb-4 overflow-y-auto">
          {/* Active bar */}
          {(todayState === 'in_progress' || todayState === 'multi_day') && renderActiveBar()}

          {/* Next Up card */}
          {todayState === 'next_up' && renderNextUpCard()}

          {/* Next job card (no CTAs) when active */}
          {(todayState === 'in_progress' || todayState === 'multi_day') && renderNextJobNoCtas()}

          {/* Remaining today strip */}
          {(todayState === 'next_up' || todayState === 'in_progress' || todayState === 'multi_day') &&
            renderRemainingStrip()}

          {/* No jobs today / All clear */}
          {todayState === 'all_clear' && (
            tasks.length > 0 ? renderNoJobsToday() : renderAllClear()
          )}
        </div>
      )}

      {/* Tasks tab content */}
      {activeTab === 'tasks' && renderTasks()}

      {/* Footer — only show when jobs exist; otherwise buttons are in empty state cards */}
      {jobs.length > 0 && (
        <div className="sticky bottom-0 z-30 bg-white border-t border-[#F3F4F6] shadow-sheet">
          <div className="flex gap-2 px-4 py-2.5 pb-[calc(10px_+_env(safe-area-inset-bottom))]">
            <button
              onClick={() => navigate('/quote')}
              className="flex-1 h-[46px] bg-white border border-[#D1D5DB] rounded-lg text-[13px] font-semibold text-[#111827] cursor-pointer"
            >
              + New Quote
            </button>
            <button
              onClick={() => navigate('/quote', { state: { entryPoint: 'missed_call' } })}
              className="flex-1 h-[46px] bg-white border border-[#D1D5DB] rounded-lg text-[13px] font-semibold text-[#111827] cursor-pointer"
            >
              Log Missed Call
            </button>
          </div>
        </div>
      )}

      {/* Tab bar */}
      <TabBar activeTab="home" onNavigate={handleNavigate} />

      {/* --- Bottom Sheet: Running Late --- */}
      <BottomSheet
        isOpen={sheet === 'running_late'}
        onClose={() => setSheet(null)}
        title={`Running late to ${selectedCustomer?.name || 'the customer'}?`}
      >
        <div className="bg-[#F9FAFB] border border-[#E5E7EB] rounded-lg p-3 mb-4">
          <textarea
            value={lateMsg}
            onChange={(e) => setLateMsg(e.target.value)}
            className="w-full text-[13px] text-[#374151] italic leading-relaxed bg-transparent border-none outline-none resize-none p-0"
            rows={3}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Button
            variant="primary"
            onClick={() => handleSendLate('whatsapp')}
            fullWidth
          >
            <MessageCircle size={18} className="mr-2" />
            Send via WhatsApp
          </Button>
          <Button
            variant="secondary"
            onClick={() => handleSendLate('sms')}
            fullWidth
          >
            Send via SMS
          </Button>
          <Button variant="ghost" onClick={() => setSheet(null)}>
            Cancel
          </Button>
        </div>
      </BottomSheet>

      {/* --- Bottom Sheet: Mark Done (no deposit) --- */}
      <BottomSheet
        isOpen={sheet === 'mark_done'}
        onClose={() => setSheet(null)}
        title="How were you paid?"
        subtitle={
          selectedCustomer && selectedJob
            ? `${selectedCustomer.name} · ${selectedJob.title} · £${formatAmount(totalFor(selectedJob.id))}`
            : undefined
        }
      >
        <div className="flex flex-col">
          <SheetRow
            icon={<Banknote size={18} color="#374151" />}
            label="Cash"
            onTap={() => handlePayment('cash')}
          />
          <SheetRow
            icon={<CreditCard size={18} color="#374151" />}
            label="Terminal"
            onTap={() => handlePayment('terminal')}
          />
          <SheetRow
            icon={<CreditCard size={18} color="#374151" />}
            label="Bank Transfer"
            onTap={() => handlePayment('bank_transfer')}
          />
          <SheetRow
            icon={<AlertTriangle size={18} color="#DC2626" />}
            label="Not yet"
            sublabel="Chase later"
            onTap={() => handlePayment('not_yet')}
            variant="destructive"
            isLast
          />
        </div>
      </BottomSheet>

      {/* --- Bottom Sheet: Mark Done (deposit) --- */}
      <BottomSheet
        isOpen={sheet === 'mark_done_deposit'}
        onClose={() => setSheet(null)}
        title={`Balance to collect: £${formatAmount(
          selectedJob
            ? totalFor(selectedJob.id) -
                (selectedJob.deposit_pct
                  ? (selectedJob.deposit_pct / 100) * totalFor(selectedJob.id)
                  : 0)
            : 0
        )}`}
        subtitle={
          selectedCustomer && selectedJob
            ? `${selectedCustomer.name} · ${selectedJob.title} · £${formatAmount(
                selectedJob.deposit_pct
                  ? (selectedJob.deposit_pct / 100) * totalFor(selectedJob.id)
                  : 0
              )} deposit already paid`
            : undefined
        }
      >
        <div className="flex flex-col">
          <SheetRow
            icon={<CreditCard size={18} color="#374151" />}
            label="Terminal"
            onTap={() => handlePayment('terminal')}
          />
          <SheetRow
            icon={<Banknote size={18} color="#374151" />}
            label="Cash"
            onTap={() => handlePayment('cash')}
          />
          <SheetRow
            icon={<AlertTriangle size={18} color="#DC2626" />}
            label="Not yet"
            sublabel="Chase later"
            onTap={() => handlePayment('not_yet')}
            variant="destructive"
            isLast
          />
        </div>
      </BottomSheet>
    </div>
  );
}
