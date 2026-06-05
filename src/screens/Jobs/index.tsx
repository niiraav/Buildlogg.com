import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, ChevronRight, ClipboardList } from 'lucide-react';
import { db, type Job, type Customer, type LineItem, type JobStatus } from '../../lib/db';
import { useAppStore } from '../../store/useAppStore';
import { TabBar } from '../../components/TabBar';
import { Button } from '../../components/Button';

/* ─── helpers ─── */

const now = () => new Date();

function daysSince(dateStr: string): number {
  const d = new Date(dateStr);
  const n = new Date();
  return Math.floor((n.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
}

function formatShortDate(d: Date): string {
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
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
  enquiry: 'bg-[#6B7280]',
  in_progress: 'bg-[#15803D]',
  booked: 'bg-[#1D4ED8]',
  quoted: 'bg-[#7C3AED]',
  awaiting_payment: 'bg-[#B45309]',
  no_show: 'bg-[#92400E]',
  paid: 'bg-[#9CA3AF]',
  cancelled: 'bg-[#D1D5DB]',
  written_off: 'bg-[#D1D5DB]',
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

  const [filter, setFilter] = useState<Filter>('all');
  const [expanded, setExpanded] = useState<Set<JobStatus>>(new Set());
  const [jobs, setJobs] = useState<Job[]>([]);
  const [customers, setCustomers] = useState<Record<string, Customer>>({});
  const [lineItems, setLineItems] = useState<LineItem[]>([]);
  const [loading, setLoading] = useState(true);

  /* load data */
  const refresh = useCallback(async () => {
    if (!userId) return;
    const allJobs = await db.jobs.where('user_id').equals(userId).toArray();
    const allCustomers = await db.customers.where('user_id').equals(userId).toArray();
    const allItems = await db.line_items.toArray();

    const custMap: Record<string, Customer> = {};
    allCustomers.forEach((c) => { custMap[c.id] = c; });

    setJobs(allJobs);
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

  const filteredJobs = useMemo<JobWithTotal[]>(() => {
    if (filter === 'all') return jobsWithData;
    if (filter === 'active') return jobsWithData.filter((j) => j.status === 'in_progress' || j.status === 'booked');
    if (filter === 'unpaid') {
      return jobsWithData
        .filter((j) => j.status === 'awaiting_payment')
        .sort((a, b) => {
          const aDays = a.invoice_sent_at ? daysSince(a.invoice_sent_at) : 0;
          const bDays = b.invoice_sent_at ? daysSince(b.invoice_sent_at) : 0;
          return bDays - aDays; // overdue first
        });
    }
    return jobsWithData;
  }, [jobsWithData, filter]);

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
            <span className="inline-flex items-center px-1.5 py-[1px] rounded-[4px] text-[10px] font-bold uppercase tracking-wide border border-[#FECACA] bg-[#FEF2F2] text-[#DC2626]">
              Overdue
            </span>
          )}
          {days >= 1 && days < 30 && (
            <span className="inline-flex items-center px-1.5 py-[1px] rounded-[4px] text-[10px] font-bold uppercase tracking-wide border border-[#FDE68A] bg-[#FFFBEB] text-[#B45309]">
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
          <span className="inline-flex items-center px-1.5 py-[1px] rounded-[4px] text-[10px] font-bold uppercase tracking-wide border border-[#FCD34D] bg-[#FEF3C7] text-[#92400E]">
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
      className="flex items-center gap-2.5 py-3 border-b border-[#F9FAFB] cursor-pointer last:border-b-0"
    >
      <div className="flex-1 min-w-0">
        <div className="text-[14px] font-semibold text-[#111827] truncate">
          {job.customer.name} · {job.title}
        </div>
        <div className="text-[12px] text-[#9CA3AF] mt-0.5">
          {renderSubLine(job)}
        </div>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        <span className="text-[13px] font-semibold text-[#374151]">
          £{job.total.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </span>
        <ChevronRight size={16} color="#D1D5DB" className="shrink-0" />
      </div>
    </div>
  );

  const renderGroupHeader = (status: JobStatus, count: number) => (
    <div className="flex items-center gap-2 pb-2 border-b border-[#F3F4F6] mb-0">
      <div className={`w-2 h-2 rounded-full shrink-0 ${statusDotClasses[status]}`} />
      <span className="text-[11px] font-bold uppercase tracking-[0.5px] text-[#374151] flex-1">
        {statusLabels[status]}
      </span>
      <span className="text-[11px] text-[#9CA3AF] font-medium">
        {count} job{count !== 1 ? 's' : ''}
      </span>
    </div>
  );

  const renderCollapsedGroup = (status: JobStatus, count: number) => (
    <div
      key={status}
      onClick={() => toggleGroup(status)}
      className="flex items-center gap-2 py-3 border-b border-[#F3F4F6] cursor-pointer last:border-b-0"
    >
      <div className={`w-2 h-2 rounded-full shrink-0 ${statusDotClasses[status]}`} />
      <span className="text-[13px] font-semibold text-[#9CA3AF] flex-1">
        {statusLabels[status]}
      </span>
      <span className="text-[12px] text-[#D1D5DB]">
        {count} job{count !== 1 ? 's' : ''}
      </span>
      <ChevronRight size={16} color="#D1D5DB" className="shrink-0" />
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
        <div className="flex-1 flex flex-col items-center justify-center px-6 py-8 text-center">
          <ClipboardList size={40} color="#9CA3AF" className="mb-4 opacity-40" />
          <p className="text-[18px] font-bold text-[#111827] mb-2">No jobs yet</p>
          <p className="text-[14px] text-[#9CA3AF] leading-relaxed mb-7">
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
      <div className="flex-1 px-4 pt-4 pb-2 overflow-y-auto min-h-0">
        {expandedGroups.map((s) => renderExpandedGroup(s, groups[s]))}
        {collapsedGroups.map((s) => renderCollapsedGroup(s, groups[s].length))}
      </div>
    );
  };

  const handleNavigate = (tab: 'home' | 'jobs' | 'activity' | 'settings') => {
    if (tab === 'jobs') return;
    navigate('/' + tab);
  };

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

  return (
    <div className="flex flex-col min-h-[100svh] relative">
      {/* Header */}
      <div className="px-4 pt-4 flex items-center justify-between shrink-0">
        <h1 className="text-[26px] font-extrabold text-[#111827]">Jobs</h1>
        <button
          className="w-9 h-9 flex items-center justify-center text-[#6B7280] cursor-pointer"
          onClick={() => { /* Search is display only for MVP */ }}
        >
          <Search size={18} />
        </button>
      </div>

      {/* Filter chips */}
      <div className="px-4 pt-3 flex gap-2 shrink-0 overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
        {filters.map((f) => {
          const isActive = filter === f.key;
          return (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`
                h-8 px-3.5 rounded-2xl flex items-center text-[13px] font-semibold whitespace-nowrap cursor-pointer shrink-0 border-[1.5px]
                transition-colors
                ${isActive
                  ? 'bg-[#111827] text-white border-[#111827]'
                  : 'bg-white text-[#6B7280] border-[#E5E7EB]'
                }
              `}
            >
              {f.label}
            </button>
          );
        })}
      </div>

      {/* Body */}
      {renderBody()}

      {/* Footer — only when there are jobs */}
      {hasAnyJobs && (
        <div className="sticky bottom-0 z-30 bg-white border-t border-[#F3F4F6]">
          <div className="flex gap-2 px-4 py-2.5 pb-[calc(10px_+_env(safe-area-inset-bottom))]">
            <button
              onClick={() => navigate('/quote')}
              className="flex-1 h-[44px] bg-[#111827] text-white border border-[#111827] rounded-xl text-[13px] font-semibold cursor-pointer"
            >
              + New Quote
            </button>
            <button
              onClick={() => navigate('/quote', { state: { entryPoint: 'missed_call' } })}
              className="flex-1 h-[44px] bg-white text-[#111827] border border-[#D1D5DB] rounded-xl text-[13px] font-semibold cursor-pointer"
            >
              Log Missed Call
            </button>
          </div>
        </div>
      )}

      {/* Tab bar */}
      <TabBar activeTab="jobs" onNavigate={handleNavigate} />
    </div>
  );
}
