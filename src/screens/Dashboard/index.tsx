import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, TrendingUp, TrendingDown, AlertCircle, Target, PoundSterling, Download, Users } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { getDashboardStats, exportMonthlyCSV, type DashboardStats } from '../../lib/dashboard';
import { captureDashboardViewed, captureDashboardCardTapped, captureDataExported, captureReferralCardViewed } from '../../lib/analytics';
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

  useEffect(() => {
    if (stats?.referral && stats.referral.total > 0) {
      captureReferralCardViewed();
    }
  }, [stats?.referral?.total]);

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
        <button onClick={() => navigate('/settings')} className="flex items-center text-brand-dark cursor-pointer mb-2">
          <ChevronLeft size={20} />
        </button>
        <div className="flex items-center justify-between">
          <h1 className="screen-title text-brand-black">Stats</h1>
          <button onClick={handleExport} className="flex items-center gap-1.5 text-xs font-semibold text-brand-dark bg-brand-surface border border-brand-border px-3 py-1.5 rounded-lg cursor-pointer active:opacity-70">
            <Download size={14} />
            Export jobs (CSV)
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

        {/* BN-2: Profit card — full width below the grid */}
        <div className="bg-white border border-brand-border rounded-xl p-4 mb-4">
          <div className="flex items-center gap-1.5 mb-1">
            <PoundSterling size={14} className="text-brand-mid" />
            <span className="text-xs font-semibold text-brand-mid">Profit (this month)</span>
          </div>
          <div className="flex items-baseline gap-3">
            <p className="text-2xl font-extrabold text-brand-black">£{(stats.monthProfit ?? stats.monthEarnings).toFixed(0)}</p>
            {stats.monthExpenses > 0 && (
              <p className="text-xs font-medium text-brand-muted">
                Revenue £{stats.monthEarnings.toFixed(0)} - Expenses £{stats.monthExpenses.toFixed(0)}
              </p>
            )}
          </div>
          {stats.monthExpenses === 0 && (
            <p className="text-xs text-brand-muted mt-1">Log expenses on jobs to see your true profit</p>
          )}
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

        {/* Referral breakdown — where customers find you */}
        {stats.referral && (stats.referral.total > 0 || stats.referral.unknown > 0) && (
          <div className="bg-white border border-brand-border rounded-xl p-4 mb-4">
            <div className="flex items-center gap-1.5 mb-3">
              <Users size={14} className="text-brand-mid" />
              <span className="text-xs font-semibold text-brand-mid">Where customers find you</span>
            </div>

            {stats.referral.total > 0 ? (
              <div className="space-y-2">
                {stats.referral.bySource.map((r) => {
                  const pct = stats.referral.total > 0
                    ? Math.round((r.count / stats.referral.total) * 100)
                    : 0;
                  return (
                    <div key={r.source}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium text-brand-dark">{r.label}</span>
                        <span className="text-sm font-medium text-brand-muted">
                          {r.count} <span className="text-xs">({pct}%)</span>
                        </span>
                      </div>
                      <div className="h-1.5 bg-brand-surface rounded-full overflow-hidden">
                        <div
                          className="h-full bg-brand-black rounded-full transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
                {stats.referral.unknown > 0 && (
                  <p className="text-xs text-brand-muted pt-1">
                    {stats.referral.unknown} customer{stats.referral.unknown !== 1 ? 's' : ''} &middot; source not recorded
                  </p>
                )}
              </div>
            ) : (
              <p className="text-sm text-brand-muted">
                {stats.referral.unknown} customer{stats.referral.unknown !== 1 ? 's' : ''} &middot; source not recorded.
                Ask &ldquo;How did you find me?&rdquo; when you start a quote.
              </p>
            )}

            <p className="text-xs text-brand-muted mt-3 pt-3 border-t border-brand-borderLight">
              All time &middot; in-app quotes + online bookings
            </p>
          </div>
        )}

        {stats.referral && stats.referral.total === 0 && stats.referral.unknown === 0 && (
          <div className="bg-white border border-brand-border rounded-xl p-4 mb-4">
            <div className="flex items-center gap-1.5 mb-2">
              <Users size={14} className="text-brand-mid" />
              <span className="text-xs font-semibold text-brand-mid">Where customers find you</span>
            </div>
            <p className="text-sm text-brand-muted">
              No referral data yet &mdash; ask &ldquo;How did you find me?&rdquo; when you start a quote.
            </p>
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
