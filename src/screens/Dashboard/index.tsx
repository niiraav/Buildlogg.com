import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, TrendingUp, TrendingDown, AlertCircle, Target, PoundSterling, Download, Users, Calendar, Plus } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { useCountUp } from '../../hooks/useCountUp';
import { db } from '../../lib/db';
import { getDashboardStats, exportMonthlyCSV, type DashboardStats } from '../../lib/dashboard';
import { captureDashboardViewed, captureDashboardCardTapped, captureDataExported, captureReferralCardViewed, captureInsightsShown, captureInsightCtaTapped, captureInsightDismissed } from '../../lib/analytics';
import { showSuccess } from '../../components/Toast/store';
import { BottomSheet } from '../../components/BottomSheet';
import { Button } from '../../components/Button';
import { addToSyncQueue } from '../../lib/syncQueue';
import { getJobTitlePricingHistory, type JobTitlePricing } from '../../lib/pricingHistory';
import { generateInsights, type Insight } from '../../lib/insights';
import InsightCard from '../../components/InsightCard';
import { useEntitlements } from '../../hooks/useEntitlements';

export default function Dashboard() {
  const navigate = useNavigate();
  const userId = useAppStore((s) => s.userId);
  const { can, upgradeUrl } = useEntitlements();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [pricing, setPricing] = useState<JobTitlePricing | null>(null);
  const [insights, setInsights] = useState<Insight[]>([]);
  const [dismissedInsights, setDismissedInsights] = useState<Set<string>>(new Set());
  const [recurringRevenue, setRecurringRevenue] = useState<{ total: number; count: number } | null>(null);

  const monthEarningsDisplay = useCountUp(stats?.monthEarnings ?? 0);
  const outstandingDisplay = useCountUp(stats?.outstandingTotal ?? 0);
  const winRateDisplay = useCountUp(stats?.winRate ?? 0);
  const avgJobDisplay = useCountUp(stats?.avgJobValue ?? 0);

  const canSeeInsights = can('business_insights');

  useEffect(() => {
    if (!userId) return;
    getDashboardStats(userId).then((s) => {
      setStats(s);
      setLoading(false);
    });
    captureDashboardViewed();
  }, [userId]);

  // Fetch pricing history for the top job type once stats are available
  useEffect(() => {
    if (!userId || !stats?.topJobType) return;
    getJobTitlePricingHistory(userId, stats.topJobType.title)
      .then(setPricing)
      .catch(() => {});
  }, [userId, stats?.topJobType]);

  useEffect(() => {
    if (stats?.referral && stats.referral.total > 0) {
      captureReferralCardViewed();
    }
  }, [stats?.referral?.total]);

  // W3-3: Generate insights after stats are loaded
  useEffect(() => {
    if (!userId || !stats || !canSeeInsights) return;
    generateInsights(userId, stats).then(setInsights).catch(() => {});
  }, [userId, stats, canSeeInsights]);

  // General expense logging
  const [showExpenseSheet, setShowExpenseSheet] = useState(false);
  const [expenseDesc, setExpenseDesc] = useState('');
  const [expenseAmount, setExpenseAmount] = useState('');

  const handleLogGeneralExpense = async () => {
    const amount = parseFloat(expenseAmount);
    if (!expenseDesc.trim() || isNaN(amount) || amount <= 0) return;
    const n = new Date().toISOString();
    const id = crypto.randomUUID();
    await db.work_log.add({
      id,
      job_id: null,
      type: 'expense',
      description: expenseDesc.trim(),
      amount,
      created_at: n,
      _sync_status: 'pending',
    });
    await addToSyncQueue('work_log', id, { id, job_id: null, type: 'expense', description: expenseDesc.trim(), amount, created_at: n }, 'insert');
    setExpenseDesc('');
    setExpenseAmount('');
    setShowExpenseSheet(false);
    // Refresh stats
    if (userId) {
      getDashboardStats(userId).then(s => setStats(s));
    }
    showSuccess('Expense logged');
  };

  // Load dismissed insights from localStorage (month-scoped)
  useEffect(() => {
    const monthKey = new Date().toISOString().slice(0, 7);
    const key = `buildlogg_insight_dismissed_${monthKey}`;
    try {
      const raw = localStorage.getItem(key);
      if (raw) setDismissedInsights(new Set(JSON.parse(raw)));
    } catch { /* ignore */ }
  }, []);

  // XU-3: Compute recurring revenue from active recurring jobs' original job line items
  useEffect(() => {
    if (!userId) return;
    (async () => {
      try {
        const active = await db.recurring_jobs
          .where('user_id')
          .equals(userId)
          .filter((r) => r.status === 'active')
          .toArray();
        if (active.length === 0) { setRecurringRevenue(null); return; }
        const originalJobIds = active.map((r) => r.original_job_id);
        const items = await db.line_items
          .where('job_id')
          .anyOf(originalJobIds)
          .filter((li) => !li.is_sample)
          .toArray();
        const total = items.reduce((sum, li) => sum + li.amount, 0);
        setRecurringRevenue({ total, count: active.length });
      } catch { setRecurringRevenue(null); }
    })();
  }, [userId]);

  const visibleInsights = useMemo(
    () => insights.filter((i) => !dismissedInsights.has(i.id)),
    [insights, dismissedInsights],
  );

  // Fire analytics when insights first render
  useEffect(() => {
    if (visibleInsights.length > 0) {
      captureInsightsShown({
        count: visibleInsights.length,
        types: visibleInsights.map((i) => i.type),
      });
    }
  }, [visibleInsights.length]);

  const handleDismissInsight = (id: string) => {
    setDismissedInsights((prev) => {
      const next = new Set(prev);
      next.add(id);
      const monthKey = new Date().toISOString().slice(0, 7);
      const key = `buildlogg_insight_dismissed_${monthKey}`;
      try { localStorage.setItem(key, JSON.stringify([...next])); } catch { /* ignore */ }
      return next;
    });
    const insight = insights.find((i) => i.id === id);
    if (insight) captureInsightDismissed({ type: insight.type });
  };

  const handleInsightCta = (insight: Insight) => {
    captureInsightCtaTapped({ type: insight.type });
    if (insight.ctaRoute) navigate(insight.ctaRoute);
  };

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
        {/* W3-3: Business insights & coaching */}
        {canSeeInsights && visibleInsights.length > 0 && (
          <div className="mb-4 space-y-3">
            {visibleInsights.map((insight) => (
              <InsightCard
                key={insight.id}
                insight={insight}
                onDismiss={handleDismissInsight}
                onCta={handleInsightCta}
              />
            ))}
          </div>
        )}

        {/* W3-3: Pro upsell for non-Pro users */}
        {!canSeeInsights && (
          <div className="bg-white border border-brand-border rounded-xl p-4 mb-4">
            <p className="text-sm font-bold text-brand-black">Business coaching insights</p>
            <p className="text-xs text-brand-muted mt-1 leading-relaxed">Upgrade to Pro for personalised coaching — win rate trends, profit alerts, and payment chase nudges.</p>
            <a href={upgradeUrl} className="inline-flex items-center gap-1 mt-2.5 text-xs font-semibold text-brand-black cursor-pointer">
              Upgrade to Pro <TrendingUp size={13} />
            </a>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="bg-white border border-brand-border rounded-xl p-4">
            <div className="flex items-center gap-1.5 mb-1">
              <PoundSterling size={14} className="text-brand-mid" />
              <span className="text-xs font-semibold text-brand-mid">This Month</span>
            </div>
            <p className="text-2xl font-extrabold text-brand-black">£{monthEarningsDisplay.toFixed(0)}</p>
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
            <p className="text-2xl font-extrabold text-brand-black">£{outstandingDisplay.toFixed(0)}</p>
            <p className="text-xs text-brand-muted mt-1">{stats.outstandingCount} job{stats.outstandingCount !== 1 ? 's' : ''}</p>
          </div>

          <div className="bg-white border border-brand-border rounded-xl p-4">
            <div className="flex items-center gap-1.5 mb-1">
              <Target size={14} className="text-brand-mid" />
              <span className="text-xs font-semibold text-brand-mid">Win Rate</span>
            </div>
            <p className="text-2xl font-extrabold text-brand-black">{winRateDisplay.toFixed(0)}%</p>
            <p className="text-xs text-brand-muted mt-1">{stats.monthQuoted} quoted this month</p>
          </div>

          <div className="bg-white border border-brand-border rounded-xl p-4">
            <div className="flex items-center gap-1.5 mb-1">
              <PoundSterling size={14} className="text-brand-mid" />
              <span className="text-xs font-semibold text-brand-mid">Avg Job</span>
            </div>
            <p className="text-2xl font-extrabold text-brand-black">£{avgJobDisplay.toFixed(0)}</p>
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
          <button
            onClick={() => setShowExpenseSheet(true)}
            className="flex items-center gap-1 text-xs font-semibold text-brand-dark mt-2 cursor-pointer"
          >
            <Plus size={13} />
            Log expense
          </button>
        </div>

        {/* XU-3: Recurring revenue tracked */}
        {recurringRevenue && recurringRevenue.total > 0 && (
          <div className="bg-white border border-brand-border rounded-xl p-4 mb-4">
            <div className="flex items-center gap-1.5 mb-1">
              <Calendar size={14} className="text-brand-mid" />
              <span className="text-xs font-semibold text-brand-mid">Recurring revenue tracked</span>
            </div>
            <p className="text-2xl font-extrabold text-brand-black">£{recurringRevenue.total.toFixed(0)}</p>
            <p className="text-xs text-brand-muted mt-1">{recurringRevenue.count} active recurring job{recurringRevenue.count !== 1 ? 's' : ''}</p>
          </div>
        )}

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

        {/* Pricing insights — actual price range for top job type */}
        {pricing && pricing.count >= 2 && (
          <div className="bg-white border border-brand-border rounded-xl p-4 mb-4">
            <p className="text-xs font-semibold text-brand-mid mb-2">Pricing insights</p>
            <p className="text-sm text-brand-dark leading-relaxed">
              You've quoted {stats.topJobType!.title} {pricing.count}× — £{pricing.min.toFixed(0)} to £{pricing.max.toFixed(0)}, avg £{pricing.avg.toFixed(0)}
            </p>
            {pricing.highVariance && pricing.count >= 3 && (
              <p className="text-xs text-status-amber mt-2 flex items-center gap-1">
                <AlertCircle size={13} /> High price variance — consider standardising your pricing
              </p>
            )}
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

      {/* General expense sheet */}
      <BottomSheet
        isOpen={showExpenseSheet}
        onClose={() => setShowExpenseSheet(false)}
        title="Log expense"
        subtitle="General expense (not tied to a specific job)"
      >
        <div className="mb-3">
          <label className="block text-micro font-bold tracking-[0.4px] text-brand-mid mb-1">
            Description
          </label>
          <input
            type="text"
            value={expenseDesc}
            onChange={(e) => setExpenseDesc(e.target.value)}
            placeholder="e.g. Gel polish bulk order"
            className="w-full h-12 px-3.5 border-2 border-brand-border rounded-lg text-base font-medium text-brand-black placeholder:text-brand-muted outline-none focus:border-brand-black"
          />
        </div>
        <div className="mb-4">
          <label className="block text-micro font-bold tracking-[0.4px] text-brand-mid mb-1">
            Amount
          </label>
          <div className="relative">
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-base font-medium text-brand-black">£</span>
            <input
              type="text"
              inputMode="decimal"
              value={expenseAmount}
              onChange={(e) => setExpenseAmount(e.target.value)}
              placeholder="0.00"
              className="w-full h-12 pl-8 pr-3.5 border-2 border-brand-border rounded-lg text-base font-medium text-brand-black placeholder:text-brand-muted outline-none focus:border-brand-black"
            />
          </div>
        </div>
        <Button
          variant="primary"
          onClick={handleLogGeneralExpense}
          disabled={!expenseDesc.trim() || !expenseAmount || parseFloat(expenseAmount) <= 0}
        >
          Log expense
        </Button>
      </BottomSheet>
    </div>
  );
}
