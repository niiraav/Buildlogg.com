import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ChevronLeft, Phone, MessageCircle, MessageSquare, Clock, Banknote, Pencil, Building2, Check,
} from 'lucide-react';
import { db, type Job, type Customer, type LineItem, type WorkLogEntry, type Profile, type Payment } from '../../lib/db';
import { useAppStore } from '../../store/useAppStore';
import { BottomSheet, SheetRow } from '../../components/BottomSheet';
import { Button } from '../../components/Button';
import { MapPreview } from '../../components/MapPreview';
import { InvoiceItemRow, InvoiceTotalRow } from '../../components/InvoiceItemRow';
import { StatusBadge } from '../../components/StatusBadge';

/* ─── helpers ─── */

function now() { return new Date().toISOString(); }

function formatShortDate(d: Date): string {
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

function elapsedStr(start: string): string {
  const diff = Date.now() - new Date(start).getTime();
  const h = Math.floor(diff / (1000 * 60 * 60));
  const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  return `${h}h ${m}m`;
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

/* ─── types ─── */

type SheetState =
  | null
  | 'cancel'
  | 'add_charge'
  | 'mark_done'
  | 'add_note'
  | 'mark_paid'
  | 'send_reminder'
  | 'reschedule'
  | 'callout_charge'
  | 'booking_confirmation'
  | 'edit_details'
  | 'send_update';

/* ─── component ─── */

export default function JobDetail() {
  const navigate = useNavigate();
  const { jobId } = useParams<{ jobId: string }>();
  const userId = useAppStore((s) => s.userId);

  const [job, setJob] = useState<Job | null>(null);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [lineItems, setLineItems] = useState<LineItem[]>([]);
  const [workLog, setWorkLog] = useState<WorkLogEntry[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const [sheet, setSheet] = useState<SheetState>(null);
  const [chargeDesc, setChargeDesc] = useState('');
  const [chargeAmount, setChargeAmount] = useState('');
  const [noteText, setNoteText] = useState('');
  const [payments, setPayments] = useState<Payment[]>([]);

  /* Initialize callout amount from profile */
  useEffect(() => {
    if (profile?.callout_charge) {
      setCalloutAmount(String(profile.callout_charge));
    } else {
      setCalloutAmount('75');
    }
  }, [profile]);
  const [reminderText, setReminderText] = useState('');
  const [rescheduleDate, setRescheduleDate] = useState('');
  const [calloutDesc, setCalloutDesc] = useState('Callout charge');
  const [calloutAmount, setCalloutAmount] = useState('');
  const [workLogExpanded, setWorkLogExpanded] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editStart, setEditStart] = useState('');
  const [editEnd, setEditEnd] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [updateMessage, setUpdateMessage] = useState('');
  const [bookingMessage, setBookingMessage] = useState('');

  /* ─── load data ─── */
  const refresh = useCallback(async () => {
    if (!jobId || !userId) { setLoading(false); return; }
    const j = await db.jobs.get(jobId);
    if (!j || j.user_id !== userId) { setLoading(false); return; }
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

    setLoading(false);
  }, [jobId, userId]);

  useEffect(() => { refresh(); }, [refresh]);

  /* ─── derived ─── */
  const total = useMemo(() => jobTotal(lineItems), [lineItems]);

  const hasContactButtons = useMemo(() => {
    if (!job) return false;
    return ['booked', 'in_progress', 'awaiting_payment', 'no_show', 'quoted'].includes(job.status);
  }, [job]);

  const statusContext = useMemo(() => {
    if (!job) return '';
    if (job.status === 'booked' && job.scheduled_start) {
      return ` · ${formatShortDate(new Date(job.scheduled_start))} · ${formatTime(new Date(job.scheduled_start))}`;
    }
    if (job.status === 'in_progress' && job.actual_start) {
      return ` · ${elapsedStr(job.actual_start)}`;
    }
    if (job.status === 'awaiting_payment' && job.invoice_sent_at) {
      const days = Math.floor((Date.now() - new Date(job.invoice_sent_at).getTime()) / (1000 * 60 * 60 * 24));
      if (days >= 30) return ` · Overdue · ${days}d`;
      if (days >= 1) return ` · Chase · ${days}d`;
      return '';
    }
    if (job.status === 'no_show' && job.scheduled_start) {
      return ` · ${formatShortDate(new Date(job.scheduled_start))} · ${formatTime(new Date(job.scheduled_start))}`;
    }
    if (job.status === 'paid' && job.actual_end && payments.length > 0) {
      const lastPayment = payments[payments.length - 1];
      return ` · ${formatShortDate(new Date(job.actual_end))} · ${lastPayment.method === 'cash' ? 'Cash' : lastPayment.method === 'bank_transfer' ? 'Bank Transfer' : 'Other'} · £${total.toFixed(2)}`;
    }
    if (job.status === 'cancelled' && job.updated_at) {
      return ` · ${formatShortDate(new Date(job.updated_at))}`;
    }
    if (job.status === 'quoted' && job.quote_sent_at) {
      const days = Math.floor((Date.now() - new Date(job.quote_sent_at).getTime()) / (1000 * 60 * 60 * 24));
      return ` · Sent ${days}d ago`;
    }
    if (job.status === 'written_off' && job.updated_at) {
      return ` · ${formatShortDate(new Date(job.updated_at))}`;
    }
    return '';
  }, [job]);

  /* ─── actions ─── */

  const addToSyncQueue = async (table: string, id: string, payload: Record<string, unknown>) => {
    await db.sync_queue.add({
      operation: 'update',
      table_name: table,
      record_id: id,
      payload,
      created_at: now(),
      retry_count: 0,
    });
  };


  const handleAddCharge = async () => {
    const amount = parseFloat(chargeAmount);
    if (!chargeDesc.trim() || isNaN(amount) || amount <= 0) return;
    const n = now();
    const liId = crypto.randomUUID();
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
    await db.work_log.add({
      id: crypto.randomUUID(),
      job_id: jobId!,
      type: 'charge',
      description: `${chargeDesc.trim()} — £${amount.toFixed(2)}`,
      amount,
      line_item_id: liId,
      created_at: n,
      _sync_status: 'pending',
    });
    await addToSyncQueue('line_items', liId, { description: chargeDesc.trim(), amount, job_id: jobId!, added_on_site: true });
    await addToSyncQueue('work_log', liId, { job_id: jobId!, type: 'charge', description: `${chargeDesc.trim()} — £${amount.toFixed(2)}`, amount });
    setChargeDesc('');
    setChargeAmount('');
    setSheet(null);
    refresh();
  };

  const handleAddNote = async () => {
    if (!noteText.trim()) return;
    const n = now();
    await db.work_log.add({
      id: crypto.randomUUID(),
      job_id: jobId!,
      type: 'note',
      description: noteText.trim(),
      created_at: n,
      _sync_status: 'pending',
    });
    await addToSyncQueue('work_log', jobId!, { job_id: jobId!, type: 'note', description: noteText.trim() });
    setNoteText('');
    setSheet(null);
    refresh();
  };

  const handleCancelJob = async (reason: 'customer_cancelled' | 'dave_cancelled') => {
    if (!job) return;
    const n = now();
    await db.jobs.update(job.id, {
      status: 'cancelled',
      cancellation_reason: reason,
      updated_at: n,
      _sync_status: 'pending',
    });
    await db.work_log.add({
      id: crypto.randomUUID(),
      job_id: job.id,
      type: 'status_change',
      description: reason === 'customer_cancelled' ? 'Customer cancelled' : 'I cancelled',
      created_at: n,
      _sync_status: 'pending',
    });
    await addToSyncQueue('jobs', job.id, { status: 'cancelled', cancellation_reason: reason, updated_at: n });
    setSheet(null);
    refresh();
  };

  const handleNotHome = async () => {
    if (!job) return;
    const n = now();
    await db.jobs.update(job.id, {
      status: 'no_show',
      actual_end: n,
      updated_at: n,
      _sync_status: 'pending',
    });
    await db.work_log.add({
      id: crypto.randomUUID(),
      job_id: job.id,
      type: 'status_change',
      description: 'Customer not home — no-show logged',
      created_at: n,
      _sync_status: 'pending',
    });
    await addToSyncQueue('jobs', job.id, { status: 'no_show', actual_end: n, updated_at: n });
    refresh();
  };

  const handleMarkDone = async (method: 'cash' | 'bank_transfer' | 'other' | 'not_yet') => {
    if (!job) return;
    const n = now();
    if (method === 'not_yet') {
      await db.jobs.update(job.id, {
        status: 'awaiting_payment',
        actual_end: n,
        invoice_sent_at: n,
        updated_at: n,
        _sync_status: 'pending',
      });
      await db.work_log.add({
        id: crypto.randomUUID(),
        job_id: job.id,
        type: 'status_change',
        description: 'Job completed — payment pending',
        created_at: n,
        _sync_status: 'pending',
      });
      await addToSyncQueue('jobs', job.id, { status: 'awaiting_payment', actual_end: n, invoice_sent_at: n, updated_at: n });
    } else {
      const payId = crypto.randomUUID();
      await db.payments.add({
        id: payId,
        job_id: job.id,
        type: 'full',
        method,
        amount: total,
        recorded_at: n,
        created_at: n,
        _sync_status: 'pending',
      });
      await db.jobs.update(job.id, {
        status: 'paid',
        actual_end: n,
        updated_at: n,
        _sync_status: 'pending',
      });
      await db.work_log.add({
        id: crypto.randomUUID(),
        job_id: job.id,
        type: 'status_change',
        description: `Payment recorded — ${method === 'cash' ? 'Cash' : method === 'bank_transfer' ? 'Bank Transfer' : 'Other'} · £${total.toFixed(2)}`,
        created_at: n,
        _sync_status: 'pending',
      });
      await addToSyncQueue('payments', payId, { job_id: job.id, type: 'full', method, amount: total });
      await addToSyncQueue('jobs', job.id, { status: 'paid', actual_end: n, updated_at: n });
    }
    setSheet(null);
    refresh();
  };

  const handleMarkAsPaid = async (method: 'cash' | 'bank_transfer' | 'other') => {
    if (!job) return;
    const n = now();
    const paymentType = payments.length > 0 ? 'balance' : 'full';
    const payId = crypto.randomUUID();
    await db.payments.add({
      id: payId,
      job_id: job.id,
      type: paymentType,
      method,
      amount: total,
      recorded_at: n,
      created_at: n,
      _sync_status: 'pending',
    });
    await db.jobs.update(job.id, {
      status: 'paid',
      updated_at: n,
      _sync_status: 'pending',
    });
    await db.work_log.add({
      id: crypto.randomUUID(),
      job_id: job.id,
      type: 'status_change',
      description: `Payment recorded — ${method === 'cash' ? 'Cash' : method === 'bank_transfer' ? 'Bank Transfer' : 'Other'} · £${total.toFixed(2)}`,
      created_at: n,
      _sync_status: 'pending',
    });
    await addToSyncQueue('payments', payId, { job_id: job.id, type: paymentType, method, amount: total });
    await addToSyncQueue('jobs', job.id, { status: 'paid', updated_at: n });
    setSheet(null);
    refresh();
  };

  

  const handleMarkAsBooked = async () => {
    if (!job || !customer) return;
    const n = now();
    await db.jobs.update(job.id, {
      status: 'booked',
      updated_at: n,
      _sync_status: 'pending',
    });
    await db.work_log.add({
      id: crypto.randomUUID(),
      job_id: job.id,
      type: 'status_change',
      description: 'Quote accepted — marked as booked',
      created_at: n,
      _sync_status: 'pending',
    });
    await addToSyncQueue('jobs', job.id, { status: 'booked', updated_at: n });
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
    setSheet('booking_confirmation');
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
    await db.work_log.add({
      id: crypto.randomUUID(),
      job_id: job.id,
      type: 'note',
      description: `Rescheduled to ${formatShortDate(new Date(rescheduleDate))} · ${formatTime(new Date(rescheduleDate))}`,
      created_at: n,
      _sync_status: 'pending',
    });
    await addToSyncQueue('jobs', job.id, { status: 'booked', scheduled_start: rescheduleDate, updated_at: n });
    setRescheduleDate('');
    setSheet(null);
    refresh();
  };

  const handleEditDetails = async () => {
    if (!job) return;
    const n = now();
    const changes: string[] = [];
    if (editTitle.trim() && editTitle.trim() !== job.title) changes.push('title');
    if (editStart !== (job.scheduled_start || '')) changes.push('date/time');
    if (editNotes.trim() !== (job.notes || '')) changes.push('notes');

    await db.jobs.update(job.id, {
      title: editTitle.trim() || job.title,
      scheduled_start: editStart || undefined,
      scheduled_end: editEnd || undefined,
      notes: editNotes.trim() || undefined,
      updated_at: n,
      _sync_status: 'pending',
    });
    await addToSyncQueue('jobs', job.id, {
      title: editTitle.trim() || job.title,
      scheduled_start: editStart || undefined,
      scheduled_end: editEnd || undefined,
      notes: editNotes.trim() || undefined,
      updated_at: n,
    });

    if (changes.length > 0) {
      await db.work_log.add({
        id: crypto.randomUUID(),
        job_id: job.id,
        type: 'status_change',
        description: `Job details updated (${changes.join(', ')})`,
        created_at: n,
        _sync_status: 'pending',
      });
      // Generate update message for customer
      const customerFirstName = customer?.name.split(' ')[0] || 'there';
      const business = profile?.business_name || 'Your tradesperson';
      const changeText = changes.includes('date/time') && editStart
        ? `Your job is now scheduled for ${formatShortDate(new Date(editStart))} · ${formatTime(new Date(editStart))}.`
        : 'There are some updates to your job details.';
      const msg = `Hi ${customerFirstName}, ${changeText} ${job.title}. — ${business}`;
      setUpdateMessage(msg);
      setSheet('send_update');
    } else {
      setSheet(null);
    }
    refresh();
  };

  const handleSendUpdate = async (method: 'whatsapp' | 'sms') => {
    if (!customer || !updateMessage) return;
    const phone = customer.phone.replace(/\D/g, '');
    const encoded = encodeURIComponent(updateMessage);

    if (method === 'whatsapp') {
      window.open(`https://wa.me/${phone}?text=${encoded}`, '_blank');
    } else if (method === 'sms') {
      window.open(`sms:${customer.phone}?body=${encoded}`, '_self');
    }

    const n = now();
    const logId = crypto.randomUUID();
    await db.work_log.add({
      id: logId,
      job_id: jobId!,
      type: 'customer_notified',
      description: 'Update sent to customer via ' + (method === 'whatsapp' ? 'WhatsApp' : 'SMS'),
      created_at: n,
      _sync_status: 'pending',
    });
    await addToSyncQueue('work_log', logId, {
      id: logId,
      job_id: jobId!,
      type: 'customer_notified',
      description: 'Update sent to customer via ' + (method === 'whatsapp' ? 'WhatsApp' : 'SMS'),
      created_at: n,
    });

    setSheet(null);
    setUpdateMessage('');
  };

  const handleSendBookingConfirmation = async (method: 'whatsapp' | 'sms') => {
    if (!customer || !bookingMessage) return;
    const phone = customer.phone.replace(/\D/g, '');
    const encoded = encodeURIComponent(bookingMessage);

    if (method === 'whatsapp') {
      window.open(`https://wa.me/${phone}?text=${encoded}`, '_blank');
    } else if (method === 'sms') {
      window.open(`sms:${customer.phone}?body=${encoded}`, '_self');
    }

    const n = now();
    const logId = crypto.randomUUID();
    await db.work_log.add({
      id: logId,
      job_id: jobId!,
      type: 'note',
      description: `Booking confirmation sent via ${method === 'whatsapp' ? 'WhatsApp' : 'SMS'}`,
      created_at: n,
      _sync_status: 'pending',
    });
    await addToSyncQueue('work_log', logId, {
      id: logId,
      job_id: jobId!,
      type: 'note',
      description: `Booking confirmation sent via ${method === 'whatsapp' ? 'WhatsApp' : 'SMS'}`,
      created_at: n,
    });

    setSheet(null);
  };

  const handleCalloutCharge = async () => {
    if (!job || !customer) return;
    const amount = parseFloat(calloutAmount);
    if (isNaN(amount) || amount <= 0) return;
    const n = now();
    const newJobId = crypto.randomUUID();
    await db.jobs.add({
      id: newJobId,
      user_id: job.user_id,
      customer_id: job.customer_id,
      title: 'Callout charge',
      status: 'awaiting_payment',
      payment_terms: 'invoice',
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
    await db.work_log.add({
      id: crypto.randomUUID(),
      job_id: newJobId,
      type: 'status_change',
      description: 'Callout charge invoice created',
      created_at: n,
      _sync_status: 'pending',
    });
    await addToSyncQueue('jobs', newJobId, { user_id: job.user_id, customer_id: job.customer_id, title: 'Callout charge', status: 'awaiting_payment', payment_terms: 'invoice', invoice_sent_at: n, is_multi_day: false });
    await addToSyncQueue('line_items', liId, { job_id: newJobId, description: calloutDesc.trim() || 'Callout charge', amount, sort_order: 0 });
    setCalloutDesc('Callout charge');
    setCalloutAmount(profile?.callout_charge ? String(profile.callout_charge) : '75');
    setSheet(null);
    navigate(`/jobs/${newJobId}`);
  };

  const handleWriteOff = async () => {
    if (!job) return;
    const n = now();
    await db.jobs.update(job.id, {
      status: 'written_off',
      updated_at: n,
      _sync_status: 'pending',
    });
    await db.work_log.add({
      id: crypto.randomUUID(),
      job_id: job.id,
      type: 'status_change',
      description: `Job written off — £${total.toFixed(2)}`,
      created_at: n,
      _sync_status: 'pending',
    });
    await addToSyncQueue('jobs', job.id, { status: 'written_off', updated_at: n });
    refresh();
  };

  const handleSendReminder = async (method: 'whatsapp' | 'sms') => {
    if (!job || !customer) return;
    const n = now();
    const defaultText = `Hi ${customer.name}, just a reminder about the invoice for ${job.title}. Amount due: £${total.toFixed(2)}. Thanks, ${profile?.full_name?.split(' ')[0] || 'Dave'}`;
    const body = reminderText || defaultText;
    const encodedBody = encodeURIComponent(body);

    if (method === 'whatsapp') {
      const phone = customer.phone.replace(/^\+/, '').replace(/^0/, '44');
      window.open(`https://wa.me/${phone}?text=${encodedBody}`, '_blank');
    } else {
      window.open(`sms:${customer.phone}?body=${encodedBody}`, '_blank');
    }

    await db.work_log.add({
      id: crypto.randomUUID(),
      job_id: job.id,
      type: 'status_change',
      description: `Reminder sent via ${method === 'whatsapp' ? 'WhatsApp' : 'SMS'}`,
      created_at: n,
      _sync_status: 'pending',
    });
    await db.jobs.update(job.id, {
      invoice_sent_at: n,
      updated_at: n,
      _sync_status: 'pending',
    });
    await addToSyncQueue('jobs', job.id, { invoice_sent_at: n, updated_at: n });
    setSheet(null);
    refresh();
  };

  const handleCall = () => {
    if (customer?.phone) window.open(`tel:${customer.phone}`, '_self');
  };

  const handleMessage = () => {
    if (!customer?.phone) return;
    const body = encodeURIComponent(`Hi ${customer.name}, it's ${profile?.full_name?.split(' ')[0] || 'Dave'}.`);
    window.open(`sms:${customer.phone}?body=${body}`, '_blank');
  };

  /* ─── render helpers ─── */

  const renderTerminalFooter = () => (
    <div className="sticky bottom-0 z-30 bg-white border-t border-[#F3F4F6] shadow-sheet">
      <div className="flex flex-col gap-2 px-4 py-3 pb-[calc(32px_+_env(safe-area-inset-bottom))]">
        <Button variant="primary" onClick={() => navigate('/', { replace: true })}>
          Go Home
        </Button>
      </div>
    </div>
  );

  const renderHeader = () => (
    <div className="px-4 pt-2 pb-3 border-b border-[#F3F4F6] shrink-0">
      <button
        onClick={() => navigate(-1)}
        className="inline-flex items-center gap-1 min-h-[44px] pr-4 text-[14px] font-medium text-[#6B7280] cursor-pointer"
      >
        <ChevronLeft size={22} color="#9CA3AF" className="-mt-px" />
        Back
      </button>
      <div className="flex items-start gap-2.5 mt-0.5">
        <div className="flex-1 min-w-0">
          <h1 className="text-[18px] font-bold text-[#111827] truncate">{customer?.name}</h1>
          <p className="text-[13px] font-medium text-[#6B7280] mt-0.5 truncate">{job?.title}</p>
        </div>
        {hasContactButtons && (
          <div className="flex gap-2 shrink-0 pt-0.5">
            <button
              onClick={handleCall}
              className="w-10 h-10 border border-[#D1D5DB] rounded-[10px] bg-[#F9FAFB] flex items-center justify-center cursor-pointer"
              aria-label="Call customer"
            >
              <Phone size={16} color="#374151" />
            </button>
            <button
              onClick={handleMessage}
              className="w-10 h-10 border border-[#D1D5DB] rounded-[10px] bg-[#F9FAFB] flex items-center justify-center cursor-pointer"
              aria-label="Message customer"
            >
              <MessageCircle size={16} color="#374151" />
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

  const renderStatusBadge = () => {
    if (!job) return null;
    return (
      <div className="mt-4 mb-5">
        <StatusBadge status={job.status} />
        {statusContext && (
          <span className="text-[11px] font-bold text-[#6B7280] ml-1">{statusContext}</span>
        )}
      </div>
    );
  };

  const renderBookedBody = () => {
    if (!job || !customer) return null;
    return (
      <div className="flex-1 overflow-y-auto px-4 pt-4 pb-2">
        {renderStatusBadge()}
        {job.status === 'booked' && confirmedAt && (
          <div className="flex items-center gap-1.5 -mt-3 mb-4">
            <Check className="w-3.5 h-3.5 text-[#16A34A]" />
            <span className="text-[11px] font-semibold text-[#16A34A]">
              Confirmed by customer · {formatShortDate(new Date(confirmedAt))}
            </span>
          </div>
        )}

        {customer.address && (
          <div className="mb-4">
            <MapPreview address={customer.address} />
          </div>
        )}

        {/* Info card */}
        <div className="border border-[#E5E7EB] rounded-[10px] overflow-hidden mb-4 divide-y divide-[#F9FAFB]">
          <div className="flex justify-between items-center px-4 py-3">
            <span className="text-[13px] text-[#9CA3AF]">Date &amp; time</span>
            <span className="text-[13px] font-medium text-[#111827] text-right">
              {formatDateTimeRange(job.scheduled_start, job.scheduled_end)}
            </span>
          </div>
          <div className="flex justify-between items-center px-4 py-3">
            <span className="text-[13px] text-[#9CA3AF]">Payment terms</span>
            <span className="text-[13px] font-medium text-[#111827] text-right">
              {paymentTermsLabel(job.payment_terms)}
            </span>
          </div>
          {job.payment_terms === 'deposit' && job.deposit_pct && (
            <div className="flex justify-between items-center px-4 py-3">
              <span className="text-[13px] text-[#9CA3AF]">Deposit</span>
              <span className="text-[13px] font-medium text-[#111827] text-right">
                {job.deposit_pct}% (£{((job.deposit_pct / 100) * total).toFixed(2)})
              </span>
            </div>
          )}
        </div>

        {/* Invoice items */}
        <div className="flex items-center justify-between mb-2.5">
          <span className="text-[10px] font-bold text-[#6B7280] uppercase tracking-[0.7px]">Quote items</span>
        </div>
        <div className="border border-[#E5E7EB] rounded-[10px] overflow-hidden mb-5">
          {lineItems.map((item) => (
            <InvoiceItemRow
              key={item.id}
              item={item}
              showRemove={false}
            />
          ))}
          <InvoiceTotalRow total={total} />
        </div>
      </div>
    );
  };

  const renderInProgressBody = () => {
    if (!job) return null;
    return (
      <div className="flex-1 overflow-y-auto px-4 pt-4 pb-2">
        {renderStatusBadge()}

        {/* Work log */}
        <div className="mb-5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-bold text-[#6B7280] uppercase tracking-[0.7px]">Work log</span>
          </div>
          {workLog.length === 0 ? (
            <p className="text-[13px] text-[#9CA3AF] italic py-2">No work logged yet</p>
          ) : (
            <div>
              {workLog.map((log) => (
                <div key={log.id} className="flex gap-2.5 py-2 border-b border-[#F3F4F6] last:border-b-0 items-start">
                  <span className="text-[11px] text-[#9CA3AF] whitespace-nowrap shrink-0 pt-0.5 min-w-[46px]">
                    {formatLogTime(log.created_at)}
                  </span>
                  <span className="text-[13px] text-[#374151] flex-1 leading-relaxed">
                    {log.description}
                  </span>
                  {log.amount !== undefined && log.amount > 0 && (
                    <span className="text-[12px] font-bold text-[#15803D] shrink-0 whitespace-nowrap">
                      +£{log.amount.toFixed(2)}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Invoice items */}
        <div className="flex items-center justify-between mb-2.5">
          <span className="text-[10px] font-bold text-[#6B7280] uppercase tracking-[0.7px]">Invoice items</span>
        </div>
        <div className="border border-[#E5E7EB] rounded-[10px] overflow-hidden mb-5">
          {lineItems.map((item) => (
            <InvoiceItemRow
              key={item.id}
              item={item}
              showRemove={false}
            />
          ))}
          {/* Inline add note */}
          <div
            onClick={() => setSheet('add_note')}
            className="min-h-[52px] flex items-center gap-2 px-3.5 border-t border-[#F3F4F6] cursor-pointer"
          >
            <span className="text-[13px] font-semibold text-[#6B7280]">+ Add note</span>
            <span className="text-[11px] text-[#9CA3AF]">Private</span>
          </div>
          {/* Inline add charge */}
          <div
            onClick={() => setSheet('add_charge')}
            className="min-h-[52px] flex items-center gap-2 px-3.5 border-t border-[#F3F4F6] cursor-pointer"
          >
            <span className="text-[13px] font-semibold text-[#6B7280]">+ Add charge</span>
            <span className="text-[11px] text-[#9CA3AF]">Added to invoice</span>
          </div>
          <InvoiceTotalRow total={total} />
        </div>
      </div>
    );
  };


  const renderQuotedBody = () => {
    if (!job || !customer) return null;
    return (
      <div className="flex-1 overflow-y-auto px-4 pt-4 pb-2">
        {renderStatusBadge()}

        <div className="mb-4">
          <div className="text-[10px] font-bold text-[#6B7280] uppercase tracking-[0.7px] mb-2.5">
            Quote
          </div>
          <div className="border border-[#E5E7EB] rounded-xl overflow-hidden">
            <div className="px-4 pt-3.5 pb-2.5 border-b border-[#F3F4F6]">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[12px] font-medium text-[#9CA3AF]">{job?.quote_number || 'Quote'}</span>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-[3px] rounded-md bg-[#EFF6FF] text-[#1D4ED8] text-[10px] font-bold uppercase tracking-[0.4px]">
                  <span className="w-[5px] h-[5px] rounded-full bg-[#1D4ED8]" />
                  Quoted
                </span>
              </div>
              <div className="text-[18px] font-bold text-[#111827]">{job.title}</div>
              <div className="text-[13px] text-[#6B7280] mt-0.5">{customer.name}</div>
            </div>
            <div className="border-b border-[#F3F4F6]">
              <div className="flex justify-between items-center px-4 py-2.5 border-b border-[#F9FAFB]">
                <span className="text-[13px] text-[#9CA3AF]">Date &amp; time</span>
                <span className="text-[13px] font-medium text-[#111827] text-right">
                  {formatDateTimeRange(job.scheduled_start, job.scheduled_end)}
                </span>
              </div>
              <div className="flex justify-between items-center px-4 py-2.5 border-b border-[#F9FAFB]">
                <span className="text-[13px] text-[#9CA3AF]">Payment</span>
                <span className="text-[13px] font-medium text-[#111827] text-right">
                  {paymentTermsLabel(job.payment_terms)}
                </span>
              </div>
              <div className="flex justify-between items-center px-4 py-2.5">
                <span className="text-[13px] text-[#9CA3AF]">Valid until</span>
                <span className="text-[13px] font-medium text-[#111827] text-right">
                  {job.quote_expires_at
                    ? new Date(job.quote_expires_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
                    : '—'}
                </span>
              </div>
            </div>
            <div className="px-4 pt-3 pb-0">
              {lineItems.map((item, idx) => (
                <div key={item.id} className={`flex justify-between py-1.5 text-[13px] text-[#374151] ${idx < lineItems.length - 1 ? 'border-b border-[#F9FAFB]' : ''}`}>
                  <span>{item.description}</span>
                  <span className="font-medium text-[#111827]">£{item.amount.toFixed(2)}</span>
                </div>
              ))}
            </div>
            <div className="flex justify-between items-center px-4 py-3 border-t-[1.5px] border-[#111827] mt-0">
              <span className="text-[16px] font-bold text-[#111827]">Total</span>
              <span className="text-[20px] font-extrabold text-[#111827]">£{total.toFixed(2)}</span>
            </div>
            <div className="px-4 py-3 border-t border-[#F3F4F6] text-[12px] text-[#9CA3AF] leading-relaxed">
              {profile?.business_name || 'Your business'}
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderBookedFooter = () => (
    <div className="sticky bottom-0 z-30 bg-white border-t border-[#F3F4F6] shadow-sheet">
      <div className="flex flex-col gap-2 px-4 py-3 pb-[calc(32px_+_env(safe-area-inset-bottom))]">
        <Button variant="primary" onClick={() => navigate('/', { replace: true })}>
          Go Home
        </Button>
        <Button variant="secondary" onClick={() => {
          if (job) {
            setEditTitle(job.title);
            setEditStart(job.scheduled_start || '');
            setEditEnd(job.scheduled_end || '');
            setEditNotes(job.notes || '');
            setSheet('edit_details');
          }
        }}>
          Edit details
        </Button>
        <button
          onClick={() => setSheet('cancel')}
          className="min-h-[44px] text-[13px] text-[#EF4444] cursor-pointer underline underline-offset-2 text-center"
        >
          Cancel job
        </button>
      </div>
    </div>
  );

  const renderQuotedFooter = () => (
    <div className="sticky bottom-0 z-30 bg-white border-t border-[#F3F4F6] shadow-sheet">
      <div className="flex flex-col gap-2 px-4 py-3 pb-[calc(32px_+_env(safe-area-inset-bottom))]">
        <Button variant="primary" onClick={handleMarkAsBooked}>
          Mark as Booked
        </Button>
      </div>
    </div>
  );

  const renderInProgressFooter = () => (
    <div className="sticky bottom-0 z-30 bg-white border-t border-[#F3F4F6] shadow-sheet">
      <div className="flex flex-col gap-2 px-4 py-3 pb-[calc(32px_+_env(safe-area-inset-bottom))]">
        <Button variant="primary" onClick={() => setSheet('mark_done')}>
          Mark Done
        </Button>
        <button
          onClick={handleNotHome}
          className="min-h-[44px] text-[12px] text-[#9CA3AF] cursor-pointer underline underline-offset-2 text-center"
        >
          Customer not home?
        </button>
      </div>
    </div>
  );

  const renderAwaitingPaymentBody = () => {
    if (!job || !customer) return null;
    const days = job.invoice_sent_at
      ? Math.floor((Date.now() - new Date(job.invoice_sent_at).getTime()) / (1000 * 60 * 60 * 24))
      : 0;

    return (
      <div className="flex-1 overflow-y-auto px-4 pt-4 pb-2">
        {renderStatusBadge()}

        {/* Amount card */}
        <div className="border border-[#FDE68A] bg-[#FFFBEB] rounded-xl px-5 py-6 text-center mb-5">
          <div className="text-[11px] font-bold uppercase tracking-[0.5px] text-[#B45309] mb-2">
            Total due
          </div>
          <div className="text-[36px] font-extrabold text-[#111827] tracking-tight">
            £{total.toFixed(2)}
          </div>
          <div className="text-[12px] text-[#B45309] mt-2">
            {job.invoice_sent_at ? `Invoice sent · ${days} day${days !== 1 ? 's' : ''} ago` : 'Payment pending'}
          </div>
        </div>

        {/* Invoice items (locked) */}
        <div className="flex items-center justify-between mb-2.5">
          <span className="text-[10px] font-bold text-[#6B7280] uppercase tracking-[0.7px]">Invoice items</span>
        </div>
        <div className="border border-[#E5E7EB] rounded-[10px] overflow-hidden mb-5">
          {lineItems.map((item) => (
            <InvoiceItemRow key={item.id} item={item} showRemove={false} />
          ))}
          <InvoiceTotalRow total={total} />
        </div>
      </div>
    );
  };

  

  const renderNoShowBody = () => {
    if (!job || !customer) return null;
    return (
      <div className="flex-1 overflow-y-auto px-4 pt-4 pb-2">
        {renderStatusBadge()}

        <div className="border border-[#E5E7EB] rounded-[10px] p-4 mb-5">
          <div className="text-[10px] font-bold uppercase tracking-[0.5px] text-[#9CA3AF] mb-2">
            What happened
          </div>
          <div className="text-[14px] text-[#374151] leading-relaxed">
            {profile?.full_name?.split(' ')[0] || 'Dave'} arrived at {job.actual_end ? formatTime(new Date(job.actual_end)) : '—'} — customer not home
          </div>
        </div>
      </div>
    );
  };

  const renderNoShowFooter = () => (
    <div className="sticky bottom-0 z-30 bg-white border-t border-[#F3F4F6] shadow-sheet">
      <div className="flex flex-col gap-2 px-4 py-3 pb-[calc(32px_+_env(safe-area-inset-bottom))]">
        <Button variant="primary" onClick={() => setSheet('reschedule')}>
          Reschedule
        </Button>
        <Button variant="secondary" onClick={() => setSheet('callout_charge')}>
          Charge callout
        </Button>
        <div className="flex items-center justify-center gap-6 py-1">
          <button
            onClick={() => setSheet('cancel')}
            className="min-h-[44px] text-[13px] text-[#9CA3AF] cursor-pointer underline underline-offset-2 text-center"
          >
            Cancel / write off
          </button>
        </div>
      </div>
    </div>
  );

  const renderPaidBody = () => {
    if (!job) return null;
    const lastPayment = payments.length > 0 ? payments[payments.length - 1] : null;
    const visibleLogs = workLogExpanded ? workLog : workLog.slice(0, 3);
    return (
      <div className="flex-1 overflow-y-auto px-4 pt-4 pb-2">
        {renderStatusBadge()}

        <div className="border border-[#E5E7EB] rounded-[10px] p-4 mb-5">
          <div className="text-[10px] font-bold uppercase tracking-[0.5px] text-[#9CA3AF] mb-2">
            Payment record
          </div>
          <div className="text-[15px] font-bold text-[#15803D] mb-1">
            Paid
          </div>
          <div className="text-[13px] text-[#6B7280] mb-0.5">
            {lastPayment?.method === 'cash' ? 'Cash' : lastPayment?.method === 'bank_transfer' ? 'Bank Transfer' : 'Other'} · £{total.toFixed(2)}
          </div>
          <div className="text-[12px] text-[#9CA3AF]">
            Recorded {job.actual_end ? formatShortDate(new Date(job.actual_end)) : '—'}
          </div>
        </div>

        <div className="mb-5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-bold text-[#6B7280] uppercase tracking-[0.7px]">Work log</span>
          </div>
          {workLog.length === 0 ? (
            <p className="text-[13px] text-[#9CA3AF] italic py-2">No work logged</p>
          ) : (
            <div>
              {visibleLogs.map((log) => (
                <div key={log.id} className="flex gap-2.5 py-2 border-b border-[#F3F4F6] last:border-b-0 items-start">
                  <span className="text-[11px] text-[#9CA3AF] whitespace-nowrap shrink-0 pt-0.5 min-w-[46px]">
                    {formatLogTime(log.created_at)}
                  </span>
                  <span className="text-[13px] text-[#374151] flex-1 leading-relaxed">
                    {log.description}
                  </span>
                  {log.amount !== undefined && log.amount > 0 && (
                    <span className="text-[12px] font-bold text-[#15803D] shrink-0 whitespace-nowrap">
                      +£{log.amount.toFixed(2)}
                    </span>
                  )}
                </div>
              ))}
              {workLog.length > 3 && (
                <button
                  onClick={() => setWorkLogExpanded(!workLogExpanded)}
                  className="text-[12px] text-[#6B7280] underline underline-offset-2 cursor-pointer mt-1"
                >
                  {workLogExpanded ? 'Show less' : `Show ${workLog.length - 3} more`}
                </button>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between mb-2.5">
          <span className="text-[10px] font-bold text-[#6B7280] uppercase tracking-[0.7px]">Invoice items</span>
        </div>
        <div className="border border-[#E5E7EB] rounded-[10px] overflow-hidden mb-5">
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
      <div className="flex-1 overflow-y-auto px-4 pt-4 pb-2">
        {renderStatusBadge()}

        <div className="border border-[#E5E7EB] rounded-[10px] p-4 mb-5">
          <div className="text-[10px] font-bold uppercase tracking-[0.5px] text-[#9CA3AF] mb-2">
            Reason
          </div>
          <div className="text-[14px] text-[#374151] leading-relaxed">
            {job.cancellation_reason === 'customer_cancelled' ? 'Customer cancelled' : 'I cancelled'}
          </div>
        </div>

        <div className="border border-[#E5E7EB] rounded-[10px] p-4 mb-5">
          <div className="text-[10px] font-bold uppercase tracking-[0.5px] text-[#9CA3AF] mb-2">
            Notes
          </div>
          {job.notes ? (
            <div className="text-[13px] text-[#374151] leading-relaxed">
              {job.notes}
            </div>
          ) : (
            <p className="text-[13px] text-[#D1D5DB] italic leading-relaxed">
              Tap to add a note about this cancellation…
            </p>
          )}
        </div>
      </div>
    );
  };

  const renderWrittenOffBody = () => {
    if (!job) return null;
    return (
      <div className="flex-1 overflow-y-auto px-4 pt-4 pb-2">
        {renderStatusBadge()}

        <div className="border border-[#E5E7EB] rounded-[10px] p-4 mb-5">
          <div className="text-[10px] font-bold uppercase tracking-[0.5px] text-[#9CA3AF] mb-2">
            Amount written off
          </div>
          <div className="text-[28px] font-extrabold text-[#111827] my-1 tracking-[-0.5px]">
            £{total.toFixed(2)}
          </div>
          <div className="text-[13px] text-[#9CA3AF] mt-2">
            Logged as bad debt · not counted in income
          </div>
        </div>

        <div className="mb-5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-bold text-[#6B7280] uppercase tracking-[0.7px]">Work log</span>
          </div>
          {workLog.length === 0 ? (
            <p className="text-[13px] text-[#9CA3AF] italic py-2">No work logged</p>
          ) : (
            <div>
              {workLog.map((log) => (
                <div key={log.id} className="flex gap-2.5 py-2 border-b border-[#F3F4F6] last:border-b-0 items-start">
                  <span className="text-[11px] text-[#9CA3AF] whitespace-nowrap shrink-0 pt-0.5 min-w-[46px]">
                    {formatLogTime(log.created_at)}
                  </span>
                  <span className="text-[13px] text-[#374151] flex-1 leading-relaxed">
                    {log.description}
                  </span>
                  {log.amount !== undefined && log.amount > 0 && (
                    <span className="text-[12px] font-bold text-[#15803D] shrink-0 whitespace-nowrap">
                      +£{log.amount.toFixed(2)}
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

  const renderAwaitingPaymentFooter = () => (
    <div className="sticky bottom-0 z-30 bg-white border-t border-[#F3F4F6] shadow-sheet">
      <div className="flex flex-col gap-2 px-4 py-3 pb-[calc(32px_+_env(safe-area-inset-bottom))]">
        <Button variant="primary" onClick={() => setSheet('mark_paid')}>
          Mark as Paid
        </Button>
        <Button variant="secondary" onClick={() => setSheet('send_reminder')}>
          Send reminder
        </Button>
        <button
          onClick={handleWriteOff}
          className="min-h-[44px] text-[12px] text-[#9CA3AF] cursor-pointer underline underline-offset-2 text-center"
        >
          Write off
        </button>
      </div>
    </div>
  );

  /* ─── sheets ─── */

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

  const renderAddChargeSheet = () => (
    <BottomSheet
      isOpen={sheet === 'add_charge'}
      onClose={() => setSheet(null)}
      title="Add a charge"
      subtitle="Added to invoice · visible to customer"
    >
      <div className="mb-3">
        <label className="block text-[10px] font-bold uppercase tracking-[0.4px] text-[#9CA3AF] mb-1">
          Description
        </label>
        <input
          type="text"
          value={chargeDesc}
          onChange={(e) => setChargeDesc(e.target.value)}
          placeholder="e.g. Corroded pipe replacement"
          className="w-full h-[48px] px-3.5 border-[1.5px] border-[#D1D5DB] rounded-[10px] text-[16px] font-medium text-[#111827] placeholder:text-[#D1D5DB] outline-none focus:border-[#111827]"
        />
      </div>
      <div className="mb-4">
        <label className="block text-[10px] font-bold uppercase tracking-[0.4px] text-[#9CA3AF] mb-1">
          Amount
        </label>
        <div className="relative">
          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[16px] font-medium text-[#111827]">£</span>
          <input
            type="text"
            inputMode="decimal"
            value={chargeAmount}
            onChange={(e) => setChargeAmount(e.target.value)}
            placeholder="0.00"
            className="w-full h-[48px] pl-8 pr-3.5 border-[1.5px] border-[#D1D5DB] rounded-[10px] text-[16px] font-medium text-[#111827] placeholder:text-[#D1D5DB] outline-none focus:border-[#111827]"
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
          className="w-full px-3.5 py-3 border-[1.5px] border-[#D1D5DB] rounded-[10px] text-[16px] font-medium text-[#111827] placeholder:text-[#D1D5DB] outline-none focus:border-[#111827] resize-none"
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

  const renderMarkDoneSheet = () => (
    <BottomSheet
      isOpen={sheet === 'mark_done'}
      onClose={() => setSheet(null)}
      title="How were you paid?"
      subtitle={job && customer ? `${customer.name} · ${job.title} · £${total.toFixed(2)}` : undefined}
    >
      <SheetRow
        icon={<Banknote size={18} color="#374151" />}
        label="Cash"
        onTap={() => handleMarkDone('cash')}
      />
      <SheetRow
        icon={<Building2 size={18} color="#374151" />}
        label="Bank Transfer"
        onTap={() => handleMarkDone('bank_transfer')}
      />
      <SheetRow
        icon={<Pencil size={18} color="#374151" />}
        label="Other"
        sublabel="Entered manually"
        onTap={() => handleMarkDone('other')}
      />
      <SheetRow
        icon={<Clock size={18} color="#9CA3AF" />}
        label="Not yet"
        sublabel="Chase later"
        onTap={() => handleMarkDone('not_yet')}
        variant="destructive"
        isLast
      />
      <p className="text-[11px] text-[#9CA3AF] px-4 pt-1 pb-2">
        → Chase payment added to tasks
      </p>
    </BottomSheet>
  );

  const renderMarkPaidSheet = () => (
    <BottomSheet
      isOpen={sheet === 'mark_paid'}
      onClose={() => setSheet(null)}
      title="How were you paid?"
      subtitle={job && customer ? `${customer.name} · ${job.title} · £${total.toFixed(2)}` : undefined}
    >
      <SheetRow
        icon={<Banknote size={18} color="#374151" />}
        label="Cash"
        onTap={() => handleMarkAsPaid('cash')}
      />
      <SheetRow
        icon={<Building2 size={18} color="#374151" />}
        label="Bank Transfer"
        onTap={() => handleMarkAsPaid('bank_transfer')}
      />
      <SheetRow
        icon={<Pencil size={18} color="#374151" />}
        label="Other"
        sublabel="Entered manually"
        onTap={() => handleMarkAsPaid('other')}
        isLast
      />
    </BottomSheet>
  );

  const renderSendReminderSheet = () => {
    if (!job || !customer) return null;
    const defaultText = `Hi ${customer.name}, just a reminder about the invoice for ${job.title}. Amount due: £${total.toFixed(2)}. Thanks, ${profile?.full_name?.split(' ')[0] || 'Dave'}`;

    return (
      <BottomSheet
        isOpen={sheet === 'send_reminder'}
        onClose={() => setSheet(null)}
        title={`Send reminder to ${customer.name}?`}
      >
        <div className="mb-3">
          <textarea
            value={reminderText || defaultText}
            onChange={(e) => setReminderText(e.target.value)}
            rows={4}
            className="w-full px-3.5 py-3 border-[1.5px] border-[#D1D5DB] rounded-[10px] text-[16px] font-medium text-[#374151] placeholder:text-[#D1D5DB] outline-none focus:border-[#111827] resize-none leading-relaxed"
          />
          <p className="text-[10px] text-[#9CA3AF] text-right mt-1">Tap to edit before sending</p>
        </div>
        <SheetRow
          icon={<MessageCircle size={18} color="#374151" />}
          label="Send via WhatsApp"
          onTap={() => handleSendReminder('whatsapp')}
        />
        <SheetRow
          icon={<MessageSquare size={18} color="#374151" />}
          label="Send via SMS"
          onTap={() => handleSendReminder('sms')}
          isLast
        />
      </BottomSheet>
    );
  };


  const renderRescheduleSheet = () => (
    <BottomSheet
      isOpen={sheet === 'reschedule'}
      onClose={() => { setSheet(null); setRescheduleDate(''); }}
      title="Reschedule job"
      subtitle={job && customer ? `${customer.name} · ${job.title}` : undefined}
    >
      <div className="mb-4">
        <label className="block text-[10px] font-bold uppercase tracking-[0.4px] text-[#9CA3AF] mb-1">
          New date & time
        </label>
        <input
          type="datetime-local"
          value={rescheduleDate}
          onChange={(e) => setRescheduleDate(e.target.value)}
          className="w-full h-[48px] px-3.5 border-[1.5px] border-[#D1D5DB] rounded-[10px] text-[16px] font-medium text-[#111827] placeholder:text-[#D1D5DB] outline-none focus:border-[#111827]"
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
        <label className="block text-[10px] font-bold uppercase tracking-[0.4px] text-[#9CA3AF] mb-1">
          Description
        </label>
        <input
          type="text"
          value={calloutDesc}
          onChange={(e) => setCalloutDesc(e.target.value)}
          placeholder="e.g. Callout charge"
          className="w-full h-[48px] px-3.5 border-[1.5px] border-[#D1D5DB] rounded-[10px] text-[16px] font-medium text-[#111827] placeholder:text-[#D1D5DB] outline-none focus:border-[#111827]"
        />
      </div>
      <div className="mb-4">
        <label className="block text-[10px] font-bold uppercase tracking-[0.4px] text-[#9CA3AF] mb-1">
          Amount
        </label>
        <div className="relative">
          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[16px] font-medium text-[#111827]">£</span>
          <input
            type="text"
            inputMode="decimal"
            value={calloutAmount}
            onChange={(e) => setCalloutAmount(e.target.value)}
            placeholder="0.00"
            className="w-full h-[48px] pl-8 pr-3.5 border-[1.5px] border-[#D1D5DB] rounded-[10px] text-[16px] font-medium text-[#111827] placeholder:text-[#D1D5DB] outline-none focus:border-[#111827]"
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

  const renderBookingConfirmationSheet = () => (
    <BottomSheet
      isOpen={sheet === 'booking_confirmation'}
      onClose={() => setSheet(null)}
      title="Send booking confirmation?"
    >
      <div className="mb-4">
        <div className="bg-[#F9FAFB] border border-[#E5E7EB] rounded-[10px] p-3.5">
          <p className="text-[13px] text-[#374151] leading-relaxed whitespace-pre-line">{bookingMessage}</p>
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <Button variant="primary" onClick={() => handleSendBookingConfirmation('whatsapp')} fullWidth>
          <MessageCircle size={18} className="mr-2" />
          Send via WhatsApp
        </Button>
        <Button variant="secondary" onClick={() => handleSendBookingConfirmation('sms')} fullWidth>
          <Phone size={18} className="mr-2" />
          Send via SMS
        </Button>
        <button
          onClick={() => setSheet(null)}
          className="w-full h-[46px] flex items-center justify-center text-[14px] font-medium text-[#9CA3AF] cursor-pointer"
        >
          Skip — already told them
        </button>
      </div>
    </BottomSheet>
  );

  const renderEditDetailsSheet = () => (
    <BottomSheet
      isOpen={sheet === 'edit_details'}
      onClose={() => { setSheet(null); setUpdateMessage(''); }}
      title="Edit job details"
      subtitle={customer ? `${customer.name} · ${job?.title}` : undefined}
    >
      <div className="mb-3">
        <label className="block text-[10px] font-bold uppercase tracking-[0.4px] text-[#9CA3AF] mb-1">
          Job title
        </label>
        <input
          type="text"
          value={editTitle}
          onChange={(e) => setEditTitle(e.target.value)}
          className="w-full h-[48px] px-3.5 border-[1.5px] border-[#D1D5DB] rounded-[10px] text-[16px] font-medium text-[#111827] outline-none focus:border-[#111827]"
        />
      </div>
      <div className="mb-3">
        <label className="block text-[10px] font-bold uppercase tracking-[0.4px] text-[#9CA3AF] mb-1">
          Date &amp; time
        </label>
        <input
          type="datetime-local"
          value={editStart}
          onChange={(e) => setEditStart(e.target.value)}
          className="w-full h-[48px] px-3.5 border-[1.5px] border-[#D1D5DB] rounded-[10px] text-[16px] font-medium text-[#111827] outline-none focus:border-[#111827]"
        />
      </div>
      {editStart && (
        <div className="mb-3">
          <label className="block text-[10px] font-bold uppercase tracking-[0.4px] text-[#9CA3AF] mb-1">
            End time (optional)
          </label>
          <input
            type="datetime-local"
            value={editEnd}
            onChange={(e) => setEditEnd(e.target.value)}
            className="w-full h-[48px] px-3.5 border-[1.5px] border-[#D1D5DB] rounded-[10px] text-[16px] font-medium text-[#111827] outline-none focus:border-[#111827]"
          />
        </div>
      )}
      <div className="mb-4">
        <label className="block text-[10px] font-bold uppercase tracking-[0.4px] text-[#9CA3AF] mb-1">
          Notes (private)
        </label>
        <textarea
          value={editNotes}
          onChange={(e) => setEditNotes(e.target.value)}
          placeholder="Any notes about this job..."
          rows={3}
          className="w-full px-3.5 py-3 border-[1.5px] border-[#D1D5DB] rounded-[10px] text-[16px] font-medium text-[#111827] placeholder:text-[#D1D5DB] outline-none focus:border-[#111827] resize-none"
        />
      </div>
      <Button variant="primary" onClick={handleEditDetails}>
        Save changes
      </Button>
    </BottomSheet>
  );

  const renderSendUpdateSheet = () => (
    <BottomSheet
      isOpen={sheet === 'send_update'}
      onClose={() => { setSheet(null); setUpdateMessage(''); }}
      title="Send update to customer?"
    >
      <div className="mb-4">
        <div className="bg-[#F9FAFB] border border-[#E5E7EB] rounded-[10px] p-3.5">
          <p className="text-[13px] text-[#374151] leading-relaxed whitespace-pre-line">{updateMessage}</p>
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <Button variant="primary" onClick={() => handleSendUpdate('whatsapp')} fullWidth>
          <MessageCircle size={18} className="mr-2" />
          Send via WhatsApp
        </Button>
        <Button variant="secondary" onClick={() => handleSendUpdate('sms')} fullWidth>
          <Phone size={18} className="mr-2" />
          Send via SMS
        </Button>
        <button
          onClick={() => setSheet(null)}
          className="w-full h-[46px] flex items-center justify-center text-[14px] font-medium text-[#9CA3AF] cursor-pointer"
        >
          Skip — already told them
        </button>
      </div>
    </BottomSheet>
  );

  /* ─── main render ─── */

  if (loading) {
    return (
      <div className="flex flex-col min-h-[100svh]">
        <div className="flex-1 flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-[#E5E7EB] border-t-[#111827] rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  if (!job || !customer) {
    return (
      <div className="flex flex-col min-h-[100svh]">
        <div className="flex-1 flex items-center justify-center px-4">
          <p className="text-[15px] text-[#9CA3AF] text-center">Job not found</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-[100svh] relative">
      {renderHeader()}

      {job.status === 'booked' && renderBookedBody()}
      {job.status === 'in_progress' && renderInProgressBody()}
      {job.status === 'awaiting_payment' && renderAwaitingPaymentBody()}
      {job.status === 'no_show' && renderNoShowBody()}
      {job.status === 'paid' && renderPaidBody()}
      {job.status === 'cancelled' && renderCancelledBody()}
      {job.status === 'written_off' && renderWrittenOffBody()}
      {job.status === 'quoted' && renderQuotedBody()}

      {job.status === 'booked' && renderBookedFooter()}
      {job.status === 'in_progress' && renderInProgressFooter()}
      {job.status === 'awaiting_payment' && renderAwaitingPaymentFooter()}
      {job.status === 'no_show' && renderNoShowFooter()}
      {job.status === 'quoted' && renderQuotedFooter()}
      {job.status === 'paid' && renderTerminalFooter()}
      {job.status === 'cancelled' && renderTerminalFooter()}
      {job.status === 'written_off' && renderTerminalFooter()}

      {renderCancelSheet()}
      {renderAddChargeSheet()}
      {renderAddNoteSheet()}
      {renderMarkDoneSheet()}
      {renderMarkPaidSheet()}
      {renderSendReminderSheet()}
      {renderRescheduleSheet()}
      {renderCalloutChargeSheet()}
      {renderBookingConfirmationSheet()}
      {renderEditDetailsSheet()}
      {renderSendUpdateSheet()}
    </div>
  );
}
