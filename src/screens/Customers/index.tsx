import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, ChevronRight, Phone } from 'lucide-react';
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
      all.sort((a, b) => {
        if (a.is_archived && !b.is_archived) return 1;
        if (!a.is_archived && b.is_archived) return -1;
        return (b.updated_at || '').localeCompare(a.updated_at || '');
      });
      setAllCustomers(all);
      setLoading(false);
      // Load stats for each customer
      all.forEach(async (c) => {
        const s = await getCustomerStats(c.id);
        setStatsMap((prev) => ({ ...prev, [c.id]: s }));
      });
    });
  }, [userId]);

  // Debounced search
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

  const displayed = query.trim() ? searchResults : allCustomers.filter((c) => showArchived || !c.is_archived);

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
        <h1 className="text-xl font-extrabold text-brand-black mb-3">Customers</h1>
        <div className="relative flex items-center mb-2">
          <Search size={16} className="absolute left-3 text-brand-muted" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, phone, address..."
            className="w-full h-11 pl-10 pr-4 text-base font-medium text-brand-black bg-brand-borderLight border border-transparent rounded-lg outline-none focus:border-brand-black focus:bg-white transition-colors"
          />
        </div>
        {!query.trim() && (
          <button
            onClick={() => setShowArchived(!showArchived)}
            className="text-xs font-medium text-brand-dark cursor-pointer"
          >
            {showArchived ? 'Hide archived' : 'Show archived'}
          </button>
        )}
      </div>

      <div className="px-4 pt-4 pb-[calc(44px+env(safe-area-inset-bottom))] flex-1">
        {displayed.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-sm text-brand-muted">
              {query.trim() ? 'No customers found' : 'No customers yet'}
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            {displayed.map((c) => {
              const s = statsMap[c.id];
              return (
                <div
                  key={c.id}
                  onClick={() => navigate(`/customers/${c.id}`)}
                  className="bg-white border border-brand-border rounded-lg p-4 cursor-pointer active:scale-[0.98] transition-transform"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-bold text-brand-black">{c.name}</span>
                    <ChevronRight size={14} className="text-brand-muted" />
                  </div>
                  <div className="flex items-center gap-3 text-xs text-brand-mid">
                    {c.phone && (
                      <span className="flex items-center gap-1">
                        <Phone size={11} /> {c.phone}
                      </span>
                    )}
                    {c.address && <span className="truncate">{c.address}</span>}
                  </div>
                  {s && (
                    <div className="flex items-center gap-3 mt-1.5 text-xs">
                      <span className="text-brand-dark font-medium">{s.jobCount} job{s.jobCount !== 1 ? 's' : ''}</span>
                      <span className="text-brand-black font-bold">£{s.totalSpent.toFixed(0)}</span>
                      {s.outstandingBalance > 0 && (
                        <span className="text-status-amber font-medium">£{s.outstandingBalance.toFixed(0)} owed</span>
                      )}
                      {c.is_archived && <span className="text-brand-muted">Archived</span>}
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
