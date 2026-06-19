import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Check, MessageCircle, Banknote, CreditCard, AlertTriangle, Clock, Calendar, CheckCircle, Camera, Image as ImageIcon, X } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { db, type Job, type Customer, type LineItem, type WorkLogEntry, type Profile } from '../../lib/db';
import { HomeTabSwitcher } from '../../components/HomeTabSwitcher';
import { JobCard } from '../../components/JobCard';
import { ActiveBar } from '../../components/ActiveBar';
import { TodayStrip } from '../../components/TodayStrip';
import SyncIndicator from '../../components/SyncIndicator';
import { BottomSheet, SheetRow } from '../../components/BottomSheet';
import { Button } from '../../components/Button';
import { TaskCard } from '../../components/TaskCard';
import { ensureJobNumber, ensureInvoiceNumber } from '../../lib/jobNumbers';
import { paymentSummary, paymentMethodLabel } from '../../lib/paymentHelpers';
import { addToSyncQueue } from '../../lib/syncQueue';
import { showToast } from '../../components/Toast/store';

/* --- helpers --- */
import { requestNotificationPermission } from '../../lib/notifications';
import { getStaleInProgressJobs, getOvernightAutoCompletableJobs, autoCompleteJob, markJobAsMultiDay, formatElapsed, daysBetween, type StaleJob } from '../../lib/jobStaleness';
import { capturePhoto, pickPhotoFromLibrary, saveJobPhoto } from '../../lib/photoCapture';
import {
  captureStaleJobNudgeShown,
  captureStaleJobNudgeTapped,
  captureStaleJobNudgeDismissed,
  captureOvernightAutoComplete,
  captureNewJobInterceptShown,
  captureNewJobInterceptMarkDone,
  captureNewJobInterceptLeaveInProgress,
  captureCompletionPhotoTaken,
  captureCompletionPhotoSkipped,
} from '../../lib/analytics';
import RecentActivity from '../../components/RecentActivity';

const now = () => new Date().toISOString();

// Module-level set: dismisses stale job nudges for the current session (resets on page reload)
const dismissedStaleJobs = new Set<string>();

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
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return days[d.getDay()];
}

function formatShortDate(d: Date): string {
  return d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' });
}

function timeAgo(minutes: number): string {
  if (minutes < 1) return 'Just now';
  if (minutes === 1) return '1 min ago';
  if (minutes < 60) return `${minutes} min ago`;
  const h = Math.floor(minutes / 60);
  if (h === 1) return '1h ago';
  return `${h}h ago`;
}

/* --- types --- */

type Tab = 'today' | 'tasks' | 'drafts';

type SheetState =
  | null
  | 'running_late'
  | 'mark_done'
  | 'mark_done_deposit'
  | 'not_home'
  | 'dismiss_confirm'
  | 'finish_previous'

type TaskType = 'overdue' | 'chase' | 'missed_call' | 'no_show' | 'stale_quote' | 'urgent_new' | 'draft_quote';

interface TaskItem {
  id: string;
  jobId: string;
  customerName: string;
  jobTitle: string;
  jobNumber?: string;
  tag: string;
  amount: string;
  isL2: boolean;
  type: TaskType;
  phone?: string;
  callTime?: string;
  flag?: 'urgent_new' | 'overdue' | 'chase' | 'stale' | 'no_show';
  flagDays?: number;
  timeAgo: string;
  contextLine: string;
}

/* --- component --- */

export default function Home() {
  const navigate = useNavigate();
  const location = useLocation();
  const userId = useAppStore((s) => s.userId);

  /* tabs — read initialTab from route state */
  const routeState = (location.state as { initialTab?: Tab } | null) || {};
  const [activeTab, setActiveTab] = useState<Tab>(routeState.initialTab || 'today');
  const [tick, setTick] = useState(0); // forces recompute of timeAgo strings

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
  const [staleJobs, setStaleJobs] = useState<StaleJob[]>([]);
  const [markDoneStep, setMarkDoneStep] = useState<'photo' | 'payment'>('photo');
  const [interceptData, setInterceptData] = useState<{ oldJob: Job; oldCustomerName: string; newJobId: string } | null>(null);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  /* --- fetch data --- */
  const refresh = useCallback(async () => {
    if (!userId) return;
    const allJobs = await db.jobs.where('user_id').equals(userId).toArray();
    const jobsWithNumbers: Job[] = [];
    for (const j of allJobs) {
      jobsWithNumbers.push(j.job_number ? j : await ensureJobNumber(j, userId));
    }
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

    setJobs(jobsWithNumbers);
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

    // Anti-forgetting: fetch stale in-progress jobs + run overnight auto-complete
    if (userId) {
      (async () => {
        // 1. Overnight auto-complete (same-day only)
        const overnightJobs = await getOvernightAutoCompletableJobs(userId);
        if (overnightJobs.length > 0) {
          for (const j of overnightJobs) {
            await autoCompleteJob(j);
          }
          captureOvernightAutoComplete({ count: overnightJobs.length });
          showToast(
            `${overnightJobs.length} job${overnightJobs.length > 1 ? "s" : ""} auto-completed — review and record payment`,
            "info"
          );
        }

        // 2. Fetch stale jobs for the banner
        const stale = await getStaleInProgressJobs(userId);
        setStaleJobs(stale);
        if (stale.length > 0 && stale[0].actual_start) {
          const elapsedH = Math.floor((Date.now() - new Date(stale[0].actual_start).getTime()) / (1000 * 60 * 60));
          captureStaleJobNudgeShown({ jobId: stale[0].id, staleType: stale[0].staleType, elapsedHours: elapsedH });
        }
      })();
    }
  }, [refresh, userId]);

  /* Recompute stale-job banner whenever the job list changes */
  useEffect(() => {
    if (!userId) return;
    getStaleInProgressJobs(userId).then(setStaleJobs);
  }, [jobs, userId]);

  /* tick for elapsed timer */

  useEffect(() => {
    timerRef.current = setInterval(() => setTick((t) => t + 1), 5000);
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


  /* Stale jobs — filtered by dismissed set for this session */
  const visibleStaleJobs = useMemo(() => staleJobs.filter((j) => !dismissedStaleJobs.has(j.id)), [staleJobs, tick]);


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
        const noShowAge = j.actual_end ? Math.floor((Date.now() - new Date(j.actual_end).getTime()) / (1000 * 60)) : 0;
        items.push({
          id: `no_show_${j.id}`,
          jobId: j.id,
          customerName: c.name,
          jobTitle: j.title,
          jobNumber: j.job_number,
          tag: 'No-show',
          amount: j.scheduled_start
            ? new Date(j.scheduled_start).toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit', hour12: true }).toLowerCase()
            : '',
          isL2: true,
          type: 'no_show',
          timeAgo: timeAgo(noShowAge),
          contextLine: j.scheduled_start
            ? `Was scheduled ${new Date(j.scheduled_start).toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit', hour12: true }).toLowerCase()}`
            : 'No-show logged',
        });
      }

      if (j.status === 'awaiting_payment' && j.invoice_sent_at && daysSince(j.invoice_sent_at) >= 30) {
        const overdueAge = daysSince(j.invoice_sent_at);
        items.push({
          id: `overdue_${j.id}`,
          jobId: j.id,
          customerName: c.name,
          jobTitle: j.title,
          jobNumber: j.job_number,
          tag: 'Overdue',
          amount: `£${formatAmount(total)}`,
          isL2: true,
          type: 'overdue',
          flag: 'overdue',
          flagDays: overdueAge,
          timeAgo: `${overdueAge}d overdue`,
          contextLine: '',
        });
      }

      if (j.status === 'enquiry' && j.created_at) {
        const ageMs = Date.now() - new Date(j.created_at).getTime();
        const ageMinutes = Math.floor(ageMs / (1000 * 60));
        const hasLineItems = (lineItems[j.id] || []).length > 0;

        if (j.title === 'Missed call') {
          items.push({
            id: `missed_${j.id}`,
            jobId: j.id,
            customerName: c.name,
            jobTitle: j.title,
            jobNumber: j.job_number,
            tag: 'Missed call',
            amount: c.phone || '',
            isL2: false,
            type: 'missed_call',
            phone: c.phone,
            callTime: timeAgo(ageMinutes),
            timeAgo: timeAgo(ageMinutes),
            contextLine: c.phone || 'Unknown number',
          });
        } else if (hasLineItems) {
          // Draft quote: has line items, not a missed call
          items.push({
            id: `draft_${j.id}`,
            jobId: j.id,
            customerName: c.name,
            jobTitle: j.title,
            jobNumber: j.job_number,
            tag: 'Draft',
            amount: `£${formatAmount(total)}`,
            isL2: false,
            type: 'draft_quote',
            timeAgo: timeAgo(ageMinutes),
            contextLine: '',
          });
        } else if (ageMs < 2 * 60 * 60 * 1000) {
          // Urgent new enquiries (not missed calls, no line items, < 2 hours)
          items.push({
            id: `urgent_${j.id}`,
            jobId: j.id,
            customerName: c.name,
            jobTitle: j.title,
            jobNumber: j.job_number,
            tag: 'New',
            amount: '',
            isL2: false,
            type: 'urgent_new',
            timeAgo: timeAgo(ageMinutes),
            contextLine: 'needs follow-up',
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
            jobNumber: j.job_number,
            tag: `Chase · ${days}d`,
            amount: `£${formatAmount(total)}`,
            isL2: false,
            type: 'chase',
            flag: 'chase',
            flagDays: days,
            timeAgo: `${days}d since invoice`,
            contextLine: '',
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
          jobNumber: j.job_number,
          tag: `Stale · ${days}d`,
          amount: `£${formatAmount(total)}`,
          isL2: false,
          type: 'stale_quote',
          flag: 'stale',
          flagDays: days,
          timeAgo: `${days}d since quote`,
          contextLine: 'no reply yet',
        });
      }
    });

    return items;
  }, [jobs, customers, lineItems, userId, tick]);

  const actTodayTasks = tasks.filter((t) => t.type === 'missed_call' || t.type === 'overdue');
  const draftTasks = tasks.filter((t) => t.type === 'draft_quote');
  const followUpTasks = tasks.filter((t) => t.type !== 'missed_call' && t.type !== 'overdue' && t.type !== 'draft_quote');
  const l2Count = actTodayTasks.length;
  const draftsCount = draftTasks.length;

  // If drafts tab disappears while selected, fall back to Today
  useEffect(() => {
    if (activeTab === 'drafts' && draftsCount === 0) {
      setActiveTab('today');
    }
  }, [activeTab, draftsCount]);

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

    // Anti-forgetting: check for other in-progress non-multi-day jobs
    const inProgressJobs = await db.jobs
      .where('status')
      .equals('in_progress')
      .filter((j) => j.user_id === userId && j.id !== nextUpJob.id && !j.is_multi_day)
      .toArray();

    if (inProgressJobs.length > 0) {
      // Sort by actual_start descending — most recently started first
      inProgressJobs.sort((a, b) => {
        const aStart = a.actual_start ? new Date(a.actual_start).getTime() : 0;
        const bStart = b.actual_start ? new Date(b.actual_start).getTime() : 0;
        return bStart - aStart;
      });
      const oldJob = inProgressJobs[0];
      const oldCustomer = await db.customers.get(oldJob.customer_id);
      captureNewJobInterceptShown({ oldJobId: oldJob.id });
      setInterceptData({
        oldJob,
        oldCustomerName: oldCustomer?.name || 'Job',
        newJobId: nextUpJob.id,
      });
      setSheet('finish_previous');
      return;
    }

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


  const handleDone = () => {
    if (!activeJob) return;
    setSelectedJobId(activeJob.id);
    setMarkDoneStep('photo');
    if (activeJob.payment_terms === 'deposit' && activeJob.deposit_pct) {
      setSheet('mark_done_deposit');
    } else {
      setSheet('mark_done');
    }
  };

  const handlePayment = async (method: 'cash' | 'terminal' | 'bank_transfer' | 'not_yet') => {
    if (!selectedJobId || !userId) return;
    const j = jobs.find((x) => x.id === selectedJobId);
    if (!j) return;
    const total = totalFor(selectedJobId);
    const n = now();

    if (method === 'not_yet') {
      const logId = crypto.randomUUID();
      await db.jobs.update(selectedJobId, {
        status: 'awaiting_payment',
        actual_end: n,
        updated_at: n,
        _sync_status: 'pending',
      });
      await db.work_log.add({
        id: logId,
        job_id: selectedJobId,
        type: 'status_change',
        description: 'Job completed \u2014 payment pending',
        created_at: n,
        _sync_status: 'pending',
      });
      await addToSyncQueue('jobs', selectedJobId, { status: 'awaiting_payment', actual_end: n, updated_at: n }, 'update');
      await addToSyncQueue('work_log', logId, { id: logId, job_id: selectedJobId, type: 'status_change', description: 'Job completed \u2014 payment pending', created_at: n }, 'insert');
      await ensureInvoiceNumber(j, userId);
    } else {
      const payments = await db.payments.where('job_id').equals(selectedJobId).toArray();
      const summary = paymentSummary(j, payments, total);
      if (summary.isFullyPaid || j.status === 'paid') {
        showToast('This job is already paid', 'info', 2000);
        setSheet(null);
        return;
      }
      // For deposit jobs, the mark-done sheet collects the balance (deposit already paid)
      let paymentType = summary.nextPaymentType;
      let paymentAmount = summary.amountDue;
      if (j.payment_terms === 'deposit' && j.deposit_pct) {
        paymentType = 'balance';
        paymentAmount = total - summary.depositAmount;
      }
      const payId = crypto.randomUUID();
      const logId = crypto.randomUUID();
      await db.payments.add({
        id: payId,
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
        id: logId,
        job_id: selectedJobId,
        type: 'status_change',
        description: `Payment recorded \u2014 ${paymentMethodLabel(method)} \u00b7 \u00a3${formatAmount(paymentAmount)}`,
        created_at: n,
        _sync_status: 'pending',
      });
      await addToSyncQueue('payments', payId, { id: payId, job_id: selectedJobId, type: paymentType, method, amount: paymentAmount, recorded_at: n, created_at: n }, 'insert');
      await addToSyncQueue('jobs', selectedJobId, { status: 'paid', actual_end: n, updated_at: n }, 'update');
      await addToSyncQueue('work_log', logId, { id: logId, job_id: selectedJobId, type: 'status_change', description: `Payment recorded \u2014 ${paymentMethodLabel(method)} \u00b7 \u00a3${formatAmount(paymentAmount)}`, created_at: n }, 'insert');
    }

    setSheet(null);
    setMarkDoneStep('photo');
    refresh();
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
      <div className="mt-3">
        <JobCard
          job={nextUpJob}
          customer={c}
          lineItemsTotal={total}
          isNextUp={true}
          onRunningLate={handleRunningLate}
          onImHere={handleImHere}
          onBodyTap={() => navigate(`/jobs/${nextUpJob.id}`)}
        />
        {showNotify && (
          <div className="mt-2 flex items-center gap-1.5">
            <Check size={12} strokeWidth={2.5} className="text-status-green" />
            <span className="text-sm text-status-green">
              Customer notified · {lastNotify?.description.split(' · ')[1] || 'just now'}
            </span>
          </div>
        )}
      </div>
    );
  };

  const renderStaleJobBanner = () => {
    if (visibleStaleJobs.length === 0) return null;
    const job = visibleStaleJobs[0];
    const customerName = job.customer?.name || 'Job';
    const jobTitle = job.title;
    const remaining = visibleStaleJobs.length - 1;

    const handleMarkDone = () => {
      captureStaleJobNudgeTapped({ jobId: job.id, staleType: job.staleType });
      dismissedStaleJobs.add(job.id);
      navigate(`/jobs/${job.id}`, { state: { autoOpenMarkDone: true } });
    };

    const handleStillWorking = async () => {
      if (job.staleType === 'crossed_midnight') {
        // Implicitly set multi-day
        await markJobAsMultiDay(job.id);
        captureStaleJobNudgeDismissed({ jobId: job.id, staleType: job.staleType, multiDaySet: true });
      } else {
        captureStaleJobNudgeDismissed({ jobId: job.id, staleType: job.staleType, multiDaySet: false });
      }
      dismissedStaleJobs.add(job.id);
      setStaleJobs((prev) => prev.filter((j) => !dismissedStaleJobs.has(j.id)));
    };

    const handleMultiDay = async () => {
      await markJobAsMultiDay(job.id);
      captureStaleJobNudgeDismissed({ jobId: job.id, staleType: job.staleType, multiDaySet: true });
      dismissedStaleJobs.add(job.id);
      setStaleJobs((prev) => prev.filter((j) => !dismissedStaleJobs.has(j.id)));
    };

    let subtitle: string;
    let icon = <Clock size={18} className="text-status-amber" />;

    if (job.staleType === 'crossed_midnight') {
      subtitle = 'Started yesterday. Still working on this?';
      icon = <Calendar size={18} className="text-status-amber" />;
    } else if (job.staleType === 'multi_day') {
      const n = job.actual_start ? daysBetween(job.actual_start) : 1;
      subtitle = `Been on this one for ${n} day${n > 1 ? 's' : ''}. Finished?`;
      icon = <Calendar size={18} className="text-status-amber" />;
    } else {
      const elapsed = job.actual_start ? formatElapsed(job.actual_start) : '3h+';
      subtitle = `In progress for ${elapsed}. Still working?`;
    }

    return (
      <div className="mt-3">
        <div className="bg-status-amberBg border border-amber-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1.5">
            {icon}
            <span className="text-sm font-semibold text-status-amber">STILL WORKING?</span>
          </div>
          <h3 className="text-base font-bold text-brand-black truncate">
            {customerName} · {jobTitle}
          </h3>
          <p className="text-sm text-brand-mid mt-0.5">{subtitle}</p>

          <div className="flex gap-2 mt-3">
            <div className="flex-1"><Button variant="primary" onClick={handleMarkDone}><Check size={16} className="mr-1" />Mark as done</Button></div>
            <div className="flex-1"><Button variant="secondary" onClick={handleStillWorking}>Still working</Button></div>
          </div>

          {/* "Multi-day job" option — only for same_day stale */}
          {job.staleType === 'same_day' && (
            <button
              onClick={handleMultiDay}
              className="text-sm text-brand-muted mt-2.5 underline cursor-pointer"
            >
              This is a multi-day job
            </button>
          )}

          {remaining > 0 && (
            <p className="text-sm text-brand-muted mt-2">
              +{remaining} more job still in progress
            </p>
          )}
        </div>
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
        onTap={() => navigate(`/jobs/${activeJob.id}`)}
        onDone={handleDone}
      />
    );
  };

  const renderRemainingStrip = () => {
    if (remainingTodayJobs.length === 0) {
      return (
        <div className="mt-6 flex items-center justify-center gap-2 text-brand-muted">
          <Clock size={16} className="text-brand-muted" />
          <span className="text-sm text-brand-muted">Nothing else booked today</span>
        </div>
      );
    }
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
      <div className="mt-3">
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
      <div className="mt-3">
        <JobCard
          job={nextUpJob}
          customer={c}
          lineItemsTotal={totalFor(nextUpJob.id)}
          onBodyTap={() => navigate(`/jobs/${nextUpJob.id}`)}
        />
      </div>
    );
  };

  const renderNoJobsToday = () => (
    <div className="px-4 mt-6">
      <div className="border border-dashed border-brand-border rounded-lg p-8 text-center">
        <div className="w-14 h-14 rounded-full bg-brand-borderLight flex items-center justify-center mb-3 mx-auto"><Calendar size={24} className="text-brand-muted" /></div>
          <p className="text-base font-semibold text-brand-black">No jobs today</p>
        <p className="text-sm text-brand-muted mt-1.5">
          {formatShortDate(today)} · Free day
        </p>
        <div className="flex gap-2 mt-5">
          <div className="flex-1">
            <Button variant="secondary" onClick={() => navigate('/quote')} fullWidth>
              + New Quote
            </Button>
          </div>
          <div className="flex-1">
            <Button variant="secondary" onClick={() => navigate('/quote', { state: { entryPoint: 'missed_call' } })} fullWidth>
              Log Missed Call
            </Button>
          </div>
        </div>
      </div>
    </div>
  );

  const renderAllClear = () => (
    <div className="px-4 mt-6">
      <div className="border border-dashed border-brand-border rounded-lg p-8 text-center">
        <p className="text-base font-semibold text-brand-black">All clear</p>
        <p className="text-sm text-brand-muted mt-1.5">
          Nothing needs your attention today
        </p>
        <div className="flex gap-2 mt-5">
          <div className="flex-1">
            <Button variant="secondary" onClick={() => navigate('/quote')} fullWidth>
              + New Quote
            </Button>
          </div>
          <div className="flex-1">
            <Button variant="secondary" onClick={() => navigate('/quote', { state: { entryPoint: 'missed_call' } })} fullWidth>
              Log Missed Call
            </Button>
          </div>
        </div>
      </div>
    </div>
  );

  const renderTasks = () => {
    return (
      <div className="pt-4 md:pt-6 pb-[calc(44px + env(safe-area-inset-bottom))] px-4 md:px-6">
        {/* ACT TODAY: Missed calls + overdue payments */}
        {actTodayTasks.length > 0 && (
          <>
            <div className="flex items-center justify-between mb-3">
              <span className="text-micro font-bold text-brand-mid tracking-[0.7px]">
                Act today
              </span>
            </div>
            <div className="flex flex-col gap-3 mb-6">
              {actTodayTasks.map((task) => {
                const j = jobs.find(x => x.id === task.jobId);
                const c = j ? customers[j.customer_id] : undefined;

                return (
                  <TaskCard
                    key={task.id}
                    type={task.type}
                    job={j}
                    customer={c}
                    timeAgo={task.timeAgo}
                    jobNumber={task.jobNumber}
                    amount={task.amount}
                    contextLine={task.contextLine}
                    onTap={() => navigate(`/jobs/${task.jobId}`, { state: { initialTab: 'tasks' } })}
                  />
                );
              })}
            </div>
          </>
        )}

        {/* FOLLOW UP: Everything else */}
        {followUpTasks.length > 0 && (
          <>
            <div className="flex items-center justify-between mb-3">
              <span className="text-micro font-bold text-brand-mid tracking-[0.7px]">
                Follow up
              </span>
            </div>
            <div className="flex flex-col gap-3 mb-6">
              {followUpTasks.map((task) => {
                const j = jobs.find(x => x.id === task.jobId);
                const c = j ? customers[j.customer_id] : undefined;

                return (
                  <TaskCard
                    key={task.id}
                    type={task.type}
                    job={j}
                    customer={c}
                    timeAgo={task.timeAgo}
                    jobNumber={task.jobNumber}
                    amount={task.amount}
                    contextLine={task.contextLine}
                    onTap={() => navigate(`/jobs/${task.jobId}`, { state: { initialTab: 'tasks' } })}
                  />
                );
              })}
            </div>
          </>
        )}

        {tasks.length === 0 && (
          <div className="px-4 mt-6">
            <div className="border border-dashed border-brand-border rounded-lg p-8 text-center">
              <p className="text-base font-semibold text-brand-black">All clear</p>
              <div className="w-14 h-14 rounded-full bg-brand-borderLight flex items-center justify-center mb-3 mx-auto"><CheckCircle size={24} className="text-brand-muted" /></div>
            <p className="text-sm text-brand-muted mt-1.5">Nothing needs your attention</p>
              <div className="flex gap-2 mt-5">
                <div className="flex-1"><Button variant="secondary" onClick={() => navigate('/quote')} fullWidth>+ New Quote</Button></div>
                <div className="flex-1"><Button variant="secondary" onClick={() => navigate('/quote', { state: { entryPoint: 'missed_call' } })} fullWidth>Log Missed Call</Button></div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderDrafts = () => {
    return (
      <div className="pt-4 md:pt-6 pb-[calc(44px + env(safe-area-inset-bottom))] px-4 md:px-6">
        {draftTasks.length > 0 ? (
          <div className="flex flex-col gap-3 mb-6">
            {draftTasks.map((task) => {
              const j = jobs.find(x => x.id === task.jobId);
              const c = j ? customers[j.customer_id] : undefined;

              return (
                <TaskCard
                  key={task.id}
                  type={task.type}
                  job={j}
                  customer={c}
                  timeAgo={task.timeAgo}
                  jobNumber={task.jobNumber}
                  amount={task.amount}
                  contextLine={task.contextLine}
                  onTap={() => navigate(`/jobs/${task.jobId}`, { state: { initialTab: 'drafts' } })}
                />
              );
            })}
          </div>
        ) : (
          <div className="px-4 mt-6">
            <div className="border border-dashed border-brand-border rounded-lg p-8 text-center">
              <p className="text-base font-semibold text-brand-black">No drafts</p>
              <p className="text-sm text-brand-muted mt-1.5">
                Quotes you start but don&apos;t send will appear here
              </p>
              <div className="flex gap-2 mt-5">
                <div className="flex-1">
                  <Button variant="secondary" onClick={() => navigate('/quote')} fullWidth>
                    + New Quote
                  </Button>
                </div>
              </div>
            </div>
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
      <div className="min-h-[100dvh] flex items-center justify-center bg-[var(--app-shell-bg)]">
        <div className="w-8 h-8 border-2 border-brand-border border-t-brand-black rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="bg-[var(--app-shell-bg)]">
      {/* Header */}
      <div className="sticky top-0 z-40 px-4 pt-4 pb-2 bg-[var(--app-shell-bg)]">
        <div className="flex items-start justify-between">
          <div>
            <span className="text-lg font-bold text-brand-black block">
              {getGreeting()}, {firstName}
            </span>
            <span className="text-sm text-brand-muted block mt-0.5">
              {todayLabel} · {subLabel}
            </span>
          </div>
          {totalOwed > 0 && (
            <div className="text-right">
              <span className="text-xl font-extrabold text-brand-black block">
                £{Number(totalOwed).toFixed(2)}
              </span>
              <span className="text-label text-brand-muted block mt-0.5">
                owed to you
              </span>
            </div>
          )}
        </div>

        {/* Sync indicator */}
        <div className="flex justify-end -mt-1 mb-1">
          <SyncIndicator />
        </div>

        {/* Tab switcher */}
        <div className="-mx-4">
          <HomeTabSwitcher
            tabs={draftsCount > 0 ? ['today', 'tasks', 'drafts'] : ['today', 'tasks']}
            activeTab={activeTab}
            todayBadgeCount={jobCountToday}
            tasksBadgeCount={l2Count}
            draftsBadgeCount={draftsCount}
            onChange={setActiveTab}
          />
        </div>
      </div>

      {/* Today tab content */}
      {activeTab === 'today' && (
        <div className="px-4 md:px-6 pt-4 md:pt-6 pb-[calc(110px + env(safe-area-inset-bottom))]">
          {/* Active bar */}

          {/* Stale job banner — anti-forgetting nudge */}
          {renderStaleJobBanner()}

          {(todayState === 'in_progress' || todayState === 'multi_day') && renderActiveBar()}

          {/* Next Up card */}
          {todayState === 'next_up' && renderNextUpCard()}

          {/* Next job card (no CTAs) when active */}
          {(todayState === 'in_progress' || todayState === 'multi_day') && renderNextJobNoCtas()}

          {/* Remaining today strip */}
          {(todayState === 'next_up' || todayState === 'in_progress' || todayState === 'multi_day') &&
            renderRemainingStrip()}

          {/* Recent high-level activity — hidden when today has more than 3 jobs or in all-clear state */}
          {todayState !== 'all_clear' && jobCountToday <= 3 && <RecentActivity />}

          {/* No jobs today / All clear */}
          {todayState === 'all_clear' && (
            tasks.length > 0 ? renderNoJobsToday() : renderAllClear()
          )}
        </div>
      )}

      {/* Tasks tab content */}
      {activeTab === 'tasks' && renderTasks()}

      {/* Drafts tab content */}
      {activeTab === 'drafts' && renderDrafts()}

      {/* Footer — only show when active tab has content; otherwise buttons are in empty state cards */}
      {activeTab === 'today' && todayState !== 'all_clear' && (
        <div className="sticky bottom-[var(--tab-bar-height)] z-30 bg-[var(--app-shell-bg)] border-t border-brand-borderLight shadow-sheet">
          <div className="flex gap-2 px-4 py-2.5 pb-3">
            <div className="flex-1"><Button variant="secondary" onClick={() => navigate('/quote')} fullWidth>+ New Quote</Button></div>
            <div className="flex-1"><Button variant="secondary" onClick={() => navigate('/quote', { state: { entryPoint: 'missed_call' } })} fullWidth>Log Missed Call</Button></div>
          </div>
        </div>
      )}

      {/* --- Bottom Sheet: Running Late --- */}
      <BottomSheet
        isOpen={sheet === 'running_late'}
        onClose={() => setSheet(null)}
        title={`Running late to ${selectedCustomer?.name || 'the customer'}?`}
      >
        <div className="bg-brand-surface border border-brand-border rounded-lg p-3 mb-4">
          <textarea
            value={lateMsg}
            onChange={(e) => setLateMsg(e.target.value)}
            className="w-full text-base text-brand-dark italic leading-relaxed bg-transparent border-none outline-none resize-none p-0"
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
        onClose={() => { setSheet(null); setMarkDoneStep('photo'); }}
        title={markDoneStep === 'photo' ? 'Job done' : 'How were you paid?'}
        titleIcon={markDoneStep === 'photo' ? <Camera size={20} /> : undefined}
        subtitle={
          markDoneStep === 'photo'
            ? 'Snap a quick photo for your records?'
            : selectedCustomer && selectedJob
              ? `${selectedCustomer.name} · ${selectedJob.title} · £${formatAmount(totalFor(selectedJob.id))}`
              : undefined
        }
      >
        {markDoneStep === 'photo' ? (
          <div className="flex flex-col">
            <SheetRow
              icon={<Camera size={18} className="text-brand-dark" />}
              label="Take photo"
              onTap={async () => {
                if (!selectedJobId || !userId) return;
                const dataUrl = await capturePhoto();
                if (!dataUrl) return;
                await saveJobPhoto(selectedJobId, userId, dataUrl);
                captureCompletionPhotoTaken({ jobId: selectedJobId });
                setMarkDoneStep('payment');
              }}
            />
            <SheetRow
              icon={<ImageIcon size={18} className="text-brand-dark" />}
              label="Choose from library"
              onTap={async () => {
                if (!selectedJobId || !userId) return;
                const dataUrl = await pickPhotoFromLibrary();
                if (!dataUrl) return;
                await saveJobPhoto(selectedJobId, userId, dataUrl);
                captureCompletionPhotoTaken({ jobId: selectedJobId });
                setMarkDoneStep('payment');
              }}
            />
            <SheetRow
              icon={<X size={18} className="text-brand-muted" />}
              label="Skip"
              onTap={() => {
                if (selectedJobId) captureCompletionPhotoSkipped({ jobId: selectedJobId });
                setMarkDoneStep('payment');
              }}
              variant="destructive"
              isLast
            />
          </div>
        ) : (
          <div className="flex flex-col">
            <SheetRow
              icon={<Banknote size={18} className="text-brand-dark" />}
              label="Cash"
              onTap={() => handlePayment('cash')}
            />
            <SheetRow
              icon={<CreditCard size={18} className="text-brand-dark" />}
              label="Terminal"
              onTap={() => handlePayment('terminal')}
            />
            <SheetRow
              icon={<CreditCard size={18} className="text-brand-dark" />}
              label="Bank Transfer"
              onTap={() => handlePayment('bank_transfer')}
            />
            <SheetRow
              icon={<AlertTriangle size={18} className="text-status-red" />}
              label="Not yet"
              sublabel="Chase later"
              onTap={() => handlePayment('not_yet')}
              variant="destructive"
              isLast
            />
          </div>
        )}
      </BottomSheet>

      {/* --- Bottom Sheet: Mark Done (deposit) --- */}
      <BottomSheet
        isOpen={sheet === 'mark_done_deposit'}
        onClose={() => { setSheet(null); setMarkDoneStep('photo'); }}
        title={markDoneStep === 'photo' ? 'Job done' : `Balance to collect: £${formatAmount(
          selectedJob
            ? totalFor(selectedJob.id) -
                (selectedJob.deposit_pct
                  ? (selectedJob.deposit_pct / 100) * totalFor(selectedJob.id)
                  : 0)
            : 0
        )}`}
        titleIcon={markDoneStep === 'photo' ? <Camera size={20} /> : undefined}
        subtitle={
          markDoneStep === 'photo'
            ? 'Snap a quick photo for your records?'
            : selectedCustomer && selectedJob
              ? `${selectedCustomer.name} · ${selectedJob.title} · £${formatAmount(
                  selectedJob.deposit_pct
                    ? (selectedJob.deposit_pct / 100) * totalFor(selectedJob.id)
                    : 0
                )} deposit already paid`
              : undefined
        }
      >
        {markDoneStep === 'photo' ? (
          <div className="flex flex-col">
            <SheetRow
              icon={<Camera size={18} className="text-brand-dark" />}
              label="Take photo"
              onTap={async () => {
                if (!selectedJobId || !userId) return;
                const dataUrl = await capturePhoto();
                if (!dataUrl) return;
                await saveJobPhoto(selectedJobId, userId, dataUrl);
                captureCompletionPhotoTaken({ jobId: selectedJobId });
                setMarkDoneStep('payment');
              }}
            />
            <SheetRow
              icon={<ImageIcon size={18} className="text-brand-dark" />}
              label="Choose from library"
              onTap={async () => {
                if (!selectedJobId || !userId) return;
                const dataUrl = await pickPhotoFromLibrary();
                if (!dataUrl) return;
                await saveJobPhoto(selectedJobId, userId, dataUrl);
                captureCompletionPhotoTaken({ jobId: selectedJobId });
                setMarkDoneStep('payment');
              }}
            />
            <SheetRow
              icon={<X size={18} className="text-brand-muted" />}
              label="Skip"
              onTap={() => {
                if (selectedJobId) captureCompletionPhotoSkipped({ jobId: selectedJobId });
                setMarkDoneStep('payment');
              }}
              variant="destructive"
              isLast
            />
          </div>
        ) : (
          <div className="flex flex-col">
            <SheetRow
              icon={<CreditCard size={18} className="text-brand-dark" />}
              label="Terminal"
              onTap={() => handlePayment('terminal')}
            />
            <SheetRow
              icon={<Banknote size={18} className="text-brand-dark" />}
              label="Cash"
              onTap={() => handlePayment('cash')}
            />
            <SheetRow
              icon={<AlertTriangle size={18} className="text-status-red" />}
              label="Not yet"
              sublabel="Chase later"
              onTap={() => handlePayment('not_yet')}
              variant="destructive"
              isLast
            />
          </div>
        )}
      </BottomSheet>

      {/* --- Bottom Sheet: Dismiss Confirm --- */}
      <BottomSheet
        isOpen={sheet === 'dismiss_confirm'}
        onClose={() => setSheet(null)}
        title="Dismiss this missed call?"
        subtitle="The phone number will be lost"
      >
        <div className="flex flex-col gap-2">
          <Button
            variant="secondary"
            onClick={() => setSheet(null)}
            fullWidth
          >
            Cancel
          </Button>
          <Button
            variant="ghost"
            onClick={async () => {
              if (!selectedJobId) return;
              await db.jobs.delete(selectedJobId);
              await db.work_log.where('job_id').equals(selectedJobId).delete();
              await db.line_items.where('job_id').equals(selectedJobId).delete();
              setSheet(null);
              refresh();
            }}
            fullWidth
          >
            Dismiss
          </Button>
        </div>
      </BottomSheet>

      {/* --- Bottom Sheet: Finish Previous Job (new-job intercept) --- */}
      <BottomSheet
        isOpen={sheet === 'finish_previous'}
        onClose={() => setSheet(null)}
        title="Finish the previous job first?"
        subtitle={
          interceptData
            ? `${interceptData.oldCustomerName} · ${interceptData.oldJob.title} — started ${interceptData.oldJob.actual_start ? formatElapsed(interceptData.oldJob.actual_start) : 'earlier'} ago`
            : undefined
        }
      >
        <div className="flex flex-col gap-2">
          <Button
            variant="primary"
            onClick={() => {
              if (!interceptData) return;
              captureNewJobInterceptMarkDone({ oldJobId: interceptData.oldJob.id });
              setSheet(null);
              navigate(`/jobs/${interceptData.oldJob.id}`, {
                state: {
                  autoOpenMarkDone: true,
                  returnToStartJob: { jobId: interceptData.newJobId, from: 'home' },
                },
              });
            }}
            fullWidth
          >
            <Check size={18} className="mr-2" />
            Mark as done
          </Button>
          <Button
            variant="secondary"
            onClick={async () => {
              if (!interceptData) return;
              captureNewJobInterceptLeaveInProgress({ oldJobId: interceptData.oldJob.id });
              setSheet(null);
              // Start the new job directly
              const n = now();
              await db.jobs.update(interceptData.newJobId, {
                status: 'in_progress',
                actual_start: n,
                updated_at: n,
                _sync_status: 'pending',
              });
              await db.work_log.add({
                id: crypto.randomUUID(),
                job_id: interceptData.newJobId,
                type: 'status_change',
                description: 'Job started',
                created_at: n,
                _sync_status: 'pending',
              });
              await db.sync_queue.add({
                operation: 'update',
                table_name: 'jobs',
                record_id: interceptData.newJobId,
                payload: { status: 'in_progress', actual_start: n, updated_at: n },
                created_at: n,
                retry_count: 0,
              });
              refresh();
            }}
            fullWidth
          >
            Leave in progress
          </Button>
        </div>
      </BottomSheet>

    </div>
  );
}
