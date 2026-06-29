import { useState, useEffect, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ChevronRight, ChevronDown, ClipboardList, Search, X, CalendarDays } from 'lucide-react';
import { BottomSheet } from '../../components/BottomSheet';
import WeekView from '../../components/WeekView';
import { CompactWeekStrip } from '../../components/CompactWeekStrip';
import { useScrollHide } from '../../hooks/useScrollHide';
import { capture } from '../../lib/analytics';
import { db, type Job, type Customer, type LineItem, type JobStatus, type Payment } from '../../lib/db';
import { useAppStore } from '../../store/useAppStore';
import { ensureJobNumber } from '../../lib/jobNumbers';
import { paymentSummary } from '../../lib/paymentHelpers';
import SyncIndicator from '../../components/SyncIndicator';
import { Button } from '../../components/Button';
import { SkeletonAppScreen } from '../../components/Skeleton';

/* ─── helpers ─── */

const now = () => new Date();

function daysSince(dateStr: string): number {
  const d = new Date(dateStr);
  const n = new Date();
  return Math.floor((n.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
}

function formatShortDate(d: Date): string {
  return d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' });
}

function formatTime(d: Date): string {
  return d.toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit', hour12: true }).toLowerCase();
}

function elapsedStr(start: string): string {
  const diff = Date.now() - new Date(start).getTime();
  const h = Math.floor(diff / (1000 * 60 * 60));
  const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  return `${h}h ${m}m in`;
}

function jobTotal(items: LineItem[], jobId: string): number {
  return items.filter((i) => i.job_id === jobId).reduce((s, i) => s + (i.amount || 0), 0);
}

/* ─── types ─── */

type Filter = 'all' | 'active' | 'unpaid';

interface JobWithTotal extends Job {
  total: number;
  amountDue: number;
  customer: Customer;
}

/* ─── status config ─── */

const statusOrder: JobStatus[] = [
  'in_progress',
  'booked',
  'quoted',
  'awaiting_payment',
  'no_show',
  'paid',
  'cancelled',
  'written_off',
];

const statusLabels: Record<JobStatus, string> = {
  enquiry: 'Enquiry',
  in_progress: 'In Progress',
  booked: 'Booked',
  quoted: 'Quoted',
  awaiting_payment: 'Awaiting Payment',
  no_show: 'No-Show',
  paid: 'Paid',
  cancelled: 'Cancelled',
  written_off: 'Written Off',
};

const statusDotClasses: Record<JobStatus, string> = {
  enquiry: 'bg-brand-mid',
  in_progress: 'bg-status-blue',
  booked: 'bg-status-blue',
  quoted: 'bg-purple-600',
  awaiting_payment: 'bg-status-amber',
  no_show: 'bg-amber-800',
  paid: 'bg-status-green',
  cancelled: 'bg-brand-border',
  written_off: 'bg-brand-border',
};

// Subtle background tint per status (CSS variables — already very pale)
const statusBgTints: Partial<Record<JobStatus, string>> = {
  in_progress: 'var(--color-blue-bg)',
  booked: 'var(--color-blue-bg)',
  awaiting_payment: 'var(--color-amber-bg)',
  no_show: 'var(--color-amber-bg)',
  paid: 'var(--color-green-bg)',
  cancelled: 'var(--color-red-bg)',
  written_off: 'var(--color-red-bg)',
};

const filters: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'active', label: 'Active' },
  { key: 'unpaid', label: 'Unpaid' },
];

/* ─── component ─── */

export default function Jobs() {
  const navigate = useNavigate();
  const userId = useAppStore((s) => s.userId);

  const [searchParams, setSearchParams] = useSearchParams();
  const dateFilter = searchParams.get('date');
  const [filter, setFilter] = useState<Filter>(() => {
    const urlFilter = searchParams.get('filter') as Filter;
    return urlFilter && ['all', 'active', 'unpaid'].includes(urlFilter) ? urlFilter : 'all';
  });
  const [expanded, setExpanded] = useState<Set<JobStatus>>(new Set(['in_progress', 'booked', 'quoted', 'awaiting_payment']));

  // When a date filter is active, auto-expand all groups so filtered jobs are visible
  useEffect(() => {
    if (dateFilter) {
      setExpanded(new Set(['enquiry', 'in_progress', 'booked', 'quoted', 'awaiting_payment', 'no_show', 'paid', 'cancelled', 'written_off']));
    }
  }, [dateFilter]);
  const [searchQuery, setSearchQuery] = useState('');
  const [showWeekSheet, setShowWeekSheet] = useState(false);
  const weekStripVisible = useScrollHide();

  /* --- reactive data (useLiveQuery) --- */
  const rawJobs = useLiveQuery(() => userId ? db.jobs.where('user_id').equals(userId).toArray() : [], [userId]);
  const rawCustomers = useLiveQuery(() => userId ? db.customers.where('user_id').equals(userId).toArray() : [], [userId]);
  const rawLineItems = useLiveQuery(() => db.line_items.toArray(), []);
  const rawPayments = useLiveQuery(() => db.payments.toArray(), []);

  const loading = rawJobs === undefined || rawCustomers === undefined;

  // Backfill missing job numbers (side effect)
  useEffect(() => {
    if (!userId || !rawJobs) return;
    const needsNumbers = rawJobs.filter((j) => !j.job_number);
    if (needsNumbers.length === 0) return;
    Promise.all(needsNumbers.map((j) => ensureJobNumber(j, userId))).catch(() => {});
  }, [userId, rawJobs]);

  // Build customer map from raw data
  const customers = useMemo<Record<string, Customer>>(() => {
    const map: Record<string, Customer> = {};
    if (rawCustomers) rawCustomers.forEach((c) => { map[c.id] = c; });
    return map;
  }, [rawCustomers]);

  // Jobs with job numbers (from raw, already backfilled via useEffect)
  const jobs = useMemo<Job[]>(() => rawJobs || [], [rawJobs]);
  const lineItems = useMemo<LineItem[]>(() => rawLineItems || [], [rawLineItems]);
  const lineItemsMap = useMemo<Record<string, LineItem[]>>(() => { const m: Record<string, LineItem[]> = {}; lineItems.forEach(li => { if (!m[li.job_id]) m[li.job_id] = []; m[li.job_id].push(li); }); return m; }, [lineItems]);
  const paymentsMap = useMemo<Record<string, Payment[]>>(() => { const m: Record<string, Payment[]> = {}; (rawPayments || []).forEach(p => { if (!m[p.job_id]) m[p.job_id] = []; m[p.job_id].push(p); }); return m; }, [rawPayments]);

  /* derived */
  const jobsWithData = useMemo<JobWithTotal[]>(() => {
    return jobs
      .filter((j) => j.user_id === userId)
      .map((j) => {
        const total = jobTotal(lineItems, j.id);
        const summary = paymentSummary(j, paymentsMap[j.id] || [], total);
        return {
          ...j,
          total,
          amountDue: summary.amountDue,
          customer: customers[j.customer_id],
        };
      })
      .filter((j) => j.customer) as JobWithTotal[];
  }, [jobs, customers, lineItems, paymentsMap, userId]);

  const searchFilteredJobs = useMemo<JobWithTotal[]>(() => {
    if (!searchQuery.trim()) return jobsWithData;
    const q = searchQuery.toLowerCase().trim();
    return jobsWithData.filter(
      (j) => j.customer.name.toLowerCase().includes(q) || j.title.toLowerCase().includes(q)
    );
  }, [jobsWithData, searchQuery]);

  const filteredJobs = useMemo<JobWithTotal[]>(() => {
    if (filter === 'all') return searchFilteredJobs;
    if (filter === 'active') return searchFilteredJobs.filter((j) => j.status === 'in_progress' || j.status === 'booked');
    if (filter === 'unpaid') {
      return searchFilteredJobs
        .filter((j) => j.status === 'awaiting_payment')
        .sort((a, b) => {
          const aDays = a.invoice_sent_at ? daysSince(a.invoice_sent_at) : 0;
          const bDays = b.invoice_sent_at ? daysSince(b.invoice_sent_at) : 0;
          return bDays - aDays; // overdue first
        });
    }
    return searchFilteredJobs;
  }, [searchFilteredJobs, filter]);

  const dateFilteredJobs = useMemo<JobWithTotal[]>(() => {
    if (!dateFilter) return filteredJobs;
    // When filtering by date, search ALL jobs (not chip-filtered) —
    // WeekView/CompactWeekStrip show booked + quoted + enquiry,
    // so the date filter must match that same set, otherwise jobs
    // that appear in the calendar vanish when you tap the day.
    return searchFilteredJobs.filter(j =>
      j.scheduled_start &&
      new Date(j.scheduled_start).toDateString() === new Date(dateFilter).toDateString()
    );
  }, [searchFilteredJobs, dateFilter]);

  const groups = useMemo(() => {
    const g: Record<JobStatus, JobWithTotal[]> = {
      enquiry: [], in_progress: [], booked: [], quoted: [], awaiting_payment: [],
      no_show: [], paid: [], cancelled: [], written_off: [],
    };
    dateFilteredJobs.forEach((j) => {
      g[j.status].push(j);
    });
    return g;
  }, [dateFilteredJobs]);

  const hasAnyJobs = jobsWithData.length > 0;

  // Filter chip counts
  const filterCounts = useMemo(() => ({
    all: searchFilteredJobs.length,
    active: searchFilteredJobs.filter((j) => j.status === 'in_progress' || j.status === 'booked').length,
    unpaid: searchFilteredJobs.filter((j) => j.status === 'awaiting_payment').length,
  }), [searchFilteredJobs]);


  const toggleGroup = (status: JobStatus) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(status)) next.delete(status);
      else next.add(status);
      return next;
    });
  };

  /* render helpers */

  const renderSubLine = (job: JobWithTotal): React.ReactNode => {
    const s = job.status;

    if (s === 'in_progress') {
      return (
        <span className="flex items-center gap-1.5 flex-wrap">
          {formatShortDate(now())} · {elapsedStr(job.actual_start || job.created_at)}
          {job.payment_terms === 'deposit' && job.deposit_status === 'paid' && (
            <span className="inline-flex items-center px-1.5 py-[1px] rounded-xs text-xs font-bold tracking-wide border border-green-200 bg-status-greenBg text-status-green">Deposit paid</span>
          )}
          {job.payment_terms === 'deposit' && job.deposit_status === 'requested' && (
            <span className="inline-flex items-center px-1.5 py-[1px] rounded-xs text-xs font-bold tracking-wide border border-amber-200 bg-status-amberBg text-status-amber">Deposit due</span>
          )}
          {job.payment_terms === 'deposit' && job.deposit_status !== 'paid' && job.deposit_status !== 'requested' && (
            <span className="inline-flex items-center px-1.5 py-[1px] rounded-xs text-xs font-bold tracking-wide border border-brand-border bg-brand-borderLight text-brand-muted">No deposit</span>
          )}
        </span>
      );
    }
    if (s === 'booked') {
      return (
        <span className="flex items-center gap-1.5 flex-wrap">
          {job.scheduled_start
            ? `${formatShortDate(new Date(job.scheduled_start))} · ${formatTime(new Date(job.scheduled_start))}`
            : 'No date set'}
          {job.payment_terms === 'deposit' && job.deposit_status === 'paid' && (
            <span className="inline-flex items-center px-1.5 py-[1px] rounded-xs text-xs font-bold tracking-wide border border-green-200 bg-status-greenBg text-status-green">Deposit paid</span>
          )}
          {job.payment_terms === 'deposit' && job.deposit_status === 'requested' && (
            <span className="inline-flex items-center px-1.5 py-[1px] rounded-xs text-xs font-bold tracking-wide border border-amber-200 bg-status-amberBg text-status-amber">Deposit due</span>
          )}
          {job.payment_terms === 'deposit' && job.deposit_status !== 'paid' && job.deposit_status !== 'requested' && (
            <span className="inline-flex items-center px-1.5 py-[1px] rounded-xs text-xs font-bold tracking-wide border border-brand-border bg-brand-borderLight text-brand-muted">No deposit</span>
          )}
        </span>
      );
    }
    if (s === 'quoted') {
      if (!job.quote_sent_at) return <span>Quote not sent</span>;
      const d = daysSince(job.quote_sent_at);
      return <span>Sent {d === 0 ? 'today' : `${d} day${d !== 1 ? 's' : ''} ago`}</span>;
    }
    if (s === 'awaiting_payment') {
      const days = job.invoice_sent_at ? daysSince(job.invoice_sent_at) : 0;
      return (
        <span className="flex items-center gap-1.5 flex-wrap">
          Invoice sent {days === 0 ? 'today' : `${days} day${days !== 1 ? 's' : ''} ago`}
          {days >= 30 && (
            <span className="inline-flex items-center px-1.5 py-[1px] rounded-xs text-xs font-bold tracking-wide border border-red-200 bg-status-redBg text-status-redText">
              Overdue
            </span>
          )}
          {days >= 1 && days < 30 && (
            <span className="inline-flex items-center px-1.5 py-[1px] rounded-xs text-xs font-bold tracking-wide border border-amber-200 bg-status-amberBg text-status-amber">
              Chase · {days}d
            </span>
          )}
          {job.amountDue > 0 && (
            <span className="text-status-red font-semibold">· £{job.amountDue.toFixed(2)} due</span>
          )}
        </span>
      );
    }
    if (s === 'no_show') {
      return (
        <span className="flex items-center gap-1.5 flex-wrap">
          {job.scheduled_start
            ? `${formatShortDate(new Date(job.scheduled_start))} · ${formatTime(new Date(job.scheduled_start))}`
            : 'No date set'}
          <span className="inline-flex items-center px-1.5 py-[1px] rounded-xs text-xs font-bold tracking-wide border border-amber-300 bg-status-amberMid text-status-amberDark">
            Action needed
          </span>
        </span>
      );
    }
    if (s === 'paid') {
      const paidDate = job.actual_end || job.updated_at || job.created_at;
      return <span>Paid {formatShortDate(new Date(paidDate))}</span>;
    }
    if (s === 'cancelled') {
      return <span>Cancelled {formatShortDate(new Date(job.updated_at || job.created_at))}</span>;
    }
    if (s === 'written_off') {
      return <span>Written off {formatShortDate(new Date(job.updated_at || job.created_at))}</span>;
    }
    return <span></span>;
  };

  const renderJobRow = (job: JobWithTotal) => (
    <div
      key={job.id}
      onClick={() => navigate(`/jobs/${job.id}`)}
      className="flex items-center gap-2.5 p-4 bg-white border border-brand-border rounded-lg cursor-pointer active:scale-[0.98] active:bg-brand-borderLight/50 transition-all duration-150 mb-2 mx-0"
    >
      <div className="flex-1 min-w-0">
        <div className="text-base font-semibold text-brand-black truncate">
          {job.customer.name} · {job.title}
        </div>
        <div className="text-sm text-brand-dark mt-0.5">
          {job.job_number && <span className="font-medium text-brand-dark">{job.job_number} · </span>}
          {renderSubLine(job)}
        </div>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        <span className="text-sm font-semibold text-brand-dark">
          £{job.total.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </span>
        <ChevronRight size={16} className="shrink-0 text-brand-muted" />
      </div>
    </div>
  );

  const renderGroupHeader = (status: JobStatus, count: number) => (
    <div
      onClick={() => toggleGroup(status)}
      className="flex items-center gap-2 py-3 px-4 mb-1 cursor-pointer active:opacity-60 transition-opacity bg-[var(--app-shell-bg)] border-b border-brand-borderLight"
    >
      <div className={`w-2 h-2 rounded-full shrink-0 ${statusDotClasses[status]}`} />
      <span className="text-label font-bold tracking-[0.5px] text-brand-dark flex-1">
        {statusLabels[status]}
      </span>
      <span className="text-label text-brand-dark font-medium">
        {count} job{count !== 1 ? 's' : ''}
      </span>
      <ChevronDown size={16} className="shrink-0 text-brand-muted transition-transform duration-200" />
    </div>
  );

  const renderCollapsedGroup = (status: JobStatus, count: number) => (
    <div
      key={status}
      onClick={() => toggleGroup(status)}
      className="flex items-center gap-2 py-3 px-4 cursor-pointer active:opacity-60 transition-opacity"
    >
      <div className={`w-2 h-2 rounded-full shrink-0 ${statusDotClasses[status]}`} />
      <span className="text-sm font-semibold text-brand-dark flex-1">
        {statusLabels[status]}
      </span>
      <span className="text-sm text-brand-dark">
        {count} job{count !== 1 ? 's' : ''}
      </span>
      <ChevronRight size={16} className="shrink-0 text-brand-muted" />
    </div>
  );

  const renderExpandedGroup = (status: JobStatus, jobs: JobWithTotal[]) => {
    const tint = statusBgTints[status];
    return (
      <div key={status} className="mb-4">
        {renderGroupHeader(status, jobs.length)}
        <div style={tint ? { backgroundColor: tint } : undefined} className="px-4 py-1">
          {jobs.map(renderJobRow)}
        </div>
      </div>
    );
  };

  const renderBody = () => {
    if (!hasAnyJobs) {
      return (
        <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
          <ClipboardList size={40} className="mb-4 opacity-40 text-brand-muted" />
          <p className="text-lg font-bold text-brand-black mb-2">No jobs yet</p>
          <p className="text-sm text-brand-dark leading-relaxed mb-7">
            Log a missed call or create a quote to get your first job on the books.
          </p>
          <Button variant="primary" onClick={() => navigate('/quote')} fullWidth>
            + New Quote
          </Button>
          <div className="h-2.5" />
          <Button variant="secondary" onClick={() => navigate('/quote', { state: { entryPoint: 'missed_call' } })} fullWidth>
            Log Missed Call
          </Button>
        </div>
      );
    }

    const visibleStatuses = statusOrder.filter((s) => groups[s].length > 0);
    const expandedGroups = visibleStatuses.filter((s) => expanded.has(s));
    const collapsedGroups = visibleStatuses.filter((s) => !expanded.has(s));

    // Empty state for filter/search returning zero results
    if (visibleStatuses.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
          <ClipboardList size={32} className="mb-3 opacity-40 text-brand-muted" />
          <p className="text-sm font-medium text-brand-dark mb-1">
            {dateFilter
              ? 'No jobs on this date'
              : filter === 'unpaid'
              ? 'No unpaid jobs — all caught up'
              : searchQuery.trim()
              ? `No jobs match "${searchQuery.trim()}"`
              : 'No jobs found'}
          </p>
          {dateFilter && (
            <button
              onClick={() => {
                const params = new URLSearchParams(searchParams);
                params.delete('date');
                setSearchParams(params);
              }}
              className="mt-3 text-sm text-brand-mid underline cursor-pointer"
            >
              Show all jobs
            </button>
          )}
        </div>
      );
    }

    return (
      <div className="pt-2 pb-4">
        {expandedGroups.map((s) => renderExpandedGroup(s, groups[s]))}
        {collapsedGroups.map((s) => renderCollapsedGroup(s, groups[s].length))}
      </div>
    );
  };

  /* ─── main render ─── */
  if (loading) {
    return <SkeletonAppScreen />;
  }

  return (
    <div className="bg-[var(--app-shell-bg)] flex flex-col min-h-[100dvh]">
      {/* Compact sticky header: week strip (scroll-to-hide) + filter chips + search */}
      <div
        className="sticky top-0 z-40 bg-[var(--app-shell-bg)] border-b border-brand-borderLight"
      >
        {/* Sync indicator row (no title — tab bar shows it) */}
        <div className="flex justify-end px-4 pt-3 pb-1">
          <SyncIndicator />
        </div>

        {/* Compact week strip — scroll-to-hide */}
        <div style={{ maxHeight: weekStripVisible ? '72px' : '0px', opacity: weekStripVisible ? 1 : 0, overflow: 'hidden', transition: 'max-height 0.2s ease-out, opacity 0.2s ease-out' }}>
          <CompactWeekStrip
            jobs={jobs}
            selectedDate={dateFilter || undefined}
            onDayTap={(date) => {
              // Use local date (not toISOString) to avoid timezone shifting the day
              const localDateStr = date.toLocaleDateString('en-CA');
              const params = new URLSearchParams(searchParams);
              if (dateFilter === localDateStr) {
                params.delete('date');
              } else {
                params.set('date', localDateStr);
              }
              setSearchParams(params);
              capture('week_strip_day_tapped', { date: localDateStr, action: dateFilter === localDateStr ? 'clear' : 'select' });
            }}
          />
        </div>

        {/* Filter chips with counts */}
        <div className="px-4 pt-3 pb-2 flex items-center gap-2 overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
          {filters.map((f) => {
            const isActive = filter === f.key;
            const count = filterCounts[f.key];
            return (
              <button
                key={f.key}
                onClick={() => {
                  setFilter(f.key);
                  const params = new URLSearchParams(searchParams);
                  if (f.key === 'all') params.delete('filter'); else params.set('filter', f.key);
                  setSearchParams(params);
                }}
                className={`
                  h-11 px-3.5 rounded-2xl flex items-center gap-1.5 text-sm font-semibold whitespace-nowrap cursor-pointer shrink-0 border-2
                  transition-colors
                  ${isActive
                    ? 'bg-brand-black text-brand-surface border-brand-black'
                    : 'bg-white text-brand-mid border-brand-border'
                  }
                `}
              >
                {f.label}
                {count > 0 && (
                  <span className={`text-xs font-medium ${isActive ? 'text-brand-surface/70' : 'text-brand-muted'}`}>
                    ({count})
                  </span>
                )}
              </button>
            );
          })}

        {/* Calendar icon — opens WeekView BottomSheet */}
        <button
          onClick={() => { setShowWeekSheet(true); capture('week_view_opened', { source: 'jobs_calendar_icon' }); }}
          className={`relative shrink-0 w-11 h-11 flex items-center justify-center rounded-2xl border-2 cursor-pointer transition-colors ${
            dateFilter ? 'bg-brand-black text-brand-surface border-brand-black' : 'bg-white text-brand-mid border-brand-border'
          }`}
          aria-label="Open week view"
        >
          <CalendarDays size={18} />
          {dateFilter && <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-status-blue" />}
        </button>
        </div>

        {/* Search bar — always visible */}
        {hasAnyJobs && (
          <div>
            <div className="px-4 pt-3 pb-4">
              <div className="relative flex items-center">
                <div className="absolute left-3.5 z-10 pointer-events-none"><Search size={16} className="text-brand-muted" /></div>
                <input id="jobs-search-input"
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search by name or job…"
                  className="w-full h-11 pl-10 pr-9 text-base font-medium text-brand-black bg-brand-borderLight border border-transparent rounded-xl outline-none focus:border-brand-black focus:bg-white transition-colors"
                />
                {searchQuery && (
                  <button onClick={() => setSearchQuery('')} className="absolute right-3 p-1 cursor-pointer">
                    <X size={14} className="text-brand-muted" />
                  </button>
                )}
              </div>
            </div>
          </div>
        )}


      </div>

      {/* Body */}
      {renderBody()}

      {/* WeekView BottomSheet — full week view with day cards */}
      <BottomSheet
        isOpen={showWeekSheet}
        onClose={() => setShowWeekSheet(false)}
        title="This week"
      >
        <WeekView
          jobs={jobs}
          customers={customers}
          lineItems={lineItemsMap}
          onDayTap={(date) => {
            setShowWeekSheet(false);
            // Use local date (not toISOString) to avoid timezone shifting the day
            const localDateStr = date.toLocaleDateString('en-CA');
            const params = new URLSearchParams(searchParams);
            params.set('date', localDateStr);
            setSearchParams(params);
            capture('week_view_day_tapped', { source: 'jobs' });
          }}
        />
      </BottomSheet>

    </div>
  );
}
