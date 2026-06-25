import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, ChevronRight, ChevronLeft, Phone, Archive } from 'lucide-react';
import { db, type Customer } from '../../lib/db';
import { useAppStore } from '../../store/useAppStore';
import { searchCustomers, getCustomerStats, type CustomerStats } from '../../lib/customers';
import { captureCustomerSearched } from '../../lib/analytics';

export default function Customers() {
  const navigate = useNavigate();
  const userId = useAppStore((s) => s.userId);
  const [query, setQuery] = useState('');
  const [allCustomers, setAllCustomers] = useState<Customer[]>([]);
  const [searchResults, setSearchResults] = useState<Customer[]>([]);
  const [statsMap, setStatsMap] = useState<Record<string, CustomerStats>>({});
  const [showArchived, setShowArchived] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) return;
    db.customers.where('user_id').equals(userId).toArray().then((all) => {
      const visible = all.filter((c) => !c.merged_into);
      visible.sort((a, b) => {
        if (a.is_archived && !b.is_archived) return 1;
        if (!a.is_archived && b.is_archived) return -1;
        return (b.updated_at || '').localeCompare(a.updated_at || '');
      });
      setAllCustomers(visible);
      setLoading(false);
      visible.forEach(async (c) => {
        const s = await getCustomerStats(c.id);
        setStatsMap((prev) => ({ ...prev, [c.id]: s }));
      });
    });
  }, [userId]);

  useEffect(() => {
    if (!userId || !query.trim()) {
      setSearchResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      const results = await searchCustomers(userId, query);
      setSearchResults(results);
      captureCustomerSearched({ resultCount: results.length });
    }, 300);
    return () => clearTimeout(timer);
  }, [query, userId]);

  const displayed = query.trim()
    ? searchResults
    : allCustomers.filter((c) => showArchived ? c.is_archived : !c.is_archived);

  if (loading) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-[var(--app-shell-bg)]">
        <div className="w-8 h-8 border-2 border-brand-border border-t-brand-black rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="bg-[var(--app-shell-bg)] flex flex-col min-h-[100dvh]">
      <div className="sticky top-0 z-40 px-4 pt-4 pb-3 bg-[var(--app-shell-bg)] border-b border-brand-borderLight">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <button onClick={() => navigate('/settings')} className="flex items-center justify-center text-brand-dark cursor-pointer" aria-label="Back to settings">
              <ChevronLeft size={20} />
            </button>
            <div>
              <h1 className="text-xl font-extrabold text-brand-black">Customers</h1>
              <p className="text-xs text-brand-muted mt-0.5">
                {showArchived ? 'Archived customers' : "Everyone you've quoted, booked, or worked for"}
              </p>
            </div>
          </div>
          {!query.trim() && (
            <button
              onClick={() => setShowArchived(!showArchived)}
              className={`text-xs font-semibold px-3 py-1.5 rounded-full cursor-pointer transition-colors flex items-center gap-1.5 ${
                showArchived
                  ? 'bg-brand-black text-brand-surface'
                  : 'bg-brand-surface text-brand-dark border border-brand-border'
              }`}
            >
              <Archive size={12} />
              {showArchived ? 'Show active' : 'Show archived'}
            </button>
          )}
        </div>
        <div className="relative flex items-center">
          <Search size={16} className="absolute left-3 text-brand-muted" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, phone, address..."
            className="w-full h-11 pl-10 pr-4 text-base font-medium text-brand-black bg-brand-borderLight border border-transparent rounded-lg outline-none focus:border-brand-black focus:bg-white transition-colors"
          />
        </div>
      </div>

      <div className="px-4 pt-4 pb-[calc(44px+env(safe-area-inset-bottom))] flex-1">
        {displayed.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-sm text-brand-muted">
              {query.trim()
                ? 'No customers found'
                : showArchived
                ? 'No archived customers'
                : 'No customers yet'}
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            {displayed.map((c) => {
              const s = statsMap[c.id];
              const isArchived = !!c.is_archived;
              return (
                <div
                  key={c.id}
                  onClick={() => navigate(`/customers/${c.id}`)}
                  className={`border rounded-lg p-4 cursor-pointer active:scale-[0.98] transition-transform ${
                    isArchived
                      ? 'bg-brand-borderLight border-brand-borderLight'
                      : 'bg-white border-brand-border'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className={`text-sm font-bold ${isArchived ? 'text-brand-muted' : 'text-brand-black'}`}>
                      {c.name}
                    </span>
                    {isArchived ? (
                      <span className="text-xs font-medium text-brand-muted bg-brand-surface px-2 py-0.5 rounded">
                        Archived
                      </span>
                    ) : (
                      <ChevronRight size={14} className="text-brand-muted" />
                    )}
                  </div>
                  <div className={`flex items-center gap-3 text-xs ${isArchived ? 'text-brand-muted' : 'text-brand-mid'}`}>
                    {c.phone && (
                      <span className="flex items-center gap-1">
                        <Phone size={11} /> {c.phone}
                      </span>
                    )}
                    {c.address && <span className="truncate">{c.address}</span>}
                  </div>
                  {s && !isArchived && (
                    <div className="flex items-center gap-3 mt-1.5 text-xs">
                      <span className="text-brand-dark font-medium">{s.jobCount} job{s.jobCount !== 1 ? 's' : ''}</span>
                      <span className="text-brand-black font-bold">£{s.totalSpent.toFixed(0)}</span>
                      {s.outstandingBalance > 0 && (
                        <span className="text-status-amber font-medium">£{s.outstandingBalance.toFixed(0)} owed</span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
