import { Hammer, Smartphone } from 'lucide-react';
import { useEffect, useState, useMemo } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { db } from '../../lib/db';
import type { Profile } from '../../lib/db';

const HAS_SEEN_DASHBOARD_KEY = 'buildlogg_has_seen_dashboard';

function isNewUser(): boolean {
  try {
    return localStorage.getItem(HAS_SEEN_DASHBOARD_KEY) !== 'true';
  } catch {
    return true;
  }
}

export default function AppDesktopContext() {
  const userId = useAppStore((s) => s.userId);
  const [isNew, setIsNew] = useState(() => isNewUser());
  const [activeJobs, setActiveJobs] = useState(0);
  const [unpaidTotal, setUnpaidTotal] = useState(0);
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
      const prof = await db.profiles.get(uid);

      const active = allJobs.filter(
        (j) => j.status === 'in_progress' || j.status === 'booked'
      ).length;
      const unpaid = allJobs
        .filter((j) => j.status === 'awaiting_payment')
        .reduce((sum, j) => {
          const items = allItems.filter((i) => i.job_id === j.id);
          return sum + items.reduce((s, i) => s + (i.amount || 0), 0);
        }, 0);

      if (!mounted) return;
      setActiveJobs(active);
      setUnpaidTotal(unpaid);
      setProfile(prof || null);
    }

    load();
    return () => {
      mounted = false;
    };
  }, [userId]);

  const extraContent = useMemo(() => {
    if (isNew) return null;
    return (
      <div className="grid grid-cols-2 gap-3">
        <Card padding={16}>
          <div className="text-xs font-medium mb-1.5" style={{ color: 'var(--muted)' }}>Active jobs</div>
          <div className="text-2xl font-semibold tracking-[-0.6px] leading-tight" style={{ color: 'var(--ink)' }}>
            {activeJobs}
          </div>
          <div className="text-xs font-medium mt-1.5" style={{ color: 'var(--success)' }}>
            {activeJobs > 0 ? 'In progress' : 'No active jobs'}
          </div>
        </Card>
        <Card padding={16}>
          <div className="text-xs font-medium mb-1.5" style={{ color: 'var(--muted)' }}>Unpaid</div>
          <div className="text-2xl font-semibold tracking-[-0.6px] leading-tight" style={{ color: 'var(--ink)' }}>
            £{unpaidTotal.toFixed(0)}
          </div>
          <div className="text-xs font-medium mt-1.5" style={{ color: unpaidTotal > 0 ? 'var(--warning)' : 'var(--success)' }}>
            {unpaidTotal > 0 ? 'Awaiting payment' : 'All paid up'}
          </div>
        </Card>
      </div>
    );
  }, [isNew, activeJobs, unpaidTotal]);

  return (
    <div className="w-full max-w-[460px] flex-1 flex flex-col justify-between">
      <div className="flex flex-col gap-6">
        <BrandHeader />

        <ContextTag isNew={isNew} />

        <div>
          <h2 className="text-2xl font-semibold tracking-[-0.5px] mb-2" style={{ color: 'var(--ink)' }}>
            {isNew ? 'Your workday, in one place' : 'Since you were last in...'}
          </h2>
          <p className="text-sm leading-relaxed" style={{ color: 'var(--muted)' }}>
            {isNew
              ? 'Track today\'s jobs, send quotes, and record payments as you move between sites.'
              : 'A calm summary, no bouncing red numbers.'}
          </p>
        </div>

        {extraContent}

        {isNew && (
          <Card padding={16}>
            <div className="flex flex-col gap-3">
              <div className="flex gap-3 items-start">
                <span className="w-2 h-2 rounded-full mt-2 shrink-0" style={{ background: 'var(--badge-violet)' }} />
                <div>
                  <div className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>Send a quote</div>
                  <div className="text-sm" style={{ color: 'var(--muted)' }}>WhatsApp or email — tracked.</div>
                </div>
              </div>
              <div className="flex gap-3 items-start">
                <span className="w-2 h-2 rounded-full mt-2 shrink-0" style={{ background: 'var(--badge-orange)' }} />
                <div>
                  <div className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>Schedule the job</div>
                  <div className="text-sm" style={{ color: 'var(--muted)' }}>Drag onto your week, set reminders.</div>
                </div>
              </div>
              <div className="flex gap-3 items-start">
                <span className="w-2 h-2 rounded-full mt-2 shrink-0" style={{ background: 'var(--success)' }} />
                <div>
                  <div className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>Get paid</div>
                  <div className="text-sm" style={{ color: 'var(--muted)' }}>Mark complete, auto-chase invoices.</div>
                </div>
              </div>
            </div>
          </Card>
        )}

        {!isNew && profile && (
          <Card padding={16}>
            <div className="text-xs font-semibold tracking-[0.04em] uppercase mb-2.5" style={{ color: 'var(--muted-soft)' }}>
              Your defaults
            </div>
            <div className="text-sm" style={{ color: 'var(--muted)' }}>
              <p className="mb-1">
                <span className="font-medium" style={{ color: 'var(--ink)' }}>Trade:</span> {profile.trade || 'Not set'}
              </p>
              <p className="mb-1">
                <span className="font-medium" style={{ color: 'var(--ink)' }}>Callout:</span> £{profile.callout_charge || '0'}
              </p>
              <p>
                <span className="font-medium" style={{ color: 'var(--ink)' }}>Payment terms:</span> {profile.payment_terms?.replace('_', ' ') || 'Not set'}
              </p>
            </div>
          </Card>
        )}
      </div>

      <MobileFooter />
    </div>
  );
}

function ContextTag({ isNew }: { isNew: boolean }) {
  return (
    <div
      className="inline-flex self-start items-center gap-2"
      style={{
        background: 'var(--canvas)',
        border: '1px solid var(--hairline)',
        borderRadius: 9999,
        padding: '5px 12px 5px 8px',
        fontSize: 12,
        fontWeight: 500,
        color: 'var(--muted)',
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: 9999,
          background: isNew ? 'var(--badge-violet)' : 'var(--success)',
        }}
      />
      <span style={{ color: 'var(--ink)' }}>Home</span>
      
      
    </div>
  );
}

function Card({ children, padding = 20 }: { children: React.ReactNode; padding?: number }) {
  return (
    <div
      style={{
        background: 'var(--canvas)',
        border: '1px solid var(--hairline)',
        borderRadius: 12,
        padding,
        boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
      }}
    >
      {children}
    </div>
  );
}

function BrandHeader() {
  return (
    <div className="flex flex-col gap-4">
      <div className="inline-flex items-center gap-2.5">
        <span className="w-9 h-9 rounded-lg bg-brand-black text-white grid place-items-center">
          <Hammer size={20} strokeWidth={2.2} />
        </span>
        <span className="text-[22px] font-extrabold tracking-[-0.03em] text-brand-black">
          Buildlogg
        </span>
      </div>
      <h1 className="text-3xl font-semibold text-brand-black tracking-[-0.03em] leading-[1.05]">
        Quotes, jobs, and payments from your van.
      </h1>
    </div>
  );
}

function MobileFooter() {
  return (
    <div className="flex items-start gap-2 mt-8 pt-4" style={{ color: 'var(--muted-soft)' }}>
      <Smartphone size={18} className="text-brand-mid mt-0.5 shrink-0" />
      <div className="text-xs leading-relaxed" style={{ color: 'var(--muted-soft)' }}>
        <p className="font-medium" style={{ color: 'var(--ink)' }}>Built for mobile.</p>
        <p>Install the app on your phone for the best experience.</p>
      </div>
    </div>
  );
}
