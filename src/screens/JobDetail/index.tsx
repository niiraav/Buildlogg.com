import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import {
  ChevronLeft, Phone, MessageCircle, MessageSquare, Copy, Clock, Banknote, Pencil, Building2, Check, CalendarPlus, Plus, X, MoreVertical, MapPin, Navigation, Camera, Image as ImageIcon, AlertTriangle, CreditCard,
} from 'lucide-react';
import { db, type Job, type Customer, type LineItem, type WorkLogEntry, type Profile, type Payment, type JobPhoto, type MaterialItem, type ReminderMode } from '../../lib/db';
import { paymentSummary, formatAmount, paymentMethodLabel } from '../../lib/paymentHelpers';
import { addToSyncQueue } from '../../lib/syncQueue';
import { createCheckoutSession } from '../../lib/stripe';
import { useAppStore } from '../../store/useAppStore';
import { setContextualFlag } from '../../lib/notificationManager';
import { captureJobMarkedPaid, captureJobBooked, captureJobStarted, captureJobCancelled, capturePaymentChase, capturePhotoAdded, capture } from '../../lib/analytics';
import { nextJobNumber, ensureJobNumber, nextInvoiceNumber, ensureInvoiceNumber } from '../../lib/jobNumbers';
import { showSuccess, showToast } from '../../components/Toast/store';
import { hapticSuccess } from '../../lib/haptics';
import { BottomSheet, SheetRow } from '../../components/BottomSheet';
import { Button } from '../../components/Button';
import { MapPreview } from '../../components/MapPreview';
import { InvoiceItemRow, InvoiceTotalRow } from '../../components/InvoiceItemRow';
import { StatusBadge } from '../../components/StatusBadge';
import { PhotoGallery } from '../../components/PhotoGallery';
import { SkeletonInline } from '../../components/Skeleton';
import {
  captureNewJobInterceptShown,
  captureNewJobInterceptMarkDone,
  captureNewJobInterceptLeaveInProgress,
  captureCompletionPhotoTaken,
  captureCompletionPhotoSkipped,
} from '../../lib/analytics';
import { formatElapsed as formatStaleElapsed } from '../../lib/jobStaleness';
import { capturePhoto, pickPhotoFromLibrary, saveJobPhoto } from '../../lib/photoCapture';
import { generateInvoicePDF } from '../../lib/pdfGenerator';
import { SendSheet, type SendMethod } from '../../components/SendSheet';
import { detectConflicts, type SchedulingConflict } from '../../lib/scheduling';
import { captureReviewRequestShown, captureReviewRequestSent, captureReviewRequestSkipped } from '../../lib/analytics';
import { addToCalendar } from '../../lib/calendar';
import { bookingPageUrl } from '../../lib/referral';
import { getFilledTemplateMessage } from '../../lib/templateEngine';
import { markQuoteResponded } from '../../lib/quoteFollowUp';
import { createPaymentChases, resolveChases, markStageSentByJob, pauseChasesOnStatusChange } from '../../lib/paymentChase';
import { createRecurringJob } from '../../lib/recurringJobs';

import { useEntitlements } from '../../hooks/useEntitlements';
/* ─── helpers ─── */

function now() { return new Date().toISOString(); }

function formatShortDate(d: Date): string {
  return d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' });
}

function formatInvoiceSent(isoDate: string): string {
  const d = new Date(isoDate);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (days < 1) return 'Sent today';
  if (days === 1) return 'Sent yesterday';
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

function formatTime(d: Date): string {
  return d.toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit', hour12: true }).toLowerCase();
}

function formatDateTimeRange(start?: string, end?: string): string {
  if (!start) return 'No date set';
  const s = new Date(start);
  const startStr = `${formatShortDate(s)} · ${formatTime(s)}`;
  if (!end) return startStr;
  const e = new Date(end);
  return `${startStr}–${formatTime(e)}`;
}

function paymentTermsLabel(t: Job['payment_terms']): string {
  if (t === 'on_completion') return 'On completion';
  if (t === 'deposit') return 'Deposit';
  return 'Invoice';
}

function jobTotal(items: LineItem[]): number {
  return items.reduce((s, i) => s + (i.amount || 0), 0);
}

function formatLogTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit', hour12: true }).toLowerCase();
}

function toDateValue(iso?: string): string {
  if (!iso) return '';
  const [datePart] = iso.split('T');
  return datePart;
}

function toTimeValue(iso?: string): string {
  if (!iso) return '';
  const match = iso.match(/T(\d{2}):(\d{2})/);
  if (!match) return '';
  const [, h, m] = match;
  return `${h}:${m}`;
}

function addTwoHours(timeStr: string): string {
  if (!timeStr) return '10:00';
  const [h, m] = timeStr.split(':').map(Number);
  const d = new Date();
  d.setHours(h + 2, m, 0, 0);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function formatElapsed(start?: string, now?: Date): string {
  if (!start || !now) return '0m';
  const startTime = new Date(start).getTime();
  const nowTime = now.getTime();
  const diff = Math.max(0, nowTime - startTime);
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

function combineDateTime(dateStr: string, timeStr: string): string | undefined {
  if (!dateStr) return undefined;
  const time = timeStr || '00:00';
  return new Date(`${dateStr}T${time}`).toISOString();
}

/* ─── types ─── */

type SheetState =
  | null
  | 'cancel'
  | 'more_options'
  | 'log_expense'
  | 'add_charge'
  | 'mark_done'
  | 'add_note'
  | 'mark_paid'
  | 'send_reminder'
  | 'reschedule'
  | 'callout_charge'
  | 'booking_confirmation'
  | 'edit_details'
  | 'send_update'
  | 'send_receipt'
  | 'change_status'
  | 'edit_payment_method'
  | 'finish_previous'
  | 'record_deposit'
  | 'request_payment'
  | 'write_off'
  | 'confirm_not_home'
  | 'review_prompt'
  | 'recurring_prompt'
  | 'zero_value_warning';

/* ─── component ─── */

export default function JobDetail() {
  const navigate = useNavigate();
  const { can } = useEntitlements();
  const location = useLocation();
  const { jobId } = useParams<{ jobId: string }>();
  const userId = useAppStore((s) => s.userId);

  const [job, setJob] = useState<Job | null>(null);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [lineItems, setLineItems] = useState<LineItem[]>([]);
  const [workLog, setWorkLog] = useState<WorkLogEntry[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const [sendSheetConfig, setSendSheetConfig] = useState<{
    title: string;
    messageText: string;
    onSend: (method: SendMethod, pdfShared: boolean) => void;
    pdfOptions?: { label: string; generatePdf: () => Promise<Blob>; fileName: string; onPdfGenerated?: () => void };
    fullMessage?: string;
    compactMessage?: string;
  } | null>(null);
  const [sheet, setSheet] = useState<SheetState>(null);
  const [conflicts, setConflicts] = useState<SchedulingConflict[]>([]);
  const [reviewMessage, setReviewMessage] = useState('');
  const [editingReview, setEditingReview] = useState(false);

  // Pre-fill review message from default template when prompt opens
  useEffect(() => {
    if (sheet === 'review_prompt' && job && customer && profile && userId) {
      getFilledTemplateMessage(userId, 'review', job, customer, profile, 0,
        `Hi ${customer.name.split(' ')[0] || 'there'}, glad the ${job.title || 'job'} is sorted! If you were happy with the work, a quick Google review helps me a lot. Only takes 30 seconds. Thanks! — ${profile.business_name || profile.full_name}\n\n${profile.google_business_url || ''}`
      ).then(setReviewMessage);
    }
  }, [sheet, job, customer, profile, userId]);
  const [chargeDesc, setChargeDesc] = useState('');
  const [chargeAmount, setChargeAmount] = useState('');
  const [expenseDesc, setExpenseDesc] = useState('');
  const [expenseAmount, setExpenseAmount] = useState('');
  const [notesBannerDismissed, setNotesBannerDismissed] = useState(false);
  const [notesBannerExpanded, setNotesBannerExpanded] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [payments, setPayments] = useState<Payment[]>([]);
  const [photos, setPhotos] = useState<JobPhoto[]>([]);
  const [materialItems, setMaterialItems] = useState<MaterialItem[]>([]);
  const [markDoneStep, setMarkDoneStep] = useState<'photo' | 'payment'>('photo');
  const [recurringEmailInput, setRecurringEmailInput] = useState('');
  const [recurringMode, setRecurringMode] = useState<ReminderMode>('remind_me');
  const [interceptData, setInterceptData] = useState<{ oldJob: Job; oldCustomerName: string; newJobId: string } | null>(null);
  const [paymentProcessing, setPaymentProcessing] = useState(false);
  const [stripeLoading, setStripeLoading] = useState(false);

  /* Initialize callout amount from profile */
  useEffect(() => {
    if (profile?.callout_charge) {
      setCalloutAmount(String(profile.callout_charge));
    } else {
      setCalloutAmount('75');
    }
  }, [profile]);
  const [reminderText, _setReminderText] = useState('');
  const [rescheduleDate, setRescheduleDate] = useState('');
  const [calloutDesc, setCalloutDesc] = useState('Callout charge');
  const [calloutAmount, setCalloutAmount] = useState('');
  const [workLogExpanded, setWorkLogExpanded] = useState(false);
  const [expandedLogIds, setExpandedLogIds] = useState<Set<string>>(new Set());
  const [editTitle, setEditTitle] = useState('');
  const [editDate, setEditDate] = useState('');
  const [editStartTime, setEditStartTime] = useState('');
  const [editEndTime, setEditEndTime] = useState('');
  const [editNotes, setEditNotes] = useState("");
  const [editAddress, setEditAddress] = useState("");
  const [updateMessage, setUpdateMessage] = useState('');
  const [bookingMessage, setBookingMessage] = useState('');
  const [elapsedNow, setElapsedNow] = useState(new Date());
  useEffect(() => {
    const interval = setInterval(() => setElapsedNow(new Date()), 60000);
    return () => clearInterval(interval);
  }, []);

  /* ─── load data ─── */
  const refresh = useCallback(async () => {
    if (!jobId || !userId) { setLoading(false); return; }
    let j = await db.jobs.get(jobId);
    if (!j || j.user_id !== userId) { setLoading(false); return; }
    if (!j.job_number) {
      j = await ensureJobNumber(j, userId);
    }
    setJob(j);

    const c = await db.customers.get(j.customer_id);
    setCustomer(c || null);

    const items = await db.line_items.where('job_id').equals(jobId).sortBy('sort_order');
    setLineItems(items);

    const logs = await db.work_log.where('job_id').equals(jobId).reverse().sortBy('created_at');
    setWorkLog(logs);

    const p = await db.profiles.get(userId);
    setProfile(p || null);

    const pmts = await db.payments.where('job_id').equals(jobId).toArray();
    setPayments(pmts);

    const phs = await db.job_photos.where('job_id').equals(jobId).toArray();
    setPhotos(phs);
    const mats = await db.material_items.where('job_id').equals(jobId).toArray();
    setMaterialItems(mats);

    setLoading(false);
  }, [jobId, userId]);

  useEffect(() => { refresh(); }, [refresh]);

  /* Anti-forgetting: auto-open mark_done sheet or auto-start job based on navigation state */
  useEffect(() => {
    const routeState = location.state as { autoOpenMarkDone?: boolean; autoStart?: boolean; returnToStartJob?: { jobId: string; from: string } } | null;
    if (!routeState || !job) return;

    if (routeState.autoOpenMarkDone && job.status === 'in_progress') {
      setMarkDoneStep('photo');
      setSheet('mark_done');
    }
    if (routeState.autoStart && job.status === 'booked') {
      doStartJob();
    }
  }, [job, location.state]);

  /* ─── derived ─── */
  const total = useMemo(() => jobTotal(lineItems), [lineItems]);
  const eventLogs = useMemo(() => workLog.filter((log) => log.type !== 'note'), [workLog]);
  const noteLogs = useMemo(() => workLog.filter((log) => log.type === 'note'), [workLog]);
  const hasPrivateNotes = noteLogs.length > 0;

  const hasContactButtons = useMemo(() => {
    if (!job) return false;
    return ['booked', 'in_progress', 'awaiting_payment', 'no_show', 'quoted'].includes(job.status);
  }, [job]);

  /* ─── actions ─── */

  const handleSaveMaterialsCost = useCallback(async (value: string) => {
    const cost = parseFloat(value);
    if (isNaN(cost) || cost <= 0) return;

    const n = now();
    const itemId = crypto.randomUUID();

    // Clear existing material items for this job and create a single total
    await db.material_items.where('job_id').equals(jobId!).delete();
    await db.material_items.add({
      id: itemId,
      job_id: jobId!,
      user_id: userId!,
      description: 'Materials',
      quantity: 1,
      unit_cost: cost,
      markup_pct: 0,
      unit_price: cost,
      total_cost: cost,
      total_price: cost,
      added_on_site: true,
      created_at: n,
      _sync_status: 'pending',
    });
    await db.sync_queue.add({
      operation: 'insert',
      table_name: 'material_items',
      record_id: itemId,
      payload: {
        id: itemId,
        job_id: jobId!,
        user_id: userId!,
        description: 'Materials',
        quantity: 1,
        unit_cost: cost,
        markup_pct: 0,
        unit_price: cost,
        total_cost: cost,
        total_price: cost,
        added_on_site: true,
        created_at: n,
      },
      created_at: n,
      retry_count: 0,
    });

    refresh();
  }, [jobId, userId, refresh]);

  const handleLogExpense = async () => {
    const amount = parseFloat(expenseAmount);
    if (!expenseDesc.trim() || isNaN(amount) || amount <= 0) return;
    const n = now();
    const workLogId = crypto.randomUUID();
    await db.work_log.add({
      id: workLogId,
      job_id: jobId!,
      type: 'expense',
      description: expenseDesc.trim(),
      amount,
      created_at: n,
      _sync_status: 'pending',
    });
    await addToSyncQueue('work_log', workLogId, {
      id: workLogId, job_id: jobId!, type: 'expense',
      description: expenseDesc.trim(), amount, created_at: n,
    }, 'insert');
    setExpenseDesc('');
    setExpenseAmount('');
    setSheet(null);
    refresh();
    showToast('Expense logged');
  };

  const handleAddCharge = async () => {
    const amount = parseFloat(chargeAmount);
    if (!chargeDesc.trim() || isNaN(amount) || amount <= 0) return;
    const n = now();
    const liId = crypto.randomUUID();
    const workLogId = crypto.randomUUID();
    await db.line_items.add({
      id: liId,
      job_id: jobId!,
      description: chargeDesc.trim(),
      amount,
      sort_order: lineItems.length,
      added_on_site: true,
      created_at: n,
      _sync_status: 'pending',
    });
    const newTotal = total + amount;
    await db.work_log.add({
      id: workLogId,
      job_id: jobId!,
      type: 'charge',
      description: `${chargeDesc.trim()} — £${amount.toFixed(2)} (Total: £${newTotal.toFixed(2)})`,
      amount,
      line_item_id: liId,
      created_at: n,
      _sync_status: 'pending',
    });
    await addToSyncQueue('line_items', liId, { id: liId, description: chargeDesc.trim(), amount, job_id: jobId!, added_on_site: true, sort_order: lineItems.length, created_at: n }, 'insert');
    await addToSyncQueue('work_log', workLogId, { id: workLogId, job_id: jobId!, type: 'charge', description: `${chargeDesc.trim()} — £${amount.toFixed(2)} (Total: £${newTotal.toFixed(2)})`, amount, line_item_id: liId, created_at: n }, 'insert');

    // Prompt to notify customer about the new charge
    const customerFirstName = customer?.name.split(' ')[0] || 'there';
    const business = profile?.business_name || profile?.full_name || 'Your tradesperson';
    const chargeMsg = `Hi ${customerFirstName}, I've added ${chargeDesc.trim()} — £${amount.toFixed(2)} to your quote for ${job?.title || 'your job'}. New total: £${newTotal.toFixed(2)}. — ${business}`;
    setUpdateMessage(chargeMsg);
    const tplMsg = await getFilledTemplateMessage(userId!, 'update', job!, customer!, profile!, total, chargeMsg);
    setChargeDesc('');
    setChargeAmount('');
    setSendSheetConfig({
      title: `Send update to ${customer?.name || 'customer'}?`,
      messageText: tplMsg,
      onSend: (method, pdfShared) => handleSendUpdate(method, pdfShared),
    });
    refresh();
  };

  const handleAddNote = async () => {
    if (!noteText.trim()) return;
    const n = now();
    const logId = crypto.randomUUID();
    await db.work_log.add({
      id: logId,
      job_id: jobId!,
      type: 'note',
      description: noteText.trim(),
      created_at: n,
      _sync_status: 'pending',
    });
    await addToSyncQueue('work_log', logId, { id: logId, job_id: jobId!, type: 'note', description: noteText.trim(), created_at: n }, 'insert');
    setNoteText('');
    setSheet(null);
    refresh();
  };

  const handleCancelJob = async (reason: 'customer_cancelled' | 'dave_cancelled') => {
    if (!job) return;
    const n = now();
    const logId = crypto.randomUUID();
    await db.jobs.update(job.id, {
      status: 'cancelled',
      cancellation_reason: reason,
      updated_at: n,
      _sync_status: 'pending',
    });
    await db.work_log.add({
      id: logId,
      job_id: job.id,
      type: 'status_change',
      description: reason === 'customer_cancelled' ? 'Customer cancelled' : 'I cancelled',
      created_at: n,
      _sync_status: 'pending',
    });
    await addToSyncQueue('jobs', job.id, { status: 'cancelled', cancellation_reason: reason, updated_at: n }, 'update');
    await addToSyncQueue('work_log', logId, { id: logId, job_id: job.id, type: 'status_change', description: reason === 'customer_cancelled' ? 'Customer cancelled' : 'I cancelled', created_at: n }, 'insert');
    hapticSuccess();
    showToast('Job cancelled', 'success', 2000);
    captureJobCancelled(reason);
    setSheet(null);
    refresh();
  };

  const handleNotHome = async () => {
    if (!job) return;
    const n = now();
    const logId = crypto.randomUUID();
    await db.jobs.update(job.id, {
      status: 'no_show',
      actual_end: n,
      updated_at: n,
      _sync_status: 'pending',
    });
    await db.work_log.add({
      id: logId,
      job_id: job.id,
      type: 'status_change',
      description: 'Customer not home — no-show logged',
      created_at: n,
      _sync_status: 'pending',
    });
    await addToSyncQueue('jobs', job.id, { status: 'no_show', actual_end: n, updated_at: n }, 'update');
    await addToSyncQueue('work_log', logId, { id: logId, job_id: job.id, type: 'status_change', description: 'Customer not home — no-show logged', created_at: n }, 'insert');
    refresh();
  };

  const handleMarkDone = async (method: 'cash' | 'bank_transfer' | 'other' | 'not_yet') => {
    if (!job || !userId || paymentProcessing) return;

    // £0.00 jobs: skip payment flow entirely, mark as paid
    if (total === 0) {
      setPaymentProcessing(true);
      const n = now();
      try {
        const logId = crypto.randomUUID();
        await db.jobs.update(job.id, {
          status: 'paid',
          actual_end: n,
          updated_at: n,
          _sync_status: 'pending',
        });
        await db.work_log.add({
          id: logId,
          job_id: job.id,
          type: 'status_change',
          description: 'Job completed — no charge',
          created_at: n,
          _sync_status: 'pending',
        });
        await addToSyncQueue('jobs', job.id, { status: 'paid', actual_end: n, updated_at: n }, 'update');
        await addToSyncQueue('work_log', logId, { id: logId, job_id: job.id, type: 'status_change', description: 'Job completed — no charge', created_at: n }, 'insert');
        hapticSuccess();
        showSuccess('Job completed — no charge');
        setContextualFlag();
        captureJobMarkedPaid();
        setSheet(null);
      } finally {
        setPaymentProcessing(false);
        refresh();
      }
      return;
    }

    setPaymentProcessing(true);
    const n = now();
    try {
      if (method === 'not_yet') {
        const logId = crypto.randomUUID();
        await db.jobs.update(job.id, {
          status: 'awaiting_payment',
          actual_end: n,
          invoice_sent_at: n,
          updated_at: n,
          _sync_status: 'pending',
        });
        await db.work_log.add({
          id: logId,
          job_id: job.id,
          type: 'status_change',
          description: 'Job completed — payment pending',
          created_at: n,
          _sync_status: 'pending',
        });
        await ensureInvoiceNumber(job, userId);
        await addToSyncQueue('jobs', job.id, { status: 'awaiting_payment', actual_end: n, invoice_sent_at: n, updated_at: n }, 'update');
        await addToSyncQueue('work_log', logId, { id: logId, job_id: job.id, type: 'status_change', description: 'Job completed — payment pending', created_at: n }, 'insert');
        createPaymentChases(job.id, userId!, n).catch(() => {});
      } else {
        const summary = paymentSummary(job, payments, total);
        if (summary.isFullyPaid || job.status === 'paid') {
          showToast('This job is already paid', 'info', 2000);
          return;
        }
        const payId = crypto.randomUUID();
        await db.payments.add({
          id: payId,
          job_id: job.id,
          type: summary.nextPaymentType,
          method,
          amount: summary.amountDue,
          recorded_at: n,
          created_at: n,
          _sync_status: 'pending',
        });
        const fullyPaidNow = summary.totalPaid + summary.amountDue >= total - 0.0001;
        if (fullyPaidNow) resolveChases(job.id).catch(() => {});
        await db.jobs.update(job.id, {
          status: fullyPaidNow ? 'paid' : 'awaiting_payment',
          actual_end: n,
          updated_at: n,
          _sync_status: 'pending',
        });
        if (fullyPaidNow) {
          hapticSuccess();
          showSuccess('Job marked as paid');
          setContextualFlag();
          captureJobMarkedPaid();

          // P2-08: Show review prompt if Google reviews are enabled
          if (profile?.google_business_url && profile?.reviews_enabled !== false && can('google_reviews')) {
            setTimeout(() => {
              setSheet('review_prompt');
              captureReviewRequestShown({ jobId: job.id });
            }, 500);
          }
        } else {
          showToast('Deposit recorded — balance still due', 'info', 2500);
        }
        await ensureInvoiceNumber(job, userId);
        const logId = crypto.randomUUID();
        await db.work_log.add({
          id: logId,
          job_id: job.id,
          type: 'status_change',
          description: `Payment recorded — ${paymentMethodLabel(method)} · £${formatAmount(summary.amountDue)}`,
          amount: summary.amountDue,
          created_at: n,
          _sync_status: 'pending',
        });
        await addToSyncQueue('payments', payId, { id: payId, job_id: job.id, type: summary.nextPaymentType, method, amount: summary.amountDue, recorded_at: n, created_at: n }, 'insert');
        await addToSyncQueue('jobs', job.id, { status: fullyPaidNow ? 'paid' : 'awaiting_payment', actual_end: n, updated_at: n }, 'update');
        await addToSyncQueue('work_log', logId, { id: logId, job_id: job.id, type: 'status_change', description: `Payment recorded — ${paymentMethodLabel(method)} · £${formatAmount(summary.amountDue)}`, amount: summary.amountDue, created_at: n }, 'insert');
      }
      setSheet(null);
    } finally {
      setPaymentProcessing(false);
      refresh();
    }
  };

  const handleMarkAsPaid = async (method: 'cash' | 'bank_transfer' | 'other') => {
    if (!job || !userId || paymentProcessing) return;

    // £0.00 jobs: skip payment, mark as paid directly
    if (total === 0) {
      const n = now();
      try {
        const logId = crypto.randomUUID();
        await db.jobs.update(job.id, {
          status: 'paid',
          updated_at: n,
          _sync_status: 'pending',
        });
        await db.work_log.add({
          id: logId,
          job_id: job.id,
          type: 'status_change',
          description: 'Job completed — no charge',
          created_at: n,
          _sync_status: 'pending',
        });
        await addToSyncQueue('jobs', job.id, { status: 'paid', updated_at: n }, 'update');
        await addToSyncQueue('work_log', logId, { id: logId, job_id: job.id, type: 'status_change', description: 'Job completed — no charge', created_at: n }, 'insert');
        hapticSuccess();
        showSuccess('Job completed — no charge');
        setContextualFlag();
        captureJobMarkedPaid();
        setSheet(null);
      } finally {
        refresh();
      }
      return;
    }

    const summary = paymentSummary(job, payments, total);
    if (summary.isFullyPaid || job.status === 'paid') {
      showToast('This job is already paid', 'info', 2000);
      return;
    }
    setPaymentProcessing(true);
    const n = now();
    try {
      const payId = crypto.randomUUID();
      await db.payments.add({
        id: payId,
        job_id: job.id,
        type: summary.nextPaymentType,
        method,
        amount: summary.amountDue,
        recorded_at: n,
        created_at: n,
        _sync_status: 'pending',
      });
      const fullyPaidNow = summary.totalPaid + summary.amountDue >= total - 0.0001;
      await db.jobs.update(job.id, {
        status: fullyPaidNow ? 'paid' : 'awaiting_payment',
        updated_at: n,
        _sync_status: 'pending',
      });
      if (fullyPaidNow) {
        hapticSuccess();
        showSuccess('Job marked as paid');
        setContextualFlag();
        captureJobMarkedPaid();
        resolveChases(job.id).catch(() => {});

        // P2-08: Show review prompt if Google reviews are enabled
        if (profile?.google_business_url && profile?.reviews_enabled !== false && can('google_reviews')) {
          setTimeout(() => {
            setSheet('review_prompt');
            captureReviewRequestShown({ jobId: job.id });
          }, 500);
        }
      }
      const logId = crypto.randomUUID();
      await db.work_log.add({
        id: logId,
        job_id: job.id,
        type: 'status_change',
        description: `Payment recorded — ${paymentMethodLabel(method)} · £${formatAmount(summary.amountDue)}`,
        amount: summary.amountDue,
        created_at: n,
        _sync_status: 'pending',
      });
      await addToSyncQueue('payments', payId, { id: payId, job_id: job.id, type: summary.nextPaymentType, method, amount: summary.amountDue, recorded_at: n, created_at: n }, 'insert');
      await addToSyncQueue('jobs', job.id, { status: fullyPaidNow ? 'paid' : 'awaiting_payment', updated_at: n }, 'update');
      await addToSyncQueue('work_log', logId, { id: logId, job_id: job.id, type: 'status_change', description: `Payment recorded — ${paymentMethodLabel(method)} · £${formatAmount(summary.amountDue)}`, amount: summary.amountDue, created_at: n }, 'insert');
      if (fullyPaidNow && profile?.google_business_url && profile?.reviews_enabled !== false && can('google_reviews')) {
        // Don't close sheet — review prompt will open, then chains to recurring
      } else if (fullyPaidNow && job.title !== 'Callout charge') {
        setSheet(null);
        setTimeout(() => setSheet('recurring_prompt'), 500);
      } else {
        setSheet(null);
      }
    } finally {
      setPaymentProcessing(false);
      setMarkDoneStep('photo');

      // Anti-forgetting: if we were sent here from a new-job intercept, navigate back and auto-start the new job
      const routeState = location.state as { returnToStartJob?: { jobId: string; from: string } } | null;
      if (routeState?.returnToStartJob) {
        navigate(`/jobs/${routeState.returnToStartJob.jobId}`, { state: { autoStart: true } });
        return;
      }

      refresh();
    }
  };

  // CU-1: Complete job + send card payment link from the mark_done sheet.
  // Wraps the not_yet completion logic (awaiting_payment) then delegates to
  // handleRequestStripePayment('full') which creates the Stripe session and
  // opens the SendSheet. Does NOT manage sheet lifecycle — the Stripe handler
  // does that (setSheet(null), setSendSheetConfig, refresh()).
  const handleMarkDoneCardPayment = async () => {
    if (!job || !userId || paymentProcessing || stripeLoading) return;
    setPaymentProcessing(true);
    const n = now();
    try {
      // Job completion — same as handleMarkDone('not_yet')
      const logId = crypto.randomUUID();
      await db.jobs.update(job.id, {
        status: 'awaiting_payment',
        actual_end: n,
        invoice_sent_at: n,
        updated_at: n,
        _sync_status: 'pending',
      });
      await db.work_log.add({
        id: logId,
        job_id: job.id,
        type: 'status_change',
        description: 'Job completed — payment pending',
        created_at: n,
        _sync_status: 'pending',
      });
      await ensureInvoiceNumber(job, userId);
      await addToSyncQueue('jobs', job.id, { status: 'awaiting_payment', actual_end: n, invoice_sent_at: n, updated_at: n }, 'update');
      await addToSyncQueue('work_log', logId, { id: logId, job_id: job.id, type: 'status_change', description: 'Job completed — payment pending', created_at: n }, 'insert');
      createPaymentChases(job.id, userId!, n).catch(() => {});
      hapticSuccess();
    } catch (err) {
      console.error('[JobDetail] handleMarkDoneCardPayment completion error:', err);
      showToast('Could not complete job', 'error', 4000);
      setPaymentProcessing(false);
      return;
    } finally {
      setPaymentProcessing(false);
    }
    // Delegate to Stripe handler — it manages setSheet, setSendSheetConfig, refresh
    await handleRequestStripePayment('full');
  };

  const handleRecordDeposit = async (method: 'cash' | 'bank_transfer' | 'other') => {
    if (!job || !userId || paymentProcessing) return;
    const summary = paymentSummary(job, payments, total);
    if (summary.totalPaid >= summary.depositAmount - 0.0001) {
      showToast('Deposit already recorded', 'info', 2000);
      return;
    }
    setPaymentProcessing(true);
    const n = now();
    try {
      const payId = crypto.randomUUID();
      const logId = crypto.randomUUID();
      const depositAmount = summary.depositAmount;
      await db.payments.add({
        id: payId,
        job_id: job.id,
        type: 'deposit',
        method,
        amount: depositAmount,
        recorded_at: n,
        created_at: n,
        _sync_status: 'pending',
      });
      await db.work_log.add({
        id: logId,
        job_id: job.id,
        type: 'status_change',
        description: `Deposit recorded — ${paymentMethodLabel(method)} · £${formatAmount(depositAmount)}`,
        amount: depositAmount,
        created_at: n,
        _sync_status: 'pending',
      });
      await addToSyncQueue('payments', payId, { id: payId, job_id: job.id, type: 'deposit', method, amount: depositAmount, recorded_at: n, created_at: n }, 'insert');
      await addToSyncQueue('work_log', logId, { id: logId, job_id: job.id, type: 'status_change', description: `Deposit recorded — ${paymentMethodLabel(method)} · £${formatAmount(depositAmount)}`, amount: depositAmount, created_at: n }, 'insert');
      if (job.status === 'quoted') {
        await db.jobs.update(job.id, { status: 'booked', updated_at: n, _sync_status: 'pending' });
        await addToSyncQueue('jobs', job.id, { status: 'booked', updated_at: n }, 'update');
      }
      hapticSuccess();
      showSuccess('Deposit recorded');
      setSheet(null);
    } finally {
      setPaymentProcessing(false);
      refresh();
    }
  };

  const handleRequestStripePayment = async (type: 'deposit' | 'full') => {
    if (!job || !userId || stripeLoading) return;
    if (!profile?.stripe_connected) {
      showToast('Enable card payments in Settings first', 'info');
      return;
    }
    const summary = paymentSummary(job, payments, total);
    const amount = type === 'deposit' ? summary.depositAmount : summary.amountDue;
    if (amount <= 0) {
      showToast('Nothing to charge', 'info', 2000);
      return;
    }
    setStripeLoading(true);
    try {
      const result = await createCheckoutSession({
        merchantId: userId,
        jobId: job.id,
        amount,
        description: `${type === 'deposit' ? 'Deposit' : 'Payment'} for ${job.title || 'job'}`,
        type,
      });
      const n = now();
      const jobPatch: Partial<Job> = {
        deposit_status: 'requested',
        deposit_stripe_url: result.url,
        deposit_stripe_link_id: result.id,
        deposit_requested_at: n,
        updated_at: n,
        _sync_status: 'pending',
      };
      if (type === 'deposit') {
        jobPatch.deposit_amount = amount;
      }
      await db.jobs.update(job.id, jobPatch);
      await addToSyncQueue('jobs', job.id, { ...jobPatch }, 'update');
      const logId = crypto.randomUUID();
      await db.work_log.add({
        id: logId, job_id: job.id, type: 'status_change',
        description: `Card payment link sent — ${type === 'deposit' ? 'Deposit' : 'Payment'} £${formatAmount(amount)} via Stripe`,
        amount, created_at: n, _sync_status: 'pending',
      });
      await addToSyncQueue('work_log', logId, {
        id: logId, job_id: job.id, type: 'status_change',
        description: `Card payment link sent — ${type === 'deposit' ? 'Deposit' : 'Payment'} £${formatAmount(amount)} via Stripe`,
        amount, created_at: n,
      }, 'insert');
      capture('stripe_payment_link_sent', { type, amount });
      setSheet(null);
      const businessName = profile?.business_name || profile?.full_name || 'Your business';
      const firstName = (customer?.name || 'there').split(' ')[0];
      const label = type === 'deposit' ? 'deposit' : 'balance';
      setSendSheetConfig({
        title: `Send payment link to ${customer?.name || 'customer'}?`,
        messageText: `Hi ${firstName}, please pay your £${formatAmount(amount)} ${label} here: ${result.url} — ${businessName}`,
        onSend: () => { setSendSheetConfig(null); refresh(); },
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Could not create payment link';
      showToast(msg, 'error', 4000);
    } finally {
      setStripeLoading(false);
      refresh();
    }
  };

  const handleWriteOff = async () => {
    if (!job) return;
    const n = now();
    const logId = crypto.randomUUID();
    await db.jobs.update(job.id, {
      status: 'written_off',
      updated_at: n,
      _sync_status: 'pending',
    });
    await db.work_log.add({
      id: logId,
      job_id: job.id,
      type: 'status_change',
      description: 'Job written off',
      created_at: n,
      _sync_status: 'pending',
    });
    await addToSyncQueue('jobs', job.id, { status: 'written_off', updated_at: n }, 'update');
    await addToSyncQueue('work_log', logId, { id: logId, job_id: job.id, type: 'status_change', description: 'Job written off', created_at: n }, 'insert');
    hapticSuccess();
    showToast('Job written off', 'success', 2000);
    setSheet(null);
    refresh();
  };

  const handleConfirmWithConflicts = async () => {
    setConflicts([]);
    // Re-run the booking without conflict check
    if (!job || !customer) return;
    const n = now();
    await db.jobs.update(job.id, { status: 'booked', updated_at: n, _sync_status: 'pending' });
    markQuoteResponded(job.id).catch(() => {});
    const logId = crypto.randomUUID();
    await db.work_log.add({ id: logId, job_id: job.id, type: 'status_change', description: 'Quote accepted — marked as booked', created_at: n, _sync_status: 'pending' });
    await addToSyncQueue('jobs', job.id, { status: 'booked', updated_at: n }, 'update');
    await addToSyncQueue('work_log', logId, { id: logId, job_id: job.id, type: 'status_change', description: 'Quote accepted — marked as booked', created_at: n }, 'insert');
    hapticSuccess();
    showToast('Job booked', 'success');
    captureJobBooked();
    refresh();
  };

  const handleMarkAsBooked = async () => {
    if (!job || !customer) return;

    // P2-05: Check for scheduling conflicts before booking
    if (job.scheduled_start && userId && can('scheduling_conflicts')) {
      const detected = await detectConflicts(
        userId,
        job.scheduled_start,
        job.scheduled_end || job.scheduled_start,
        job.id,
      );
      if (detected.length > 0) {
        setConflicts(detected);
        return; // Don't proceed — show conflict warning
      }
    }

    const n = now();
    await db.jobs.update(job.id, {
      status: 'booked',
      updated_at: n,
      _sync_status: 'pending',
    });
    const logId = crypto.randomUUID();
    await db.work_log.add({
      id: logId,
      job_id: job.id,
      type: 'status_change',
      description: 'Quote accepted — marked as booked',
      created_at: n,
      _sync_status: 'pending',
    });
    await addToSyncQueue('jobs', job.id, { status: 'booked', updated_at: n }, 'update');
    await addToSyncQueue('work_log', logId, { id: logId, job_id: job.id, type: 'status_change', description: 'Quote accepted — marked as booked', created_at: n }, 'insert');
    hapticSuccess();
    showToast('Job booked', 'success');
    captureJobBooked();
    refresh();

    // Generate booking confirmation message
    const customerFirstName = customer.name.split(' ')[0] || 'there';
    const dateStr = job.scheduled_start
      ? new Date(job.scheduled_start).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })
      : 'a date to be confirmed';
    const timeStr = job.scheduled_start
      ? new Date(job.scheduled_start).toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit', hour12: true }).toLowerCase().replace(':00', '')
      : '';
    const business = profile?.business_name || 'Your tradesperson';
    const msg = timeStr
      ? `Hi ${customerFirstName}, your booking for ${job.title} is confirmed for ${dateStr} at ${timeStr}. See you then! — ${business}`
      : `Hi ${customerFirstName}, your booking for ${job.title} is confirmed for ${dateStr}. See you then! — ${business}`;
    setBookingMessage(msg);
    const tplMsg = await getFilledTemplateMessage(userId!, 'booking', job, customer, profile!, total, msg);
    setSendSheetConfig({
      title: `Send confirmation to ${customer?.name?.split(' ')[0] || 'customer'}?`,
      messageText: tplMsg,
      onSend: (method, pdfShared) => handleSendBookingConfirmation(method, pdfShared),
    });
  };

  const doStartJob = async () => {
    if (!job) return;
    const n = now();
    await db.jobs.update(job.id, {
      status: 'in_progress',
      actual_start: n,
      updated_at: n,
      _sync_status: 'pending',
    });
    const logId = crypto.randomUUID();
    await db.work_log.add({
      id: logId,
      job_id: job.id,
      type: 'status_change',
      description: 'Job started',
      created_at: n,
      _sync_status: 'pending',
    });
    await addToSyncQueue('jobs', job.id, { status: 'in_progress', actual_start: n, updated_at: n }, 'update');
    await addToSyncQueue('work_log', logId, { id: logId, job_id: job.id, type: 'status_change', description: 'Job started', created_at: n }, 'insert');
    hapticSuccess();
    showToast('Job started', 'success');
    captureJobStarted();
    navigate('/', { replace: true });
  };

  const handleStartJob = async () => {
    if (!job) return;

    // Anti-forgetting: check for other in-progress non-multi-day jobs
    if (userId) {
      const inProgressJobs = await db.jobs
        .where('status')
        .equals('in_progress')
        .filter((j) => j.user_id === userId && j.id !== job.id && !j.is_multi_day)
        .toArray();

      if (inProgressJobs.length > 0) {
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
          newJobId: job.id,
        });
        setSheet('finish_previous');
        return;
      }
    }

    // £0.00 warning: job has no priced items yet
    if (total === 0 && !job.is_sample) {
      setSheet('zero_value_warning');
      capture('zero_value_job_warning_shown', { source: 'job_detail' });
      return;
    }

    doStartJob();
  };

  const handleReschedule = async () => {
    if (!job || !rescheduleDate) return;
    const n = now();
    await db.jobs.update(job.id, {
      status: 'booked',
      scheduled_start: rescheduleDate,
      actual_end: undefined,
      updated_at: n,
      _sync_status: 'pending',
    });
    const logId = crypto.randomUUID();
    await db.work_log.add({
      id: logId,
      job_id: job.id,
      type: 'note',
      description: `Rescheduled to ${formatShortDate(new Date(rescheduleDate))} · ${formatTime(new Date(rescheduleDate))}`,
      created_at: n,
      _sync_status: 'pending',
    });
    await addToSyncQueue('jobs', job.id, { status: 'booked', scheduled_start: rescheduleDate, updated_at: n }, 'update');
    await addToSyncQueue('work_log', logId, { id: logId, job_id: job.id, type: 'note', description: `Rescheduled to ${formatShortDate(new Date(rescheduleDate))} · ${formatTime(new Date(rescheduleDate))}`, created_at: n }, 'insert');
    setRescheduleDate('');
    setSheet(null);
    refresh();
  };

  const handleChangeStatus = async (newStatus: 'booked' | 'in_progress' | 'awaiting_payment') => {
    if (!job || !userId) return;
    const n = now();
    const prevStatus = job.status;
    const update: Record<string, unknown> = { status: newStatus, updated_at: n };
    if (newStatus === 'awaiting_payment') {
      update.actual_end = n;
    }
    await db.jobs.update(job.id, {
      status: newStatus,
      ...(newStatus === 'awaiting_payment' ? { actual_end: n, invoice_sent_at: n } : {}),
      updated_at: n,
      _sync_status: 'pending',
    });
    const logId = crypto.randomUUID();
    await db.work_log.add({
      id: logId,
      job_id: job.id,
      type: 'status_change',
      description: `Status changed from ${prevStatus} to ${newStatus}`,
      created_at: n,
      _sync_status: 'pending',
    });
    await addToSyncQueue('jobs', job.id, update, 'update');
    await addToSyncQueue('work_log', logId, { id: logId, job_id: job.id, type: 'status_change', description: `Status changed from ${prevStatus} to ${newStatus}`, created_at: n }, 'insert');
    if (newStatus === 'awaiting_payment') {
      await ensureInvoiceNumber(job, userId);
      createPaymentChases(job.id, userId!, n).catch(() => {});
    }
    if (newStatus === 'in_progress' && prevStatus === 'awaiting_payment') {
      pauseChasesOnStatusChange(job.id).catch(() => {});
    }
    setSheet(null);
    refresh();
  };

  const handleChangePaymentMethod = async (newMethod: 'cash' | 'bank_transfer' | 'terminal' | 'other') => {
    if (!job || payments.length === 0) return;
    const n = now();
    const lastPayment = payments[payments.length - 1];
    
    // Update the last payment record
    await db.payments.update(lastPayment.id, {
      method: newMethod,
      updated_at: n,
      _sync_status: 'pending',
    });
    
    // Log the change
    const logId = crypto.randomUUID();
    await db.work_log.add({
      id: logId,
      job_id: job.id,
      type: 'status_change',
      description: `Payment method updated: ${lastPayment.method} → ${newMethod}`,
      created_at: n,
      _sync_status: 'pending',
    });
    
    await addToSyncQueue('payments', lastPayment.id, { method: newMethod, updated_at: n }, 'update');
    await addToSyncQueue('work_log', logId, { id: logId, job_id: job.id, type: 'status_change', description: `Payment method updated: ${lastPayment.method} → ${newMethod}`, created_at: n }, 'insert');
    
    showToast('Payment method updated', 'success', 2000);
    setSheet(null);
    refresh();
  };

  const handleEditDetails = async () => {
    if (!job) return;
    const n = now();
    const combinedStart = combineDateTime(editDate, editStartTime);
    const combinedEnd = editEndTime ? combineDateTime(editDate, editEndTime) : undefined;
    const changes: string[] = [];
    if (editTitle.trim() && editTitle.trim() !== job.title) changes.push('title');
    if (combinedStart !== job.scheduled_start) changes.push('date/time');
    if (editNotes.trim() !== (job.notes || '')) changes.push('notes');
    if (editAddress.trim() !== (customer?.address || '')) changes.push('address');

    await db.jobs.update(job.id, {
      title: editTitle.trim() || job.title,
      scheduled_start: combinedStart,
      scheduled_end: combinedEnd,
      notes: editNotes.trim() || undefined,
      updated_at: n,
      _sync_status: 'pending',
    });
    await addToSyncQueue('jobs', job.id, {
      title: editTitle.trim() || job.title,
      scheduled_start: combinedStart,
      scheduled_end: combinedEnd,
      notes: editNotes.trim() || undefined,
      updated_at: n,
    }, 'update');

    if (customer && editAddress.trim() !== (customer.address || '')) {
      await db.customers.update(customer.id, {
        address: editAddress.trim() || undefined,
        updated_at: n,
        _sync_status: 'pending',
      });
      await addToSyncQueue('customers', customer.id, {
        address: editAddress.trim() || undefined,
        updated_at: n,
      }, 'update');
    }

    if (changes.length > 0) {
      const logId = crypto.randomUUID();
      await db.work_log.add({
        id: logId,
        job_id: job.id,
        type: 'status_change',
        description: `Job details updated (${changes.join(', ')})`,
        created_at: n,
        _sync_status: 'pending',
      });
      await addToSyncQueue('work_log', logId, { id: logId, job_id: job.id, type: 'status_change', description: `Job details updated (${changes.join(', ')})`, created_at: n }, 'insert');
      // Generate update message for customer
      const customerFirstName = customer?.name.split(' ')[0] || 'there';
      const business = profile?.business_name || 'Your tradesperson';
      const changeText = changes.includes('date/time') && combinedStart
        ? `Your job is now scheduled for ${formatShortDate(new Date(combinedStart))} · ${formatTime(new Date(combinedStart))}.`
        : 'There are some updates to your job details.';
      const msg = `Hi ${customerFirstName}, ${changeText} ${job.title}. — ${business}`;
      setUpdateMessage(msg);
      const tplMsg = await getFilledTemplateMessage(userId!, 'update', job, customer!, profile!, total, msg);
      setSendSheetConfig({
        title: `Send update to ${customer?.name || 'customer'}?`,
        messageText: tplMsg,
        onSend: (method, pdfShared) => handleSendUpdate(method, pdfShared),
      });
    } else {
      setSheet(null);
    }
    refresh();
  };

  const openEditDetails = () => {
    setSheet('edit_details');
    setEditTitle(job?.title || '');
    setEditDate(toDateValue(job?.scheduled_start));
    setEditStartTime(toTimeValue(job?.scheduled_start));
    setEditEndTime(toTimeValue(job?.scheduled_end));
    setEditNotes(job?.notes || '');
    setEditAddress(customer?.address || '');
  };

  const handleSendUpdate = async (method: SendMethod, _pdfShared: boolean) => {
    if (!customer || !updateMessage) return;

    const n = now();
    const logId = crypto.randomUUID();
    await db.work_log.add({
      id: logId,
      job_id: jobId!,
      type: 'customer_notified',
      description: `[Update sent via ${method === 'whatsapp' || method === 'whatsapp_pdf' ? 'WhatsApp' : 'SMS'}] ${updateMessage}`,
      created_at: n,
      _sync_status: 'pending',
    });
    await addToSyncQueue('work_log', logId, {
      id: logId,
      job_id: jobId!,
      type: 'customer_notified',
      description: `[Update sent via ${method === 'whatsapp' || method === 'whatsapp_pdf' ? 'WhatsApp' : 'SMS'}] ${updateMessage}`,
      created_at: n,
    }, 'insert');

    setSheet(null);
    setUpdateMessage('');
  };

  const handleSendBookingConfirmation = async (method: SendMethod, _pdfShared: boolean) => {
    if (!customer || !bookingMessage) return;

    const n = now();
    const logId = crypto.randomUUID();
    await db.work_log.add({
      id: logId,
      job_id: jobId!,
      type: 'note',
      description: `[Booking confirmation sent via ${method === 'whatsapp' || method === 'whatsapp_pdf' ? 'WhatsApp' : 'SMS'}] ${bookingMessage}`,
      created_at: n,
      _sync_status: 'pending',
    });
    await addToSyncQueue('work_log', logId, {
      id: logId,
      job_id: jobId!,
      type: 'note',
      description: `[Booking confirmation sent via ${method === 'whatsapp' || method === 'whatsapp_pdf' ? 'WhatsApp' : 'SMS'}] ${bookingMessage}`,
      created_at: n,
    }, 'insert');

    setSheet(null);
  };

  const handleSendReceipt = async (method: SendMethod, _pdfShared: boolean) => {
    if (!job || !customer) return;
    const business = profile?.business_name || 'Your tradesperson';
    const msg = `Hi ${customer.name}, payment of £${total.toFixed(2)} for ${job.title} has been confirmed. Thanks for your business! — ${business}`;

    const n = now();
    const logId = crypto.randomUUID();
    await db.work_log.add({
      id: logId,
      job_id: jobId!,
      type: 'customer_notified',
      description: `[Receipt sent via ${method === 'whatsapp' || method === 'whatsapp_pdf' ? 'WhatsApp' : 'SMS'}] ${msg}`,
      created_at: n,
      _sync_status: 'pending',
    });
    await addToSyncQueue('work_log', logId, {
      id: logId,
      job_id: jobId!,
      type: 'customer_notified',
      description: `[Receipt sent via ${method === 'whatsapp' || method === 'whatsapp_pdf' ? 'WhatsApp' : 'SMS'}] ${msg}`,
      created_at: n,
    }, 'insert');

    setSheet(null);
  };

  const handleCalloutCharge = async () => {
    if (!job || !customer || !userId) return;
    const amount = parseFloat(calloutAmount);
    if (isNaN(amount) || amount <= 0) return;
    const n = now();
    const newJobId = crypto.randomUUID();
    const jobNumber = await nextJobNumber(job.user_id);
    const invoiceNumber = await nextInvoiceNumber(userId);
    await db.jobs.add({
      id: newJobId,
      user_id: job.user_id,
      customer_id: job.customer_id,
      title: 'Callout charge',
      job_number: jobNumber,
      status: 'awaiting_payment',
      payment_terms: 'invoice',
      invoice_number: invoiceNumber,
      invoice_sent_at: n,
      is_multi_day: false,
      created_at: n,
      updated_at: n,
      _sync_status: 'pending',
    });
    const liId = crypto.randomUUID();
    await db.line_items.add({
      id: liId,
      job_id: newJobId,
      description: calloutDesc.trim() || 'Callout charge',
      amount,
      sort_order: 0,
      added_on_site: false,
      created_at: n,
      _sync_status: 'pending',
    });
    const logId = crypto.randomUUID();
    await db.work_log.add({
      id: logId,
      job_id: newJobId,
      type: 'status_change',
      description: 'Callout charge invoice created',
      created_at: n,
      _sync_status: 'pending',
    });
    await addToSyncQueue('jobs', newJobId, { id: newJobId, user_id: job.user_id, customer_id: job.customer_id, title: 'Callout charge', job_number: jobNumber, invoice_number: invoiceNumber, invoice_sent_at: n, status: 'awaiting_payment', payment_terms: 'invoice', is_multi_day: false, created_at: n, updated_at: n }, 'insert');
    await addToSyncQueue('line_items', liId, { id: liId, job_id: newJobId, description: calloutDesc.trim() || 'Callout charge', amount, sort_order: 0, created_at: n }, 'insert');
    await addToSyncQueue('work_log', logId, { id: logId, job_id: newJobId, type: 'status_change', description: 'Callout charge invoice created', created_at: n }, 'insert');
    setCalloutDesc('Callout charge');
    setCalloutAmount(profile?.callout_charge ? String(profile.callout_charge) : '75');
    setSheet(null);
    navigate(`/jobs/${newJobId}`);
  };

  const handleSendReminder = async (method: SendMethod, pdfShared: boolean) => {
    if (!job || !customer) return;
    const n = now();
    const defaultText = `Hi ${customer.name}, just a reminder about the invoice for ${job.title}. Amount due: £${total.toFixed(2)}. Thanks, ${profile?.full_name?.split(' ')[0] || 'Dave'}`;
    const body = reminderText || defaultText;
    const methodLabel = method === 'whatsapp' || method === 'whatsapp_pdf' ? 'WhatsApp' : 'SMS';

    const logId = crypto.randomUUID();
    await db.work_log.add({
      id: logId,
      job_id: job.id,
      type: 'status_change',
      description: `[Reminder sent via ${methodLabel}${pdfShared ? ' (PDF attached)' : ''}] ${body}`,
      created_at: n,
      _sync_status: 'pending',
    });
    // Don't overwrite invoice_sent_at — the escalation clock starts from actual_end
    // Instead, mark the current due stage as sent
    markStageSentByJob(job.id, 'gentle', method === 'whatsapp' || method === 'whatsapp_pdf' ? 'whatsapp' : 'sms').catch(() => {});
    await addToSyncQueue('work_log', logId, { id: logId, job_id: job.id, type: 'status_change', description: `[Reminder sent via ${method === 'whatsapp' ? 'WhatsApp' : 'SMS'}] ${body}`, created_at: n }, 'insert');
    capturePaymentChase(method === 'whatsapp' || method === 'whatsapp_pdf' ? 'whatsapp' : 'sms');
    setSheet(null);
    refresh();
  };

  const handleCall = () => {
    if (customer?.phone) window.open(`tel:${customer.phone}`, '_self');
  };

  const handleMessage = () => {
    if (!customer?.phone) return;
    const body = encodeURIComponent(`Hi ${customer.name}, it's ${profile?.full_name?.split(' ')[0] || 'Dave'}.`);
    window.location.href = `sms:${customer.phone}?body=${body}`;
  };

  /* ─── render helpers ─── */

  const renderPaidFooter = () => (
    <div className="sticky bottom-0 z-40 bg-[var(--app-shell-bg)] border-t border-brand-borderLight px-4 py-2 pb-[calc(4px_+_env(safe-area-inset-bottom))]">
      <div className="flex flex-col gap-2">
        <Button variant="primary" disabled={!!job?.is_sample} onClick={async () => {
          if (!job || !customer || !userId) return;
          const business = profile?.business_name || 'Your tradesperson';
          const fallback = `Hi ${customer.name}, payment of £${total.toFixed(2)} for ${job.title} has been confirmed. Thanks for your business! — ${business}`;
          const receiptMsg = await getFilledTemplateMessage(userId, 'receipt', job, customer, profile!, total, fallback);
          setSendSheetConfig({
            title: `Send receipt to ${customer.name}?`,
            messageText: receiptMsg,
            onSend: (method, pdfShared) => handleSendReceipt(method, pdfShared),
          });
        }}>
          Send receipt
        </Button>
        <Button variant="secondary" onClick={() => navigate(-1)}>
          Close
        </Button>
        {!job?.is_sample && (
          <Button variant="secondary" onClick={() => navigate('/quote', { state: { customerId: job?.customer_id, sourceJobId: job?.id, entryPoint: 'requote' } })}>
            Create similar quote
          </Button>
        )}
      </div>
    </div>
  );

  const renderTerminalFooter = () => (
    <div className="sticky bottom-0 z-40 bg-[var(--app-shell-bg)] border-t border-brand-borderLight px-4 py-2 pb-[calc(4px_+_env(safe-area-inset-bottom))]">
      <div className="flex flex-col gap-2">
        <Button variant="primary" onClick={() => navigate('/', { replace: true })}>
          Go Home
        </Button>
        {!job?.is_sample && (
          <Button variant="secondary" onClick={() => navigate('/quote', { state: { customerId: job?.customer_id, sourceJobId: job?.id, entryPoint: 'requote' } })}>
            Create similar quote
          </Button>
        )}
      </div>
    </div>
  );

  const renderHeader = () => (
    <div className="sticky top-0 z-40 px-4 py-2 bg-[var(--app-shell-bg)] border-b border-brand-borderLight shrink-0">
      {/* Back + options row */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => navigate(-1)}
          className="inline-flex items-center gap-1 min-h-11 pr-4 text-sm font-medium text-brand-mid cursor-pointer"
        >
          <ChevronLeft size={24} className="-mt-px text-brand-muted" />
          Back
        </button>
        <div className="flex items-center gap-2">
          {(job?.status === 'quoted' || job?.status === 'booked' || job?.status === 'no_show' || job?.status === 'in_progress' || job?.status === 'awaiting_payment') && (
            <button
              onClick={() => setSheet('more_options')}
              className="w-8 h-8 flex items-center justify-center rounded-lg cursor-pointer text-brand-muted hover:text-brand-dark hover:bg-brand-surface transition-colors"
              aria-label="More"
            >
              <MoreVertical size={18} />
            </button>
          )}
        </div>
      </div>
      {/* Name + contact actions row */}
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-title font-bold text-brand-black truncate leading-tight">{customer?.name}</h1>
            {job && job.status !== 'quoted' && <StatusBadge status={job.status} />}
          </div>
          <div className="flex items-center gap-2"><p className="text-sm font-medium text-brand-mid truncate">{job?.title}</p>{job?.is_sample && <span className="text-xs font-bold text-brand-mid bg-brand-surface px-2 py-0.5 rounded-full shrink-0">Sample</span>}</div>
          <p className="text-xs font-medium text-brand-muted mt-0.5">{job?.job_number}</p>
        </div>
        {hasContactButtons && (
          <div className="flex gap-1.5 shrink-0">
            <button
              onClick={handleCall}
              className="w-9 h-9 border border-brand-border rounded-lg bg-brand-surface flex items-center justify-center cursor-pointer active:bg-brand-borderLight"
              aria-label="Call customer"
            >
              <Phone size={16} className="text-brand-dark" />
            </button>
            <button
              onClick={handleMessage}
              className="w-9 h-9 border border-brand-border rounded-lg bg-brand-surface flex items-center justify-center cursor-pointer active:bg-brand-borderLight"
              aria-label="Message customer"
            >
              <MessageCircle size={16} className="text-brand-dark" />
            </button>
          </div>
        )}
      </div>
    </div>
  );


  const confirmedAt = useMemo(() => {
    if (!workLog.length) return null;
    const entry = workLog.find(
      (log) => log.type === 'status_change' && log.description.includes('Quote accepted')
    );
    return entry ? entry.created_at : null;
  }, [workLog]);

  const renderPhotosAndMaterials = (editable: boolean = true) => {
    const materialsTotal = materialItems.reduce((sum, m) => sum + (m.total_price || 0), 0);

    return (
      <>
        <div className="mb-5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-micro font-bold text-brand-mid tracking-[0.7px]">Photos</span>
          </div>
          <PhotoGallery
            jobId={jobId!}
            userId={userId!}
            photos={photos}
            onPhotosChange={refresh}
            onCapture={capturePhotoAdded}
            editable={editable}
          />
        </div>

        {/* Simple materials cost — Dave's own cost tracking, not part of invoice */}
        <div className="mb-5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-micro font-bold text-brand-mid tracking-[0.7px]">Materials cost</span>
            <span className="text-sm font-bold text-brand-black">£{materialsTotal.toFixed(2)}</span>
          </div>
          {editable ? (
            <>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-base text-brand-muted">£</span>
                <input
                  type="text"
                  inputMode="decimal"
                  defaultValue={materialsTotal > 0 ? materialsTotal.toFixed(2) : ''}
                  placeholder="Total spent at merchant"
                  className="w-full h-11 pl-7 pr-3 border border-brand-border rounded-lg text-base text-brand-black placeholder:text-brand-muted placeholder:italic outline-none focus:border-brand-black"
                  onBlur={(e) => handleSaveMaterialsCost(e.target.value)}
                />
              </div>
              <p className="text-label text-brand-dark mt-1.5 italic">For your reference only — not included in the customer invoice.</p>
            </>
          ) : materialsTotal > 0 ? (
            <p className="text-sm text-brand-muted">Recorded for your reference</p>
          ) : null}
        </div>
      </>
    );
  };

  const renderEnquiryBody = () => {
    if (!job || !customer) return null;
    const missedCallLog = eventLogs.find((log) => log.description.includes('Missed call logged'));
    const isDraft = lineItems.length > 0 && job.title !== 'Missed call';
    const total = jobTotal(lineItems);

    return (
      <div className="flex-1 px-4 md:px-6 pt-4 md:pt-6 pb-[calc(120px + env(safe-area-inset-bottom))]">
        {/* What we know */}
        <div className="border border-brand-border rounded-lg p-4 mb-5">
          <div className="text-micro font-bold tracking-[0.5px] text-brand-mid mb-3">
            What we know
          </div>
          <div className="flex items-center gap-2 mb-2">
            <Phone size={14} className="text-brand-muted" />
            <span className="text-sm text-brand-dark font-medium">{customer.phone || 'No phone'}</span>
          </div>
          <div className="flex items-center gap-2">
            <Clock size={14} className="text-brand-muted" />
            <span className="text-sm text-brand-dark">
              {missedCallLog ? formatLogTime(missedCallLog.created_at) : 'Just now'}
            </span>
          </div>
        </div>

        {/* Draft quote: show line items */}
        {isDraft && (
          <div className="border border-brand-border rounded-lg p-4 mb-5">
            <div className="text-micro font-bold tracking-[0.5px] text-brand-mid mb-3">
              Draft quote
            </div>
            <div className="space-y-2">
              {lineItems.map((item) => (
                <div key={item.id} className="flex justify-between items-center py-1 border-b border-brand-borderLight last:border-b-0">
                  <span className="text-sm text-brand-dark flex-1 pr-2">{item.description}</span>
                  <span className="text-sm font-bold text-brand-black">£{item.amount.toFixed(2)}</span>
                </div>
              ))}
            </div>
            <div className="flex justify-between items-center mt-3 pt-2 border-t border-brand-border">
              <span className="text-sm font-bold text-brand-black">Total</span>
              <span className="text-lg font-extrabold text-brand-black">£{total.toFixed(2)}</span>
            </div>
            <div className="mt-3 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg">
              <p className="text-sm text-amber-800">
                <span className="font-bold">Not sent yet.</span> Tap "Continue quote" below to finish and send.
              </p>
            </div>
          </div>
        )}

        {/* Next steps */}
        {!isDraft && (
          <div className="border border-brand-border rounded-lg p-4 mb-5">
            <div className="text-micro font-bold tracking-[0.5px] text-brand-mid mb-3">
              Next steps
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm text-brand-dark">
                <span className="w-5 h-5 rounded-full bg-brand-surface flex items-center justify-center text-xs font-bold text-brand-muted shrink-0">1</span>
                Set a job title and time
              </div>
              <div className="flex items-center gap-2 text-sm text-brand-dark">
                <span className="w-5 h-5 rounded-full bg-brand-surface flex items-center justify-center text-xs font-bold text-brand-muted shrink-0">2</span>
                Add line items to the quote
              </div>
              <div className="flex items-center gap-2 text-sm text-brand-dark">
                <span className="w-5 h-5 rounded-full bg-brand-surface flex items-center justify-center text-xs font-bold text-brand-muted shrink-0">3</span>
                Send the quote to the customer
              </div>
            </div>
          </div>
        )}

        {renderPhotosAndMaterials(true)}

        {/* Work log */}
        <div className="mb-5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-micro font-bold text-brand-mid tracking-[0.7px]">Work log</span>
          </div>
          {eventLogs.length === 0 ? (
            <p className="text-sm text-brand-muted italic py-2">No work logged</p>
          ) : (
            <div>
              {eventLogs.map((log) => (
                <div key={log.id} className="flex gap-2.5 py-2 border-b border-brand-borderLight last:border-b-0 items-start">
                  <span className="text-label text-brand-dark whitespace-nowrap shrink-0 pt-0.5 min-w-[46px]">
                    {formatLogTime(log.created_at)}
                  </span>
                  <span className="text-sm text-brand-dark flex-1 leading-relaxed">
                    {log.description}
                  </span>
                  {log.amount !== undefined && log.amount > 0 && (
                    <span className={`text-sm font-bold shrink-0 whitespace-nowrap ${log.type === 'expense' ? 'text-status-red' : 'text-status-green'}`}>
                      {log.type === 'expense' ? '-' : '+'}£{log.amount.toFixed(2)}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderEnquiryFooter = () => {
    const isDraft = job && lineItems.length > 0 && job.title !== 'Missed call';
    const isMissedCall = job?.title === 'Missed call';

    return (
      <div className="sticky bottom-0 z-40 bg-[var(--app-shell-bg)] border-t border-brand-borderLight px-4 py-2 pb-[calc(4px_+_env(safe-area-inset-bottom))]">
        {isDraft ? (
          <>
            <Button
              variant="primary"
              onClick={() => navigate('/quote', { state: { jobId: job?.id, customerId: job?.customer_id, entryPoint: 'task' } })}
            >
              Continue quote →
            </Button>
            <div className="flex gap-2 mt-2">
              <button
                onClick={() => {
                  if (customer?.phone) window.open(`tel:${customer.phone}`, '_self');
                }}
                className="flex-1 h-11 flex items-center justify-center gap-1.5 rounded-xl bg-white border border-brand-border text-sm font-semibold text-brand-black cursor-pointer"
              >
                <Phone size={14} className="text-brand-mid" />
                Call
              </button>
              <button
                onClick={() => setSheet('cancel')}
                className="flex-1 h-11 flex items-center justify-center rounded-xl border border-red-200 text-sm font-semibold text-status-error cursor-pointer"
              >
                Delete
              </button>
            </div>
          </>
        ) : (
          <>
            <Button
              variant="primary"
              onClick={() => navigate('/quote', { state: { jobId: job?.id, customerId: job?.customer_id, entryPoint: 'task' } })}
            >
              {isMissedCall ? 'Create quote' : 'Create quote'}
            </Button>
            <div className="flex gap-2 mt-2">
              <button
                onClick={() => {
                  if (customer?.phone) window.open(`tel:${customer.phone}`, '_self');
                }}
                className="flex-1 h-11 flex items-center justify-center gap-1.5 rounded-xl bg-white border border-brand-border text-sm font-semibold text-brand-black cursor-pointer"
              >
                <Phone size={14} className="text-brand-mid" />
                {isMissedCall ? 'Call back' : 'Call'}
              </button>
              <button
                onClick={() => navigate('/', { replace: true })}
                className="flex-1 h-11 flex items-center justify-center rounded-xl border border-brand-border text-sm font-semibold text-brand-muted cursor-pointer"
              >
                Go Home
              </button>
            </div>
          </>
        )}
      </div>
    );
  };

  const renderBookedBody = () => {
    if (!job || !customer) return null;
    return (
      <div className="flex-1 px-4 md:px-6 pt-4 md:pt-6 pb-[calc(120px + env(safe-area-inset-bottom))]">
        {/* Location card — leads */}
        {customer.address ? (
          <div className="mb-5">
            <div className="text-micro font-bold text-brand-mid tracking-[0.7px] mb-2.5">Location</div>
            <div className="border border-brand-border rounded-xl overflow-hidden bg-white">
              <div className="relative">
                <MapPreview address={customer.address} />
              </div>
              <div className="flex items-center justify-between px-4 py-3 border-t border-brand-borderLight">
                <div className="flex items-center gap-2 min-w-0">
                  <MapPin size={16} className="text-brand-muted shrink-0" />
                  <span className="text-sm text-brand-dark font-medium truncate">{customer.address}</span>
                </div>
                <button
                  onClick={() =>
                    window.open(`https://maps.google.com/maps?daddr=${encodeURIComponent(customer.address || '')}`, '_blank')
                  }
                  className="flex items-center gap-1 text-sm font-semibold text-brand-black shrink-0 ml-2"
                >
                  <Navigation size={14} />
                  Navigate
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="mb-5">
            <div className="text-micro font-bold text-brand-mid tracking-[0.7px] mb-2.5">Location</div>
            <div className="border border-brand-border rounded-xl px-4 py-6 bg-white flex flex-col items-center justify-center text-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-brand-surface flex items-center justify-center">
                <MapPin size={18} className="text-brand-muted" />
              </div>
              <p className="text-sm text-brand-muted">No address set</p>
              <button
                onClick={openEditDetails}
                className="text-sm font-semibold text-brand-black underline underline-offset-2"
              >
                Add address
              </button>
            </div>
          </div>
        )}

        {/* Schedule card */}
        <div className="mb-5">
          <div className="text-micro font-bold text-brand-mid tracking-[0.7px] mb-2.5">Schedule</div>
          <div className="border border-brand-border rounded-xl overflow-hidden bg-white divide-y divide-brand-borderLight">
            <div className="flex justify-between items-center px-4 py-3">
              <span className="text-sm text-brand-muted">Date</span>
              <span className="text-sm font-medium text-brand-black text-right">
                {job.scheduled_start ? formatShortDate(new Date(job.scheduled_start)) : 'Not set'}
              </span>
            </div>
            <div className="flex justify-between items-center px-4 py-3">
              <span className="text-sm text-brand-muted">Arrival window</span>
              <span className="text-sm font-medium text-brand-black text-right">
                {job.scheduled_start ? formatTime(new Date(job.scheduled_start)) : '—'}
                {job.scheduled_end ? ` – ${formatTime(new Date(job.scheduled_end))}` : ''}
              </span>
            </div>
            {confirmedAt && (
              <div className="flex justify-between items-center px-4 py-3">
                <span className="text-sm text-brand-muted">Status</span>
                <div className="flex items-center gap-1.5">
                  <Check size={16} className="text-brand-black shrink-0" />
                  <span className="text-sm font-medium text-brand-black">Confirmed</span>
                  <span className="text-sm text-brand-black ml-1">{formatShortDate(new Date(confirmedAt))}</span>
                </div>
              </div>
            )}
            {job.payment_terms === 'deposit' && job.deposit_pct && (
              <div className="flex justify-between items-center px-4 py-3">
                <span className="text-sm text-brand-muted">Deposit</span>
                <span className="text-sm font-medium text-brand-black text-right">
                  {job.deposit_pct}% (£{((job.deposit_pct / 100) * total).toFixed(2)})
                </span>
              </div>
            )}
            {job.deposit_status === 'requested' && job.deposit_stripe_url && (
              <div className="flex items-center gap-2 px-4 py-3 bg-status-amberBg border-y border-amber-200">
                <CreditCard size={16} className="text-status-amber shrink-0" />
                <span className="text-sm text-status-amber flex-1">Deposit link sent — waiting for payment</span>
                <button
                  onClick={() => setSheet('request_payment')}
                  className="text-xs font-semibold text-status-amber underline cursor-pointer shrink-0"
                >
                  Resend
                </button>
              </div>
            )}
            <div className="flex justify-between items-center px-4 py-3">
              <span className="text-sm text-brand-muted">Payment terms</span>
              <span className="text-sm font-medium text-brand-black text-right">
                {paymentTermsLabel(job.payment_terms)}
              </span>
            </div>
          </div>
          {/* Add to calendar — only when date is set */}
          {job.scheduled_start && (
            <button
              onClick={() => {
                addToCalendar({
                  jobId: job.id,
                  title: job.title,
                  scheduled_start: job.scheduled_start,
                  scheduled_end: job.scheduled_end,
                  customerName: customer.name,
                  customerPhone: customer.phone,
                  address: customer.address,
                  notes: job.notes,
                });
                showToast('Calendar event ready to add', 'info', 3000);
              }}
              className="w-full h-11 mt-2 flex items-center justify-center gap-2 text-sm font-medium text-brand-black border border-brand-border rounded-xl bg-white active:bg-brand-surface transition-colors cursor-pointer"
            >
              <CalendarPlus size={16} className="text-brand-mid" />
              Add to calendar
            </button>
          )}
        </div>

        {/* Invoice items */}
        <div className="flex items-center justify-between mb-2.5">
          <span className="text-micro font-bold text-brand-mid tracking-[0.7px]">Quote items</span>
        </div>
        <div className="border border-brand-border rounded-lg overflow-hidden mb-5">
          {lineItems.map((item) => (
            <InvoiceItemRow
              key={item.id}
              item={item}
              showRemove={false}
            />
          ))}
          <InvoiceTotalRow total={total} />
        </div>

        {renderPhotosAndMaterials(true)}

        {/* Secondary action */}
        <button
          onClick={() => setSheet('confirm_not_home')}
          className="w-full text-center text-sm text-brand-muted py-2 mb-2 underline underline-offset-2 cursor-pointer"
        >
          Customer not home?
        </button>
      </div>
    );
  };

  const renderInProgressBody = () => {
    if (!job || !customer) return null;
    return (
      <div className="flex-1 px-4 md:px-6 pt-4 md:pt-6 pb-[calc(120px + env(safe-area-inset-bottom))]">
        {/* Running state */}
        <div className="mb-5">
          <div className="text-micro font-bold text-brand-mid tracking-[0.7px] mb-2.5">Running</div>
          <div className="border border-brand-border rounded-xl overflow-hidden bg-white divide-y divide-brand-borderLight">
            <div className="flex justify-between items-center px-4 py-3">
              <span className="text-sm text-brand-muted">Started</span>
              <span className="text-sm font-medium text-brand-black text-right">
                {job.actual_start
                  ? formatTime(new Date(job.actual_start))
                  : '—'}
              </span>
            </div>
            <div className="flex items-center justify-between px-4 py-3 bg-status-blueBg">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                <span className="text-sm font-medium text-status-blue">In progress</span>
              </div>
              <span className="text-sm font-bold text-status-blue font-mono">
                {formatElapsed(job.actual_start, elapsedNow)}
              </span>
            </div>
          </div>
        </div>

        {/* Location — icon container + two-line address */}
        {customer.address ? (
          <div className="mb-5">
            <div className="text-micro font-bold text-brand-mid tracking-[0.7px] mb-2.5">Location</div>
            <div className="border border-brand-border rounded-xl px-4 py-3 bg-white flex items-start gap-3">
              <div className="w-10 h-10 rounded-lg bg-brand-surface flex items-center justify-center shrink-0 mt-0.5">
                <MapPin size={18} className="text-brand-muted" />
              </div>
              <div className="flex-1 min-w-0">
                {(() => {
                  const addr = customer.address;
                  const parts = addr.split(',');
                  if (parts.length > 1) {
                    return (
                      <>
                        <div className="text-sm font-medium text-brand-dark">{parts[0].trim()}</div>
                        <div className="text-sm text-brand-muted">{parts.slice(1).join(',').trim()}</div>
                      </>
                    );
                  }
                  return <div className="text-sm font-medium text-brand-dark">{addr}</div>;
                })()}
              </div>
            </div>
          </div>
        ) : (
          <div className="mb-5">
            <div className="text-micro font-bold text-brand-mid tracking-[0.7px] mb-2.5">Location</div>
            <div className="border border-brand-border rounded-xl px-4 py-6 bg-white flex flex-col items-center justify-center text-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-brand-surface flex items-center justify-center">
                <MapPin size={18} className="text-brand-muted" />
              </div>
              <p className="text-sm text-brand-muted">No address set</p>
              <button
                onClick={openEditDetails}
                className="text-sm font-semibold text-brand-black underline underline-offset-2"
              >
                Add address
              </button>
            </div>
          </div>
        )}

        {/* Invoice items */}
        <div className="flex items-center justify-between mb-2.5">
          <span className="text-micro font-bold text-brand-mid tracking-[0.7px]">
            Quote · {paymentTermsLabel(job.payment_terms).toLowerCase()}
          </span>
        </div>
        <div className="border border-brand-border rounded-lg overflow-hidden mb-5">
          {lineItems.map((item) => (
            <InvoiceItemRow
              key={item.id}
              item={item}
              showRemove={false}
            />
          ))}
          <InvoiceTotalRow total={total} />
        </div>
        {renderPhotosAndMaterials(true)}

        {job.scheduled_start && (
          <button
            onClick={() => {
              addToCalendar({
                jobId: job.id,
                title: job.title,
                scheduled_start: job.scheduled_start,
                scheduled_end: job.scheduled_end,
                customerName: customer.name,
                customerPhone: customer.phone,
                address: customer.address,
                notes: job.notes,
              });
              showToast('Calendar event ready to add', 'info', 3000);
            }}
            className="w-full h-11 mt-2 flex items-center justify-center gap-2 text-sm font-medium text-brand-black border border-brand-border rounded-xl bg-white active:bg-brand-surface transition-colors cursor-pointer"
          >
            <CalendarPlus size={16} className="text-brand-mid" />
            Add to calendar
          </button>
        )}
      </div>
    );
  };


  const renderQuotedBody = () => {
    if (!job || !customer) return null;
    return (
      <div className="flex-1 px-4 md:px-6 pt-4 md:pt-6 pb-[calc(120px + env(safe-area-inset-bottom))]">

        <div className="mb-4">
          <div className="text-micro font-bold text-brand-mid tracking-[0.7px] mb-2.5">
            Quote
          </div>
          <div className="border border-brand-border rounded-xl overflow-hidden">
            <div className="px-4 pt-3.5 pb-2.5 border-b border-brand-borderLight">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-sm font-medium text-brand-muted">{job?.job_number || 'Quote'}</span>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-[3px] rounded-full bg-status-blueBg text-status-blue text-micro font-bold tracking-[0.4px]">
                  <span className="w-[5px] h-[5px] rounded-full bg-status-blue" />
                  Quoted
                </span>
              </div>
              <div className="text-lg font-bold text-brand-black">{job.title}</div>
              <div className="text-sm text-brand-mid mt-0.5">{customer.name}</div>
            </div>
            <div className="border-b border-brand-borderLight">
              <div className="flex justify-between items-center px-4 py-2.5 border-b border-brand-surface">
                <span className="text-sm text-brand-muted">Date &amp; time</span>
                <span className="text-sm font-medium text-brand-black text-right">
                  {formatDateTimeRange(job.scheduled_start, job.scheduled_end)}
                </span>
              </div>
              <div className="flex justify-between items-center px-4 py-2.5 border-b border-brand-surface">
                <span className="text-sm text-brand-muted">Payment</span>
                <span className="text-sm font-medium text-brand-black text-right">
                  {paymentTermsLabel(job.payment_terms)}
                </span>
              </div>
              <div className="flex justify-between items-center px-4 py-2.5">
                <span className="text-sm text-brand-muted">Valid until</span>
                <span className="text-sm font-medium text-brand-black text-right">
                  {job.quote_expires_at
                    ? new Date(job.quote_expires_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
                    : '—'}
                </span>
              </div>
            </div>
            <div className="px-4 pt-3 pb-0">
              {lineItems.map((item, idx) => (
                <div key={item.id} className={`flex justify-between py-1.5 text-sm text-brand-dark ${idx < lineItems.length - 1 ? 'border-b border-brand-surface' : ''}`}>
                  <span>{item.description}</span>
                  <span className="font-medium text-brand-black">£{item.amount.toFixed(2)}</span>
                </div>
              ))}
            </div>
            <div className="flex justify-between items-center px-4 py-3 border-t-[1.5px] border-brand-black mt-0">
              <span className="text-base font-bold text-brand-black">Total</span>
              <span className="text-title font-extrabold text-brand-black">£{total.toFixed(2)}</span>
            </div>
            <div className="px-4 py-3 border-t border-brand-borderLight text-sm text-brand-muted leading-relaxed">
              {profile?.business_name || 'Your business'}
            </div>
          </div>
        </div>
        {renderPhotosAndMaterials(true)}
      </div>
    );
  };

  const renderBookedFooter = () => (
    <div className="sticky bottom-0 z-40 bg-[var(--app-shell-bg)] border-t border-brand-borderLight px-4 py-2 pb-[calc(4px_+_env(safe-area-inset-bottom))]">
      <Button variant="primary" onClick={handleStartJob}>
        Start job
      </Button>
    </div>
  );

  const handleReviseQuote = () => {
    if (!job || !customer) return;
    navigate('/quote', {
      state: {
        jobId: job.id,
        customerId: job.customer_id,
        entryPoint: 'revise',
      },
    });
  };

  const renderQuotedFooter = () => (
    <div className="sticky bottom-0 z-40 bg-[var(--app-shell-bg)] border-t border-brand-borderLight px-4 py-2 pb-[calc(4px_+_env(safe-area-inset-bottom))]">
      <div className="flex gap-2">
        <div className="flex-1">
          <Button variant="primary" onClick={handleMarkAsBooked} disabled={!!job?.is_sample}>
            Mark as Booked
          </Button>
        </div>
        <div className="flex-1">
          <Button variant="secondary" onClick={handleReviseQuote} disabled={!!job?.is_sample}>
            Revise quote
          </Button>
        </div>
      </div>
      {job?.is_sample && <p className="text-xs text-brand-muted text-center mt-2">This is a sample — create a real job to use this</p>}
    </div>
  );

  const renderInProgressFooter = () => (
    <div className="sticky bottom-0 z-40 bg-[var(--app-shell-bg)] border-t border-brand-borderLight px-4 py-2 pb-[calc(4px_+_env(safe-area-inset-bottom))]">
      <div className="flex flex-col gap-2">
        <Button variant="primary" onClick={() => setSheet('mark_done')}>
          <Check size={18} className="mr-2" />
          Complete & take payment
        </Button>
        <Button variant="secondary" onClick={() => navigate(-1)}>
          Close
        </Button>
      </div>
    </div>
  );

  const renderAwaitingPaymentBody = () => {
    if (!job || !customer) return null;

    return (
      <div className="flex-1 px-4 md:px-6 pt-4 md:pt-6 pb-[calc(120px + env(safe-area-inset-bottom))]">

        {/* Amount card */}
        <div className="border border-amber-200 bg-status-amberBg rounded-xl px-5 py-6 text-center mb-5">
          <div className="text-label font-bold tracking-[0.5px] text-status-amber mb-2">
            Total due
          </div>
          <div className="text-[36px] font-extrabold text-brand-black tracking-tight">
            £{total.toFixed(2)}
          </div>
          <div className="text-sm text-status-amber mt-2">
            {job.invoice_sent_at ? `Invoice sent · ${formatInvoiceSent(job.invoice_sent_at)}` : 'Payment pending'}
          </div>
          {job.invoice_number && (
            <div className="text-xs text-brand-muted mt-1.5">
              {job.invoice_number}
            </div>
          )}
        </div>

        {/* Invoice items (locked) */}
        <div className="flex items-center justify-between mb-2.5">
          <span className="text-micro font-bold text-brand-mid tracking-[0.7px]">Invoice items</span>
        </div>
        <div className="border border-brand-border rounded-lg overflow-hidden mb-5">
          {lineItems.map((item) => (
            <InvoiceItemRow key={item.id} item={item} showRemove={false} />
          ))}
          <InvoiceTotalRow total={total} />
        </div>
        {renderPhotosAndMaterials(false)}
      </div>
    );
  };

  

  const renderNoShowBody = () => {
    if (!job || !customer) return null;
    return (
      <div className="flex-1 px-4 md:px-6 pt-4 md:pt-6 pb-[calc(120px + env(safe-area-inset-bottom))]">

        {/* What happened */}
        <div className="border border-brand-border rounded-lg p-4 mb-5">
          <div className="text-micro font-bold tracking-[0.5px] text-brand-mid mb-2">
            What happened
          </div>
          <div className="text-sm text-brand-dark leading-relaxed">
            {profile?.full_name?.split(' ')[0] || 'Dave'} arrived at {job.actual_end ? formatTime(new Date(job.actual_end)) : '—'} — customer not home
          </div>
        </div>

        {/* Location */}
        {customer.address ? (
          <div className="mb-5">
            <div className="text-micro font-bold text-brand-mid tracking-[0.7px] mb-2.5">Location</div>
            <div className="border border-brand-border rounded-xl overflow-hidden bg-white">
              <div className="relative">
                <MapPreview address={customer.address} />
              </div>
              <div className="flex items-center justify-between px-4 py-3 border-t border-brand-borderLight">
                <div className="flex items-center gap-2 min-w-0">
                  <MapPin size={16} className="text-brand-muted shrink-0" />
                  <span className="text-sm text-brand-dark font-medium truncate">{customer.address}</span>
                </div>
                <button
                  onClick={() => window.open(`https://maps.google.com/maps?daddr=${encodeURIComponent(customer.address || '')}`, '_blank')}
                  className="flex items-center gap-1 text-sm font-semibold text-brand-black shrink-0 ml-2"
                >
                  <Navigation size={14} />
                  Navigate
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="mb-5">
            <div className="text-micro font-bold text-brand-mid tracking-[0.7px] mb-2.5">Location</div>
            <div className="border border-brand-border rounded-xl px-4 py-6 bg-white flex flex-col items-center justify-center text-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-brand-surface flex items-center justify-center">
                <MapPin size={18} className="text-brand-muted" />
              </div>
              <p className="text-sm text-brand-muted">No address set</p>
              <button onClick={openEditDetails} className="text-sm font-semibold text-brand-black underline underline-offset-2">
                Add address
              </button>
            </div>
          </div>
        )}

        {/* Schedule (simplified — date + arrival window only) */}
        <div className="mb-5">
          <div className="text-micro font-bold text-brand-mid tracking-[0.7px] mb-2.5">Schedule</div>
          <div className="border border-brand-border rounded-xl overflow-hidden bg-white divide-y divide-brand-borderLight">
            <div className="flex justify-between items-center px-4 py-3">
              <span className="text-sm text-brand-muted">Date</span>
              <span className="text-sm font-medium text-brand-black text-right">
                {job.scheduled_start ? formatShortDate(new Date(job.scheduled_start)) : 'Not set'}
              </span>
            </div>
            <div className="flex justify-between items-center px-4 py-3">
              <span className="text-sm text-brand-muted">Arrival window</span>
              <span className="text-sm font-medium text-brand-black text-right">
                {job.scheduled_start ? formatTime(new Date(job.scheduled_start)) : '—'}
                {job.scheduled_end ? ` – ${formatTime(new Date(job.scheduled_end))}` : ''}
              </span>
            </div>
          </div>
        </div>

        {/* Quote items */}
        <div className="flex items-center justify-between mb-2.5">
          <span className="text-micro font-bold text-brand-mid tracking-[0.7px]">Quote items</span>
        </div>
        <div className="border border-brand-border rounded-lg overflow-hidden mb-5">
          {lineItems.map((item) => (
            <InvoiceItemRow key={item.id} item={item} showRemove={false} />
          ))}
          <InvoiceTotalRow total={total} />
        </div>
      </div>
    );
  };

  const renderNoShowFooter = () => (
    <div className="sticky bottom-0 z-40 bg-[var(--app-shell-bg)] border-t border-brand-borderLight px-4 py-2 pb-[calc(4px_+_env(safe-area-inset-bottom))]">
      <div className="flex gap-2">
        <div className="flex-1">
          <Button variant="primary" onClick={() => setSheet('reschedule')}>
            Reschedule
          </Button>
        </div>
        <div className="flex-1">
          <Button variant="secondary" onClick={() => setSheet('callout_charge')}>
            Charge callout
          </Button>
        </div>
      </div>
      {!job?.is_sample && (
        <button
          onClick={() => navigate('/quote', { state: { customerId: job?.customer_id, sourceJobId: job?.id, entryPoint: 'requote' } })}
          className="w-full text-center text-sm text-brand-muted py-2 mt-1 underline underline-offset-2 cursor-pointer"
        >
          Create similar quote
        </button>
      )}
    </div>
  );

  const renderPaidBody = () => {
    if (!job) return null;
    const lastPayment = payments.length > 0 ? payments[payments.length - 1] : null;
    const visibleLogs = workLogExpanded ? eventLogs : eventLogs.slice(0, 3);
    return (
      <div className="flex-1 px-4 md:px-6 pt-4 md:pt-6 pb-[calc(120px + env(safe-area-inset-bottom))]">

        <div className="border border-brand-border rounded-lg p-4 mb-5">
          <div className="text-micro font-bold tracking-[0.5px] text-brand-mid mb-2">
            Payment record
          </div>
          <div className="text-md font-bold text-status-green mb-1">
            Paid
          </div>
          <div className="text-sm text-brand-mid mb-0.5">
            {lastPayment?.method === 'cash' ? 'Cash' : lastPayment?.method === 'bank_transfer' ? 'Bank Transfer' : 'Other'} · £{total.toFixed(2)}
          </div>
          <div className="flex items-center justify-between">
            <div className="text-sm text-brand-muted">
              Recorded {job.actual_end ? formatShortDate(new Date(job.actual_end)) : '—'}
            </div>
            <button
              onClick={() => setSheet('edit_payment_method')}
              className="text-sm font-medium text-brand-mid underline underline-offset-2 cursor-pointer active:text-brand-dark"
            >
              Change method
            </button>
          </div>
        </div>

        {/* BU-4: Book again card — shown when booking is enabled */}
        {profile?.booking_enabled && profile?.booking_slug && (() => {
          const bookingUrl = bookingPageUrl(profile.booking_slug);
          const businessName = profile?.business_name || profile?.full_name || 'Your business';
          const firstName = customer?.name?.split(' ')[0] || 'there';
          return (
            <div className="bg-brand-surface border border-brand-border rounded-lg p-4 mb-5">
              <div className="flex items-center gap-2 mb-2">
                <CalendarPlus size={16} className="text-brand-mid" />
                <span className="text-micro font-bold text-brand-mid tracking-[0.7px]">Book again</span>
              </div>
              <p className="text-sm text-brand-dark mb-3 leading-relaxed">Let {firstName} book their next appointment online.</p>
              <div className="flex flex-col gap-2">
                <Button
                  variant="secondary"
                  fullWidth
                  disabled={!!job?.is_sample}
                  onClick={() => {
                    setSendSheetConfig({
                      title: `Send booking link to ${customer?.name || 'customer'}?`,
                      messageText: `Hi ${firstName}, thanks for your business! Book your next appointment online: ${bookingUrl} — ${businessName}`,
                      onSend: () => { setSendSheetConfig(null); },
                    });
                  }}
                >
                  Send booking link
                </Button>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(bookingUrl).then(() => {
                      showToast('Booking link copied', 'info', 3000);
                    }).catch(() => {
                      showToast('Could not copy link', 'error', 3000);
                    });
                  }}
                  className="text-sm font-medium text-brand-mid underline underline-offset-2 cursor-pointer text-center min-h-11"
                >
                  Copy booking link
                </button>
              </div>
            </div>
          );
        })()}

        {renderPhotosAndMaterials(false)}

        <div className="mb-5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-micro font-bold text-brand-mid tracking-[0.7px]">Work log</span>
          </div>
          {eventLogs.length === 0 ? (
            <p className="text-sm text-brand-muted italic py-2">No work logged</p>
          ) : (
            <div>
              {visibleLogs.map((log) => {
                const isLong = log.description.length > 100;
                const isExpanded = expandedLogIds.has(log.id);
                const displayText = isLong && !isExpanded
                  ? log.description.substring(0, 100) + '...'
                  : log.description;
                return (
                  <div
                    key={log.id}
                    className="flex gap-2.5 py-2 border-b border-brand-borderLight last:border-b-0 items-start"
                    onClick={isLong ? () => {
                      setExpandedLogIds((prev) => {
                        const next = new Set(prev);
                        if (next.has(log.id)) next.delete(log.id);
                        else next.add(log.id);
                        return next;
                      });
                    } : undefined}
                    style={isLong ? { cursor: 'pointer' } : undefined}
                  >
                    <span className="text-label text-brand-dark whitespace-nowrap shrink-0 pt-0.5 min-w-[46px]">
                      {formatLogTime(log.created_at)}
                    </span>
                    <span className="text-sm text-brand-dark flex-1 leading-relaxed whitespace-pre-line">
                      {displayText}
                    </span>
                    {log.amount !== undefined && log.amount > 0 && (
                      <span className={`text-sm font-bold shrink-0 whitespace-nowrap ${log.type === 'expense' ? 'text-status-red' : 'text-status-green'}`}>
                        {log.type === 'expense' ? '-' : '+'}£{log.amount.toFixed(2)}
                      </span>
                    )}
                  </div>
                );
              })}
              {eventLogs.length > 3 && (
                <button
                  onClick={() => setWorkLogExpanded(!workLogExpanded)}
                  className="text-sm text-brand-mid underline underline-offset-2 cursor-pointer mt-1"
                >
                  {workLogExpanded ? 'Show less' : `Show ${eventLogs.length - 3} more`}
                </button>
              )}
            </div>
          )}
        </div>

        {/* Private Notes */}
        {hasPrivateNotes && (
          <div className="mb-5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-micro font-bold text-brand-mid tracking-[0.7px]">Private notes</span>
            </div>
            <div className="border border-brand-border rounded-lg p-3.5">
              {noteLogs.map((log) => (
                <div key={log.id} className="flex gap-2.5 py-1.5 border-b border-brand-surface last:border-b-0 items-start">
                  <span className="text-label text-brand-dark whitespace-nowrap shrink-0 min-w-[46px]">{formatLogTime(log.created_at)}</span>
                  <span className="text-sm text-brand-dark flex-1 leading-relaxed">{log.description}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex items-center justify-between mb-2.5">
          <span className="text-micro font-bold text-brand-mid tracking-[0.7px]">Invoice items</span>
        </div>
        <div className="border border-brand-border rounded-lg overflow-hidden mb-5">
          {lineItems.map((item) => (
            <InvoiceItemRow key={item.id} item={item} showRemove={false} />
          ))}
          <InvoiceTotalRow total={total} />
        </div>
      </div>
    );
  };

  const renderCancelledBody = () => {
    if (!job) return null;
    return (
      <div className="flex-1 px-4 md:px-6 pt-4 md:pt-6 pb-[calc(120px + env(safe-area-inset-bottom))]">

        <div className="border border-brand-border rounded-lg p-4 mb-5">
          <div className="text-micro font-bold tracking-[0.5px] text-brand-mid mb-2">
            Reason
          </div>
          <div className="text-sm text-brand-dark leading-relaxed">
            {job.cancellation_reason === 'customer_cancelled' ? 'Customer cancelled' : 'I cancelled'}
          </div>
        </div>

        <div className="border border-brand-border rounded-lg p-4 mb-5">
          <div className="text-micro font-bold tracking-[0.5px] text-brand-mid mb-2">
            Notes
          </div>
          {job.notes ? (
            <div className="text-sm text-brand-dark leading-relaxed">
              {job.notes}
            </div>
          ) : (
            <p className="text-sm text-brand-muted italic leading-relaxed">
              Tap to add a note about this cancellation…
            </p>
          )}
        </div>
        {renderPhotosAndMaterials(false)}
      </div>
    );
  };

  const renderWrittenOffBody = () => {
    if (!job) return null;
    return (
      <div className="flex-1 px-4 md:px-6 pt-4 md:pt-6 pb-[calc(120px + env(safe-area-inset-bottom))]">

        <div className="border border-brand-border rounded-lg p-4 mb-5">
          <div className="text-micro font-bold tracking-[0.5px] text-brand-mid mb-2">
            Amount written off
          </div>
          <div className="text-hero font-extrabold text-brand-black my-1 tracking-[-0.5px]">
            £{total.toFixed(2)}
          </div>
          <div className="text-sm text-brand-muted mt-2">
            Logged as bad debt · not counted in income
          </div>
        </div>

        {renderPhotosAndMaterials(false)}

        <div className="mb-5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-micro font-bold text-brand-mid tracking-[0.7px]">Work log</span>
          </div>
          {eventLogs.length === 0 ? (
            <p className="text-sm text-brand-muted italic py-2">No work logged</p>
          ) : (
            <div>
              {eventLogs.map((log) => (
                <div key={log.id} className="flex gap-2.5 py-2 border-b border-brand-borderLight last:border-b-0 items-start">
                  <span className="text-label text-brand-dark whitespace-nowrap shrink-0 pt-0.5 min-w-[46px]">
                    {formatLogTime(log.created_at)}
                  </span>
                  <span className="text-sm text-brand-dark flex-1 leading-relaxed">
                    {log.description}
                  </span>
                  {log.amount !== undefined && log.amount > 0 && (
                    <span className={`text-sm font-bold shrink-0 whitespace-nowrap ${log.type === 'expense' ? 'text-status-red' : 'text-status-green'}`}>
                      {log.type === 'expense' ? '-' : '+'}£{log.amount.toFixed(2)}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Private Notes */}
        {hasPrivateNotes && (
          <div className="mb-5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-micro font-bold text-brand-mid tracking-[0.7px]">Private notes</span>
            </div>
            <div className="border border-brand-border rounded-lg p-3.5">
              {noteLogs.map((log) => (
                <div key={log.id} className="flex gap-2.5 py-1.5 border-b border-brand-surface last:border-b-0 items-start">
                  <span className="text-label text-brand-dark whitespace-nowrap shrink-0 min-w-[46px]">{formatLogTime(log.created_at)}</span>
                  <span className="text-sm text-brand-dark flex-1 leading-relaxed">{log.description}</span>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>
    );
  };

  const renderAwaitingPaymentFooter = () => (
    <div className="sticky bottom-0 z-40 bg-[var(--app-shell-bg)] border-t border-brand-borderLight px-4 py-2 pb-[calc(4px_+_env(safe-area-inset-bottom))]">
      <div className="flex gap-2">
        <div className="flex-1">
          <Button variant="primary" onClick={() => total === 0 ? handleMarkAsPaid('cash') : setSheet('mark_paid')}>
            Mark as Paid
          </Button>
        </div>
        <div className="flex-1">
          <Button variant="secondary" onClick={async () => {
              if (!job || !customer || !userId) return;
              const fallbackText = `Hi ${customer.name}, just a reminder about the invoice for ${job.title}. Amount due: £${total.toFixed(2)}. Thanks, ${profile?.full_name?.split(' ')[0] || 'Dave'}`;
              const defaultText = await getFilledTemplateMessage(userId, 'invoice', job, customer, profile!, total, fallbackText);
              const compactText = `Hi ${customer.name}, your invoice for ${job.title} is ready. Amount due: £${total.toFixed(2)}. Details attached. Thanks!`;
              setSendSheetConfig({
                title: `Send reminder to ${customer.name}?`,
                messageText: reminderText || defaultText,
                onSend: (method, pdfShared) => handleSendReminder(method, pdfShared),
                pdfOptions: {
                  label: 'Attach PDF invoice',
                  generatePdf: async () => {
                    if (!profile || !customer || !job) throw new Error('Missing data');
                    return await generateInvoicePDF({ profile, customer, job, lineItems, total, payments, amountDue: total, dueDate: job.invoice_sent_at ? new Date(Date.now() + 7 * 86400000).toISOString() : undefined });
                  },
                  fileName: `invoice-${job.invoice_number || job.job_number}.pdf`,
                },
                fullMessage: defaultText,
                compactMessage: compactText,
              });
            }}>
            Send reminder
          </Button>
        </div>
      </div>
      <button onClick={() => navigate('/jobs')} className="text-sm text-brand-mid underline underline-offset-2 mt-2 w-full text-center cursor-pointer">
        Close
      </button>
    </div>
  );

  /* ─── sheets ─── */

  const renderMoreOptionsSheet = () => (
    <BottomSheet
      isOpen={sheet === 'more_options'}
      onClose={() => setSheet(null)}
      title="More options"
    >
      <SheetRow
        label="Edit details"
        onTap={openEditDetails}
      />
      <SheetRow
        label="Add a note"
        onTap={() => setSheet('add_note')}
      />
      {(job?.status === 'in_progress' || job?.status === 'awaiting_payment' || job?.status === 'booked' || job?.status === 'no_show' || job?.status === 'quoted') && (
        <>
          <SheetRow
            label="Log expense"
            onTap={() => setSheet('log_expense')}
          />
          <SheetRow
            label="Add charge"
            onTap={() => setSheet('add_charge')}
          />
        </>
      )}
      {(job?.status === 'in_progress' || job?.status === 'awaiting_payment') && (
        <SheetRow
          label="Change status"
          onTap={() => setSheet('change_status')}
        />
      )}
      {job?.payment_terms === 'deposit' && job?.deposit_pct && (
        <SheetRow
          label="Record deposit"
          onTap={() => setSheet('record_deposit')}
        />
      )}
      {profile?.stripe_connected && (() => {
        if (!job) return null;
        const summary = paymentSummary(job, payments, total);
        if (summary.amountDue <= 0) return null;
        const validStatus = ['quoted', 'booked', 'in_progress', 'awaiting_payment'].includes(job.status);
        if (!validStatus) return null;
        return (
          <SheetRow
            icon={<CreditCard size={18} className="text-brand-dark" />}
            label="Request card payment"
            onTap={() => setSheet('request_payment')}
          />
        );
      })()}
      {job?.status === 'awaiting_payment' && (
        <SheetRow
          label="Write off"
          onTap={() => setSheet('write_off')}
          variant="destructive"
        />
      )}
      {(job?.status === 'booked' || job?.status === 'in_progress' || job?.status === 'no_show' || job?.status === 'awaiting_payment') && (
        <SheetRow
          label="Cancel job"
          onTap={() => setSheet('cancel')}
          variant="destructive"
        />
      )}
      {job?.status === 'quoted' && (
        <SheetRow
          label="Cancel quote"
          onTap={() => setSheet('cancel')}
          variant="destructive"
        />
      )}
      <SheetRow
        label="Close"
        onTap={() => setSheet(null)}
        isLast
      />
    </BottomSheet>
  );

  const renderCancelSheet = () => (
    <BottomSheet
      isOpen={sheet === 'cancel'}
      onClose={() => setSheet(null)}
      title="Why are you cancelling?"
      subtitle={job && customer ? `${customer.name} · ${job.title}` : undefined}
    >
      <SheetRow
        label="Customer cancelled"
        onTap={() => handleCancelJob('customer_cancelled')}
      />
      <SheetRow
        label="I need to cancel"
        onTap={() => handleCancelJob('dave_cancelled')}
      />
      <SheetRow
        label="Keep the job"
        onTap={() => setSheet(null)}
        variant="destructive"
        isLast
      />
    </BottomSheet>
  );

  const renderLogExpenseSheet = () => (
    <BottomSheet
      isOpen={sheet === 'log_expense'}
      onClose={() => setSheet(null)}
      title="Log expense"
      subtitle="Materials or costs for this job"
    >
      <div className="mb-3">
        <label className="block text-micro font-bold tracking-[0.4px] text-brand-mid mb-1">
          Description
        </label>
        <input
          type="text"
          value={expenseDesc}
          onChange={(e) => setExpenseDesc(e.target.value)}
          placeholder="e.g. Boiler parts from Screwfix"
          className="w-full h-12 px-3.5 border-2 border-brand-border rounded-lg text-base font-medium text-brand-black placeholder:text-brand-muted outline-none focus:border-brand-black"
        />
      </div>
      <div className="mb-4">
        <label className="block text-micro font-bold tracking-[0.4px] text-brand-mid mb-1">
          Amount
        </label>
        <div className="relative">
          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-base font-medium text-brand-black">£</span>
          <input
            type="text"
            inputMode="decimal"
            value={expenseAmount}
            onChange={(e) => setExpenseAmount(e.target.value)}
            placeholder="0.00"
            className="w-full h-12 pl-8 pr-3.5 border-2 border-brand-border rounded-lg text-base font-medium text-brand-black placeholder:text-brand-muted outline-none focus:border-brand-black"
          />
        </div>
      </div>
      <Button
        variant="primary"
        onClick={handleLogExpense}
        disabled={!expenseDesc.trim() || !expenseAmount || parseFloat(expenseAmount) <= 0}
      >
        Log expense
      </Button>
    </BottomSheet>
  );

  const renderAddChargeSheet = () => (
    <BottomSheet
      isOpen={sheet === 'add_charge'}
      onClose={() => setSheet(null)}
      title="Add a charge"
      subtitle="Added to invoice · visible to customer"
    >
      <div className="mb-3">
        <label className="block text-micro font-bold tracking-[0.4px] text-brand-mid mb-1">
          Description
        </label>
        <input
          type="text"
          value={chargeDesc}
          onChange={(e) => setChargeDesc(e.target.value)}
          placeholder="e.g. Corroded pipe replacement"
          className="w-full h-12 px-3.5 border-2 border-brand-border rounded-lg text-base font-medium text-brand-black placeholder:text-brand-muted outline-none focus:border-brand-black"
        />
      </div>
      <div className="mb-4">
        <label className="block text-micro font-bold tracking-[0.4px] text-brand-mid mb-1">
          Amount
        </label>
        <div className="relative">
          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-base font-medium text-brand-black">£</span>
          <input
            type="text"
            inputMode="decimal"
            value={chargeAmount}
            onChange={(e) => setChargeAmount(e.target.value)}
            placeholder="0.00"
            className="w-full h-12 pl-8 pr-3.5 border-2 border-brand-border rounded-lg text-base font-medium text-brand-black placeholder:text-brand-muted outline-none focus:border-brand-black"
          />
        </div>
      </div>
      <Button
        variant="primary"
        onClick={handleAddCharge}
        disabled={!chargeDesc.trim() || !chargeAmount || parseFloat(chargeAmount) <= 0}
      >
        Add to invoice
      </Button>
    </BottomSheet>
  );

  const renderAddNoteSheet = () => (
    <BottomSheet
      isOpen={sheet === 'add_note'}
      onClose={() => setSheet(null)}
      title="Add a note"
      subtitle="Only visible to you"
    >
      <div className="mb-4">
        <textarea
          value={noteText}
          onChange={(e) => setNoteText(e.target.value)}
          placeholder="What happened?"
          rows={3}
          className="w-full px-3.5 py-3 border-2 border-brand-border rounded-lg text-base font-medium text-brand-black placeholder:text-brand-muted outline-none focus:border-brand-black resize-none"
        />
      </div>
      <Button
        variant="primary"
        onClick={handleAddNote}
        disabled={!noteText.trim()}
      >
        Add note
      </Button>
    </BottomSheet>
  );

  const renderMarkDoneSheet = () => {
    // If job already has 10 photos, skip the photo step
    const photoStep = markDoneStep === 'photo' && photos.length < 10;
    const summary = job ? paymentSummary(job, payments, total) : null;

    return (
      <BottomSheet
        isOpen={sheet === 'mark_done'}
        onClose={() => { !paymentProcessing && setSheet(null); setMarkDoneStep('photo'); }}
        title={photoStep ? 'Job done' : 'How were you paid?'}

        subtitle={
          photoStep
            ? 'Snap a quick photo for your records?'
            : job && customer ? `${customer.name} · ${job.title} · £${formatAmount(summary?.amountDue ?? total)} due` : undefined
        }
      >
        {photoStep ? (
          <>
            <SheetRow
              icon={<Camera size={18} className="text-brand-dark" />}
              label="Take photo"
              onTap={async () => {
                if (!job || !userId) return;
                const dataUrl = await capturePhoto();
                if (!dataUrl) return;
                await saveJobPhoto(job.id, userId, dataUrl);
                captureCompletionPhotoTaken({ jobId: job.id });
                setPhotos((prev) => [...prev, {
                  id: crypto.randomUUID(), job_id: job.id, user_id: userId,
                  data_url: dataUrl, taken_at: now(), created_at: now(), _sync_status: 'pending',
                }]);
                setMarkDoneStep('payment');
              }}
            />
            <SheetRow
              icon={<ImageIcon size={18} className="text-brand-dark" />}
              label="Choose from library"
              onTap={async () => {
                if (!job || !userId) return;
                const dataUrl = await pickPhotoFromLibrary();
                if (!dataUrl) return;
                await saveJobPhoto(job.id, userId, dataUrl);
                captureCompletionPhotoTaken({ jobId: job.id });
                setPhotos((prev) => [...prev, {
                  id: crypto.randomUUID(), job_id: job.id, user_id: userId,
                  data_url: dataUrl, taken_at: now(), created_at: now(), _sync_status: 'pending',
                }]);
                setMarkDoneStep('payment');
              }}
            />
            <SheetRow
              icon={<X size={18} className="text-brand-muted" />}
              label="Skip"
              onTap={() => {
                if (job) captureCompletionPhotoSkipped({ jobId: job.id });
                setMarkDoneStep('payment');
              }}
              variant="destructive"
              isLast
            />
          </>
        ) : (
          <>
            <SheetRow
              icon={<Banknote size={18} className="text-brand-dark" />}
              label="Cash"
              onTap={() => handleMarkDone('cash')}
              disabled={paymentProcessing}
            />
            <SheetRow
              icon={<Building2 size={18} className="text-brand-dark" />}
              label="Bank Transfer"
              onTap={() => handleMarkDone('bank_transfer')}
              disabled={paymentProcessing}
            />
            {profile?.stripe_connected && summary && summary.amountDue > 0 && (
              <SheetRow
                icon={<CreditCard size={18} className="text-brand-dark" />}
                label={`Send card payment link (£${formatAmount(summary.amountDue)})`}
                onTap={handleMarkDoneCardPayment}
                disabled={paymentProcessing || stripeLoading}
              />
            )}
            <SheetRow
              icon={<Pencil size={18} className="text-brand-dark" />}
              label="Other"
              sublabel="Entered manually"
              onTap={() => handleMarkDone('other')}
              disabled={paymentProcessing}
            />
            <SheetRow
              icon={<Clock size={18} className="text-brand-muted" />}
              label="Not yet"
              sublabel="Chase later"
              onTap={() => handleMarkDone('not_yet')}
              variant="destructive"
              isLast
              disabled={paymentProcessing}
            />
            <p className="text-label text-brand-dark px-4 pt-1 pb-2">
              → Chase payment added to tasks
            </p>
          </>
        )}
      </BottomSheet>
    );
  };

  const renderMarkPaidSheet = () => {
    const summary = job ? paymentSummary(job, payments, total) : null;
    return (
      <BottomSheet
        isOpen={sheet === 'mark_paid'}
        onClose={() => !paymentProcessing && setSheet(null)}
        title="How were you paid?"
        subtitle={job && customer ? `${customer.name} · ${job.title} · £${formatAmount(summary?.amountDue ?? total)} due` : undefined}
      >
        <SheetRow
          icon={<Banknote size={18} className="text-brand-dark" />}
          label="Cash"
          onTap={() => handleMarkAsPaid('cash')}
          disabled={paymentProcessing}
        />
        <SheetRow
          icon={<Building2 size={18} className="text-brand-dark" />}
          label="Bank Transfer"
          onTap={() => handleMarkAsPaid('bank_transfer')}
          disabled={paymentProcessing}
        />
        {profile?.stripe_connected && summary && summary.amountDue > 0 && (
          <SheetRow
            icon={<CreditCard size={18} className="text-brand-dark" />}
            label={`Send card payment link (£${formatAmount(summary.amountDue)})`}
            onTap={() => handleRequestStripePayment('full')}
            disabled={paymentProcessing || stripeLoading}
          />
        )}
        <SheetRow
          icon={<Pencil size={18} className="text-brand-dark" />}
          label="Other"
          sublabel="Entered manually"
          onTap={() => handleMarkAsPaid('other')}
          isLast
          disabled={paymentProcessing}
        />
      </BottomSheet>
    );
  };

  const renderDepositSheet = () => {
    const summary = job ? paymentSummary(job, payments, total) : null;
    const depositAmount = summary?.depositAmount ?? 0;
    return (
      <BottomSheet
        isOpen={sheet === 'record_deposit'}
        onClose={() => !paymentProcessing && setSheet(null)}
        title="Record deposit"
        subtitle={job && customer ? `${customer.name} · ${job.title} · £${formatAmount(depositAmount)} deposit` : undefined}
      >
        <SheetRow
          icon={<Banknote size={18} className="text-brand-dark" />}
          label="Cash"
          onTap={() => handleRecordDeposit('cash')}
          disabled={paymentProcessing}
        />
        <SheetRow
          icon={<Building2 size={18} className="text-brand-dark" />}
          label="Bank Transfer"
          onTap={() => handleRecordDeposit('bank_transfer')}
          disabled={paymentProcessing}
        />
        <SheetRow
          icon={<Pencil size={18} className="text-brand-dark" />}
          label="Other"
          sublabel="Entered manually"
          onTap={() => handleRecordDeposit('other')}
          isLast
          disabled={paymentProcessing}
        />
      </BottomSheet>
    );
  };

  const renderRequestPaymentSheet = () => {
    if (!job) return null;
    const summary = paymentSummary(job, payments, total);
    const canRequestDeposit = job.payment_terms === 'deposit' && job.deposit_pct && job.deposit_status !== 'paid';
    const canRequestBalance = summary.amountDue > 0 && job.deposit_status !== 'requested';
    const linkSent = job.deposit_status === 'requested' && job.deposit_stripe_url;
    return (
      <BottomSheet
        isOpen={sheet === 'request_payment'}
        onClose={() => !stripeLoading && setSheet(null)}
        title="Request card payment"
        subtitle={job && customer ? `${customer.name} · ${job.title}` : undefined}
      >
        {canRequestDeposit && (
          <SheetRow
            icon={<CreditCard size={18} className="text-brand-dark" />}
            label={`Request deposit — £${formatAmount(summary.depositAmount)}`}
            onTap={() => handleRequestStripePayment('deposit')}
            disabled={stripeLoading}
          />
        )}
        {canRequestBalance && (
          <SheetRow
            icon={<CreditCard size={18} className="text-brand-dark" />}
            label={`Request ${job.deposit_status === 'paid' ? 'balance' : 'payment'} — £${formatAmount(summary.amountDue)}`}
            onTap={() => handleRequestStripePayment('full')}
            disabled={stripeLoading}
          />
        )}
        {linkSent && (
          <>
            <SheetRow
              label="Link sent — waiting for payment"
              sublabel="The customer hasn't paid yet"
              onTap={() => {}}
            />
            <SheetRow
              label="Resend link"
              onTap={() => {
                if (!job.deposit_stripe_url) return;
                const businessName = profile?.business_name || profile?.full_name || 'Your business';
                const firstName = (customer?.name || 'there').split(' ')[0];
                const summary2 = paymentSummary(job, payments, total);
                const amount = summary2.depositAmount > 0 && job.deposit_status !== 'paid' ? summary2.depositAmount : summary2.amountDue;
                setSheet(null);
                setSendSheetConfig({
                  title: `Resend payment link to ${customer?.name || 'customer'}?`,
                  messageText: `Hi ${firstName}, please pay your £${formatAmount(amount)} here: ${job.deposit_stripe_url} — ${businessName}`,
                  onSend: () => { setSendSheetConfig(null); refresh(); },
                });
              }}
              disabled={stripeLoading}
            />
          </>
        )}
        {!canRequestDeposit && !canRequestBalance && !linkSent && (
          <SheetRow label="No payment due" onTap={() => setSheet(null)} isLast />
        )}
        <SheetRow
          label="Close"
          onTap={() => setSheet(null)}
          isLast
          disabled={stripeLoading}
        />
      </BottomSheet>
    );
  };

  const renderWriteOffSheet = () => (
    <BottomSheet
      isOpen={sheet === 'write_off'}
      onClose={() => setSheet(null)}
      title="Write off this job?"
      subtitle={job && customer ? `${customer.name} · ${job.title} · £${formatAmount(total)} still owed` : undefined}
    >
      <SheetRow
        label="Write off balance"
        onTap={handleWriteOff}
        variant="destructive"
      />
      <SheetRow
        label="Keep chasing payment"
        onTap={() => setSheet(null)}
        isLast
      />
    </BottomSheet>
  );

  const renderConfirmNotHomeSheet = () => (
    <BottomSheet
      isOpen={sheet === 'confirm_not_home'}
      onClose={() => setSheet(null)}
      title="Customer not home?"
      subtitle={job && customer ? `${customer.name} · ${job.title}` : undefined}
    >
      <div className="mb-4 px-1">
        <p className="text-sm text-brand-dark leading-relaxed">
          This will mark the job as a no-show. You can reschedule or charge a callout fee afterwards.
        </p>
      </div>
      <SheetRow
        label="Yes, mark as no-show"
        onTap={() => { handleNotHome(); setSheet(null); }}
        variant="destructive"
      />
      <SheetRow
        label="Cancel"
        onTap={() => setSheet(null)}
        isLast
      />
    </BottomSheet>
  );

  const renderRescheduleSheet = () => (
    <BottomSheet
      isOpen={sheet === 'reschedule'}
      onClose={() => { setSheet(null); setRescheduleDate(''); }}
      title="Reschedule job"
      subtitle={job && customer ? `${customer.name} · ${job.title}` : undefined}
    >
      <div className="mb-4">
        <label className="block text-micro font-bold tracking-[0.4px] text-brand-mid mb-1">
          New date & time
        </label>
        <input
          type="datetime-local"
          value={rescheduleDate}
          onChange={(e) => setRescheduleDate(e.target.value)}
          className="w-full h-12 px-3.5 border-2 border-brand-border rounded-lg text-base font-medium text-brand-black placeholder:text-brand-muted outline-none focus:border-brand-black"
        />
      </div>
      <Button
        variant="primary"
        onClick={handleReschedule}
        disabled={!rescheduleDate}
      >
        Reschedule
      </Button>
    </BottomSheet>
  );

  const renderCalloutChargeSheet = () => (
    <BottomSheet
      isOpen={sheet === 'callout_charge'}
      onClose={() => { setSheet(null); setCalloutDesc('Callout charge'); setCalloutAmount(profile?.callout_charge ? String(profile.callout_charge) : '75'); }}
      title="Charge callout"
      subtitle="Charge for arriving when customer wasn't home"
    >
      <div className="mb-3">
        <label className="block text-micro font-bold tracking-[0.4px] text-brand-mid mb-1">
          Description
        </label>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={calloutDesc}
            onChange={(e) => setCalloutDesc(e.target.value)}
            placeholder="e.g. Callout charge"
            className="flex-1 h-12 px-3.5 border-2 border-brand-border rounded-lg text-base font-medium text-brand-black placeholder:text-brand-muted outline-none focus:border-brand-black"
          />
        </div>
      </div>
      <div className="mb-4">
        <label className="block text-micro font-bold tracking-[0.4px] text-brand-mid mb-1">
          Amount
        </label>
        <div className="relative">
          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-base font-medium text-brand-black">£</span>
          <input
            type="text"
            inputMode="decimal"
            value={calloutAmount}
            onChange={(e) => setCalloutAmount(e.target.value)}
            placeholder="0.00"
            className="w-full h-12 pl-8 pr-3.5 border-2 border-brand-border rounded-lg text-base font-medium text-brand-black placeholder:text-brand-muted outline-none focus:border-brand-black"
          />
        </div>
      </div>
      <Button
        variant="primary"
        onClick={handleCalloutCharge}
        disabled={!calloutDesc.trim() || !calloutAmount || parseFloat(calloutAmount) <= 0 || isNaN(parseFloat(calloutAmount))}
      >
        Create invoice
      </Button>
    </BottomSheet>
  );

  const renderChangeStatusSheet = () => {
    if (!job) return null;
    const options: { label: string; value: 'booked' | 'in_progress' | 'awaiting_payment'; icon?: React.ReactNode }[] = [];
    if (job.status === 'in_progress') {
      options.push({ label: 'Revert to booked', value: 'booked' });
      options.push({ label: 'Revert to awaiting payment', value: 'awaiting_payment' });
    }
    if (job.status === 'awaiting_payment') {
      options.push({ label: 'Revert to in progress', value: 'in_progress' });
    }
    return (
      <BottomSheet
        isOpen={sheet === 'change_status'}
        onClose={() => setSheet(null)}
        title="Change job status"
        subtitle={customer ? `${customer.name} · ${job.title}` : undefined}
      >
        {options.map((opt) => (
          <SheetRow
            key={opt.value}
            label={opt.label}
            onTap={() => handleChangeStatus(opt.value)}
          />
        ))}
        <SheetRow
          label="Close"
          onTap={() => setSheet(null)}
          isLast
        />
      </BottomSheet>
    );
  };

  const renderEditPaymentMethodSheet = () => {
    if (!job || payments.length === 0) return null;
    const lastPayment = payments[payments.length - 1];
    const methods: { label: string; value: 'cash' | 'bank_transfer' | 'terminal' | 'other' }[] = [
      { label: 'Cash', value: 'cash' },
      { label: 'Bank Transfer', value: 'bank_transfer' },
      { label: 'Terminal (Card)', value: 'terminal' },
      { label: 'Other', value: 'other' },
    ];
    return (
      <BottomSheet
        isOpen={sheet === 'edit_payment_method'}
        onClose={() => setSheet(null)}
        title="Change payment method"
        subtitle={`Current: ${lastPayment.method === 'cash' ? 'Cash' : lastPayment.method === 'bank_transfer' ? 'Bank Transfer' : lastPayment.method === 'terminal' ? 'Terminal (Card)' : 'Other'} · £${lastPayment.amount.toFixed(2)}`}
      >
        {methods.map((method) => (
          <SheetRow
            key={method.value}
            label={method.label}
            onTap={() => handleChangePaymentMethod(method.value)}
          />
        ))}
        <SheetRow
          label="Cancel"
          onTap={() => setSheet(null)}
          isLast
        />
      </BottomSheet>
    );
  };

  const renderEditDetailsSheet = () => (
    <BottomSheet
      isOpen={sheet === 'edit_details'}
      onClose={() => { setSheet(null); setUpdateMessage(''); }}
      title="Edit job details"
      subtitle={customer ? `${customer.name} · ${job?.title}` : undefined}
    >
      <div className="mb-3">
        <label className="block text-micro font-bold tracking-[0.4px] text-brand-mid mb-1">
          Job title
        </label>
        <input
          type="text"
          value={editTitle}
          onChange={(e) => setEditTitle(e.target.value)}
          className="w-full h-12 px-3.5 border-2 border-brand-border rounded-lg text-base font-medium text-brand-black outline-none focus:border-brand-black"
        />
      </div>
      <div className="mb-3">
        <label className="block text-micro font-bold tracking-[0.4px] text-brand-mid mb-1">
          Address
        </label>
        <textarea
          value={editAddress}
          onChange={(e) => setEditAddress(e.target.value)}
          placeholder="e.g. 12 High Street, London SW1A 1AA"
          rows={2}
          className="w-full px-3.5 py-3 border-2 border-brand-border rounded-lg text-base font-medium text-brand-black placeholder:text-brand-muted outline-none focus:border-brand-black resize-none"
        />
      </div>
      <div className="mb-3">
        <label className="block text-micro font-bold tracking-[0.4px] text-brand-mid mb-1">
          Date
        </label>
        <div className="relative">
          <input
            type="date"
            value={editDate}
            onChange={(e) => setEditDate(e.target.value)}
            className="w-full h-12 px-3.5 pr-10 border-2 border-brand-border rounded-lg text-base font-medium text-brand-black outline-none focus:border-brand-black bg-white"
          />
        </div>
      </div>
      <div className="mb-3">
        <label className="block text-micro font-bold tracking-[0.4px] text-brand-mid mb-1">
          Start time
        </label>
        <div className="relative">
          <input
            type="time"
            value={editStartTime}
            onChange={(e) => setEditStartTime(e.target.value)}
            className="w-full h-12 px-3.5 pr-10 border-2 border-brand-border rounded-lg text-base font-medium text-brand-black outline-none focus:border-brand-black bg-white"
          />
        </div>
      </div>
      <div className="mb-3">
        <label className="block text-micro font-bold tracking-[0.4px] text-brand-mid mb-1">
          End time <span className="normal-case font-normal tracking-0">(optional)</span>
        </label>
        {!editEndTime ? (
          <button
            onClick={() => setEditEndTime(addTwoHours(editStartTime))}
            className="w-full h-12 px-3.5 border-2 border-brand-border border-dashed rounded-lg flex items-center gap-2 text-sm font-medium text-brand-muted cursor-pointer bg-white hover:bg-brand-surface active:bg-brand-borderLight transition-colors"
          >
            <Plus size={14} className="text-brand-muted" />
  Add end time
          </button>
        ) : (
          <div className="relative">
            <input
              type="time"
              value={editEndTime}
              onChange={(e) => setEditEndTime(e.target.value)}
              className="w-full h-12 px-3.5 pr-10 border-2 border-brand-border rounded-lg text-base font-medium text-brand-black outline-none focus:border-brand-black bg-white"
            />
            <button
              onClick={() => setEditEndTime('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-brand-borderLight flex items-center justify-center cursor-pointer"
              aria-label="Clear end time"
            >
              <X size={12} className="text-brand-muted" />            </button>
          </div>
        )}
      </div>
      <div className="mb-4">
        <label className="block text-micro font-bold tracking-[0.4px] text-brand-mid mb-1">
          Notes (private)
        </label>
        <div className="relative">
          <textarea
            value={editNotes}
            onChange={(e) => setEditNotes(e.target.value)}
            placeholder="Any notes about this job..."
            rows={3}
            className="w-full px-3.5 py-3 pr-12 border-2 border-brand-border rounded-lg text-base font-medium text-brand-black placeholder:text-brand-muted outline-none focus:border-brand-black resize-none"
          />
        </div>
      </div>
      <Button variant="primary" onClick={handleEditDetails}>
        Save changes
      </Button>
    </BottomSheet>
  );

  /* ─── main render ─── */

  if (loading) {
    return (
      <div className="flex flex-col min-h-[100dvh]">
        <div className="flex-1 flex items-center justify-center">
          <SkeletonInline />
        </div>
      </div>
    );
  }

  if (!job || !customer) {
    return (
      <div className="flex flex-col min-h-[100dvh]">
        <div className="flex-1 flex items-center justify-center px-4 md:px-6">
          <p className="text-md text-brand-muted text-center">Job not found</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-[100dvh] relative">
      {renderHeader()}

      {/* W1-3: Customer notes banner */}
      {customer?.notes && !notesBannerDismissed && (
        <div className="bg-status-amberBg border border-amber-200 rounded-lg p-3 mx-4 mb-3 flex items-start gap-2">
          <AlertTriangle size={16} className="text-status-amber shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm text-status-amber leading-relaxed whitespace-pre-line">
              {notesBannerExpanded ? customer.notes : (customer.notes.length > 200 ? customer.notes.substring(0, 200) + '...' : customer.notes)}
            </p>
            {customer.notes.length > 200 && (
              <button onClick={() => setNotesBannerExpanded(!notesBannerExpanded)} className="text-xs font-semibold text-status-amber underline mt-1 cursor-pointer">
                {notesBannerExpanded ? 'Show less' : 'Show all'}
              </button>
            )}
          </div>
          <button onClick={() => setNotesBannerDismissed(true)} className="text-status-amber/60 shrink-0 cursor-pointer" aria-label="Dismiss">
            <X size={16} />
          </button>
        </div>
      )}

      {job.status === 'enquiry' && renderEnquiryBody()}
      {job.status === 'booked' && renderBookedBody()}
      {job.status === 'in_progress' && renderInProgressBody()}
      {job.status === 'awaiting_payment' && renderAwaitingPaymentBody()}
      {job.status === 'no_show' && renderNoShowBody()}
      {job.status === 'paid' && renderPaidBody()}
      {job.status === 'cancelled' && renderCancelledBody()}
      {job.status === 'written_off' && renderWrittenOffBody()}
      {job.status === 'quoted' && renderQuotedBody()}

      {job.status === 'enquiry' && renderEnquiryFooter()}
      {job.status === 'booked' && renderBookedFooter()}
      {job.status === 'in_progress' && renderInProgressFooter()}
      {job.status === 'awaiting_payment' && renderAwaitingPaymentFooter()}
      {job.status === 'no_show' && renderNoShowFooter()}
      {job.status === 'quoted' && renderQuotedFooter()}
      {job.status === 'paid' && renderPaidFooter()}
      {job.status === 'cancelled' && renderTerminalFooter()}
      {job.status === 'written_off' && renderTerminalFooter()}

      {renderCancelSheet()}
      {renderMoreOptionsSheet()}
      {renderLogExpenseSheet()}
      {renderAddChargeSheet()}
      {renderAddNoteSheet()}
      {renderMarkDoneSheet()}
      {renderMarkPaidSheet()}
      {renderDepositSheet()}
      {renderRequestPaymentSheet()}
      {renderWriteOffSheet()}
      {renderConfirmNotHomeSheet()}
      
      {renderRescheduleSheet()}
      {renderCalloutChargeSheet()}
      {renderChangeStatusSheet()}
      {renderEditPaymentMethodSheet()}
      
      {renderEditDetailsSheet()}

      {/* --- Bottom Sheet: Finish Previous Job (new-job intercept) --- */}
      <BottomSheet
        isOpen={sheet === 'finish_previous'}
        onClose={() => setSheet(null)}
        title="Finish the previous job first?"
        subtitle={
          interceptData
            ? `${interceptData.oldCustomerName} · ${interceptData.oldJob.title} — started ${interceptData.oldJob.actual_start ? formatStaleElapsed(interceptData.oldJob.actual_start) : 'earlier'} ago`
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
                  returnToStartJob: { jobId: interceptData.newJobId, from: 'jobDetail' },
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
              await addToSyncQueue('jobs', interceptData.newJobId, { status: 'in_progress', actual_start: n, updated_at: n });
              refresh();
            }}
            fullWidth
          >
            Leave in progress
          </Button>
        </div>
      </BottomSheet>

            {/* SendSheet — used by reminder and other send flows */}
      <SendSheet
        isOpen={!!sendSheetConfig}
        onClose={() => { setSendSheetConfig(null); setSheet(null); }}
        title={sendSheetConfig?.title || ''}
        customerPhone={customer?.phone || ''}
        messageText={sendSheetConfig?.messageText || ''}
        onMessageChange={(text: string) => setSendSheetConfig(prev => prev ? { ...prev, messageText: text } : prev)}
        onSend={(method: SendMethod, pdfShared: boolean) => {
          if (sendSheetConfig) sendSheetConfig.onSend(method, pdfShared);
          setSendSheetConfig(null);
        }}
        pdfOptions={sendSheetConfig?.pdfOptions}
        fullMessage={sendSheetConfig?.fullMessage}
        compactMessage={sendSheetConfig?.compactMessage}
      />

      {/* P2-05: Scheduling conflict warning */}
      {conflicts.length > 0 && (
        <BottomSheet
          isOpen={conflicts.length > 0}
          onClose={() => setConflicts([])}
          title="Scheduling conflict"
          subtitle={`${conflicts.length} conflict${conflicts.length > 1 ? 's' : ''} detected`}
        >
          <div className="flex flex-col gap-3 mb-4">
            {conflicts.map((c, i) => (
              <div key={i} className="bg-status-amberBg border border-amber-200 rounded-lg p-3">
                <p className="text-sm font-semibold text-status-amber">{c.job.title}</p>
                <p className="text-xs text-brand-dark mt-0.5">{c.message}</p>
              </div>
            ))}
          </div>
          <div className="flex flex-col gap-2">
            <Button variant="primary" onClick={handleConfirmWithConflicts} fullWidth>
              Keep both
            </Button>
            <Button variant="secondary" onClick={() => {
              setConflicts([]);
              navigate('/quote', { state: { jobId: job?.id, customerId: job?.customer_id, entryPoint: 'reschedule' } });
            }} fullWidth>
              Change time
            </Button>
            <Button variant="ghost" onClick={() => setConflicts([])} fullWidth>
              Cancel
            </Button>
          </div>
        </BottomSheet>
      )}

      {/* P2-08: Google Review Request */}
      <BottomSheet
        isOpen={sheet === 'review_prompt'}
        onClose={() => { setSheet(null); setReviewMessage(''); setEditingReview(false); captureReviewRequestSkipped({ jobId: job?.id || '' }); if (job?.status === 'paid') setTimeout(() => setSheet('recurring_prompt'), 500); }}
        title="Ask for a Google review?"
        subtitle={customer ? `${customer.name} · ${job?.title || ''}` : undefined}
      >
        <div className="flex flex-col gap-3">
          {/* Full message preview — tap to edit */}
          {editingReview ? (
            <textarea
              value={reviewMessage}
              onChange={(e) => setReviewMessage(e.target.value)}
              onBlur={() => setEditingReview(false)}
              autoFocus
              className="w-full min-h-[120px] p-3 bg-brand-surface border border-brand-border rounded-lg text-sm text-brand-dark font-normal leading-relaxed outline-none focus:border-brand-black"
            />
          ) : (
            <div
              onClick={() => setEditingReview(true)}
              className="bg-brand-surface border border-brand-border rounded-lg p-3 cursor-text"
            >
              <p className="text-sm text-brand-dark leading-relaxed whitespace-pre-line select-text">
                {reviewMessage}
              </p>
              <p className="text-label text-brand-dark mt-1 italic">
                Tap to edit
              </p>
            </div>
          )}
          <Button
            variant="primary"
            onClick={async () => {
              if (!customer || !job) return;
              const phone = customer.phone.replace(/\D/g, '');
              const msg = encodeURIComponent(reviewMessage);
              const now = new Date().toISOString();
              db.jobs.update(job.id, { review_requested_at: now, _sync_status: 'pending' });
              addToSyncQueue('jobs', job.id, { review_requested_at: now });
              const logId = crypto.randomUUID();
              await db.work_log.add({
                id: logId,
                job_id: job.id,
                type: 'customer_notified',
                description: `[Review request sent via WhatsApp] ${reviewMessage}`,
                created_at: now,
                _sync_status: 'pending',
              });
              addToSyncQueue('work_log', logId, { id: logId, job_id: job.id, type: 'customer_notified', description: `[Review request sent via WhatsApp] ${reviewMessage}`, created_at: now });
              captureReviewRequestSent({ jobId: job.id });
              setSheet(null);
              setReviewMessage('');
              setEditingReview(false);
              setTimeout(() => setSheet('recurring_prompt'), 500);
              window.location.href = `https://wa.me/${phone}?text=${msg}`;
            }}
            fullWidth
          >
            <MessageCircle size={18} className="mr-2" />
            Send via WhatsApp
          </Button>
          <Button
            variant="secondary"
            onClick={async () => {
              if (!customer || !job) return;
              const phone = customer.phone.replace(/\D/g, '');
              const msg = encodeURIComponent(reviewMessage);
              const now = new Date().toISOString();
              db.jobs.update(job.id, { review_requested_at: now, _sync_status: 'pending' });
              addToSyncQueue('jobs', job.id, { review_requested_at: now });
              const logId = crypto.randomUUID();
              await db.work_log.add({
                id: logId,
                job_id: job.id,
                type: 'customer_notified',
                description: `[Review request sent via SMS] ${reviewMessage}`,
                created_at: now,
                _sync_status: 'pending',
              });
              addToSyncQueue('work_log', logId, { id: logId, job_id: job.id, type: 'customer_notified', description: `[Review request sent via SMS] ${reviewMessage}`, created_at: now });
              captureReviewRequestSent({ jobId: job.id });
              setSheet(null);
              setReviewMessage('');
              setEditingReview(false);
              setTimeout(() => setSheet('recurring_prompt'), 500);
              window.location.href = `sms:${phone}?body=${msg}`;
            }}
            fullWidth
          >
            <MessageSquare size={18} className="mr-2" />
            Send via text
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              navigator.clipboard.writeText(reviewMessage);
              showToast('Copied to clipboard', 'success', 2000);
            }}
            fullWidth
          >
            <Copy size={18} className="mr-2" />
            Copy message
          </Button>
          <Button variant="ghost" onClick={() => { setSheet(null); setReviewMessage(''); setEditingReview(false); captureReviewRequestSkipped({ jobId: job?.id || '' }); if (job?.status === 'paid') setTimeout(() => setSheet('recurring_prompt'), 500); }}>
            Skip
          </Button>
        </div>
      </BottomSheet>

      {/* P2-02: Recurring Job Prompt */}
      <BottomSheet
        isOpen={sheet === 'recurring_prompt'}
        onClose={() => setSheet(null)}
        title="Is this a recurring job?"
        subtitle={customer ? `${customer.name} · ${job?.title || ''}` : undefined}
      >
        <div className="flex flex-col gap-2">
          {job?.title === 'Callout charge' ? null : (
            <>
              {customer && !customer.email && (
                <div className="mb-2">
                  <label className="block text-label font-semibold text-brand-dark mb-1">Add email for auto-reminders (optional)</label>
                  <input
                    type="email"
                    value={recurringEmailInput}
                    onChange={(e) => setRecurringEmailInput(e.target.value)}
                    placeholder="e.g. sarah@example.com"
                    className="w-full h-12 px-3.5 border-2 border-brand-border rounded-lg text-base font-medium text-brand-black placeholder:text-brand-muted placeholder:italic outline-none focus:border-brand-black"
                  />
                </div>
              )}
              <Button variant="ghost" onClick={() => setSheet(null)} fullWidth>
                One-off
              </Button>
              <Button variant="secondary" onClick={async () => {
                if (!job || !userId) return;
                if (recurringEmailInput.trim() && customer) {
                  try {
                    const n = new Date().toISOString();
                    await db.customers.update(job.customer_id, { email: recurringEmailInput.trim(), updated_at: n, _sync_status: 'pending' });
                    await addToSyncQueue('customers', job.customer_id, { email: recurringEmailInput.trim(), updated_at: n }, 'update');
                  } catch {}
                }
                await createRecurringJob(job, 'monthly', { reminderMode: recurringMode });
                showSuccess('Monthly reminder set');
                setSheet(null);
              }} fullWidth>
                Monthly
              </Button>
              <Button variant="secondary" onClick={async () => {
                if (!job || !userId) return;
                if (recurringEmailInput.trim() && customer) {
                  try {
                    const n = new Date().toISOString();
                    await db.customers.update(job.customer_id, { email: recurringEmailInput.trim(), updated_at: n, _sync_status: 'pending' });
                    await addToSyncQueue('customers', job.customer_id, { email: recurringEmailInput.trim(), updated_at: n }, 'update');
                  } catch {}
                }
                await createRecurringJob(job, 'quarterly', { reminderMode: recurringMode });
                showSuccess('Quarterly reminder set');
                setSheet(null);
              }} fullWidth>
                Quarterly
              </Button>
              <Button variant="secondary" onClick={async () => {
                if (!job || !userId) return;
                if (recurringEmailInput.trim() && customer) {
                  try {
                    const n = new Date().toISOString();
                    await db.customers.update(job.customer_id, { email: recurringEmailInput.trim(), updated_at: n, _sync_status: 'pending' });
                    await addToSyncQueue('customers', job.customer_id, { email: recurringEmailInput.trim(), updated_at: n }, 'update');
                  } catch {}
                }
                await createRecurringJob(job, 'six_monthly', { reminderMode: recurringMode });
                showSuccess('6-monthly reminder set');
                setSheet(null);
              }} fullWidth>
                6-monthly
              </Button>
              <Button variant="primary" onClick={async () => {
                if (!job || !userId) return;
                if (recurringEmailInput.trim() && customer) {
                  try {
                    const n = new Date().toISOString();
                    await db.customers.update(job.customer_id, { email: recurringEmailInput.trim(), updated_at: n, _sync_status: 'pending' });
                    await addToSyncQueue('customers', job.customer_id, { email: recurringEmailInput.trim(), updated_at: n }, 'update');
                  } catch {}
                }
                await createRecurringJob(job, 'annual', { reminderMode: recurringMode });
                showSuccess('Annual reminder set');
                setSheet(null);
              }} fullWidth>
                Annual
              </Button>
              <div className="pt-2 mt-2 border-t border-brand-borderLight">
                <p className="text-label font-semibold text-brand-mid mb-2">Reminder mode</p>
                <div className="flex gap-2">
                  <button onClick={() => setRecurringMode('remind_me')} className={`flex-1 py-2 rounded-lg text-xs font-medium cursor-pointer ${recurringMode === 'remind_me' ? 'bg-status-blue text-white' : 'bg-brand-surface text-brand-dark'}`}>Remind me</button>
                  <button onClick={() => setRecurringMode('remind_client')} className={`flex-1 py-2 rounded-lg text-xs font-medium cursor-pointer ${recurringMode === 'remind_client' ? 'bg-status-blue text-white' : 'bg-brand-surface text-brand-dark'}`}>Auto-message</button>
                  <button onClick={() => setRecurringMode('both')} className={`flex-1 py-2 rounded-lg text-xs font-medium cursor-pointer ${recurringMode === 'both' ? 'bg-status-blue text-white' : 'bg-brand-surface text-brand-dark'}`}>Both</button>
                </div>
                {recurringMode !== 'remind_me' && <p className="text-xs text-brand-muted mt-1.5">Auto-message emails the client automatically when due</p>}
              </div>
            </>
          )}
        </div>
      </BottomSheet>

      {/* £0.00 job warning — no priced items yet */}
      <BottomSheet
        isOpen={sheet === 'zero_value_warning'}
        onClose={() => setSheet(null)}
        title="No price set for this job"
      >
        <p className="text-sm text-brand-dark mb-5">
          You haven't added any priced items yet. Add them now or start the job and add charges as you go.
        </p>
        <div className="flex flex-col gap-2">
          <Button variant="primary" fullWidth onClick={() => {
            setSheet(null);
            capture('zero_value_job_add_items', { source: 'job_detail' });
            if (job) navigate('/quote', { state: { jobId: job.id, customerId: job.customer_id, entryPoint: 'revise' } });
          }}>
            Add items
          </Button>
          <Button variant="secondary" fullWidth onClick={() => {
            setSheet(null);
            capture('zero_value_job_start_anyway', { source: 'job_detail' });
            doStartJob();
          }}>
            Start anyway
          </Button>
          <Button variant="ghost" onClick={() => setSheet(null)}>Cancel</Button>
        </div>
      </BottomSheet>

    </div>
  );
}
