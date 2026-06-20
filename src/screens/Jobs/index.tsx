import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ChevronRight, ClipboardList, Search, X } from 'lucide-react';
import { db, type Job, type Customer, type LineItem, type JobStatus } from '../../lib/db';
import { useAppStore } from '../../store/useAppStore';
import { ensureJobNumber } from '../../lib/jobNumbers';
import SyncIndicator from '../../components/SyncIndicator';
import { Button } from '../../components/Button';

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

const terminalStatuses: JobStatus[] = ['paid', 'cancelled', 'written_off'];

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
  const [filter, setFilter] = useState<Filter>(() => {
    const urlFilter = searchParams.get('filter') as Filter;
    return urlFilter && ['all', 'active', 'unpaid'].includes(urlFilter) ? urlFilter : 'all';
  });
  const [expanded, setExpanded] = useState<Set<JobStatus>>(new Set());
  const [jobs, setJobs] = useState<Job[]>([]);
  const [customers, setCustomers] = useState<Record<string, Customer>>({});
  const [lineItems, setLineItems] = useState<LineItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  /* load data */
  const refresh = useCallback(async () => {
    if (!userId) return;
    const allJobs = await db.jobs.where('user_id').equals(userId).toArray();
    const allCustomers = await db.customers.where('user_id').equals(userId).toArray();
    const allItems = await db.line_items.toArray();

    const jobsWithNumbers: Job[] = [];
    for (const j of allJobs) {
      jobsWithNumbers.push(j.job_number ? j : await ensureJobNumber(j, userId));
    }

    const custMap: Record<string, Customer> = {};
    allCustomers.forEach((c) => { custMap[c.id] = c; });

    setJobs(jobsWithNumbers);
    setCustomers(custMap);
    setLineItems(allItems);
    setLoading(false);
  }, [userId]);

  useEffect(() => { refresh(); }, [refresh]);

  /* derived */
  const jobsWithData = useMemo<JobWithTotal[]>(() => {
    return jobs
      .filter((j) => j.user_id === userId)
      .map((j) => ({
        ...j,
        total: jobTotal(lineItems, j.id),
        customer: customers[j.customer_id],
      }))
      .filter((j) => j.customer) as JobWithTotal[];
  }, [jobs, customers, lineItems, userId]);

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

  const groups = useMemo(() => {
    const g: Record<JobStatus, JobWithTotal[]> = {
      enquiry: [], in_progress: [], booked: [], quoted: [], awaiting_payment: [],
      no_show: [], paid: [], cancelled: [], written_off: [],
    };
    filteredJobs.forEach((j) => {
      g[j.status].push(j);
    });
    return g;
  }, [filteredJobs]);

  const hasAnyJobs = jobsWithData.length > 0;

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
        <span>
          {formatShortDate(now())} · {elapsedStr(job.actual_start || job.created_at)}
        </span>
      );
    }
    if (s === 'booked') {
      return (
        <span>
          {job.scheduled_start
            ? `${formatShortDate(new Date(job.scheduled_start))} · ${formatTime(new Date(job.scheduled_start))}`
            : 'No date set'}
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
            <span className="inline-flex items-center px-1.5 py-[1px] rounded-xs text-xs font-bold tracking-wide border border-red-200 bg-status-redBg text-status-red">
              Overdue
            </span>
          )}
          {days >= 1 && days < 30 && (
            <span className="inline-flex items-center px-1.5 py-[1px] rounded-xs text-xs font-bold tracking-wide border border-amber-200 bg-status-amberBg text-status-amber">
              Chase · {days}d
            </span>
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
      className="flex items-center gap-2.5 py-3 border-b border-brand-surface cursor-pointer last:border-b-0"
    >
      <div className="flex-1 min-w-0">
        <div className="text-base font-semibold text-brand-black truncate">
          {job.customer.name} · {job.title}
        </div>
        <div className="text-sm text-brand-muted mt-0.5">
          {job.job_number && <span className="font-medium text-brand-mid">{job.job_number} · </span>}
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
    <div className="flex items-center gap-2 pb-2 border-b border-brand-borderLight mb-0">
      <div className={`w-2 h-2 rounded-full shrink-0 ${statusDotClasses[status]}`} />
      <span className="text-label font-bold tracking-[0.5px] text-brand-dark flex-1">
        {statusLabels[status]}
      </span>
      <span className="text-label text-brand-muted font-medium">
        {count} job{count !== 1 ? 's' : ''}
      </span>
    </div>
  );

  const renderCollapsedGroup = (status: JobStatus, count: number) => (
    <div
      key={status}
      onClick={() => toggleGroup(status)}
      className="flex items-center gap-2 py-3 border-b border-brand-borderLight cursor-pointer last:border-b-0"
    >
      <div className={`w-2 h-2 rounded-full shrink-0 ${statusDotClasses[status]}`} />
      <span className="text-sm font-semibold text-brand-muted flex-1">
        {statusLabels[status]}
      </span>
      <span className="text-sm text-brand-muted">
        {count} job{count !== 1 ? 's' : ''}
      </span>
      <ChevronRight size={16} className="shrink-0 text-brand-muted" />
    </div>
  );

  const renderExpandedGroup = (status: JobStatus, jobs: JobWithTotal[]) => (
    <div key={status} className="mb-5">
      {renderGroupHeader(status, jobs.length)}
      <div>
        {jobs.map(renderJobRow)}
      </div>
    </div>
  );

  const renderBody = () => {
    if (!hasAnyJobs) {
      return (
        <div className="min-h-[50dvh] flex flex-col items-center justify-center px-6 py-8 text-center">
          <ClipboardList size={40} className="mb-4 opacity-40 text-brand-muted" />
          <p className="text-lg font-bold text-brand-black mb-2">No jobs yet</p>
          <p className="text-sm text-brand-muted leading-relaxed mb-7">
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
    const expandedGroups = visibleStatuses.filter((s) => !terminalStatuses.includes(s) || expanded.has(s));
    const collapsedGroups = visibleStatuses.filter((s) => terminalStatuses.includes(s) && !expanded.has(s));

    return (
      <div className="px-4 md:px-6 pt-4 md:pt-6 pb-[calc(122px + env(safe-area-inset-bottom))]">
        {expandedGroups.map((s) => renderExpandedGroup(s, groups[s]))}
        {collapsedGroups.map((s) => renderCollapsedGroup(s, groups[s].length))}
      </div>
    );
  };

  /* ─── main render ─── */
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
      <div className="sticky top-0 z-40 px-4 pt-4 pb-3 bg-[var(--app-shell-bg)] border-b border-brand-borderLight">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-extrabold text-brand-black">Jobs</h1>
          <SyncIndicator />
        </div>
      </div>

      {/* Filter chips */}
      <div className="px-4 pt-3 flex gap-2 overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
        {filters.map((f) => {
          const isActive = filter === f.key;
          return (
            <button
              key={f.key}
              onClick={() => { setFilter(f.key); setSearchParams(f.key === 'all' ? {} : { filter: f.key }); }}
              className={`
                h-11 px-3.5 rounded-2xl flex items-center text-sm font-semibold whitespace-nowrap cursor-pointer shrink-0 border-2
                transition-colors
                ${isActive
                  ? 'bg-brand-black text-brand-surface border-brand-black'
                  : 'bg-white text-brand-mid border-brand-border'
                }
              `}
            >
              {f.label}
            </button>
          );
        })}
      </div>

      {/* Search bar */}
      {hasAnyJobs && (
        <div className="px-4 pt-2 shrink-0">
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
                <X size={14} className="text-brand-muted" />              </button>
            )}
          </div>
        </div>
      )}

      {/* Body */}
      {renderBody()}

      {/* Footer — only when there are jobs */}
      {hasAnyJobs && (
        <div className="sticky bottom-[var(--tab-bar-height)] z-30 bg-[var(--app-shell-bg)] border-t border-brand-borderLight">
          <div className="flex gap-2 px-4 py-2.5 pb-3">
            <div className="flex-1"><Button variant="primary" onClick={() => navigate('/quote')} fullWidth>+ New Quote</Button></div>
            <div className="flex-1"><Button variant="secondary" onClick={() => navigate('/quote', { state: { entryPoint: 'missed_call' } })} fullWidth>Log Missed Call</Button></div>
          </div>
        </div>
      )}
    </div>
  );
}
