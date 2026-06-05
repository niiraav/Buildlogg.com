import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ChevronLeft, Phone, MessageCircle, Clock, Banknote, Pencil, Building2,
} from 'lucide-react';
import { db, type Job, type Customer, type LineItem, type WorkLogEntry, type Profile } from '../../lib/db';
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
  | 'add_note';

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
    setLoading(false);
  }, [jobId, userId]);

  useEffect(() => { refresh(); }, [refresh]);

  /* ─── derived ─── */
  const total = useMemo(() => jobTotal(lineItems), [lineItems]);

  const hasContactButtons = useMemo(() => {
    if (!job) return false;
    return ['booked', 'in_progress', 'awaiting_payment', 'no_show'].includes(job.status);
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

  const handleRemoveItem = async (itemId: string) => {
    await db.line_items.delete(itemId);
    await addToSyncQueue('line_items', itemId, { _deleted: true });
    refresh();
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

  const handleCall = () => {
    if (customer?.phone) window.open(`tel:${customer.phone}`, '_self');
  };

  const handleMessage = () => {
    if (!customer?.phone) return;
    const body = encodeURIComponent(`Hi ${customer.name}, it's ${profile?.full_name?.split(' ')[0] || 'Dave'}.`);
    window.open(`sms:${customer.phone}?body=${body}`, '_blank');
  };

  /* ─── render helpers ─── */

  const renderHeader = () => (
    <div className="px-4 pt-2 pb-3 border-b border-[#F3F4F6] shrink-0">
      <button
        onClick={() => navigate('/jobs')}
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
              showRemove={true}
              onRemove={() => handleRemoveItem(item.id)}
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
            <div className="flex gap-3.5">
              <button
                onClick={() => setSheet('add_note')}
                className="text-[12px] text-[#6B7280] cursor-pointer underline underline-offset-2"
              >
                + Add note
              </button>
              <button
                onClick={() => setSheet('add_charge')}
                className="text-[12px] text-[#6B7280] cursor-pointer underline underline-offset-2"
              >
                + Add charge
              </button>
            </div>
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
              showRemove={true}
              isAddedOnSite={item.added_on_site}
              onRemove={() => handleRemoveItem(item.id)}
            />
          ))}
          <InvoiceTotalRow total={total} />
        </div>
      </div>
    );
  };

  const renderBookedFooter = () => (
    <div className="sticky bottom-0 z-30 bg-white border-t border-[#F3F4F6] shadow-sheet">
      <div className="flex flex-col gap-2 px-4 py-3 pb-[calc(32px_+_env(safe-area-inset-bottom))]">
        <Button variant="secondary" onClick={() => { /* Edit details — placeholder for later milestone */ }}>
          Edit details
        </Button>
        <button
          onClick={() => setSheet('cancel')}
          className="w-full h-[46px] rounded-xl text-[14px] font-semibold cursor-pointer border border-[#FCA5A5] bg-[#FFF5F5] text-[#EF4444]"
        >
          Cancel job
        </button>
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

      {job.status === 'booked' && renderBookedFooter()}
      {job.status === 'in_progress' && renderInProgressFooter()}

      {renderCancelSheet()}
      {renderAddChargeSheet()}
      {renderAddNoteSheet()}
      {renderMarkDoneSheet()}
    </div>
  );
}
