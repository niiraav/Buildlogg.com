import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { ChevronLeft, X, Plus, BookmarkPlus, LayoutTemplate } from 'lucide-react';
import { db, type Customer, type Profile, type CustomItem } from '../../lib/db';
import { useAppStore } from '../../store/useAppStore';
import { nextJobNumber } from '../../lib/jobNumbers';
import { SegmentedControl } from '../../components/SegmentedControl';
import { Button } from '../../components/Button';
import { StickyFooter } from '../../components/StickyFooter';
import { showToast } from '../../components/Toast/store';
import { BottomSheet, SheetRow } from '../../components/BottomSheet';
import { TRADE_TEMPLATES, BEAUTY_TEMPLATES, type TemplateSeed } from '../../lib/tradeTemplates';
import { getPricingHistory, getJobTitlePricingHistory, clearPricingCache, type PricingHistory } from '../../lib/pricingHistory';
import { capture } from '../../lib/analytics';
import BrandedLoader from '../../components/BrandedLoader';
import { useUnsavedChanges } from '../../hooks/useUnsavedChanges';

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



/* ─── types ─── */

interface EditableItem {
  id: string;
  description: string;
  detail?: string;   // optional sub-text (what's included)
  amount: string; // raw string for input
  amountNum: number;
}

interface QuoteBuilderProps {
  customerId: string;
  jobId?: string;
  sourceJobId?: string;
  onPreview: () => void;
  onBack: () => void;
  onSaveDraft: () => void;
}

/* ─── component ─── */

export default function QuoteBuilder({ customerId, jobId, sourceJobId, onPreview, onBack, onSaveDraft }: QuoteBuilderProps) {
  const userId = useAppStore((s) => s.userId);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [_customerHistory, setCustomerHistory] = useState<{
    totalJobs: number;
    totalQuoted: number;
    totalPaid: number;
    lastQuoteDate: string | null;
  } | null>(null);
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

  /* Unsaved changes guard — warn when user navigates away with entered data */
  const builderIsDirty = !loading && (title.trim().length > 0 || items.length > 0 || notes.trim().length > 0 || date.trim().length > 0 || startTime.trim().length > 0);
  useUnsavedChanges(builderIsDirty, 'You have unsaved quote details. Leave without saving?');

  /* custom items library */
  const [customItems, setCustomItems] = useState<CustomItem[]>([]);
  const [showTemplateSheet, setShowTemplateSheet] = useState(false);

  const [jobTitlePricing, setJobTitlePricing] = useState<any>(null);
  const [itemPricingHints, setItemPricingHints] = useState<Record<string, PricingHistory | null>>({});
  const [profile, setProfile] = useState<Profile | null>(null);
  const depositSectionRef = useRef<HTMLDivElement>(null);
  const pricingDebounceRef = useRef<ReturnType<typeof setTimeout>>();

  /* load customer and job */
  useEffect(() => {
    if (!userId) return;

    const load = async () => {
      const c = await db.customers.get(customerId);
      setCustomer(c || null);

      /* Load customer history */
      if (c) {
        const jobs = await db.jobs.where('customer_id').equals(c.id).toArray();
        const jobIds = jobs.map((j) => j.id);
        const lineItems = jobIds.length > 0 ? await db.line_items.where('job_id').anyOf(jobIds).toArray() : [];
        const payments = jobIds.length > 0 ? await db.payments.where('job_id').anyOf(jobIds).toArray() : [];
        const totalQuoted = lineItems.reduce((sum, li) => sum + li.amount, 0);
        const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);
        const quotedJobs = jobs.filter((j) => j.quote_sent_at);
        const lastQuoteDate: string | null = quotedJobs.length > 0
          ? quotedJobs.sort((a, b) => new Date(b.quote_sent_at!).getTime() - new Date(a.quote_sent_at!).getTime())[0].quote_sent_at ?? null
          : null;
        setCustomerHistory({
          totalJobs: jobs.length,
          totalQuoted,
          totalPaid,
          lastQuoteDate,
        });
      }
      const p = await db.profiles.get(userId);
      setProfile(p || null);
      
      /* Load custom items */
      const ci = await db.custom_items.where('user_id').equals(userId).sortBy('sort_order');
      setCustomItems(ci);

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
                detail: i.detail || '',
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
        const jobNumber = await nextJobNumber(userId);
        await db.jobs.add({
          id: newJobId,
          user_id: userId,
          customer_id: customerId,
          title: '',
          job_number: jobNumber,
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
            id: newJobId, user_id: userId, customer_id: customerId, job_number: jobNumber,
            title: '', status: 'enquiry', payment_terms: 'on_completion',
            is_multi_day: false, created_at: n, updated_at: n,
          },
          created_at: n,
          retry_count: 0,
        });
        setCurrentJobId(newJobId);

        // BR-1: If sourceJobId provided, clone items from the source job instead of default labour
        if (sourceJobId) {
          const sourceJob = await db.jobs.get(sourceJobId);
          if (sourceJob) {
            setTitle(sourceJob.title || '');
            setPaymentTerms(sourceJob.payment_terms || 'on_completion');
            const presets = [10, 20, 25, 50];
            if (sourceJob.deposit_pct && !presets.includes(sourceJob.deposit_pct)) {
              setDepositPct(sourceJob.deposit_pct);
              setDepositCustom(String(sourceJob.deposit_pct));
            } else {
              setDepositPct(sourceJob.deposit_pct || 20);
              setDepositCustom(null);
            }
            const sourceItems = await db.line_items.where('job_id').equals(sourceJobId).toArray();
            if (sourceItems.length > 0) {
              const clonedItems = sourceItems.map((i) => ({
                id: crypto.randomUUID(),
                description: i.description,
                detail: i.detail || '',
                amount: i.amount ? i.amount.toFixed(2) : '',
                amountNum: i.amount || 0,
              }));
              setItems(clonedItems);
              for (const ci of clonedItems) {
                await db.line_items.add({
                  id: ci.id,
                  job_id: newJobId,
                  description: ci.description,
                  detail: ci.detail || undefined,
                  amount: ci.amountNum,
                  sort_order: sourceItems.find(si => si.description === ci.description)?.sort_order || 0,
                  added_on_site: false,
                  created_at: n,
                  _sync_status: 'pending',
                });
                await db.sync_queue.add({
                  operation: 'insert',
                  table_name: 'line_items',
                  record_id: ci.id,
                  payload: {
                    id: ci.id, job_id: newJobId,
                    description: ci.description, amount: ci.amountNum,
                    sort_order: sourceItems.find(si => si.description === ci.description)?.sort_order || 0,
                    added_on_site: false, created_at: n,
                  },
                  created_at: n,
                  retry_count: 0,
                });
              }
            }
          }
        } else if (p && p.default_labour_charge > 0) {
          // Auto-fill default labour charge from profile (only if enabled in onboarding)
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
  }, [customerId, currentJobId, userId, sourceJobId]);

  /* ─── derived ─── */
  const total = useMemo(() => items.reduce((sum, i) => sum + (i.amountNum || 0), 0), [items]);

  const canPreview =
    title.trim().length > 0 &&
    items.length > 0 &&
    total > 0 &&
    items.every((item) => item.description.trim() && item.amountNum > 0);

  const depositAmount = paymentTerms === 'deposit' ? total * (depositPct / 100) : 0;
  const balance = total - depositAmount;

  // Clear pricing cache on unmount
  useEffect(() => {
    return () => clearPricingCache();
  }, []);

  /* ─── BN-4: Pricing history helpers ─── */
  const fetchItemPricing = useCallback(async (description: string) => {
    if (!description.trim() || !userId) return;
    const history = await getPricingHistory(userId, description.trim());
    setItemPricingHints(prev => ({ ...prev, [description.toLowerCase().trim()]: history }));
    if (history) capture('pricing_hint_shown', { type: 'line_item', count: history.count });
  }, [userId]);

  const updateItemDescWithPricing = (id: string, desc: string) => {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, description: desc } : i)));
    if (pricingDebounceRef.current) clearTimeout(pricingDebounceRef.current);
    pricingDebounceRef.current = setTimeout(() => fetchItemPricing(desc), 300);
  };

  const addQuickItemWithPricing = (customItem: CustomItem) => {
    setItems((prev) => [
      ...prev,
      { id: crypto.randomUUID(), description: customItem.description, detail: customItem.detail, amount: customItem.amount.toFixed(2), amountNum: customItem.amount },
    ]);
    fetchItemPricing(customItem.description);
  };

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
        detail: i.detail?.trim() || undefined,
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
          detail: i.detail?.trim() || undefined,
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
  const handleTitleBlur = async () => {
    setTitleFocused(false);
    saveJob();
    if (title.trim() && userId) {
      const history = await getJobTitlePricingHistory(userId, title.trim());
      setJobTitlePricing(history);
      if (history) capture('pricing_hint_shown', { type: 'job_title', count: history.count });
    } else {
      setJobTitlePricing(null);
    }
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



  /* Starter suggestions when user has no custom items */
  const starterItems: CustomItem[] = [
    { id: 'starter-1', user_id: '', description: 'Labour', amount: profile?.default_labour_charge || 0, sort_order: 0, created_at: '', updated_at: '', _sync_status: 'pending' },
    { id: 'starter-2', user_id: '', description: 'Materials', amount: 0, sort_order: 1, created_at: '', updated_at: '', _sync_status: 'pending' },
    { id: 'starter-3', user_id: '', description: 'Callout charge', amount: profile?.callout_charge || 75, sort_order: 2, created_at: '', updated_at: '', _sync_status: 'pending' },
  ];
  const displayItems = customItems.length > 0 ? customItems : starterItems;
  const filteredDisplayItems = displayItems.filter(
    (ci) => !items.some((i) => i.description.trim().toLowerCase() === ci.description.trim().toLowerCase())
  );

  const isInLibrary = (description: string, amount: number): boolean => {
    return displayItems.some((ci) => ci.description === description && ci.amount === amount);
  };

  const saveToLibrary = async (description: string, amount: number, detail?: string) => {
    if (!userId || isInLibrary(description, amount)) return;
    const n = new Date().toISOString();
    const item: CustomItem = { id: crypto.randomUUID(), user_id: userId, description, detail, amount, sort_order: customItems.length, created_at: n, updated_at: n, _sync_status: 'pending' };
    await db.custom_items.add(item);
    await db.sync_queue.add({ operation: 'insert', table_name: 'custom_items', record_id: item.id, payload: { ...item }, created_at: n, retry_count: 0 });
    setCustomItems((prev) => [...prev, item]);
    showToast(`Saved "${description}" to your items`, 'success', 3000);
  };

  // XU-1: Apply a trade/beauty template — replaces all items and writes directly to Dexie.
  // Does NOT use saveItems() useCallback — it closes over stale items state (race condition).
  const applyTemplate = async (seeds: TemplateSeed[]) => {
    const newItems: EditableItem[] = seeds.map((seed) => ({
      id: crypto.randomUUID(),
      description: seed.description,
      detail: seed.detail || '',
      amount: seed.amount.toFixed(2),
      amountNum: seed.amount,
    }));
    setItems(newItems);
    setShowTemplateSheet(false);
    capture('template_applied', { count: seeds.length });

    // Write directly to Dexie (same pattern as saveItems but with explicit items)
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
    for (let idx = 0; idx < newItems.length; idx++) {
      const i = newItems[idx];
      await db.line_items.add({
        id: i.id,
        job_id: currentJobId,
        description: i.description,
        detail: i.detail || undefined,
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
          description: i.description,
          detail: i.detail || undefined,
          amount: i.amountNum,
          sort_order: idx,
          added_on_site: false, created_at: n,
        },
        created_at: n,
        retry_count: 0,
      });
    }
  };

  // XU-1: Determine available templates based on profile
  const getAvailableTemplates = (): Array<{ label: string; seeds: TemplateSeed[] }> => {
    if (profile?.business_type === 'beauty') {
      return [{ label: `Beauty services — ${BEAUTY_TEMPLATES.length} items`, seeds: BEAUTY_TEMPLATES }];
    }
    const tradeKey = profile?.trade || 'other';
    const tradeTemplates = TRADE_TEMPLATES[tradeKey];
    if (tradeTemplates) {
      const tradeLabel = tradeKey === 'other' ? 'General' :
        tradeKey.charAt(0).toUpperCase() + tradeKey.slice(1);
      return [{ label: `${tradeLabel} — ${tradeTemplates.length} items`, seeds: tradeTemplates }];
    }
    return [{ label: `General — ${TRADE_TEMPLATES['other'].length} items`, seeds: TRADE_TEMPLATES['other'] }];
  };

  const handleRemoveEmptyItems = () => {
    setItems((prev) => prev.filter((i) => i.description.trim() || i.amountNum > 0));
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

  const updateItemDetail = (id: string, detail: string) => {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, detail } : i)));
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
      <div className="flex flex-col min-h-[100dvh]">
        <div className="flex-1 flex items-center justify-center">
          <BrandedLoader size={48} fullscreen={false} />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-[100dvh]">
      {/* Header */}
      <div className="sticky top-0 z-40 bg-[var(--app-shell-bg)] px-4 py-2 border-b border-brand-borderLight shrink-0 grid grid-cols-3 items-center">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-1 min-h-11 pr-4 text-sm font-medium text-brand-mid cursor-pointer justify-self-start"
        >
          <ChevronLeft size={24} className="-mt-px text-brand-muted" />
          Back
        </button>
        <span className="text-base font-bold text-brand-black text-center">Quote details</span>
        <div className="min-h-11 w-11" aria-hidden="true" />
      </div>

      {/* Body */}
      <div className="flex-1 px-4 md:px-6 pt-4 md:pt-6 pb-[calc(128px + env(safe-area-inset-bottom))]">
        {/* Customer strip */}
        {customer && (
          <div className="bg-brand-surface border border-brand-border rounded-lg px-3.5 py-2.5 mb-5 flex items-center gap-2">
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-brand-black truncate">{customer.name || 'Unknown'}</div>
              <div className="text-sm text-brand-muted mt-px">{customer.phone}</div>
            </div>
            <button
              onClick={onBack}
              className="text-sm text-brand-mid underline underline-offset-2 cursor-pointer shrink-0"
            >
              Edit
            </button>
          </div>
        )}

        {/* Job details */}
        <div className="mb-5">
          <div className="text-micro font-bold text-brand-mid tracking-[0.7px] mb-2.5">
            Job
          </div>

          <div className="mb-2.5">
            <label className="block text-label font-semibold text-brand-dark tracking-[0.3px] mb-1">
              Job title
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onFocus={() => setTitleFocused(true)}
              onBlur={handleTitleBlur}
              placeholder="e.g. New boiler installation"
              className={`w-full min-h-12 px-3.5 border-2 rounded-lg text-base font-medium text-brand-black placeholder:text-brand-muted placeholder:italic outline-none ${
                titleFocused ? 'border-brand-black' : 'border-brand-border'
              }`}
            />
            {jobTitlePricing && !titleFocused && (
              <p className="text-xs text-brand-mid mt-1">
                {jobTitlePricing.highVariance
                  ? `You've quoted this ${jobTitlePricing.count}× — £${jobTitlePricing.min.toFixed(0)} to £${jobTitlePricing.max.toFixed(0)} (varies widely)`
                  : `You've quoted this ${jobTitlePricing.count}× — £${jobTitlePricing.min.toFixed(0)} to £${jobTitlePricing.max.toFixed(0)}, avg £${jobTitlePricing.avg.toFixed(0)}`}
              </p>
            )}
          </div>

          <div className="mb-2.5">
            <label className="block text-label font-semibold text-brand-dark tracking-[0.3px] mb-1">
              Date <span className="normal-case font-normal tracking-0">(optional)</span>
            </label>
            <div className="relative">
              <input
                type="date"
                value={date}
                min={new Date().toISOString().split('T')[0]}
                onChange={(e) => setDate(e.target.value)}
                onClick={(e) => { try { (e.currentTarget as HTMLInputElement).showPicker(); } catch {} }}
                onBlur={handleDateBlur}
                className="w-full h-12 px-3.5 pr-10 border-2 border-brand-border rounded-lg text-base font-medium text-brand-black outline-none focus:border-brand-black bg-white"
              />
            </div>
          </div>

          <div className="flex flex-row gap-2.5">
            <div className="flex-1 min-w-0">
              <label className="block text-label font-semibold text-brand-dark tracking-[0.3px] mb-1">
                Start <span className="normal-case font-normal tracking-0">(optional)</span>
              </label>
              <div className="relative">
                <input
                  type="time"
                  value={startTime}
                  min={date === new Date().toISOString().split('T')[0] ? new Date().toTimeString().slice(0, 5) : undefined}
                  onChange={(e) => setStartTime(e.target.value)}
                  onClick={(e) => { try { (e.currentTarget as HTMLInputElement).showPicker(); } catch {} }}
                  onBlur={handleStartTimeBlur}
                  className="w-full h-12 px-3.5 pr-8 border-2 border-brand-border rounded-lg text-base font-medium text-brand-black outline-none focus:border-brand-black bg-white"
                />
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <label className="block text-label font-semibold text-brand-dark tracking-[0.3px] mb-1">
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
                  <Plus size={14} className="text-brand-muted" />
  Add end time
                </button>
              ) : (
                <div className="relative">
                  <input
                    type="time"
                    value={endTime}
                    min={startTime || undefined}
                    onChange={(e) => setEndTime(e.target.value)}
                    onClick={(e) => { try { (e.currentTarget as HTMLInputElement).showPicker(); } catch {} }}
                    onBlur={handleEndTimeBlur}
                    className="w-full h-12 px-3.5 pr-8 border-2 border-brand-border rounded-lg text-base font-medium text-brand-black outline-none focus:border-brand-black bg-white"
                  />
                  <button
                    onClick={() => { setEndTime(''); saveJob(); }}
                    className="absolute right-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-brand-borderLight flex items-center justify-center cursor-pointer"
                    aria-label="Clear end time"
                  >
                    <X size={12} className="text-brand-muted" />                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Line items */}
        <div className="mb-5">
          <div className="text-micro font-bold text-brand-mid tracking-[0.7px] mb-2.5">
            Items
          </div>

          <div className="border border-brand-border rounded-lg overflow-hidden mb-2">
            {items.map((item, idx) => (
              <div
                key={item.id}
                className={`px-3.5 py-2.5 min-w-0 ${idx < items.length - 1 ? 'border-b border-brand-borderLight' : ''}`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <div className="flex-1 min-w-0 flex items-center gap-1">
                    <input
                      type="text"
                      value={item.description}
                      onChange={(e) => updateItemDescWithPricing(item.id, e.target.value)}
                      onBlur={saveItemBlur}
                      placeholder="Item description"
                      className={`flex-1 min-w-0 min-h-12 px-2 border-2 rounded-lg text-base font-medium text-brand-black placeholder:text-brand-muted placeholder:italic outline-none focus:border-brand-black ${
                        item.description.trim() ? 'border-brand-border' : 'border-status-error'
                      }`}
                    />
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <span className="text-sm text-brand-mid">£</span>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={item.amount}
                      onChange={(e) => updateItemAmount(item.id, e.target.value)}
                      onBlur={saveItemBlur}
                      placeholder="0.00"
                      className={`w-20 min-h-12 px-2 border-2 rounded-lg text-base font-medium text-brand-black text-right outline-none focus:border-brand-black placeholder:text-brand-muted ${
                        (item.amount === '' || item.amountNum === 0) ? 'border-status-error' : 'border-brand-border'
                      }`}
                    />
                  </div>
                  <button
                    onClick={() => removeItem(item.id)}
                    className="w-7 h-7 rounded-full border border-brand-border bg-brand-surface flex items-center justify-center shrink-0 cursor-pointer"
                    aria-label="Remove item"
                  >
                    <X size={14} className="text-brand-muted" />
                  </button>
                </div>
                {/* BN-4: Line item pricing hint */}
                {(() => {
                  const hint = itemPricingHints[item.description.toLowerCase().trim()];
                  if (!hint) return null;
                  return (
                    <div className="text-xs text-brand-mid mt-1 flex items-center gap-2 flex-wrap">
                      <span>
                        {hint.count > 0
                          ? `Default: \u00a3${hint.defaultAmount.toFixed(0)}. Last ${hint.count} ${hint.count === 1 ? 'charge' : 'charges'}: \u00a3${hint.minCharged.toFixed(0)}-\u00a3${hint.maxCharged.toFixed(0)}${!hint.highVariance ? `, avg \u00a3${hint.avgCharged.toFixed(0)}` : ''}.`
                          : `Default: \u00a3${hint.defaultAmount.toFixed(0)}.`}
                      </span>
                      {!hint.highVariance && hint.avgCharged > 0 && (
                        <button
                          onClick={() => { updateItemAmount(item.id, hint.avgCharged.toFixed(2)); capture('pricing_hint_used', { type: 'line_item', amount_used: 'avg' }); }}
                          className="text-brand-dark font-semibold underline cursor-pointer"
                        >
                          Use \u00a3{hint.avgCharged.toFixed(0)}
                        </button>
                      )}
                    </div>
                  );
                })()}
                {/* Detail sub-text input (Issue E) */}
                <input
                  type="text"
                  value={item.detail || ''}
                  onChange={(e) => updateItemDetail(item.id, e.target.value)}
                  onBlur={saveItemBlur}
                  placeholder="Add detail (optional) — e.g. what's included"
                  className="w-full min-h-9 mt-1.5 px-2 text-sm text-brand-mid bg-brand-surface border border-brand-borderLight rounded-md outline-none focus:border-brand-mid placeholder:text-brand-muted placeholder:italic"
                />

              </div>
            ))}
          </div>

          <button
            onClick={addItem}
            className="inline-flex items-center gap-1 text-sm font-medium text-brand-mid underline underline-offset-2 cursor-pointer"
          >
            <Plus size={14} />
            Add item
          </button>

          {/* XU-1: Start from template — only when items are empty or unfilled */}
          {(items.length === 0 || (items.length === 1 && !items[0].description.trim())) && (
            <button
              onClick={() => setShowTemplateSheet(true)}
              className="inline-flex items-center gap-1.5 h-9 px-3 mt-2 rounded-full bg-transparent text-sm font-medium text-brand-mid cursor-pointer border border-dashed border-brand-border hover:border-brand-mid transition-colors"
            >
              <LayoutTemplate size={14} />
              Start from template
            </button>
          )}

          {/* Quick-add chips — custom item library */}
          {filteredDisplayItems.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {filteredDisplayItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => addQuickItemWithPricing(item)}
                  className="inline-flex items-center gap-1.5 h-9 px-3 rounded-full bg-brand-borderLight text-sm font-medium text-brand-dark cursor-pointer border border-brand-border hover:bg-brand-border active:bg-brand-borderLight transition-colors"
                >
                  <Plus size={12} className="text-brand-muted" />
                  <span className="truncate max-w-[120px]">{item.description}</span>
                  {item.amount > 0 && (
                    <span className="text-brand-muted font-normal">£{item.amount.toFixed(2)}</span>
                  )}
                </button>
              ))}
            </div>
          )}

          {/* Save to library pill — always visible when there's an unsaved item,
              even if all chips are filtered out (prevents the pill from disappearing) */}
          {items.filter((i) => i.description.trim() && i.amountNum > 0 && !isInLibrary(i.description, i.amountNum)).slice(0, 1).map((item) => (
            <div key={`save-wrapper-${item.id}`} className="mt-2">
              <button
                onClick={() => saveToLibrary(item.description.trim(), item.amountNum, item.detail?.trim())}
                className="inline-flex items-center gap-1.5 h-9 px-3 rounded-full bg-brand-black text-brand-surface text-sm font-medium cursor-pointer hover:opacity-90 active:opacity-80 transition-opacity"
              >
                <BookmarkPlus size={14} />
                <span className="truncate max-w-[100px]">Save "{item.description.trim()}"</span>
              </button>
            </div>
          ))}

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
          <label className="block text-label font-semibold text-brand-dark tracking-[0.3px] mb-1">
            Notes <span className="normal-case font-normal tracking-0">(optional)</span>
          </label>
          <div className="relative">
            <textarea
              value={notes}
              onChange={(e) => handleNotesChange(e.target.value)}
              onBlur={handleNotesBlur}
              placeholder="e.g. Includes all parts, labour, and disposal of old unit"
              rows={3}
              className="w-full min-h-20 px-3.5 py-2.5 pr-12 border-2 border-brand-border rounded-lg text-base font-medium text-brand-black placeholder:text-brand-muted placeholder:italic outline-none focus:border-brand-black resize-none leading-relaxed"
            />
          </div>
        </div>

        {/* Payment terms */}
        <div className="mb-5">
          <div className="text-micro font-bold text-brand-mid tracking-[0.7px] mb-2.5">
            Payment
          </div>
          <SegmentedControl
            options={PAYMENT_OPTIONS}
            value={paymentTerms}
            onChange={handlePaymentTermsChange}
          />
          <div className="mt-2.5 bg-brand-surface border border-brand-border rounded-lg p-3">
            <p className="text-sm text-brand-dark leading-relaxed">
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
              <div className="text-micro font-bold text-brand-mid tracking-[0.7px] mb-2.5">
                Deposit amount
              </div>
              <div className="flex gap-2 mb-3">
              {DEPOSIT_PRESETS.map((pct) => (
                <button
                  key={pct}
                  onClick={() => handleDepositPctChange(pct)}
                  className={`flex-1 h-11 rounded-lg text-sm font-semibold cursor-pointer border-2 ${
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
                className={`flex-1 h-11 rounded-lg text-sm font-semibold cursor-pointer border-2 ${
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
                  className="w-full min-h-12 px-3.5 border-2 border-brand-border rounded-lg text-base font-medium text-brand-black placeholder:text-brand-muted placeholder:italic outline-none focus:border-brand-black"
                />
              </div>
            )}

              <div className="text-sm text-brand-mid text-center leading-relaxed">
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

      {/* XU-1: Template picker BottomSheet */}
      <BottomSheet
        isOpen={showTemplateSheet}
        onClose={() => setShowTemplateSheet(false)}
        title="Choose a template"
      >
        {getAvailableTemplates().map((tpl, idx) => (
          <SheetRow
            key={idx}
            icon={<LayoutTemplate size={18} className="text-brand-dark" />}
            label={tpl.label}
            onTap={() => applyTemplate(tpl.seeds)}
            isLast={idx === getAvailableTemplates().length - 1}
          />
        ))}
      </BottomSheet>
    </div>
  );
}
