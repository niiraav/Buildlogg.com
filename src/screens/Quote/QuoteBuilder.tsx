import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { ChevronLeft, X, Plus } from 'lucide-react';
import { db, type Customer } from '../../lib/db';
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
  const [items, setItems] = useState<EditableItem[]>([]);
  const [paymentTerms, setPaymentTerms] = useState<'on_completion' | 'deposit' | 'invoice'>('on_completion');
  const [depositPct, setDepositPct] = useState<number>(20);
  const [depositCustom, setDepositCustom] = useState<string | null>(null);
  const [titleFocused, setTitleFocused] = useState(false);
  const depositSectionRef = useRef<HTMLDivElement>(null);

  /* load customer and job */
  useEffect(() => {
    if (!userId) return;

    const load = async () => {
      const c = await db.customers.get(customerId);
      setCustomer(c || null);

      if (currentJobId) {
        const job = await db.jobs.get(currentJobId);
        if (job) {
          setTitle(job.title || '');
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
            const profile = await db.profiles.get(userId);
            if (profile && profile.default_labour_charge > 0) {
              const itemId = crypto.randomUUID();
              const desc = profile.default_labour_description || 'Labour';
              const amt = profile.default_labour_charge;
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
        const profile = await db.profiles.get(userId);
        if (profile && profile.default_labour_charge > 0) {
          const itemId = crypto.randomUUID();
          const desc = profile.default_labour_description || 'Labour';
          const amt = profile.default_labour_charge;
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
        updated_at: n,
      },
      created_at: n,
      retry_count: 0,
    });
  }, [currentJobId, userId, title, date, startTime, endTime, paymentTerms, depositPct]);

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
          added_on_site: false,
          created_at: n,
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

  const saveItemBlur = useCallback(() => {
    saveItems();
  }, [saveItems]);

  const handlePreview = async () => {
    await saveItems();
    await saveJob();
    onPreview();
  };

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
          <div className="w-8 h-8 border-2 border-[#E5E7EB] border-t-[#111827] rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-[100svh]">
      {/* Header */}
      <div className="px-4 pt-2 pb-3 border-b border-[#F3F4F6] shrink-0 flex items-center justify-between">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-1 min-h-[44px] pr-4 text-[14px] font-medium text-[#6B7280] cursor-pointer"
        >
          <ChevronLeft size={22} color="#9CA3AF" className="-mt-px" />
          Back
        </button>
        <span className="text-[16px] font-bold text-[#111827]">Quote details</span>
        <div className="min-h-[44px] w-[44px]" aria-hidden="true" />
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-4 pt-4 pb-2">
        {/* Customer strip */}
        {customer && (
          <div className="bg-[#F9FAFB] border border-[#E5E7EB] rounded-lg px-3.5 py-2.5 mb-5 flex items-center gap-2">
            <div className="flex-1 min-w-0">
              <div className="text-[14px] font-semibold text-[#111827] truncate">{customer.name || 'Unknown'}</div>
              <div className="text-[12px] text-[#9CA3AF] mt-px">{customer.phone}</div>
            </div>
            <button
              onClick={onBack}
              className="text-[12px] text-[#6B7280] underline underline-offset-2 cursor-pointer shrink-0"
            >
              Edit
            </button>
          </div>
        )}

        {/* Job details */}
        <div className="mb-5">
          <div className="text-[10px] font-bold text-[#6B7280] uppercase tracking-[0.7px] mb-2.5">
            Job
          </div>

          <div className="mb-2.5">
            <label className="block text-[11px] font-semibold text-[#9CA3AF] uppercase tracking-[0.3px] mb-1">
              Job title
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onFocus={() => setTitleFocused(true)}
              onBlur={handleTitleBlur}
              placeholder="e.g. New boiler installation"
              className={`w-full min-h-[48px] px-3.5 border-[1.5px] rounded-[10px] text-[16px] font-medium text-[#111827] placeholder:text-[#D1D5DB] placeholder:italic outline-none ${
                titleFocused ? 'border-[#111827]' : 'border-[#E5E7EB]'
              }`}
            />
          </div>

          <div className="mb-2.5">
            <label className="block text-[11px] font-semibold text-[#9CA3AF] uppercase tracking-[0.3px] mb-1">
              Date <span className="normal-case font-normal tracking-0">(optional)</span>
            </label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              onBlur={handleDateBlur}
              className="w-full min-h-[48px] px-3.5 border-[1.5px] border-[#E5E7EB] rounded-[10px] text-[16px] font-medium text-[#111827] outline-none focus:border-[#111827] bg-white appearance-none"
              style={{ colorScheme: 'light' }}
            />
          </div>

          <div className="flex gap-2.5">
            <div className="flex-1">
              <label className="block text-[11px] font-semibold text-[#9CA3AF] uppercase tracking-[0.3px] mb-1">
                Start <span className="normal-case font-normal tracking-0">(optional)</span>
              </label>
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                onBlur={handleStartTimeBlur}
                className="w-full min-h-[48px] px-3.5 border-[1.5px] border-[#E5E7EB] rounded-[10px] text-[16px] font-medium text-[#111827] outline-none focus:border-[#111827] bg-white appearance-none"
                style={{ colorScheme: 'light' }}
              />
            </div>
            <div className="flex-1">
              <label className="block text-[11px] font-semibold text-[#9CA3AF] uppercase tracking-[0.3px] mb-1">
                End <span className="normal-case font-normal tracking-0">(optional)</span>
              </label>
              <input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                onBlur={handleEndTimeBlur}
                className="w-full min-h-[48px] px-3.5 border-[1.5px] border-[#E5E7EB] rounded-[10px] text-[16px] font-medium text-[#111827] outline-none focus:border-[#111827] bg-white appearance-none"
                style={{ colorScheme: 'light' }}
              />
            </div>
          </div>
        </div>

        {/* Line items */}
        <div className="mb-5">
          <div className="text-[10px] font-bold text-[#6B7280] uppercase tracking-[0.7px] mb-2.5">
            Items
          </div>

          <div className="border border-[#E5E7EB] rounded-[10px] overflow-hidden mb-2">
            {items.map((item, idx) => (
              <div
                key={item.id}
                className={`flex items-center gap-2 px-3.5 py-2.5 ${idx < items.length - 1 ? 'border-b border-[#F3F4F6]' : ''}`}
              >
                <input
                  type="text"
                  value={item.description}
                  onChange={(e) => updateItemDesc(item.id, e.target.value)}
                  onBlur={saveItemBlur}
                  placeholder="Item description"
                  className="flex-1 min-h-[48px] px-2 border-[1.5px] border-[#E5E7EB] rounded-lg text-[16px] font-medium text-[#111827] placeholder:text-[#D1D5DB] placeholder:italic outline-none focus:border-[#111827]"
                />
                <div className="flex items-center gap-1 shrink-0">
                  <span className="text-[14px] text-[#6B7280]">£</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={item.amount}
                    onChange={(e) => updateItemAmount(item.id, e.target.value)}
                    onBlur={saveItemBlur}
                    placeholder="0.00"
                    className={`w-[80px] min-h-[48px] px-2 border-[1.5px] rounded-lg text-[16px] font-medium text-[#111827] text-right outline-none focus:border-[#111827] placeholder:text-[#D1D5DB] ${
                      (item.amount === '' || item.amountNum === 0) ? 'border-[#EF4444]' : 'border-[#E5E7EB]'
                    }`}
                  />
                </div>
                <button
                  onClick={() => removeItem(item.id)}
                  className="w-7 h-7 rounded-full border border-[#E5E7EB] bg-[#F9FAFB] flex items-center justify-center shrink-0 cursor-pointer"
                  aria-label="Remove item"
                >
                  <X size={14} color="#9CA3AF" />
                </button>
              </div>
            ))}
          </div>

          <button
            onClick={addItem}
            className="inline-flex items-center gap-1 text-[13px] font-medium text-[#6B7280] underline underline-offset-2 cursor-pointer"
          >
            <Plus size={14} />
            Add item
          </button>

          {/* Total bar */}
          {items.length > 0 && (
            <div className="flex justify-between items-center mt-3 py-3 px-3.5 border-t-[1.5px] border-[#111827]">
              <span className="text-[15px] font-bold text-[#111827]">Total</span>
              <span className="text-[24px] font-extrabold text-[#111827] tracking-tight">
                £{formatAmountDisplay(total)}
              </span>
            </div>
          )}
        </div>

        {/* Payment terms */}
        <div className="mb-5">
          <div className="text-[10px] font-bold text-[#6B7280] uppercase tracking-[0.7px] mb-2.5">
            Payment
          </div>
          <SegmentedControl
            options={PAYMENT_OPTIONS}
            value={paymentTerms}
            onChange={handlePaymentTermsChange}
          />
        </div>

        {/* Deposit section */}
        {paymentTerms === 'deposit' && (
          <div ref={depositSectionRef} className="mb-5">
            <div className="bg-[#F9FAFB] border border-[#E5E7EB] rounded-[10px] p-3.5">
              <div className="text-[10px] font-bold text-[#6B7280] uppercase tracking-[0.7px] mb-2.5">
                Deposit amount
              </div>
              <div className="flex gap-2 mb-3">
              {DEPOSIT_PRESETS.map((pct) => (
                <button
                  key={pct}
                  onClick={() => handleDepositPctChange(pct)}
                  className={`flex-1 h-[44px] rounded-lg text-[13px] font-semibold cursor-pointer border-[1.5px] ${
                    depositPct === pct && depositCustom === null
                      ? 'bg-white text-[#111827] border-[#111827]'
                      : 'bg-white text-[#6B7280] border-[#E5E7EB]'
                  }`}
                >
                  {pct}%
                </button>
              ))}
              <button
                onClick={() => setDepositCustom('')}
                className={`flex-1 h-[44px] rounded-lg text-[13px] font-semibold cursor-pointer border-[1.5px] ${
                  depositCustom !== null
                    ? 'bg-white text-[#111827] border-[#111827]'
                    : 'bg-white text-[#6B7280] border-[#E5E7EB]'
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
                  className="w-full min-h-[48px] px-3.5 border-[1.5px] border-[#E5E7EB] rounded-[10px] text-[16px] font-medium text-[#111827] placeholder:text-[#D1D5DB] placeholder:italic outline-none focus:border-[#111827]"
                />
              </div>
            )}

              <div className="text-[13px] text-[#6B7280] text-center leading-relaxed">
                Deposit: <span className="font-bold text-[#111827]">£{formatAmountDisplay(depositAmount)}</span>
                <br />
                Balance on completion: <span className="font-bold text-[#111827]">£{formatAmountDisplay(balance)}</span>
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
          className="w-full h-[46px] flex items-center justify-center text-[14px] font-medium text-[#9CA3AF] cursor-pointer underline underline-offset-2"
        >
          Save draft
        </button>
      </StickyFooter>
    </div>
  );
}
