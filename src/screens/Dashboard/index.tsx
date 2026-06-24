import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, TrendingUp, TrendingDown, AlertCircle, Target, PoundSterling, Download } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { getDashboardStats, exportMonthlyCSV, type DashboardStats } from '../../lib/dashboard';
import { captureDashboardViewed, captureDashboardCardTapped, captureDataExported } from '../../lib/analytics';
import { showSuccess } from '../../components/Toast/store';

export default function Dashboard() {
  const navigate = useNavigate();
  const userId = useAppStore((s) => s.userId);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) return;
    getDashboardStats(userId).then((s) => {
      setStats(s);
      setLoading(false);
    });
    captureDashboardViewed();
  }, [userId]);

  const handleExport = async () => {
    if (!userId) return;
    const csv = await exportMonthlyCSV(userId);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `buildlogg-${new Date().toISOString().slice(0, 7)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    captureDataExported({ format: 'csv', month: new Date().toISOString().slice(0, 7) });
    showSuccess('CSV exported');
  };

  if (loading) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-[var(--app-shell-bg)]">
        <div className="w-8 h-8 border-2 border-brand-border border-t-brand-black rounded-full animate-spin" />
      </div>
    );
  }

  if (!stats) return null;

  const earningsUp = stats.monthEarnings > stats.lastMonthEarnings;
  const isFirstMonth = stats.lastMonthEarnings === 0 && stats.monthEarnings === 0;

  return (
    <div className="bg-[var(--app-shell-bg)] flex flex-col min-h-[100dvh]">
      <div className="sticky top-0 z-40 px-4 pt-4 pb-3 bg-[var(--app-shell-bg)] border-b border-brand-borderLight">
        <div className="flex items-center justify-between">
          <button onClick={() => navigate('/')} className="flex items-center gap-1 text-brand-dark cursor-pointer">
            <ChevronLeft size={20} />
            <span className="text-sm font-medium">Home</span>
          </button>
          <h1 className="text-xl font-extrabold text-brand-black">Stats</h1>
          <button onClick={handleExport} className="w-8 h-8 flex items-center justify-center text-brand-black cursor-pointer">
            <Download size={18} />
          </button>
        </div>
      </div>

      <div className="px-4 pt-4 pb-8 flex-1">
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="bg-white border border-brand-border rounded-xl p-4">
            <div className="flex items-center gap-1.5 mb-1">
              <PoundSterling size={14} className="text-brand-mid" />
              <span className="text-xs font-semibold text-brand-mid">This Month</span>
            </div>
            <p className="text-2xl font-extrabold text-brand-black">£{stats.monthEarnings.toFixed(0)}</p>
            {!isFirstMonth && (
              <div className={`flex items-center gap-1 mt-1 ${earningsUp ? 'text-status-green' : 'text-status-amber'}`}>
                {earningsUp ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                <span className="text-xs font-medium">
                  {earningsUp ? '↑' : '↓'} vs £{stats.lastMonthEarnings.toFixed(0)}
                </span>
              </div>
            )}
            {isFirstMonth && <p className="text-xs text-brand-muted mt-1">Building baseline</p>}
          </div>

          <div
            onClick={() => { captureDashboardCardTapped({ card: 'outstanding' }); navigate('/jobs'); }}
            className="bg-white border border-brand-border rounded-xl p-4 cursor-pointer active:scale-[0.98] transition-transform"
          >
            <div className="flex items-center gap-1.5 mb-1">
              <AlertCircle size={14} className="text-brand-mid" />
              <span className="text-xs font-semibold text-brand-mid">Outstanding</span>
            </div>
            <p className="text-2xl font-extrabold text-brand-black">£{stats.outstandingTotal.toFixed(0)}</p>
            <p className="text-xs text-brand-muted mt-1">{stats.outstandingCount} job{stats.outstandingCount !== 1 ? 's' : ''}</p>
          </div>

          <div className="bg-white border border-brand-border rounded-xl p-4">
            <div className="flex items-center gap-1.5 mb-1">
              <Target size={14} className="text-brand-mid" />
              <span className="text-xs font-semibold text-brand-mid">Win Rate</span>
            </div>
            <p className="text-2xl font-extrabold text-brand-black">{stats.winRate.toFixed(0)}%</p>
            <p className="text-xs text-brand-muted mt-1">{stats.monthQuoted} quoted this month</p>
          </div>

          <div className="bg-white border border-brand-border rounded-xl p-4">
            <div className="flex items-center gap-1.5 mb-1">
              <PoundSterling size={14} className="text-brand-mid" />
              <span className="text-xs font-semibold text-brand-mid">Avg Job</span>
            </div>
            <p className="text-2xl font-extrabold text-brand-black">£{stats.avgJobValue.toFixed(0)}</p>
            <p className="text-xs text-brand-muted mt-1">per completed job</p>
          </div>
        </div>

        {stats.topJobType && (
          <div className="bg-white border border-brand-border rounded-xl p-4 mb-4">
            <p className="text-xs font-semibold text-brand-mid mb-2">Top job type</p>
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold text-brand-black">{stats.topJobType.title}</span>
              <span className="text-sm font-bold text-brand-black">£{stats.topJobType.earnings.toFixed(0)}</span>
            </div>
            <p className="text-xs text-brand-muted mt-1">{stats.topJobType.count} job{stats.topJobType.count !== 1 ? 's' : ''}</p>
          </div>
        )}

        {stats.reviewRequestsSent > 0 && (
          <div className="bg-white border border-brand-border rounded-xl p-4">
            <p className="text-xs font-semibold text-brand-mid mb-1">Review requests</p>
            <p className="text-sm font-bold text-brand-black">{stats.reviewRequestsSent} sent this month</p>
          </div>
        )}
      </div>
    </div>
  );
}
