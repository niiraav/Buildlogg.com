import { useEffect, useState, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { useAppStore } from '../../store/useAppStore';
import { db, type Profile } from '../../lib/db';
import { CONTEXT_CONTENT, type RouteKey } from './content';

const HAS_SEEN_DASHBOARD_KEY = 'buildlogg_has_seen_dashboard';

function isNewUser(): boolean {
  try {
    return localStorage.getItem(HAS_SEEN_DASHBOARD_KEY) !== 'true';
  } catch {
    return true;
  }
}

function routeKeyFromPath(path: string): RouteKey {
  if (path === '/' || path === '/app' || path === '/app/') return 'home';
  if (path.startsWith('/jobs')) return 'jobs';
  if (path.startsWith('/activity')) return 'activity';
  if (path.startsWith('/settings')) return 'settings';
  return 'home';
}

export default function AppDesktopContext() {
  const location = useLocation();
  const userId = useAppStore((s) => s.userId);
  const [isNew, setIsNew] = useState(() => isNewUser());
  const [activeJobs, setActiveJobs] = useState(0);
  const [bookedToday, setBookedToday] = useState(0);
  const [unpaidTotal, setUnpaidTotal] = useState(0);
  const [recentPayments, setRecentPayments] = useState(0);
  const [completedToday, setCompletedToday] = useState(0);
  const [profile, setProfile] = useState<Profile | null>(null);

  // Re-check new/returning state on mount and when storage changes
  useEffect(() => {
    const check = () => setIsNew(isNewUser());
    check();
    window.addEventListener('storage', check);
    return () => window.removeEventListener('storage', check);
  }, []);

  // Fetch contextual stats for the left panel
  useEffect(() => {
    if (!userId) return;
    const uid = userId;

    let mounted = true;
    async function load() {
      const allJobs = await db.jobs.where('user_id').equals(uid).toArray();
      const allItems = await db.line_items.toArray();
      const allPayments = await db.payments.toArray();
      const prof = await db.profiles.get(uid);
      const today = new Date().toDateString();

      const active = allJobs.filter(
        (j) => j.status === 'in_progress' || j.status === 'booked'
      ).length;
      const booked = allJobs.filter(
        (j) => j.status === 'booked' && j.scheduled_start && new Date(j.scheduled_start).toDateString() === today
      ).length;
      const unpaid = allJobs
        .filter((j) => j.status === 'awaiting_payment')
        .reduce((sum, j) => {
          const items = allItems.filter((i) => i.job_id === j.id);
          return sum + items.reduce((s, i) => s + (i.amount || 0), 0);
        }, 0);
      const completed = allJobs.filter(
        (j) => j.status === 'paid' && j.actual_end && new Date(j.actual_end).toDateString() === today
      ).length;

      const now = new Date();
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const payments = allPayments.filter(
        (p) => p.recorded_at && new Date(p.recorded_at) >= weekAgo
      ).length;

      if (!mounted) return;
      setActiveJobs(active);
      setBookedToday(booked);
      setUnpaidTotal(unpaid);
      setCompletedToday(completed);
      setRecentPayments(payments);
      setProfile(prof || null);
    }

    load();
    return () => {
      mounted = false;
    };
  }, [userId]);

  const routeKey = routeKeyFromPath(location.pathname);
  const variant = isNew ? CONTEXT_CONTENT[routeKey].new : CONTEXT_CONTENT[routeKey].returning;

  const extraContent = useMemo(() => {
    if (!variant.extra) return null;

    if (variant.extra.type === 'stats') {
      if (routeKey === 'home') {
        return (
          <div className="grid grid-cols-3 gap-3">
            <div>
              <p className="text-xl font-extrabold text-brand-black">{activeJobs}</p>
              <p className="text-xs text-brand-mid">Active</p>
            </div>
            <div>
              <p className="text-xl font-extrabold text-brand-black">{bookedToday}</p>
              <p className="text-xs text-brand-mid">Today</p>
            </div>
            <div>
              <p className="text-xl font-extrabold text-brand-black">£{unpaidTotal.toFixed(0)}</p>
              <p className="text-xs text-brand-mid">Unpaid</p>
            </div>
          </div>
        );
      }
      if (routeKey === 'activity') {
        return (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-xl font-extrabold text-brand-black">{recentPayments}</p>
              <p className="text-xs text-brand-mid">Payments this week</p>
            </div>
            <div>
              <p className="text-xl font-extrabold text-brand-black">{completedToday}</p>
              <p className="text-xs text-brand-mid">Done today</p>
            </div>
          </div>
        );
      }
      return null;
    }

    if (variant.extra.type === 'status') {
      const checks = [
        { label: 'Business name', ok: !!profile?.business_name?.trim() },
        { label: 'Trade', ok: !!profile?.trade },
        { label: 'Payment terms', ok: !!profile?.payment_terms },
        { label: 'Phone', ok: !!profile?.phone?.trim() },
      ];
      const missing = checks.filter((c) => !c.ok);
      return (
        <div className="space-y-2">
          {missing.length === 0 ? (
            <p className="text-sm text-brand-dark">All key details are set.</p>
          ) : (
            <>
              <p className="text-sm text-brand-dark">Still to set:</p>
              <ul className="flex flex-wrap gap-2">
                {missing.map((c) => (
                  <li key={c.label} className="text-xs text-brand-mid bg-brand-surface-card px-2 py-1 rounded-md">
                    {c.label}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      );
    }

    return (
      <p className="text-sm text-brand-dark">
        {variant.extra.content}
      </p>
    );
  }, [variant, routeKey, activeJobs, bookedToday, unpaidTotal, recentPayments, completedToday, profile]);

  return (
    <div className="max-w-md flex flex-col gap-6">
      <div className="text-brand-black">
        {variant.illustration}
      </div>
      <div>
        <h2 className="text-xl font-extrabold text-brand-black tracking-tight mb-2">
          {variant.headline}
        </h2>
        <p className="text-sm text-brand-mid leading-relaxed">
          {variant.body}
        </p>
      </div>
      {extraContent && (
        <div className="pt-2">
          {extraContent}
        </div>
      )}
    </div>
  );
}
