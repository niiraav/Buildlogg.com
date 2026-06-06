import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { ChevronLeft, X, Plus, Calendar, Clock } from 'lucide-react';
import { db, type Customer, type Profile } from '../../lib/db';
import { useAppStore } from '../../store/useAppStore';
import { SegmentedControl } from '../../components/SegmentedControl';
import { Button } from '../../components/Button';
import { StickyFooter } from '../../components/StickyFooter';

/* ─── helpers ─── */

const now = () => new Date().toISOString();

function formatDateForInput(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toISOString().split('T')[0];
}

function formatTimeForInput(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toTimeString().slice(0, 5);
}

function addTwoHours(timeStr: string): string {
  if (!timeStr) return '10:00';
  const [h, m] = timeStr.split(':').map(Number);
  const d = new Date();
  d.setHours(h + 2, m, 0, 0);
  return d.toTimeString().slice(0, 5);
}

function combineDateTime(dateStr: string, timeStr: string): string | undefined {
  if (!dateStr) return undefined;
  const time = timeStr || '00:00';
  return new Date(`${dateStr}T${time}`).toISOString();
}

function formatAmountDisplay(n: number): string {
  return n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const PAYMENT_OPTIONS = [
  { value: 'on_completion', label: 'On completion' },
  { value: 'deposit', label: 'Deposit' },
  { value: 'invoice', label: 'Invoice' },
];

const DEPOSIT_PRESETS = [10, 20, 25, 50];

/* Quick-add items by trade type */
const QUICK_ADD_ITEMS: Record<string, string[]> = {
  plumber: ['Pipes', 'Fittings', 'Boiler', 'Radiator', 'Valves'],
  electrician: ['Cable', 'Sockets', 'Switches', 'Consumer unit', 'Light fittings'],
  builder: ['Bricks', 'Cement', 'Timber', 'Plaster', 'Tiles'],
  other: ['Materials', 'Parts', 'Tools'],
};

function getQuickAddItems(profile: Profile | null): string[] {
  if (!profile?.trade) return QUICK_ADD_ITEMS.other;
  return QUICK_ADD_ITEMS[profile.trade] || QUICK_ADD_ITEMS.other;
}

/* ─── types ─── */

interface EditableItem {
  id: string;
  description: string;
  amount: string; // raw string for input
  amountNum: number;
}

interface QuoteBuilderProps {
  customerId: string;
  jobId?: string;
  onPreview: () => void;
  onBack: () => void;
  onSaveDraft: () => void;
}

/* ─── component ─── */

export default function QuoteBuilder({ customerId, jobId, onPreview, onBack, onSaveDraft }: QuoteBuilderProps) {
  const userId = useAppStore((s) => s.userId);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentJobId, setCurrentJobId] = useState<string | undefined>(jobId);

  /* form state */
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<EditableItem[]>([]);
  const [paymentTerms, setPaymentTerms] = useState<'on_completion' | 'deposit' | 'invoice'>('on_completion');
  const [depositPct, setDepositPct] = useState<number>(20);
  const [depositCustom, setDepositCustom] = useState<string | null>(null);
  const [titleFocused, setTitleFocused] = useState(false);

  const [profile, setProfile] = useState<Profile | null>(null);
  const depositSectionRef = useRef<HTMLDivElement>(null);

  /* load customer and job */
  useEffect(() => {
    if (!userId) return;

    const load = async () => {
      const c = await db.customers.get(customerId);
      setCustomer(c || null);
      const p = await db.profiles.get(userId);
      setProfile(p || null);

      if (currentJobId) {
        const job = await db.jobs.get(currentJobId);
        if (job) {
          setTitle(job.title || '');
          setNotes(job.notes || '');
          setDate(formatDateForInput(job.scheduled_start));
          setStartTime(formatTimeForInput(job.scheduled_start));
          setEndTime(formatTimeForInput(job.scheduled_end));
          setPaymentTerms(job.payment_terms || 'on_completion');
          const presets = [10, 20, 25, 50];
          if (job.deposit_pct && !presets.includes(job.deposit_pct)) {
            setDepositPct(job.deposit_pct);
            setDepositCustom(String(job.deposit_pct));
          } else {
            setDepositPct(job.deposit_pct || 20);
            setDepositCustom(null);
          }

          const dbItems = await db.line_items.where('job_id').equals(currentJobId).toArray();
          if (dbItems.length > 0) {
            setItems(
              dbItems.map((i) => ({
                id: i.id,
                description: i.description,
                amount: i.amount ? i.amount.toFixed(2) : '',
                amountNum: i.amount || 0,
              }))
            );
          } else {
            // Auto-fill default labour charge from profile (only if enabled in onboarding)
            if (p && p.default_labour_charge > 0) {
              const itemId = crypto.randomUUID();
              const desc = p.default_labour_description || 'Labour';
              const amt = p.default_labour_charge;
              const itemNow = now();
              setItems([{
                id: itemId,
                description: desc,
                amount: amt.toFixed(2),
                amountNum: amt,
              }]);
              await db.line_items.add({
                id: itemId,
                job_id: currentJobId,
                description: desc,
                amount: amt,
                sort_order: 0,
                added_on_site: false,
                created_at: itemNow,
                _sync_status: 'pending',
              });
              await db.sync_queue.add({
                operation: 'insert',
                table_name: 'line_items',
                record_id: itemId,
                payload: {
                  id: itemId, job_id: currentJobId,
                  description: desc, amount: amt,
                  sort_order: 0, added_on_site: false, created_at: itemNow,
                },
                created_at: itemNow,
                retry_count: 0,
              });
            }
          }
        }
      } else {
        // Create new job — should not happen in normal flow (parent creates it)
        const newJobId = crypto.randomUUID();
        const n = now();
        await db.jobs.add({
          id: newJobId,
          user_id: userId,
          customer_id: customerId,
          title: '',
          status: 'enquiry',
          payment_terms: 'on_completion',
          is_multi_day: false,
          created_at: n,
          updated_at: n,
          _sync_status: 'pending',
        });
        await db.sync_queue.add({
          operation: 'insert',
          table_name: 'jobs',
          record_id: newJobId,
          payload: {
            id: newJobId, user_id: userId, customer_id: customerId,
            title: '', status: 'enquiry', payment_terms: 'on_completion',
            is_multi_day: false, created_at: n, updated_at: n,
          },
          created_at: n,
          retry_count: 0,
        });
        setCurrentJobId(newJobId);

        // Auto-fill default labour charge from profile (only if enabled in onboarding)
        if (p && p.default_labour_charge > 0) {
          const itemId = crypto.randomUUID();
          const desc = p.default_labour_description || 'Labour';
          const amt = p.default_labour_charge;
          setItems([{
            id: itemId,
            description: desc,
            amount: amt.toFixed(2),
            amountNum: amt,
          }]);
          await db.line_items.add({
            id: itemId,
            job_id: newJobId,
            description: desc,
            amount: amt,
            sort_order: 0,
            added_on_site: false,
            created_at: n,
            _sync_status: 'pending',
          });
          await db.sync_queue.add({
            operation: 'insert',
            table_name: 'line_items',
            record_id: itemId,
            payload: {
              id: itemId, job_id: newJobId,
              description: desc, amount: amt,
              sort_order: 0, added_on_site: false, created_at: n,
            },
            created_at: n,
            retry_count: 0,
          });
        }
      }

      setLoading(false);
    };

    load();
  }, [customerId, currentJobId, userId]);

  /* ─── derived ─── */
  const total = useMemo(() => items.reduce((sum, i) => sum + (i.amountNum || 0), 0), [items]);

  const canPreview = title.trim().length > 0 && items.length > 0 && items.every((i) => i.amountNum > 0);

  const depositAmount = paymentTerms === 'deposit' ? total * (depositPct / 100) : 0;
  const balance = total - depositAmount;

  /* ─── auto-save helpers ─── */
  const saveJob = useCallback(async () => {
    if (!currentJobId || !userId) return;
    const n = now();
    const scheduledStart = combineDateTime(date, startTime);
    const scheduledEnd = combineDateTime(date, endTime);

    await db.jobs.update(currentJobId, {
      title: title.trim() || '',
      scheduled_start: scheduledStart,
      scheduled_end: scheduledEnd,
      payment_terms: paymentTerms,
      deposit_pct: paymentTerms === 'deposit' ? depositPct : undefined,
      notes: notes.trim() || undefined,
      updated_at: n,
      _sync_status: 'pending',
    });

    await db.sync_queue.add({
      operation: 'update',
      table_name: 'jobs',
      record_id: currentJobId,
      payload: {
        title: title.trim(),
        scheduled_start: scheduledStart,
        scheduled_end: scheduledEnd,
        payment_terms: paymentTerms,
        deposit_pct: paymentTerms === 'deposit' ? depositPct : undefined,
        notes: notes.trim() || undefined,
        updated_at: n,
      },
      created_at: n,
      retry_count: 0,
    });
  }, [currentJobId, userId, title, date, startTime, endTime, notes, paymentTerms, depositPct]);

  const saveItems = useCallback(async () => {
    if (!currentJobId || !userId) return;
    const n = now();

    const existing = await db.line_items.where('job_id').equals(currentJobId).toArray();
    for (const e of existing) {
      await db.line_items.delete(e.id);
      await db.sync_queue.add({
        operation: 'delete',
        table_name: 'line_items',
        record_id: e.id,
        payload: {},
        created_at: n,
        retry_count: 0,
      });
    }

    for (let idx = 0; idx < items.length; idx++) {
      const i = items[idx];
      if (!i.description.trim() && i.amountNum === 0) continue;
      await db.line_items.add({
        id: i.id,
        job_id: currentJobId,
        description: i.description.trim(),
        amount: i.amountNum,
        sort_order: idx,
        added_on_site: false,
        created_at: n,
        _sync_status: 'pending',
      });
      await db.sync_queue.add({
        operation: 'insert',
        table_name: 'line_items',
        record_id: i.id,
        payload: {
          id: i.id, job_id: currentJobId,
          description: i.description.trim(),
          amount: i.amountNum,
          sort_order: idx,
          added_on_site: false, created_at: n,
        },
        created_at: n,
        retry_count: 0,
      });
    }
  }, [currentJobId, userId, items]);

  /* ─── event handlers ─── */
  const handleTitleBlur = () => {
    setTitleFocused(false);
    saveJob();
  };

  const handleDateBlur = () => saveJob();
  const handleStartTimeBlur = () => saveJob();
  const handleEndTimeBlur = () => saveJob();
  const handleNotesBlur = () => saveJob();
  const handleNotesChange = (val: string) => setNotes(val);

  const handlePaymentTermsChange = async (val: string) => {
    const terms = val as 'on_completion' | 'deposit' | 'invoice';
    setPaymentTerms(terms);
    if (currentJobId && userId) {
      const n = now();
      await db.jobs.update(currentJobId, {
        payment_terms: terms,
        updated_at: n,
        _sync_status: 'pending',
      });
      await db.sync_queue.add({
        operation: 'update',
        table_name: 'jobs',
        record_id: currentJobId,
        payload: {
          payment_terms: terms,
          updated_at: n,
        },
        created_at: n,
        retry_count: 0,
      });
    }
  };

  const handleDepositPctChange = async (pct: number) => {
    setDepositPct(pct);
    setDepositCustom(null);
    if (currentJobId && userId) {
      const n = now();
      await db.jobs.update(currentJobId, {
        deposit_pct: pct,
        updated_at: n,
        _sync_status: 'pending',
      });
      await db.sync_queue.add({
        operation: 'update',
        table_name: 'jobs',
        record_id: currentJobId,
        payload: {
          deposit_pct: pct,
          updated_at: n,
        },
        created_at: n,
        retry_count: 0,
      });
    }
  };

  const handleDepositCustomBlur = async () => {
    const val = depositCustom ? parseFloat(depositCustom) : NaN;
    let finalPct = depositPct;
    if (!isNaN(val) && val > 0 && val <= 100) {
      setDepositPct(val);
      finalPct = val;
    }
    if (currentJobId && userId) {
      const n = now();
      await db.jobs.update(currentJobId, {
        deposit_pct: finalPct,
        updated_at: n,
        _sync_status: 'pending',
      });
      await db.sync_queue.add({
        operation: 'update',
        table_name: 'jobs',
        record_id: currentJobId,
        payload: {
          deposit_pct: finalPct,
          updated_at: n,
        },
        created_at: n,
        retry_count: 0,
      });
    }
  };

  const addItem = () => {
    setItems((prev) => [
      ...prev,
      { id: crypto.randomUUID(), description: '', amount: '', amountNum: 0 },
    ]);
  };

  const addQuickItem = (description: string) => {
    const itemId = crypto.randomUUID();
    setItems((prev) => [
      ...prev,
      { id: itemId, description, amount: '', amountNum: 0 },
    ]);
  };

  const handleRemoveEmptyItems = () => {
    setItems((prev) => prev.filter((i) => i.description.trim() || i.amountNum > 0));
  };

  const updateItemDesc = (id: string, desc: string) => {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, description: desc } : i)));
  };

  const updateItemAmount = (id: string, amt: string) => {
    const num = parseFloat(amt);
    setItems((prev) =>
      prev.map((i) =>
        i.id === id
          ? { ...i, amount: amt, amountNum: isNaN(num) || num < 0 ? 0 : num }
          : i
      )
    );
  };

  const removeItem = (id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
  };

  const saveItemBlur = () => {
    handleRemoveEmptyItems();
    saveItems();
  };

  const handlePreview = async () => {
    await saveItems();
    await saveJob();
    onPreview();
  };

  const quickAdds = getQuickAddItems(profile);

  /* auto-scroll to deposit section on select */
  useEffect(() => {
    if (paymentTerms === 'deposit' && depositSectionRef.current) {
      requestAnimationFrame(() => {
        depositSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      });
    }
  }, [paymentTerms]);

  if (loading) {
    return (
      <div className="flex flex-col min-h-[100svh]">
        <div className="flex-1 flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-brand-border border-t-brand-black rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-[100svh]">
      {/* Header */}
      <div className="px-4 pt-2 pb-3 border-b border-brand-borderLight shrink-0 grid grid-cols-3 items-center">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-1 min-h-11 pr-4 text-sm font-medium text-brand-mid cursor-pointer justify-self-start"
        >
          <ChevronLeft size={22} color="#9CA3AF" className="-mt-px" />
          Back
        </button>
        <span className="text-base font-bold text-brand-black text-center">Quote details</span>
        <div className="min-h-11 w-11" aria-hidden="true" />
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-4 pt-4 pb-2">
        {/* Customer strip */}
        {customer && (
          <div className="bg-brand-surface border border-brand-border rounded-lg px-3.5 py-2.5 mb-5 flex items-center gap-2">
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-brand-black truncate">{customer.name || 'Unknown'}</div>
              <div className="text-xxs text-brand-muted mt-px">{customer.phone}</div>
            </div>
            <button
              onClick={onBack}
              className="text-xxs text-brand-mid underline underline-offset-2 cursor-pointer shrink-0"
            >
              Edit
            </button>
          </div>
        )}

        {/* Job details */}
        <div className="mb-5">
          <div className="text-micro font-bold text-brand-mid uppercase tracking-[0.7px] mb-2.5">
            Job
          </div>

          <div className="mb-2.5">
            <label className="block text-label font-semibold text-brand-muted uppercase tracking-[0.3px] mb-1">
              Job title
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onFocus={() => setTitleFocused(true)}
              onBlur={handleTitleBlur}
              placeholder="e.g. New boiler installation"
              className={`w-full min-h-12 px-3.5 border-2 rounded-lg text-base font-medium text-brand-black placeholder:text-gray-300 placeholder:italic outline-none ${
                titleFocused ? 'border-brand-black' : 'border-brand-border'
              }`}
            />
          </div>

          <div className="mb-2.5">
            <label className="block text-label font-semibold text-brand-muted uppercase tracking-[0.3px] mb-1">
              Date <span className="normal-case font-normal tracking-0">(optional)</span>
            </label>
            <div className="relative">
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                onBlur={handleDateBlur}
                className="w-full min-h-12 px-3.5 pr-10 border-2 border-brand-border rounded-lg text-base font-medium text-brand-black outline-none focus:border-brand-black bg-white appearance-none"
              />
              <Calendar size={18} color="#9CA3AF" className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          </div>

          <div className="flex gap-2.5">
            <div className="flex-1">
              <label className="block text-label font-semibold text-brand-muted uppercase tracking-[0.3px] mb-1">
                Start <span className="normal-case font-normal tracking-0">(optional)</span>
              </label>
              <div className="relative">
                <input
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  onBlur={handleStartTimeBlur}
                  className="w-full min-h-12 px-3.5 pr-10 border-2 border-brand-border rounded-lg text-base font-medium text-brand-black outline-none focus:border-brand-black bg-white appearance-none"
                />
                <Clock size={18} color="#9CA3AF" className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            </div>
            <div className="flex-1">
              <label className="block text-label font-semibold text-brand-muted uppercase tracking-[0.3px] mb-1">
                End <span className="normal-case font-normal tracking-0">(optional)</span>
              </label>
              {/* End time: show "Add end time" button when empty, time input when set */}
              {!endTime ? (
                <button
                  onClick={() => {
                    const defaultEnd = addTwoHours(startTime);
                    setEndTime(defaultEnd);
                    saveJob();
                  }}
                  className="w-full h-12 px-3.5 border-2 border-brand-border border-dashed rounded-lg flex items-center gap-2 text-sm font-medium text-brand-muted cursor-pointer bg-white hover:bg-brand-surface active:bg-brand-borderLight transition-colors"
                >
                  <Plus size={14} color="#9CA3AF" />
                  Add end time
                </button>
              ) : (
                <div className="relative">
                  <input
                    type="time"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    onBlur={handleEndTimeBlur}
                    className="w-full min-h-12 px-3.5 pr-10 border-2 border-brand-border rounded-lg text-base font-medium text-brand-black outline-none focus:border-brand-black bg-white appearance-none"
                  />
                  <button
                    onClick={() => { setEndTime(''); saveJob(); }}
                    className="absolute right-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-brand-borderLight flex items-center justify-center cursor-pointer"
                    aria-label="Clear end time"
                  >
                    <X size={12} color="#9CA3AF" />
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Line items */}
        <div className="mb-5">
          <div className="text-micro font-bold text-brand-mid uppercase tracking-[0.7px] mb-2.5">
            Items
          </div>

          <div className="border border-brand-border rounded-lg overflow-hidden mb-2">
            {items.map((item, idx) => (
              <div
                key={item.id}
                className={`flex items-center gap-2 px-3.5 py-2.5 ${idx < items.length - 1 ? 'border-b border-brand-borderLight' : ''}`}
              >
                <input
                  type="text"
                  value={item.description}
                  onChange={(e) => updateItemDesc(item.id, e.target.value)}
                  onBlur={saveItemBlur}
                  placeholder="Item description"
                  className="flex-1 min-h-12 px-2 border-2 border-brand-border rounded-lg text-base font-medium text-brand-black placeholder:text-gray-300 placeholder:italic outline-none focus:border-brand-black"
                />
                <div className="flex items-center gap-1 shrink-0">
                  <span className="text-sm text-brand-mid">£</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={item.amount}
                    onChange={(e) => updateItemAmount(item.id, e.target.value)}
                    onBlur={saveItemBlur}
                    placeholder="0.00"
                    className={`w-20 min-h-12 px-2 border-2 rounded-lg text-base font-medium text-brand-black text-right outline-none focus:border-brand-black placeholder:text-gray-300 ${
                      (item.amount === '' || item.amountNum === 0) ? 'border-status-error' : 'border-brand-border'
                    }`}
                  />
                </div>
                <button
                  onClick={() => removeItem(item.id)}
                  className="w-7 h-7 rounded-full border border-brand-border bg-brand-surface flex items-center justify-center shrink-0 cursor-pointer"
                  aria-label="Remove item"
                >
                  <X size={14} color="#9CA3AF" />
                </button>
              </div>
            ))}
          </div>

          <button
            onClick={addItem}
            className="inline-flex items-center gap-1 text-xs font-medium text-brand-mid underline underline-offset-2 cursor-pointer"
          >
            <Plus size={14} />
            Add item
          </button>

          {/* Quick-add chips */}
          {quickAdds.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {quickAdds.map((desc) => (
                <button
                  key={desc}
                  onClick={() => addQuickItem(desc)}
                  className="inline-flex items-center gap-1 h-8 px-3 rounded-full bg-brand-borderLight text-xxs font-medium text-brand-dark cursor-pointer border border-brand-border hover:bg-brand-border active:bg-gray-300 transition-colors"
                >
                  <Plus size={12} color="#9CA3AF" />
                  {desc}
                </button>
              ))}
            </div>
          )}

          {/* Total bar */}
          {items.length > 0 && (
            <div className="flex justify-between items-center mt-3 py-3 px-3.5 border-t-[1.5px] border-brand-black">
              <span className="text-md font-bold text-brand-black">Total</span>
              <span className="text-[24px] font-extrabold text-brand-black tracking-tight">
                £{formatAmountDisplay(total)}
              </span>
            </div>
          )}
        </div>

        {/* Notes / What's included */}
        <div className="mb-5">
          <label className="block text-label font-semibold text-brand-muted uppercase tracking-[0.3px] mb-1">
            Notes <span className="normal-case font-normal tracking-0">(optional)</span>
          </label>
          <textarea
            value={notes}
            onChange={(e) => handleNotesChange(e.target.value)}
            onBlur={handleNotesBlur}
            placeholder="e.g. Includes all parts, labour, and disposal of old unit"
            rows={3}
            className="w-full min-h-20 px-3.5 py-2.5 border-2 border-brand-border rounded-lg text-base font-medium text-brand-black placeholder:text-gray-300 placeholder:italic outline-none focus:border-brand-black resize-none leading-relaxed"
          />
        </div>

        {/* Payment terms */}
        <div className="mb-5">
          <div className="text-micro font-bold text-brand-mid uppercase tracking-[0.7px] mb-2.5">
            Payment
          </div>
          <SegmentedControl
            options={PAYMENT_OPTIONS}
            value={paymentTerms}
            onChange={handlePaymentTermsChange}
          />
          <div className="mt-2.5 bg-brand-surface border border-brand-border rounded-lg p-3">
            <p className="text-xxs text-brand-dark leading-relaxed">
              {paymentTerms === 'on_completion' && (
                <>
                  <span className="font-semibold text-brand-black">What happens at the end:</span> Customer pays the full amount in cash, by card, or bank transfer once the job is complete. You mark it as paid and they get a receipt.
                </>
              )}
              {paymentTerms === 'deposit' && (
                <>
                  <span className="font-semibold text-brand-black">What happens at the end:</span> Customer pays a deposit now (e.g. 20%). The balance is collected on completion. You can send a reminder if it is overdue.
                </>
              )}
              {paymentTerms === 'invoice' && (
                <>
                  <span className="font-semibold text-brand-black">What happens at the end:</span> You send an invoice after the job. Customer pays within the agreed terms (usually 7–14 days). The app tracks who has paid and who needs chasing.
                </>
              )}
            </p>
          </div>
        </div>

        {/* Deposit section */}
        {paymentTerms === 'deposit' && (
          <div ref={depositSectionRef} className="mb-5">
            <div className="bg-brand-surface border border-brand-border rounded-lg p-3.5">
              <div className="text-micro font-bold text-brand-mid uppercase tracking-[0.7px] mb-2.5">
                Deposit amount
              </div>
              <div className="flex gap-2 mb-3">
              {DEPOSIT_PRESETS.map((pct) => (
                <button
                  key={pct}
                  onClick={() => handleDepositPctChange(pct)}
                  className={`flex-1 h-11 rounded-lg text-xs font-semibold cursor-pointer border-2 ${
                    depositPct === pct && depositCustom === null
                      ? 'bg-white text-brand-black border-brand-black'
                      : 'bg-white text-brand-mid border-brand-border'
                  }`}
                >
                  {pct}%
                </button>
              ))}
              <button
                onClick={() => setDepositCustom('')}
                className={`flex-1 h-11 rounded-lg text-xs font-semibold cursor-pointer border-2 ${
                  depositCustom !== null
                    ? 'bg-white text-brand-black border-brand-black'
                    : 'bg-white text-brand-mid border-brand-border'
                }`}
              >
                Custom
              </button>
            </div>

            {depositCustom !== null && (
              <div className="mb-3">
                <input
                  type="text"
                  inputMode="decimal"
                  value={depositCustom}
                  onChange={(e) => setDepositCustom(e.target.value)}
                  onBlur={handleDepositCustomBlur}
                  placeholder="e.g. 15"
                  className="w-full min-h-12 px-3.5 border-2 border-brand-border rounded-lg text-base font-medium text-brand-black placeholder:text-gray-300 placeholder:italic outline-none focus:border-brand-black"
                />
              </div>
            )}

              <div className="text-xs text-brand-mid text-center leading-relaxed">
                Deposit: <span className="font-bold text-brand-black">£{formatAmountDisplay(depositAmount)}</span>
                <br />
                Balance on completion: <span className="font-bold text-brand-black">£{formatAmountDisplay(balance)}</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Sticky Footer */}
      <StickyFooter>
        <Button variant="primary" onClick={handlePreview} disabled={!canPreview}>
          Preview quote →
        </Button>
        <button
          onClick={onSaveDraft}
          className="w-full h-11.5 flex items-center justify-center text-sm font-medium text-brand-muted cursor-pointer underline underline-offset-2"
        >
          Save draft
        </button>
      </StickyFooter>
    </div>
  );
}
