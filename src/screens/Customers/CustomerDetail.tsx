import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ChevronLeft, Phone, MapPin, Plus, Archive, ArchiveRestore, GitMerge, Search } from 'lucide-react';
import { db, type Customer, type Job, type Payment } from '../../lib/db';
import { getCustomerStats, getCustomerJobs, getCustomerPayments, archiveCustomer, unarchiveCustomer, mergeCustomers, type CustomerStats } from '../../lib/customers';
import { StatusBadge } from '../../components/StatusBadge';
import { Button } from '../../components/Button';
import { BottomSheet } from '../../components/BottomSheet';
import { captureCustomerDetailViewed } from '../../lib/analytics';
import { showSuccess } from '../../components/Toast/store';

export default function CustomerDetail() {
  const navigate = useNavigate();
  const { customerId } = useParams<{ customerId: string }>();
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [stats, setStats] = useState<CustomerStats | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [showMergeSheet, setShowMergeSheet] = useState(false);
  const [mergeQuery, setMergeQuery] = useState('');
  const [mergeResults, setMergeResults] = useState<Customer[]>([]); 

  useEffect(() => {
    if (!customerId) return;
    Promise.all([
      db.customers.get(customerId),
      getCustomerStats(customerId),
      getCustomerJobs(customerId),
      getCustomerPayments(customerId),
    ]).then(([c, s, j, p]) => {
      setCustomer(c || null);
      setStats(s);
      setJobs(j);
      setPayments(p);
      setLoading(false);
      if (c) captureCustomerDetailViewed({ customerId, jobCount: j.length });
    });
  }, [customerId]);

  const handleArchive = async () => {
    if (!customerId) return;
    await archiveCustomer(customerId);
    showSuccess('Customer archived');
    navigate('/customers');
  };

  const handleUnarchive = async () => {
    if (!customerId) return;
    await unarchiveCustomer(customerId);
    showSuccess('Customer restored');
    navigate('/customers');
  };

  // Merge search
  useEffect(() => {
    if (!mergeQuery.trim() || !customer) {
      setMergeResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      // Search all customers (including this one — we'll filter it out)
      const all = await db.customers.where('user_id').equals(customer.user_id).toArray();
      const q = mergeQuery.toLowerCase().trim();
      const results = all.filter((c) => {
        if (c.id === customerId) return false;
        if (c.merged_into) return false;
        return (
          c.name.toLowerCase().includes(q) ||
          (c.phone || '').toLowerCase().includes(q)
        );
      }).slice(0, 5);
      setMergeResults(results);
    }, 300);
    return () => clearTimeout(timer);
  }, [mergeQuery, customerId, customer]);

  const handleMerge = async (targetId: string) => {
    if (!customerId || !customer) return;
    const target = mergeResults.find((c) => c.id === targetId);
    if (!target) return;
    const confirmed = window.confirm(`Move all jobs from "${customer.name}" to "${target.name}"? "${customer.name}" will be archived.`);
    if (!confirmed) return;
    await mergeCustomers(customerId, targetId);
    showSuccess('Customers merged');
    setShowMergeSheet(false);
    navigate('/customers');
  };

  if (loading) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-[var(--app-shell-bg)]">
        <div className="w-8 h-8 border-2 border-brand-border border-t-brand-black rounded-full animate-spin" />
      </div>
    );
  }

  if (!customer) {
    return (
      <div className="bg-[var(--app-shell-bg)] flex flex-col min-h-[100dvh] items-center justify-center">
        <p className="text-sm text-brand-muted">Customer not found</p>
        <div className="px-8 mt-4"><Button variant="secondary" onClick={() => navigate('/customers')} fullWidth>Back to customers</Button></div>
      </div>
    );
  }

  return (
    <div className="bg-[var(--app-shell-bg)] flex flex-col min-h-[100dvh]">
      <div className="sticky top-0 z-40 px-4 pt-4 pb-3 bg-[var(--app-shell-bg)] border-b border-brand-borderLight">
        <div className="flex items-center justify-between">
          <button onClick={() => navigate('/customers')} className="flex items-center gap-1 text-brand-dark cursor-pointer">
            <ChevronLeft size={20} />
            <span className="text-sm font-medium">Customers</span>
          </button>
          <h1 className="text-base font-bold text-brand-black truncate max-w-[180px]">{customer.name}</h1>
          <div className="w-20" />
        </div>
      </div>

      <div className="px-4 pt-4 pb-[calc(44px+env(safe-area-inset-bottom))] flex-1">
        {/* Archived banner */}
        {customer.is_archived && (
          <div className="bg-brand-borderLight border border-brand-border rounded-lg p-3 mb-4 flex items-center justify-between">
            <span className="text-sm font-medium text-brand-muted">This customer is archived</span>
            <Button variant="secondary" size="sm" onClick={handleUnarchive}>
              <ArchiveRestore size={14} className="mr-1" />
              Restore
            </Button>
          </div>
        )}

        {/* Contact info */}
        <div className="bg-white border border-brand-border rounded-xl p-4 mb-4">
          {customer.business_name && (
            <p className="text-sm font-semibold text-brand-dark mb-1">{customer.business_name}</p>
          )}
          <div className="flex flex-col gap-2">
            {customer.phone && (
              <button
                onClick={() => window.open(`tel:${customer.phone}`, '_self')}
                className="flex items-center gap-2 text-sm text-brand-dark cursor-pointer"
              >
                <Phone size={14} className="text-brand-muted" />
                {customer.phone}
              </button>
            )}
            {customer.address && (
              <button
                onClick={() => window.open(`https://maps.google.com/?q=${encodeURIComponent(customer.address!)}`, '_blank')}
                className="flex items-center gap-2 text-sm text-brand-dark cursor-pointer"
              >
                <MapPin size={14} className="text-brand-muted" />
                {customer.address}
              </button>
            )}
            {customer.email && (
              <span className="text-sm text-brand-muted">{customer.email}</span>
            )}
          </div>
          {customer.notes && (
            <p className="text-xs text-brand-muted mt-3 pt-3 border-t border-brand-borderLight">{customer.notes}</p>
          )}
        </div>

        {/* Stats cards */}
        {stats && (
          <div className="grid grid-cols-3 gap-2 mb-4">
            <div className="bg-white border border-brand-border rounded-lg p-3 text-center">
              <p className="text-lg font-extrabold text-brand-black">£{stats.totalSpent.toFixed(0)}</p>
              <p className="text-xs text-brand-muted">Total spent</p>
            </div>
            <div className="bg-white border border-brand-border rounded-lg p-3 text-center">
              <p className="text-lg font-extrabold text-brand-black">{stats.jobCount}</p>
              <p className="text-xs text-brand-muted">Jobs</p>
            </div>
            <div className="bg-white border border-brand-border rounded-lg p-3 text-center">
              <p className={`text-lg font-extrabold ${stats.outstandingBalance > 0 ? 'text-status-amber' : 'text-brand-black'}`}>
                £{stats.outstandingBalance.toFixed(0)}
              </p>
              <p className="text-xs text-brand-muted">Outstanding</p>
            </div>
          </div>
        )}

        {/* Job history */}
        <div className="mb-4">
          <p className="text-micro font-bold tracking-[0.7px] text-brand-mid mb-2">Job history</p>
          {jobs.length === 0 ? (
            <p className="text-sm text-brand-muted py-4 text-center">No jobs yet</p>
          ) : (
            <div className="flex flex-col gap-2">
              {jobs.map((job) => (
                <div
                  key={job.id}
                  onClick={() => navigate(`/jobs/${job.id}`)}
                  className="bg-white border border-brand-border rounded-lg p-3 cursor-pointer active:scale-[0.98] transition-transform"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-semibold text-brand-black truncate flex-1">{job.title}</span>
                    <StatusBadge status={job.status} size="sm" />
                  </div>
                  <div className="flex items-center justify-between text-xs text-brand-muted">
                    <span>{job.job_number || ''}</span>
                    <span>{new Date(job.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Payment history */}
        {payments.length > 0 && (
          <div className="mb-4">
            <p className="text-micro font-bold tracking-[0.7px] text-brand-mid mb-2">Payments</p>
            <div className="bg-white border border-brand-border rounded-xl overflow-hidden">
              {payments.map((p, i) => (
                <div
                  key={p.id}
                  className={`flex items-center justify-between px-4 py-2.5 ${i < payments.length - 1 ? 'border-b border-brand-borderLight' : ''}`}
                >
                  <div>
                    <span className="text-sm text-brand-dark">{p.method.replace(/_/g, ' ')}</span>
                    <span className="text-xs text-brand-muted ml-2">
                      {new Date(p.recorded_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                    </span>
                  </div>
                  <span className="text-sm font-bold text-brand-black">£{p.amount.toFixed(2)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-col gap-2">
          <Button variant="primary" onClick={() => navigate('/quote', { state: { customerId: customer.id, entryPoint: 'new_quote' } })} fullWidth>
            <Plus size={18} className="mr-2" />
            New quote
          </Button>
          {!customer.is_archived ? (
            <>
              <Button variant="secondary" onClick={() => setShowMergeSheet(true)} fullWidth>
                <GitMerge size={16} className="mr-2" />
                Merge with another customer
              </Button>
              <Button variant="secondary" onClick={handleArchive} fullWidth>
                <Archive size={16} className="mr-2" />
                Archive customer
              </Button>
            </>
          ) : (
            <Button variant="secondary" onClick={handleUnarchive} fullWidth>
              <ArchiveRestore size={16} className="mr-2" />
              Un-archive customer
            </Button>
          )}
        </div>
      </div>

      {/* Merge BottomSheet */}
      <BottomSheet
        isOpen={showMergeSheet}
        onClose={() => setShowMergeSheet(false)}
        title="Merge with another customer"
        subtitle={`All jobs from "${customer.name}" will move to the selected customer`}
      >
        <div className="flex flex-col gap-3">
          <div className="relative flex items-center">
            <Search size={16} className="absolute left-3 text-brand-muted" />
            <input
              type="text"
              value={mergeQuery}
              onChange={(e) => setMergeQuery(e.target.value)}
              placeholder="Search by name or phone..."
              className="w-full h-11 pl-10 pr-4 text-base font-medium text-brand-black bg-brand-borderLight border border-transparent rounded-lg outline-none focus:border-brand-black focus:bg-white transition-colors"
              autoFocus
            />
          </div>
          {mergeResults.length > 0 && (
            <div className="flex flex-col gap-2">
              {mergeResults.map((target) => (
                <button
                  key={target.id}
                  onClick={() => handleMerge(target.id)}
                  className="text-left px-4 py-3 bg-white border border-brand-border rounded-lg cursor-pointer active:opacity-70"
                >
                  <p className="text-sm font-semibold text-brand-black">{target.name}</p>
                  {target.phone && <p className="text-xs text-brand-muted mt-0.5">{target.phone}</p>}
                  {target.address && <p className="text-xs text-brand-muted truncate">{target.address}</p>}
                </button>
              ))}
            </div>
          )}
          {mergeQuery.trim() && mergeResults.length === 0 && (
            <p className="text-sm text-brand-muted text-center py-4">No matches found</p>
          )}
        </div>
      </BottomSheet>
    </div>
  );
}
