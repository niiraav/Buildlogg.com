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
import { archiveSampleJobs } from '../../lib/seedSampleJob';
import NotificationBanner from '../../components/NotificationBanner';
import WeekView from '../../components/WeekView';
import { SendSheet, type SendMethod } from '../../components/SendSheet';

/* --- helpers --- */
import { shouldShowBanner as shouldShowNotificationBanner } from '../../lib/notificationManager';
import { createPaymentChases, resolveChases, getDuePaymentChases } from '../../lib/paymentChase';
import { getDueQuoteFollowUps, snoozeFollowUp, markQuoteResponded, dismissFollowUp, incrementNudge } from '../../lib/quoteFollowUp';
import { markChaseSent, pauseChase, resumeChase, resolveChases as resolveChaseById } from '../../lib/paymentChase';
import { advanceRecurrence, cancelRecurrence, incrementContactAttempt } from '../../lib/recurringJobs';
import { getUpcomingRecurringJobs, createRecurringJob } from '../../lib/recurringJobs';
import { acceptBookingRequest, rejectBookingRequest, getPendingBookingRequests, checkBookingConflict, type ConflictJobInfo } from '../../lib/booking';
import type { BookingRequest } from '../../lib/db';
import type { PaymentChase, QuoteFollowUp, RecurringJob } from '../../lib/db';
import { getStaleInProgressJobs, getOvernightAutoCompletableJobs, autoCompleteJob, markJobAsMultiDay, formatElapsed, daysBetween, type StaleJob } from '../../lib/jobStaleness';
import { capturePhoto, pickPhotoFromLibrary, saveJobPhoto } from '../../lib/photoCapture';
import { capture,
  captureQuoteFollowUpShown, captureQuoteFollowUpSent, captureQuoteFollowUpSnoozed, captureQuoteFollowUpResponded,
  capturePaymentChaseShown, capturePaymentChaseSent, capturePaymentChasePaused, capturePaymentChaseResumed,
  captureRecurringReminderShown, captureRecurringReminderActed,
} from '../../lib/analytics';
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
  captureReviewRequestShown,
  captureReviewRequestSent,
  captureReviewRequestSkipped,
} from '../../lib/analytics';
import RecentActivity from '../../components/RecentActivity';
import BrandedLoader from '../../components/BrandedLoader';

const now = () => new Date().toISOString();

// localStorage-backed set: dismisses stale job nudges, persists across page reloads
// TTL: 12 hours — after that, the nudge can show again
const DISMISSED_STALE_KEY = 'buildlogg_dismissed_stale_jobs';
const DISMISSED_STALE_TTL = 12 * 60 * 60 * 1000; // 12 hours

function loadDismissedStaleJobs(): Set<string> {
  try {
    const raw = localStorage.getItem(DISMISSED_STALE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as { id: string; ts: number }[];
    const now = Date.now();
    return new Set(parsed.filter((e) => now - e.ts < DISMISSED_STALE_TTL).map((e) => e.id));
  } catch {
    return new Set();
  }
}

function saveDismissedStaleJob(jobId: string) {
  try {
    const raw = localStorage.getItem(DISMISSED_STALE_KEY);
    const existing = raw ? JSON.parse(raw) as { id: string; ts: number }[] : [];
    const now = Date.now();
    const filtered = existing.filter((e) => now - e.ts < DISMISSED_STALE_TTL);
    filtered.push({ id: jobId, ts: now });
    localStorage.setItem(DISMISSED_STALE_KEY, JSON.stringify(filtered));
  } catch {}
}

const dismissedStaleJobs = loadDismissedStaleJobs();

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

function getDaysUntil(dateStr: string): number | null {
  const [y, m, d] = dateStr.split('-').map(Number);
  if (!y || !m || !d) return null;
  const target = new Date(y, m - 1, d, 0, 0, 0, 0);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  return Math.floor((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
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
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days}d ago`;
  // For older items, show the date
  const date = new Date(Date.now() - minutes * 60 * 1000);
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
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
  | 'review_prompt'
  | 'recurring_prompt'
  | 'follow_up_actions'
  | 'chase_actions'
  | 'recurring_actions'
  | 'booking_request'
  | 'booking_list'
  | 'eod_review'
  | 'week_view'

type TaskType = 'missed_call' | 'no_show' | 'urgent_new' | 'draft_quote' | 'quote_follow_up' | 'payment_chase' | 'recurring_reminder' | 'booking_request';

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
  duration?: string;
  requestedDate?: string;
  conflictText?: string;
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
  const [dueFollowUps, setDueFollowUps] = useState<Array<QuoteFollowUp & { job?: import('../../lib/db').Job }>>([]);
  const [dueChases, setDueChases] = useState<Array<PaymentChase & { job?: import('../../lib/db').Job }>>([]);
  const [upcomingRecurring, setUpcomingRecurring] = useState<Array<RecurringJob & { job?: import('../../lib/db').Job }>>([]);
  const [sampleExplored, setSampleExplored] = useState(() => localStorage.getItem('buildlogg_sample_explored') === 'true');
  const [selectedFollowUp, setSelectedFollowUp] = useState<(QuoteFollowUp & { job?: import('../../lib/db').Job }) | null>(null);
  const [selectedChase, setSelectedChase] = useState<(PaymentChase & { job?: import('../../lib/db').Job }) | null>(null);
  const [selectedRecurring, setSelectedRecurring] = useState<(RecurringJob & { job?: import('../../lib/db').Job }) | null>(null);
  const [pendingBookings, setPendingBookings] = useState<BookingRequest[]>([]);
  const [selectedBooking, setSelectedBooking] = useState<BookingRequest | null>(null);
  const [bookingConflict, setBookingConflict] = useState<ConflictJobInfo | null>(null);
  const summaryBookingStats = useRef<{ count: number; urgent: number }>({ count: 0, urgent: 0 });
  const [sendSheetConfig, setSendSheetConfig] = useState<{
    title: string;
    customerPhone: string;
    messageText: string;
    onSend: (method: SendMethod, pdfShared: boolean) => void;
  } | null>(null);
  const [allRecurring, setAllRecurring] = useState<Array<RecurringJob & { job?: import('../../lib/db').Job }>>([]);
  const [recurringListExpanded, setRecurringListExpanded] = useState(false);
  const [showEodReview, setShowEodReview] = useState(false);
  const [eodReviewJobIds, setEodReviewJobIds] = useState<string[]>([]);
  const [eodDismissedToday, setEodDismissedToday] = useState(() => {
    try {
      const saved = localStorage.getItem('buildlogg_eod_review');
      if (!saved) return false;
      const parsed = JSON.parse(saved);
      return parsed.date === new Date().toDateString() && parsed.dismissed;
    } catch { return false; }
  });
  // Update sampleExplored when component regains focus (e.g., returning from JobDetail)
  useEffect(() => {
    const update = () => setSampleExplored(localStorage.getItem('buildlogg_sample_explored') === 'true');
    window.addEventListener('focus', update);
    return () => window.removeEventListener('focus', update);
  }, []);
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

    // Fetch pending booking requests from local Dexie (synced from Supabase)
    getPendingBookingRequests(userId).then(setPendingBookings).catch(() => {});

    setLoading(false);
  }, [userId]);


  useEffect(() => {
    refresh();

    // Re-fetch booking requests after a delay to give initialSync time to complete
    // initialSync runs asynchronously in App.tsx and may not have finished
    // when refresh() runs above. This ensures booking request task cards appear
    // without requiring a manual page reload.
    const bookingRetryTimer = setTimeout(() => {
      if (userId) getPendingBookingRequests(userId).then(setPendingBookings).catch(() => {});
    }, 3000);

    return () => clearTimeout(bookingRetryTimer);

    // Anti-forgetting: fetch stale in-progress jobs + run overnight auto-complete
    if (userId) {
      (async () => {
        // 1. Overnight auto-complete (same-day only)
        const overnightJobs = await getOvernightAutoCompletableJobs(userId!);
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
        const stale = await getStaleInProgressJobs(userId!);
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
    getDueQuoteFollowUps(userId).then(setDueFollowUps).catch(() => {});
    getDuePaymentChases(userId).then(setDueChases).catch(() => {});
    getUpcomingRecurringJobs(userId, 14).then(setUpcomingRecurring).catch(() => {});
    getUpcomingRecurringJobs(userId, 90).then(setAllRecurring).catch(() => {});
    getPendingBookingRequests(userId).then(setPendingBookings).catch(() => {});
  }, [jobs, userId]);

  /* tick for elapsed timer */

  useEffect(() => {
    timerRef.current = setInterval(() => setTick((t) => t + 1), 5000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  /* Check for booking conflicts when the booking request sheet opens */
  useEffect(() => {
    if (sheet !== 'booking_request' || !selectedBooking || !userId) {
      setBookingConflict(null);
      return;
    }
    checkBookingConflict(userId, selectedBooking.id)
      .then((result) => {
        setBookingConflict(result.conflictJob || null);
      })
      .catch(() => {
        setBookingConflict(null);
      });
  }, [sheet, selectedBooking, userId]);

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

  const sampleJob = useMemo(() => jobs.find((j) => j.is_sample === true), [jobs]);
  const hasRealJobs = useMemo(() => jobs.some((j) => !j.is_sample && j.status !== 'cancelled' && j.status !== 'written_off'), [jobs]);
  const todaysActiveCount = useMemo(() =>
    jobs.filter(j => j.status === 'in_progress' && j.actual_start && isToday(j.actual_start) && !j.is_sample && !j.is_multi_day).length,
  [jobs]);

  // W1-2: End-of-day review banner
  useEffect(() => {
    if (eodDismissedToday || loading) return;
    const hour = new Date().getHours();
    if (hour < 18) return;
    if (todaysActiveCount > 0) {
      setShowEodReview(true);
      capture('eod_review_shown', { jobCount: todaysActiveCount });
    }
  }, [jobs, eodDismissedToday, loading, todaysActiveCount]);

  const handleEodComplete = (jobId: string) => {
    const j = jobs.find(job => job.id === jobId);
    if (!j) return;
    setSelectedJobId(jobId);
    setMarkDoneStep('photo');
    setEodReviewJobIds(prev => prev.filter(id => id !== jobId));
    setSheet(null);
    if (eodReviewJobIds.length <= 1) {
      setShowEodReview(false);
      setEodDismissedToday(true);
      localStorage.setItem('buildlogg_eod_review', JSON.stringify({ date: new Date().toDateString(), dismissed: true }));
    }
    capture('eod_review_completed', { jobCount: 1 });
    setTimeout(() => {
      if (j.payment_terms === 'deposit' && j.deposit_pct) {
        setSheet('mark_done_deposit');
      } else {
        setSheet('mark_done');
      }
    }, 200);
  };

  const showSampleBanner = !!sampleJob && !hasRealJobs;

  const handleRemoveSample = async () => {
    if (!userId) return;
    const count = await archiveSampleJobs(userId);
    if (count > 0) {
      capture('sample_job_dismissed', { method: 'manual' });
      showToast('Sample removed');
    }
  };

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
            contextLine: j.title,
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




    });

    // Add quote follow-up tasks (replaces stale_quote)
    dueFollowUps.forEach((f) => {
      if (!f.job) return;
      const c = customers[f.job.customer_id];
      if (!c) return;
      const total = jobTotal(lineItems[f.job.id] || []);
      const days = f.job.quote_sent_at ? daysSince(f.job.quote_sent_at) : 0;
      const isExpired = f.job.quote_expires_at && new Date(f.job.quote_expires_at).getTime() < Date.now();
      items.push({
        id: `followup_${f.id}`,
        jobId: f.job.id,
        customerName: c.name,
        jobTitle: f.job.title,
        jobNumber: f.job.job_number,
        tag: isExpired ? 'Quote expired' : `Follow up · ${f.nudge_count + 1}`,
        amount: `£${formatAmount(total)}`,
        isL2: false,
        type: 'quote_follow_up',
        timeAgo: `${days}d since quote`,
        contextLine: isExpired ? 'Quote expired — resend or close' : 'no reply yet',
      });
    });

    // Add payment chase tasks (replaces chase + overdue)
    dueChases.forEach((chase) => {
      if (!chase.job) return;
      const c = customers[chase.job.customer_id];
      if (!c) return;
      const total = jobTotal(lineItems[chase.job.id] || []);
      const clockStart = chase.job.actual_end || chase.job.updated_at;
      const daysOverdue = clockStart ? daysSince(clockStart) : 0;
      const isHighUrgency = chase.stage === 'final' || chase.stage === 'small_claims';
      const stageLabels: Record<string, string> = {
        gentle: `Chase · ${daysOverdue}d`,
        firm: `Chase · ${daysOverdue}d`,
        final: `Final chase · ${daysOverdue}d`,
        small_claims: `Small claims? · ${daysOverdue}d`,
      };
      items.push({
        id: `chase_${chase.id}`,
        jobId: chase.job.id,
        customerName: c.name,
        jobTitle: chase.job.title,
        jobNumber: chase.job.job_number,
        tag: stageLabels[chase.stage] || `Chase · ${daysOverdue}d`,
        amount: `£${formatAmount(total)}`,
        isL2: isHighUrgency,
        type: 'payment_chase',
        flag: isHighUrgency ? 'overdue' : 'chase',
        flagDays: daysOverdue,
        timeAgo: `${daysOverdue}d since completed`,
        contextLine: chase.stage === 'small_claims' ? 'Consider small claims court' : '',
      });
    });

    // Add recurring reminder tasks
    upcomingRecurring.forEach((r) => {
      const c = customers[r.customer_id];
      if (!c) return;
      const daysUntilDue = Math.floor((new Date(r.next_due_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
      const isOverdue = daysUntilDue < 0;
      items.push({
        id: `recurring_${r.id}`,
        jobId: r.original_job_id,
        customerName: c.name,
        jobTitle: r.title,
        tag: isOverdue ? `Overdue ${Math.abs(daysUntilDue)}d` : `Due in ${daysUntilDue}d`,
        amount: '',
        isL2: false,
        type: 'recurring_reminder',
        timeAgo: isOverdue ? `${Math.abs(daysUntilDue)}d overdue` : `${daysUntilDue}d until due`,
        contextLine: r.address || '',
      });
    });

    // Add booking request tasks (use summary card if volume is high)
    if (pendingBookings.length >= 5) {
      const urgentCount = pendingBookings.filter((b) => {
        const days = getDaysUntil(b.requested_date);
        return days !== null && days <= 1;
      }).length;
      items.push({
        id: 'booking_summary',
        jobId: 'booking_summary',
        customerName: '',
        jobTitle: '',
        tag: 'Booking requests',
        amount: '',
        isL2: true,
        type: 'booking_request',
        timeAgo: '',
        contextLine: '',
        requestedDate: '',
      });
      summaryBookingStats.current = { count: pendingBookings.length, urgent: urgentCount };
    } else {
      pendingBookings.forEach((b) => {
        items.push({
          id: `booking_${b.id}`,
          jobId: b.accepted_job_id || b.id,
          customerName: b.client_name,
          jobTitle: b.service_description,
          jobNumber: undefined,
          tag: 'Booking request',
          amount: b.service_amount > 0 ? `£${b.service_amount.toFixed(0)}` : '',
          duration: '1hr',
          isL2: true,
          type: 'booking_request',
          phone: b.client_phone,
          timeAgo: new Date(b.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
          contextLine: `${b.requested_date} at ${b.requested_time}`,
          requestedDate: b.requested_date,
        });
      });
    }

    return items;
  }, [jobs, customers, lineItems, userId, tick, dueFollowUps, dueChases, upcomingRecurring, pendingBookings]);

  const actTodayTasks = tasks.filter((t) => t.type === 'missed_call' || (t.type === 'payment_chase' && t.isL2) || t.type === 'booking_request');
  const draftTasks = tasks
    .filter((t) => t.type === 'draft_quote')
    .sort((a, b) => {
      const aJob = jobs.find((j) => j.id === a.jobId);
      const bJob = jobs.find((j) => j.id === b.jobId);
      const aTime = aJob?.updated_at ? new Date(aJob.updated_at).getTime() : 0;
      const bTime = bJob?.updated_at ? new Date(bJob.updated_at).getTime() : 0;
      return bTime - aTime; // most recently edited first
    });
  const followUpTasks = tasks.filter((t) => t.type !== 'missed_call' && t.type !== 'draft_quote' && !(t.type === 'payment_chase' && t.isL2) && t.type !== 'recurring_reminder' && t.type !== 'booking_request');
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
      description: `[Running late sent via ${method === 'whatsapp' ? 'WhatsApp' : 'SMS'}] ${lateMsg}`,
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
        invoice_sent_at: n,
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
      await addToSyncQueue('jobs', selectedJobId, { status: 'awaiting_payment', actual_end: n, invoice_sent_at: n, updated_at: n }, 'update');
      await addToSyncQueue('work_log', logId, { id: logId, job_id: selectedJobId, type: 'status_change', description: 'Job completed \u2014 payment pending', created_at: n }, 'insert');
      await ensureInvoiceNumber(j, userId);
      createPaymentChases(selectedJobId, userId, n).catch(() => {});
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
      resolveChases(selectedJobId).catch(() => {});
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

    // P2-08: Show review prompt if Google Business URL is set
    if (method !== 'not_yet' && profile?.google_business_url && profile?.reviews_enabled !== false) {
      const cust = customerFor(selectedJobId);
      if (cust) {
        setTimeout(() => {
          setSheet('review_prompt');
          captureReviewRequestShown({ jobId: selectedJobId });
        }, 500);
      }
    }
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
      saveDismissedStaleJob(job.id);
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
      saveDismissedStaleJob(job.id);
      setStaleJobs((prev) => prev.filter((j) => !dismissedStaleJobs.has(j.id)));
    };

    const handleMultiDay = async () => {
      await markJobAsMultiDay(job.id);
      captureStaleJobNudgeDismissed({ jobId: job.id, staleType: job.staleType, multiDaySet: true });
      dismissedStaleJobs.add(job.id);
      saveDismissedStaleJob(job.id);
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
      <div className="pt-4 md:pt-6 pb-4 px-4 md:px-6">
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
                    duration={task.duration}
                    requestedDate={task.requestedDate}
                    conflictText={task.conflictText}
                    contextLine={task.contextLine}
                    isSummary={task.id === 'booking_summary'}
                    summaryCount={task.id === 'booking_summary' ? summaryBookingStats.current.count : undefined}
                    summaryStats={task.id === 'booking_summary' ? `${summaryBookingStats.current.urgent} urgent (today/tomorrow) · 0 conflicts` : undefined}
                    onTap={() => {
                    if (task.type === 'quote_follow_up') {
                      const fu = dueFollowUps.find(f => f.id === task.id.replace('followup_', ''));
                      if (fu) { setSelectedFollowUp(fu); captureQuoteFollowUpShown({ jobId: fu.job_id, nudgeCount: fu.nudge_count }); setSheet('follow_up_actions'); }
                    } else if (task.type === 'payment_chase') {
                      const ch = dueChases.find(c => c.id === task.id.replace('chase_', ''));
                      if (ch) { setSelectedChase(ch); capturePaymentChaseShown({ jobId: ch.job_id, stage: ch.stage }); setSheet('chase_actions'); }
                    } else if (task.type === 'recurring_reminder') {
                      const rc = upcomingRecurring.find(r => r.id === task.id.replace('recurring_', ''));
                      if (rc) { setSelectedRecurring(rc); captureRecurringReminderShown({ recurringId: rc.id, daysUntilDue: Math.floor((new Date(rc.next_due_at).getTime() - Date.now()) / 86400000) }); setSheet('recurring_actions'); }
                    } else if (task.type === 'booking_request') {
                      if (task.id === 'booking_summary') {
                        setSheet('booking_list');
                        return;
                      }
                      const bookingId = task.id.replace('booking_', '');
                      const bk = pendingBookings.find(b => b.id === bookingId);
                      if (bk) { setSelectedBooking(bk); setBookingConflict(null); setSheet('booking_request'); }
                    } else {
                      navigate(`/jobs/${task.jobId}`, { state: { initialTab: 'tasks' } });
                    }
                  }}
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
                    duration={task.duration}
                    requestedDate={task.requestedDate}
                    conflictText={task.conflictText}
                    contextLine={task.contextLine}
                    isSummary={task.id === 'booking_summary'}
                    summaryCount={task.id === 'booking_summary' ? summaryBookingStats.current.count : undefined}
                    summaryStats={task.id === 'booking_summary' ? `${summaryBookingStats.current.urgent} urgent (today/tomorrow) · 0 conflicts` : undefined}
                    onTap={() => {
                    if (task.type === 'quote_follow_up') {
                      const fu = dueFollowUps.find(f => f.id === task.id.replace('followup_', ''));
                      if (fu) { setSelectedFollowUp(fu); captureQuoteFollowUpShown({ jobId: fu.job_id, nudgeCount: fu.nudge_count }); setSheet('follow_up_actions'); }
                    } else if (task.type === 'payment_chase') {
                      const ch = dueChases.find(c => c.id === task.id.replace('chase_', ''));
                      if (ch) { setSelectedChase(ch); capturePaymentChaseShown({ jobId: ch.job_id, stage: ch.stage }); setSheet('chase_actions'); }
                    } else if (task.type === 'recurring_reminder') {
                      const rc = upcomingRecurring.find(r => r.id === task.id.replace('recurring_', ''));
                      if (rc) { setSelectedRecurring(rc); captureRecurringReminderShown({ recurringId: rc.id, daysUntilDue: Math.floor((new Date(rc.next_due_at).getTime() - Date.now()) / 86400000) }); setSheet('recurring_actions'); }
                    } else if (task.type === 'booking_request') {
                      if (task.id === 'booking_summary') {
                        setSheet('booking_list');
                        return;
                      }
                      const bookingId = task.id.replace('booking_', '');
                      const bk = pendingBookings.find(b => b.id === bookingId);
                      if (bk) { setSelectedBooking(bk); setBookingConflict(null); setSheet('booking_request'); }
                    } else {
                      navigate(`/jobs/${task.jobId}`, { state: { initialTab: 'tasks' } });
                    }
                  }}
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

        {/* P2-D: Upcoming recurring section */}
        {allRecurring.length > 0 && (
          <div className="mt-4">
            <button
              onClick={() => setRecurringListExpanded(!recurringListExpanded)}
              className="flex items-center justify-between w-full text-micro font-bold text-brand-mid tracking-[0.7px] mb-2 cursor-pointer"
            >
              <span>Upcoming recurring ({allRecurring.length})</span>
              <span className="text-brand-muted">{recurringListExpanded ? 'Hide' : 'Show'}</span>
            </button>
            {recurringListExpanded && (
              <div className="flex flex-col gap-2">
                {allRecurring.map((r) => {
                  const c = customerFor(r.customer_id);
                  const intervalLabels: Record<string, string> = { monthly: 'Monthly', quarterly: 'Quarterly', six_monthly: '6-monthly', annual: 'Annual' };
                  const nextDue = new Date(r.next_due_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
                  const isOverdue = new Date(r.next_due_at).getTime() < Date.now();
                  return (
                    <div
                      key={r.id}
                      onClick={() => { setSelectedRecurring(r); setSheet('recurring_actions'); }}
                      className="bg-white border border-brand-border rounded-lg p-3 cursor-pointer active:opacity-70 flex items-center justify-between"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-brand-black truncate">{c?.name || 'Unknown'} · {r.title}</p>
                        <p className="text-xs text-brand-muted mt-0.5">
                          {isOverdue ? `Overdue · ` : `Due ${nextDue} · `}{intervalLabels[r.interval] || r.interval}
                          {r.status === 'dormant' && ' · Dormant'}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  const renderDrafts = () => {
    return (
      <div className="pt-4 md:pt-6 pb-4 px-4 md:px-6">
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
                  onTap={() => navigate('/quote', { state: { jobId: j?.id, customerId: j?.customer_id, entryPoint: 'new_quote' } })}
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
    return <BrandedLoader fullscreen />;
  }

  return (
    <div className="bg-[var(--app-shell-bg)] flex flex-col min-h-[100dvh]">
      {/* Header */}
      <div className="sticky top-0 z-40 px-4 pt-5 pb-2 bg-[var(--app-shell-bg)]">
        <div className="flex items-start justify-between">
          <div>
            <span className="text-xl font-extrabold text-brand-black block">
              {getGreeting()}, {firstName}
            </span>
            <span className="text-sm text-brand-muted block mt-0.5">
              {todayLabel} · {subLabel}
            </span>
            <button onClick={() => { setSheet('week_view'); capture('week_view_opened', {}); }}
              className="text-xs font-medium text-brand-mid underline underline-offset-2 cursor-pointer mt-1 block">
              View week →
            </button>
          </div>
          {totalOwed > 0 && (
            <div
              className="text-right cursor-pointer active:opacity-70"
              onClick={() => navigate('/dashboard')}
            >
              <span className="text-xl font-extrabold text-brand-black block">
                £{Number(totalOwed).toFixed(2)}
              </span>
              <span className="text-label text-brand-dark block mt-0.5">
                owed to you →
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
        <div className="px-4 md:px-6 pt-4 md:pt-6 pb-4">
          {/* Active bar */}

          {/* W1-2: End-of-day review banner */}
          {showEodReview && !eodDismissedToday && todaysActiveCount > 0 && (
            <div className="bg-status-blueBg border border-blue-200 rounded-lg px-3.5 py-3 mb-4 flex items-start gap-3">
              <Clock size={18} className="text-status-blue shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-medium text-status-blue">
                  {todaysActiveCount} job{todaysActiveCount > 1 ? 's' : ''} still in progress. Done for the day?
                </p>
                <div className="flex gap-2 mt-2">
                  <div className="flex-1">
                    <Button variant="primary" size="sm" fullWidth onClick={() => {
                      const ids = jobs.filter(j => j.status === 'in_progress' && j.actual_start && isToday(j.actual_start) && !j.is_sample && !j.is_multi_day).map(j => j.id);
                      setEodReviewJobIds(ids);
                      setSheet('eod_review');
                    }}>Review now</Button>
                  </div>
                  <div className="flex-1">
                    <Button variant="secondary" size="sm" fullWidth onClick={() => {
                      setShowEodReview(false);
                      setEodDismissedToday(true);
                      localStorage.setItem('buildlogg_eod_review', JSON.stringify({ date: new Date().toDateString(), dismissed: true }));
                      capture('eod_review_dismissed', {});
                    }}>Maybe later</Button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Notification permission banner */}
          {shouldShowNotificationBanner() && <NotificationBanner />}

          {/* Sample job banner — shows when user has no real jobs yet */}
          {showSampleBanner && (
            <div className="bg-status-blueBg border border-blue-200 rounded-lg px-3.5 py-3 mb-4">
              {!sampleExplored ? (
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <p className="text-sm font-medium text-status-blue">
                      👋 This is a sample job so you can see how Buildlogg works. Tap it to explore the flow.
                    </p>
                  </div>
                  <button onClick={handleRemoveSample} className="text-xs font-medium text-status-blue underline underline-offset-2 cursor-pointer shrink-0">
                    Remove sample →
                  </button>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  <p className="text-sm font-medium text-status-blue">Ready to try it yourself?</p>
                  <button onClick={() => navigate('/quote')} className="w-full h-10 bg-status-blue text-white text-sm font-semibold rounded-lg cursor-pointer active:opacity-80">
                    Create your first real quote
                  </button>
                  <button onClick={handleRemoveSample} className="text-xs font-medium text-status-blue underline underline-offset-2 cursor-pointer">
                    Remove sample
                  </button>
                </div>
              )}
            </div>
          )}

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
        <div className="mt-auto sticky bottom-0 z-40 bg-[var(--app-shell-bg)] border-t border-brand-borderLight shadow-sheet cta-above-tabbar">
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

      {/* --- Bottom Sheet: Google Review Request --- */}
      <BottomSheet
        isOpen={sheet === 'review_prompt'}
        onClose={() => { setSheet(null); captureReviewRequestSkipped({ jobId: selectedJobId || '' }); const j = jobs.find(x => x.id === selectedJobId); if (j?.status === 'paid' && j.title !== 'Callout charge') setTimeout(() => setSheet('recurring_prompt'), 500); }}
        title="Ask for a Google review?"
        subtitle={selectedCustomer ? `${selectedCustomer.name} · ${selectedJob?.title || ''}` : undefined}
      >
        <div className="flex flex-col gap-2">
          <Button
            variant="primary"
            onClick={async () => {
              if (!selectedCustomer || !profile?.google_business_url) return;
              const phone = selectedCustomer.phone.replace(/\D/g, '');
              const msg = encodeURIComponent(
                `Hi ${selectedCustomer.name.split(' ')[0]}, glad the ${selectedJob?.title || 'job'} is sorted! If you were happy with the work, a quick Google review helps me a lot: ${profile.google_business_url}. Only takes 30 seconds. Thanks! — ${profile.business_name || profile.full_name}`
              );
              window.open(`https://wa.me/${phone}?text=${msg}`, '_blank');
              if (selectedJobId) {
                const now = new Date().toISOString();
                db.jobs.update(selectedJobId, { review_requested_at: now, _sync_status: 'pending' });
                addToSyncQueue('jobs', selectedJobId, { review_requested_at: now });
                // Store the review request message in work_log
                const reviewMsg = `Hi ${selectedCustomer.name.split(' ')[0]}, glad the ${selectedJob?.title || 'job'} is sorted! If you were happy with the work, a quick Google review helps me a lot: ${profile?.google_business_url}. Only takes 30 seconds. Thanks!`;
                const logId = crypto.randomUUID();
                await db.work_log.add({
                  id: logId,
                  job_id: selectedJobId,
                  type: 'customer_notified',
                  description: `[Review request sent via WhatsApp] ${reviewMsg}`,
                  created_at: now,
                  _sync_status: 'pending',
                });
                addToSyncQueue('work_log', logId, { id: logId, job_id: selectedJobId, type: 'customer_notified', description: `[Review request sent via WhatsApp] ${reviewMsg}`, created_at: now });
              }
              captureReviewRequestSent({ jobId: selectedJobId || '' });
              setSheet(null);
            }}
            fullWidth
          >
            <MessageCircle size={18} className="mr-2" />
            Send via WhatsApp
          </Button>
          <Button variant="ghost" onClick={() => { setSheet(null); captureReviewRequestSkipped({ jobId: selectedJobId || '' }); }}>
            Skip
          </Button>
        </div>
      </BottomSheet>

      {/* P2-02: Recurring Job Prompt */}
      <BottomSheet
        isOpen={sheet === 'recurring_prompt'}
        onClose={() => setSheet(null)}
        title="Is this a recurring job?"
        subtitle={selectedJobId ? `${customerFor(selectedJobId)?.name || ''} · ${jobs.find(x => x.id === selectedJobId)?.title || ''}` : undefined}
      >
        <div className="flex flex-col gap-2">
          <Button variant="ghost" onClick={() => setSheet(null)} fullWidth>
            One-off
          </Button>
          <Button variant="secondary" onClick={async () => {
            const j = jobs.find(x => x.id === selectedJobId);
            if (!j || !userId) return;
            await createRecurringJob(j, 'monthly');
            showToast('Monthly reminder set');
            setSheet(null);
          }} fullWidth>Monthly</Button>
          <Button variant="secondary" onClick={async () => {
            const j = jobs.find(x => x.id === selectedJobId);
            if (!j || !userId) return;
            await createRecurringJob(j, 'quarterly');
            showToast('Quarterly reminder set');
            setSheet(null);
          }} fullWidth>Quarterly</Button>
          <Button variant="secondary" onClick={async () => {
            const j = jobs.find(x => x.id === selectedJobId);
            if (!j || !userId) return;
            await createRecurringJob(j, 'six_monthly');
            showToast('6-monthly reminder set');
            setSheet(null);
          }} fullWidth>6-monthly</Button>
          <Button variant="primary" onClick={async () => {
            const j = jobs.find(x => x.id === selectedJobId);
            if (!j || !userId) return;
            await createRecurringJob(j, 'annual');
            showToast('Annual reminder set');
            setSheet(null);
          }} fullWidth>Annual</Button>
        </div>
      </BottomSheet>

      {/* P2-A: Follow-up actions sheet */}
      <BottomSheet
        isOpen={sheet === 'follow_up_actions'}
        onClose={() => { setSheet(null); setSelectedFollowUp(null); }}
        title="Follow up"
        subtitle={selectedFollowUp ? `${customerFor(selectedFollowUp.job?.customer_id || '')?.name || ''} · ${selectedFollowUp.job?.title || ''}` : undefined}
      >
        {selectedFollowUp && selectedFollowUp.job && (() => {
          const c = customerFor(selectedFollowUp.job.customer_id);
          const total = (lineItems[selectedFollowUp.job.id] || []).reduce((s, i) => s + i.amount, 0);
          const days = selectedFollowUp.job.quote_sent_at ? Math.floor((Date.now() - new Date(selectedFollowUp.job.quote_sent_at).getTime()) / 86400000) : 0;
          const businessName = profile?.business_name || profile?.full_name || 'Your business';
          const firstName = c?.name?.split(' ')[0] || 'there';
          const followUpMsg = `Hi ${firstName}, just following up on the quote I sent for ${selectedFollowUp.job.title}. Happy to answer any questions. — ${businessName}`;
          return (
            <div className="flex flex-col gap-2">
              <div className="bg-brand-surface border border-brand-border rounded-lg p-3 mb-2">
                <p className="text-sm text-brand-dark">Quote sent {days}d ago · £{total.toFixed(2)}</p>
              </div>
              <Button variant="primary" fullWidth onClick={() => {
                setSendSheetConfig({
                  title: `Send to ${c?.name || 'customer'}?`,
                  customerPhone: c?.phone || '',
                  messageText: followUpMsg,
                  onSend: async (method) => {
                    await incrementNudge(selectedFollowUp.id);
                    const methodLabel = method === 'whatsapp' || method === 'whatsapp_pdf' ? 'WhatsApp' : 'SMS';
                    const n = new Date().toISOString();
                    const logId = crypto.randomUUID();
                    await db.work_log.add({ id: logId, job_id: selectedFollowUp.job_id, type: 'quote_follow_up_sent', description: `[Follow-up sent via ${methodLabel}] ${followUpMsg}`, created_at: n, _sync_status: 'pending' });
                    await addToSyncQueue('work_log', logId, { id: logId, job_id: selectedFollowUp.job_id, type: 'quote_follow_up_sent', description: `[Follow-up sent via ${method === 'whatsapp' ? 'WhatsApp' : 'SMS'}] ${followUpMsg}`, created_at: n }, 'insert');
                    captureQuoteFollowUpSent({ jobId: selectedFollowUp.job_id, nudgeCount: selectedFollowUp.nudge_count + 1, method: method === 'whatsapp' || method === 'whatsapp_pdf' ? 'whatsapp' : 'sms' });
                    setSheet(null); setSelectedFollowUp(null); refresh();
                  },
                });
              }}>
                <MessageCircle size={18} className="mr-2" />
                Send follow-up
              </Button>
              <div className="flex gap-2">
                <Button variant="secondary" fullWidth onClick={async () => { await snoozeFollowUp(selectedFollowUp.id, '1d'); captureQuoteFollowUpSnoozed({ jobId: selectedFollowUp.job_id, duration: '1d' }); setSheet(null); setSelectedFollowUp(null); refresh(); showToast('Snoozed 1 day'); }}>1 day</Button>
                <Button variant="secondary" fullWidth onClick={async () => { await snoozeFollowUp(selectedFollowUp.id, '1w'); captureQuoteFollowUpSnoozed({ jobId: selectedFollowUp.job_id, duration: '1w' }); setSheet(null); setSelectedFollowUp(null); refresh(); showToast('Snoozed 1 week'); }}>1 week</Button>
                <Button variant="secondary" fullWidth onClick={async () => { await snoozeFollowUp(selectedFollowUp.id, '2w'); captureQuoteFollowUpSnoozed({ jobId: selectedFollowUp.job_id, duration: '2w' }); setSheet(null); setSelectedFollowUp(null); refresh(); showToast('Snoozed 2 weeks'); }}>2 weeks</Button>
              </div>
              <Button variant="secondary" fullWidth onClick={async () => { await markQuoteResponded(selectedFollowUp.job_id); captureQuoteFollowUpResponded({ jobId: selectedFollowUp.job_id }); setSheet(null); setSelectedFollowUp(null); refresh(); showToast('Marked as responded'); }}>Customer responded</Button>
              <Button variant="ghost" fullWidth onClick={async () => { await dismissFollowUp(selectedFollowUp.id); setSheet(null); setSelectedFollowUp(null); refresh(); showToast('Stopped tracking'); }}>Stop tracking</Button>
              <Button variant="ghost" fullWidth onClick={() => { setSheet(null); setSelectedFollowUp(null); navigate(`/jobs/${selectedFollowUp.job_id}`); }}>Open job</Button>
            </div>
          );
        })()}
      </BottomSheet>

      {/* P2-A: Chase actions sheet */}
      <BottomSheet
        isOpen={sheet === 'chase_actions'}
        onClose={() => { setSheet(null); setSelectedChase(null); }}
        title="Payment chase"
        subtitle={selectedChase ? `${customerFor(selectedChase.job?.customer_id || '')?.name || ''} · ${selectedChase.job?.title || ''}` : undefined}
      >
        {selectedChase && selectedChase.job && (() => {
          const c = customerFor(selectedChase.job.customer_id);
          const total = (lineItems[selectedChase.job.id] || []).reduce((s, i) => s + i.amount, 0);
          const clockStart = selectedChase.job.actual_end || selectedChase.job.updated_at;
          const daysOverdue = clockStart ? Math.floor((Date.now() - new Date(clockStart).getTime()) / 86400000) : 0;
          const businessName = profile?.business_name || profile?.full_name || 'Your business';
          const firstName = c?.name?.split(' ')[0] || 'there';
          const stageMessages: Record<string, string> = {
            gentle: `Hi ${firstName}, just a friendly reminder about the £${total.toFixed(2)} for the ${selectedChase.job.title}. Let me know if you need to talk about payment timing. — ${businessName}`,
            firm: `Hi ${firstName}, the balance of £${total.toFixed(2)} is now ${daysOverdue} days overdue. Happy to set up a payment plan if that helps. — ${businessName}`,
            final: `Hi ${firstName}, the balance of £${total.toFixed(2)} for the ${selectedChase.job.title} is now ${daysOverdue} days overdue. Please arrange payment at your earliest convenience. — ${businessName}`,
          };
          const isPaused = selectedChase.status === 'paused';
          const isSmallClaims = selectedChase.stage === 'small_claims';
          return (
            <div className="flex flex-col gap-2">
              <div className="bg-brand-surface border border-brand-border rounded-lg p-3 mb-2">
                <p className="text-sm text-brand-dark">£{total.toFixed(2)} · {daysOverdue}d overdue · {selectedChase.stage}{isPaused ? ' (paused)' : ''}</p>
              </div>
              {isSmallClaims ? (
                <div className="bg-status-amberBg border border-amber-200 rounded-lg p-3 mb-2">
                  <p className="text-sm text-status-amber">This invoice is {daysOverdue} days overdue. You can file a small claims court claim for £{total.toFixed(2)}.</p>
                </div>
              ) : !isPaused ? (
                <Button variant="primary" fullWidth onClick={() => {
                  const msg = stageMessages[selectedChase.stage] || stageMessages.gentle;
                  setSendSheetConfig({
                    title: `Send to ${c?.name || 'customer'}?`,
                    customerPhone: c?.phone || '',
                    messageText: msg,
                    onSend: async (method) => {
                      await markChaseSent(selectedChase.id, method === 'whatsapp' || method === 'whatsapp_pdf' ? 'whatsapp' : 'sms');
                      const n = new Date().toISOString();
                      const logId = crypto.randomUUID();
                      await db.work_log.add({ id: logId, job_id: selectedChase.job_id, type: 'payment_chase_sent', description: `[Payment chase sent via ${method === 'whatsapp' || method === 'whatsapp_pdf' ? 'WhatsApp' : 'SMS'}] ${selectedChase.stage}: ${msg}`, created_at: n, _sync_status: 'pending' });
                      await addToSyncQueue('work_log', logId, { id: logId, job_id: selectedChase.job_id, type: 'payment_chase_sent', description: `[Payment chase sent via ${method === 'whatsapp' || method === 'whatsapp_pdf' ? 'WhatsApp' : 'SMS'}] ${selectedChase.stage}: ${msg}`, created_at: n }, 'insert');
                      capturePaymentChaseSent({ jobId: selectedChase.job_id, stage: selectedChase.stage, method: method === 'whatsapp' || method === 'whatsapp_pdf' ? 'whatsapp' : 'sms' });
                      setSheet(null); setSelectedChase(null); refresh();
                    },
                  });
                }}>
                  <MessageCircle size={18} className="mr-2" />
                  Send chase
                </Button>
              ) : null}
              {isPaused ? (
                <Button variant="secondary" fullWidth onClick={async () => { await resumeChase(selectedChase.job_id); const n = new Date().toISOString(); const logId = crypto.randomUUID(); await db.work_log.add({ id: logId, job_id: selectedChase.job_id, type: 'payment_chase_resumed', description: 'Payment chase resumed', created_at: n, _sync_status: 'pending' }); await addToSyncQueue('work_log', logId, { id: logId, job_id: selectedChase.job_id, type: 'payment_chase_resumed', description: 'Payment chase resumed', created_at: n }, 'insert'); capturePaymentChaseResumed({ jobId: selectedChase.job_id }); setSheet(null); setSelectedChase(null); refresh(); showToast('Chase resumed'); }}>Resume chase</Button>
              ) : (
                <Button variant="secondary" fullWidth onClick={async () => { await pauseChase(selectedChase.job_id, 'manual'); const n = new Date().toISOString(); const logId = crypto.randomUUID(); await db.work_log.add({ id: logId, job_id: selectedChase.job_id, type: 'payment_chase_paused', description: 'Payment chase paused', created_at: n, _sync_status: 'pending' }); await addToSyncQueue('work_log', logId, { id: logId, job_id: selectedChase.job_id, type: 'payment_chase_paused', description: 'Payment chase paused', created_at: n }, 'insert'); capturePaymentChasePaused({ jobId: selectedChase.job_id, reason: 'manual' }); setSheet(null); setSelectedChase(null); refresh(); showToast('Chase paused'); }}>Pause chase</Button>
              )}
              {isSmallClaims && (
                <Button variant="secondary" fullWidth onClick={async () => { await resolveChaseById(selectedChase.job_id); setSheet(null); setSelectedChase(null); refresh(); showToast('Marked as resolved'); }}>Mark resolved</Button>
              )}
              <Button variant="ghost" fullWidth onClick={() => { setSheet(null); setSelectedChase(null); navigate(`/jobs/${selectedChase.job_id}`); }}>Open job</Button>
            </div>
          );
        })()}
      </BottomSheet>

      {/* P2-A: Recurring actions sheet */}
      <BottomSheet
        isOpen={sheet === 'recurring_actions'}
        onClose={() => { setSheet(null); setSelectedRecurring(null); }}
        title="Recurring job"
        subtitle={selectedRecurring ? `${customerFor(selectedRecurring.customer_id)?.name || ''} · ${selectedRecurring.title}` : undefined}
      >
        {selectedRecurring && (() => {
          const c = customerFor(selectedRecurring.customer_id);
          const businessName = profile?.business_name || profile?.full_name || 'Your business';
          const firstName = c?.name?.split(' ')[0] || 'there';
          const reminderMsg = `Hi ${firstName}, your ${selectedRecurring.title} is due soon. Want to book? — ${businessName}`;
          const intervalLabels: Record<string, string> = { monthly: 'Monthly', quarterly: 'Quarterly', six_monthly: '6-monthly', annual: 'Annual' };
          const nextDue = new Date(selectedRecurring.next_due_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
          return (
            <div className="flex flex-col gap-2">
              <div className="bg-brand-surface border border-brand-border rounded-lg p-3 mb-2">
                <p className="text-sm text-brand-dark">Next due: {nextDue} · {intervalLabels[selectedRecurring.interval] || selectedRecurring.interval}</p>
                {selectedRecurring.status === 'dormant' && <p className="text-xs text-status-amber mt-1">Dormant — no response after multiple attempts</p>}
              </div>
              <Button variant="secondary" fullWidth onClick={async () => { if (c?.phone) window.open(`tel:${c.phone}`, '_self'); await incrementContactAttempt(selectedRecurring.id); const n = new Date().toISOString(); const logId = crypto.randomUUID(); await db.work_log.add({ id: logId, job_id: selectedRecurring.original_job_id, type: 'recurring_reminder_sent', description: `[Call customer about ${selectedRecurring.title}]`, created_at: n, _sync_status: 'pending' }); await addToSyncQueue('work_log', logId, { id: logId, job_id: selectedRecurring.original_job_id, type: 'recurring_reminder_sent', description: `[Call customer about ${selectedRecurring.title}]`, created_at: n }, 'insert'); captureRecurringReminderActed({ recurringId: selectedRecurring.id, action: 'call' }); setSheet(null); setSelectedRecurring(null); refresh(); }}>Call customer</Button>
              <Button variant="primary" fullWidth onClick={() => {
                setSendSheetConfig({
                  title: `Send to ${c?.name || 'customer'}?`,
                  customerPhone: c?.phone || '',
                  messageText: reminderMsg,
                  onSend: async (method) => {
                    await incrementContactAttempt(selectedRecurring.id);
                    const n = new Date().toISOString();
                    const logId = crypto.randomUUID();
                    await db.work_log.add({ id: logId, job_id: selectedRecurring.original_job_id, type: 'recurring_reminder_sent', description: `[Recurring reminder sent via ${method === 'whatsapp' || method === 'whatsapp_pdf' ? 'WhatsApp' : 'SMS'}] ${reminderMsg}`, created_at: n, _sync_status: 'pending' });
                    await addToSyncQueue('work_log', logId, { id: logId, job_id: selectedRecurring.original_job_id, type: 'recurring_reminder_sent', description: `[Recurring reminder sent via ${method === 'whatsapp' || method === 'whatsapp_pdf' ? 'WhatsApp' : 'SMS'}] ${reminderMsg}`, created_at: n }, 'insert');
                    captureRecurringReminderActed({ recurringId: selectedRecurring.id, action: 'whatsapp' });
                    setSheet(null); setSelectedRecurring(null); refresh();
                  },
                });
              }}>
                <MessageCircle size={18} className="mr-2" />
                Send WhatsApp
              </Button>
              <Button variant="secondary" fullWidth onClick={async () => { await advanceRecurrence(selectedRecurring.id); const n = new Date().toISOString(); const logId = crypto.randomUUID(); await db.work_log.add({ id: logId, job_id: selectedRecurring.original_job_id, type: 'recurring_reminder_sent', description: `[Recurring job completed — ${selectedRecurring.title}]`, created_at: n, _sync_status: 'pending' }); await addToSyncQueue('work_log', logId, { id: logId, job_id: selectedRecurring.original_job_id, type: 'recurring_reminder_sent', description: `[Recurring job completed — ${selectedRecurring.title}]`, created_at: n }, 'insert'); captureRecurringReminderActed({ recurringId: selectedRecurring.id, action: 'done' }); setSheet(null); setSelectedRecurring(null); refresh(); showToast('Marked as done — next cycle set'); }}>Mark as done</Button>
              <Button variant="secondary" fullWidth onClick={async () => { await incrementContactAttempt(selectedRecurring.id); const n = new Date().toISOString(); const logId = crypto.randomUUID(); await db.work_log.add({ id: logId, job_id: selectedRecurring.original_job_id, type: 'recurring_reminder_no_response', description: `[No response — ${selectedRecurring.title}]`, created_at: n, _sync_status: 'pending' }); await addToSyncQueue('work_log', logId, { id: logId, job_id: selectedRecurring.original_job_id, type: 'recurring_reminder_no_response', description: `[No response — ${selectedRecurring.title}]`, created_at: n }, 'insert'); captureRecurringReminderActed({ recurringId: selectedRecurring.id, action: 'no_response' }); setSheet(null); setSelectedRecurring(null); refresh(); showToast('Recorded no response'); }}>No response</Button>
              <Button variant="ghost" fullWidth onClick={async () => { await cancelRecurrence(selectedRecurring.id); const n = new Date().toISOString(); const logId = crypto.randomUUID(); await db.work_log.add({ id: logId, job_id: selectedRecurring.original_job_id, type: 'recurring_job_cancelled', description: `[Recurring job cancelled — ${selectedRecurring.title}]`, created_at: n, _sync_status: 'pending' }); await addToSyncQueue('work_log', logId, { id: logId, job_id: selectedRecurring.original_job_id, type: 'recurring_job_cancelled', description: `[Recurring job cancelled — ${selectedRecurring.title}]`, created_at: n }, 'insert'); captureRecurringReminderActed({ recurringId: selectedRecurring.id, action: 'cancel' }); setSheet(null); setSelectedRecurring(null); refresh(); showToast('Recurrence cancelled'); }}>Cancel recurrence</Button>
              <Button variant="ghost" fullWidth onClick={() => { setSheet(null); setSelectedRecurring(null); navigate(`/jobs/${selectedRecurring.original_job_id}`); }}>Open job</Button>
            </div>
          );
        })()}
      </BottomSheet>

      {/* Booking requests list sheet (shown when 5+ pending) */}
      <BottomSheet
        isOpen={sheet === 'booking_list'}
        onClose={() => setSheet(null)}
        title="Booking requests"
        subtitle={`${pendingBookings.length} pending`}
      >
        <div className="flex flex-col gap-2">
          {pendingBookings.map((b) => (
            <div
              key={b.id}
              onClick={() => { setSelectedBooking(b); setSheet('booking_request'); }}
              className="bg-white border border-brand-border rounded-lg p-3 cursor-pointer active:scale-[0.98] transition-transform"
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-semibold text-brand-black">{b.client_name}</span>
                {b.service_amount > 0 && <span className="text-sm font-bold text-brand-black">£{b.service_amount.toFixed(0)}</span>}
              </div>
              <p className="text-xs text-brand-muted">{b.service_description}</p>
              <p className="text-xs text-brand-mid mt-1">{b.requested_date} at {b.requested_time}</p>
            </div>
          ))}
        </div>
      </BottomSheet>

      {/* W2-1: Booking request sheet */}
      <BottomSheet
        isOpen={sheet === 'booking_request'}
        onClose={() => { setSheet(null); setSelectedBooking(null); }}
        title="Booking request"
        subtitle={selectedBooking ? `${selectedBooking.client_name} · ${selectedBooking.service_description}` : undefined}
      >
        {selectedBooking && (() => {
          const conflictTime = bookingConflict?.scheduledStart
            ? new Date(bookingConflict.scheduledStart).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
            : '';
          return (
            <div className="flex flex-col gap-2">
              {bookingConflict ? (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-2 flex items-start gap-2">
                  <AlertTriangle size={18} className="text-status-red shrink-0 mt-0.5" />
                  <p className="text-sm text-status-red">
                    Conflicts with: {bookingConflict.jobNumber || 'no job #'} · {bookingConflict.customerName} · {bookingConflict.title} · {conflictTime}
                  </p>
                </div>
              ) : (
                <div className="bg-status-greenBg border border-green-200 rounded-lg p-3 mb-2 flex items-center gap-2">
                  <CheckCircle size={18} className="text-status-green" />
                  <p className="text-sm text-status-green">Available</p>
                </div>
              )}
              <div className="bg-brand-surface border border-brand-border rounded-lg p-3 mb-2">
                <p className="text-sm text-brand-dark">
                  <span className="font-semibold">{selectedBooking.service_description}</span>
                  {selectedBooking.service_amount > 0 && <span className="text-brand-muted"> · £{selectedBooking.service_amount.toFixed(0)}</span>}
                </p>
                <p className="text-xs text-brand-muted mt-1">
                  {selectedBooking.requested_date} at {selectedBooking.requested_time}
                </p>
                <p className="text-xs text-brand-muted mt-1">📞 {selectedBooking.client_phone}</p>
                {selectedBooking.notes && <p className="text-xs text-brand-mid mt-1.5 italic">"{selectedBooking.notes}"</p>}
                {selectedBooking.referral_source && <p className="text-xs text-brand-muted mt-1">How they found you: {selectedBooking.referral_source}{selectedBooking.referral_detail ? ` (${selectedBooking.referral_detail})` : ''}</p>}
              </div>
              <Button variant="primary" fullWidth onClick={async () => {
                if (!userId) return;
                try {
                  const result = await acceptBookingRequest(selectedBooking.id, userId);
                  // Send confirmation message via SendSheet
                  setSheet(null);
                  setSelectedBooking(null);
                  setSendSheetConfig({
                    title: `Send confirmation to ${result.customer.name}?`,
                    customerPhone: result.customer.phone,
                    messageText: result.confirmationMessage,
                    onSend: () => {
                      setSendSheetConfig(null);
                      refresh();
                      showToast('Booking accepted — job created');
                    },
                  });
                  refresh();
                } catch (e) {
                  showToast('Could not accept booking', 'error');
                }
              }}>
                <Check size={18} className="mr-2" />
                Accept booking
              </Button>
              <Button variant="secondary" fullWidth onClick={async () => {
                await rejectBookingRequest(selectedBooking.id);
                const businessName = profile?.business_name || profile?.full_name || 'Your business';
                const rescheduleMsg = `Hi ${selectedBooking.client_name.split(' ')[0]}, sorry I'm not available on ${selectedBooking.requested_date} at ${selectedBooking.requested_time}. Can we find another time? — ${businessName}`;
                setSheet(null);
                setSelectedBooking(null);
                setSendSheetConfig({
                  title: `Send to ${selectedBooking.client_name}?`,
                  customerPhone: selectedBooking.client_phone,
                  messageText: rescheduleMsg,
                  onSend: () => {
                    setSendSheetConfig(null);
                    refresh();
                    showToast('Booking rejected — reschedule sent');
                  },
                });
                refresh();
              }}>
                Reject — send reschedule
              </Button>
              <Button variant="secondary" fullWidth onClick={() => {
                window.open(`tel:${selectedBooking.client_phone}`, '_self');
              }}>
                Call client
              </Button>
              <Button variant="ghost" fullWidth onClick={() => { setSheet(null); setSelectedBooking(null); }}>
                Close
              </Button>
            </div>
          );
        })()}
      </BottomSheet>

      {/* W1-1: Week view sheet */}
      <BottomSheet
        isOpen={sheet === 'week_view'}
        onClose={() => setSheet(null)}
        title="This week"
      >
        <WeekView
          jobs={jobs}
          customers={customers}
          lineItems={lineItems}
          onDayTap={(date) => {
            setSheet(null);
            const dateStr = date.toISOString().split('T')[0];
            const dayJobs = jobs.filter(j =>
              j.scheduled_start &&
              new Date(j.scheduled_start).toDateString() === date.toDateString() &&
              ['booked', 'in_progress'].includes(j.status) &&
              !j.is_sample
            );
            if (dayJobs.length === 1) {
              navigate(`/jobs/${dayJobs[0].id}`);
            } else {
              navigate(`/jobs?date=${dateStr}`);
            }
            capture('week_view_day_tapped', { jobCount: dayJobs.length });
          }}
        />
      </BottomSheet>

      {/* W1-2: End-of-day review sheet */}
      <BottomSheet
        isOpen={sheet === 'eod_review'}
        onClose={() => setSheet(null)}
        title="End of day review"
        subtitle={eodReviewJobIds.length > 0 ? `${eodReviewJobIds.length} job${eodReviewJobIds.length > 1 ? 's' : ''} still in progress` : undefined}
      >
        {eodReviewJobIds.map(jobId => {
          const j = jobs.find(x => x.id === jobId);
          const c = j ? customers[j.customer_id] : null;
          if (!j || !c) return null;
          return (
            <div key={jobId} className="bg-white border border-brand-border rounded-lg p-3 mb-2">
              <p className="text-sm font-semibold text-brand-black">{c.name} · {j.title}</p>
              <div className="flex gap-2 mt-2">
                <Button variant="primary" size="sm" onClick={() => handleEodComplete(jobId)}>Complete</Button>
                <Button variant="secondary" size="sm" onClick={() => {
                  setEodReviewJobIds(prev => prev.filter(id => id !== jobId));
                  if (eodReviewJobIds.length <= 1) {
                    setSheet(null);
                    setShowEodReview(false);
                    setEodDismissedToday(true);
                    localStorage.setItem('buildlogg_eod_review', JSON.stringify({ date: new Date().toDateString(), dismissed: true }));
                  }
                }}>Still working</Button>
              </div>
            </div>
          );
        })}
        {eodReviewJobIds.length === 0 && (
          <p className="text-sm text-brand-muted text-center py-4">All caught up</p>
        )}
      </BottomSheet>

      {/* P2-A: SendSheet for task card sends */}
      <SendSheet
        isOpen={!!sendSheetConfig}
        onClose={() => setSendSheetConfig(null)}
        title={sendSheetConfig?.title || ''}
        customerPhone={sendSheetConfig?.customerPhone || ''}
        messageText={sendSheetConfig?.messageText || ''}
        onMessageChange={(text) => setSendSheetConfig(prev => prev ? { ...prev, messageText: text } : prev)}
        onSend={(method, pdfShared) => {
          if (sendSheetConfig) sendSheetConfig.onSend(method, pdfShared);
          setSendSheetConfig(null);
        }}
      />

    </div>
  );
}
