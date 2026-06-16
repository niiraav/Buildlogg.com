import type { ReactNode, ReactElement } from 'react';
import { Hammer, Smartphone } from 'lucide-react';
import { useEffect, useState, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { useAppStore } from '../../store/useAppStore';
import { db } from '../../lib/db';
import type { Profile } from '../../lib/db';

const HAS_SEEN_DASHBOARD_KEY = 'buildlogg_has_seen_dashboard';

type Screen = 'home' | 'jobs' | 'activity' | 'settings';
type Mode = 'new' | 'returning';

function isNewUser(): boolean {
  try {
    return localStorage.getItem(HAS_SEEN_DASHBOARD_KEY) !== 'true';
  } catch {
    return true;
  }
}

function getScreen(path: string): Screen {
  if (path === '/jobs') return 'jobs';
  if (path === '/activity') return 'activity';
  if (path === '/settings' || path.startsWith('/settings/')) return 'settings';
  return 'home';
}

function getScreenLabel(screen: Screen): string {
  switch (screen) {
    case 'home': return 'Home';
    case 'jobs': return 'Jobs';
    case 'activity': return 'Activity';
    case 'settings': return 'Settings';
  }
}

export default function AppDesktopContext() {
  const userId = useAppStore((s) => s.userId);
  const location = useLocation();
  const screen = useMemo(() => getScreen(location.pathname), [location.pathname]);
  const [isNew, setIsNew] = useState(() => isNewUser());
  const [activeJobs, setActiveJobs] = useState(0);
  const [unpaidTotal, setUnpaidTotal] = useState(0);
  const [profile, setProfile] = useState<Profile | null>(null);

  useEffect(() => {
    const check = () => setIsNew(isNewUser());
    check();
    window.addEventListener('storage', check);
    return () => window.removeEventListener('storage', check);
  }, []);

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

  const mode: Mode = isNew ? 'new' : 'returning';

  return (
    <div className="w-full max-w-[460px] flex-1 flex flex-col justify-between">
      <div className="flex flex-col gap-6">
        <BrandHeader />

        <div key={`${screen}-${mode}`} className="lc-fade-in">
          <ContextModule
            screen={screen}
            mode={mode}
            activeJobs={activeJobs}
            unpaidTotal={unpaidTotal}
            profile={profile}
          />
        </div>
      </div>

      <MobileFooter />
    </div>
  );
}

function ContextModule({
  screen,
  mode,
  activeJobs,
  unpaidTotal,
  profile,
}: {
  screen: Screen;
  mode: Mode;
  activeJobs: number;
  unpaidTotal: number;
  profile: Profile | null;
}) {
  const tag = <ContextTag screen={screen} mode={mode} />;

  if (screen === 'home') {
    return (
      <Frame>
        {tag}
        {mode === 'new' ? <HomeNew /> : <HomeReturning activeJobs={activeJobs} unpaidTotal={unpaidTotal} profile={profile} />}
      </Frame>
    );
  }
  if (screen === 'jobs') {
    return (
      <Frame>
        {tag}
        {mode === 'new' ? <JobsNew /> : <JobsReturning />}
      </Frame>
    );
  }
  if (screen === 'activity') {
    return (
      <Frame>
        {tag}
        {mode === 'new' ? <ActivityNew /> : <ActivityReturning />}
      </Frame>
    );
  }
  return (
    <Frame>
      {tag}
      {mode === 'new' ? <SettingsNew /> : <SettingsReturning profile={profile} />}
    </Frame>
  );
}

function Frame({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-4">{children}</div>;
}

function ContextTag({ screen, mode }: { screen: Screen; mode: Mode }) {
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
          background: mode === 'new' ? 'var(--badge-violet)' : 'var(--success)',
        }}
      />
      <span style={{ color: 'var(--ink)' }}>{getScreenLabel(screen)}</span>
      <span style={{ color: 'var(--muted-soft)' }}>·</span>
      <span>{mode === 'new' ? 'First visit' : 'Welcome back'}</span>
    </div>
  );
}

function BrandHeader() {
  return (
    <div className="flex flex-col gap-5">
      <div className="inline-flex items-center gap-2.5">
        <span className="w-9 h-9 rounded-lg bg-brand-black text-white grid place-items-center">
          <Hammer size={20} strokeWidth={2.2} />
        </span>
        <span className="text-[22px] font-extrabold tracking-[-0.03em] text-brand-black">
          Buildlogg
        </span>
      </div>
      <h1 className="text-3xl font-semibold text-brand-black tracking-[-0.03em] leading-[1.05]">
        Quotes, jobs, and payments — from your van.
      </h1>
    </div>
  );
}

function HomeNew() {
  return (
    <>
      <Heading>One place for your trade business.</Heading>
      <Lede>Quote, schedule, and chase payment without juggling four apps.</Lede>
      <Card padding={20}>
        <div className="flex flex-col gap-4">
          {[
            { dot: 'var(--badge-violet)', t: 'Send a quote', s: 'WhatsApp or email — tracked.' },
            { dot: 'var(--badge-orange)', t: 'Schedule the job', s: 'Set dates, reminders, and notes.' },
            { dot: 'var(--success)', t: 'Get paid', s: 'Mark complete and record payment.' },
          ].map((r) => (
            <div key={r.t} className="flex gap-3 items-start">
              <span className="w-2 h-2 rounded-full mt-2 shrink-0" style={{ background: r.dot }} />
              <div>
                <div className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>{r.t}</div>
                <div className="text-sm" style={{ color: 'var(--muted)' }}>{r.s}</div>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </>
  );
}

function HomeReturning({
  activeJobs,
  unpaidTotal,
  profile,
}: {
  activeJobs: number;
  unpaidTotal: number;
  profile: Profile | null;
}) {
  return (
    <>
      <Heading>Since you were last in…</Heading>
      <Lede>A calm summary, no bouncing red numbers.</Lede>
      <div className="grid grid-cols-2 gap-3">
        <Stat label="Active jobs" value={String(activeJobs)} delta={activeJobs > 0 ? 'In progress' : 'No active jobs'} tone={activeJobs > 0 ? 'up' : 'neutral'} />
        <Stat label="Unpaid" value={`£${unpaidTotal.toFixed(0)}`} delta={unpaidTotal > 0 ? 'Awaiting payment' : 'All paid up'} tone={unpaidTotal > 0 ? 'warn' : 'neutral'} />
      </div>
      {profile && (
        <Card padding={16}>
          <div className="text-xs font-semibold tracking-[0.04em] uppercase mb-2.5" style={{ color: 'var(--muted-soft)' }}>
            Your defaults
          </div>
          <div className="text-sm" style={{ color: 'var(--muted)' }}>
            <p className="mb-1">
              <span className="font-medium" style={{ color: 'var(--ink)' }}>Trade:</span>{' '}
              {profile.trade === 'other' ? profile.trade_other || 'Other' : (profile.trade || 'Not set')}
            </p>
            <p className="mb-1">
              <span className="font-medium" style={{ color: 'var(--ink)' }}>Callout:</span>{' '}
              £{profile.callout_charge || '0'}
            </p>
            <p>
              <span className="font-medium" style={{ color: 'var(--ink)' }}>Payment terms:</span>{' '}
              {profile.payment_terms?.replace(/_/g, ' ') || 'Not set'}
            </p>
          </div>
        </Card>
      )}
    </>
  );
}

function JobsNew() {
  return (
    <>
      <Heading>What a "job" is in Buildlogg.</Heading>
      <Lede>One job holds the quote, the schedule, the visit notes, and the invoice.</Lede>
      <Card padding={20}>
        <FlowDiagram />
      </Card>
    </>
  );
}

function JobsReturning() {
  return (
    <>
      <Heading>Your pipeline at a glance.</Heading>
      <Lede>Everything from enquiry to payment, sorted by status.</Lede>
      <Card padding={16}>
        <div className="flex flex-col gap-1.5 text-sm" style={{ color: 'var(--muted)' }}>
          <p>Use the board to track jobs through each stage:</p>
          <div className="flex gap-2 items-center mt-1">
            <span className="w-2 h-2 rounded-full" style={{ background: 'var(--badge-violet)' }} />
            <span>Quoted</span>
          </div>
          <div className="flex gap-2 items-center">
            <span className="w-2 h-2 rounded-full" style={{ background: 'var(--badge-orange)' }} />
            <span>Scheduled & in progress</span>
          </div>
          <div className="flex gap-2 items-center">
            <span className="w-2 h-2 rounded-full" style={{ background: 'var(--success)' }} />
            <span>Awaiting payment</span>
          </div>
        </div>
      </Card>
      <ProTip>
        Tip · tap any job card to see the full quote, schedule, and payment history.
      </ProTip>
    </>
  );
}

function ActivityNew() {
  return (
    <>
      <Heading>Everything that matters, logged automatically.</Heading>
      <Lede>So you can prove what you did, when, and to whom — even months later.</Lede>
      <Card padding={18}>
        <ActivityRow icon="quote" title="Quotes sent and viewed" meta="Open rates, reminders" />
        <Divider />
        <ActivityRow icon="job" title="Job status changes" meta="Booked, started, completed" />
        <Divider />
        <ActivityRow icon="pay" title="Payments and chases" meta="Received, due, overdue" />
        <Divider />
        <ActivityRow icon="note" title="Site notes and photos" meta="Timestamped, geo-tagged" />
      </Card>
    </>
  );
}

function ActivityReturning() {
  return (
    <>
      <Heading>This week's highlights.</Heading>
      <Lede>A few things worth knowing before you dive in.</Lede>
      <div className="flex flex-col gap-2.5">
        <Highlight tone="var(--success)" title="Activity is logged in real time" body="Every quote, status change, and payment is recorded here." />
        <Highlight tone="var(--badge-orange)" title="Chase overdue invoices" body="Use the jobs board to see what’s still unpaid." />
        <Highlight tone="var(--brand-accent)" title="Keep customers in the loop" body="WhatsApp or SMS updates are sent from the job detail page." />
      </div>
    </>
  );
}

function SettingsNew() {
  return (
    <>
      <Heading>Start with the three that change everything.</Heading>
      <Lede>You can come back to the rest. These set up the spine.</Lede>
      <Card padding={16}>
        <SetupRow n={1} title="Add your business details" hint="Name, trade, and phone — shows up on quotes." />
        <Divider />
        <SetupRow n={2} title="Set your payment terms" hint="Callout charge, deposits, and invoice defaults." />
        <Divider />
        <SetupRow n={3} title="Customise your quote defaults" hint="Labour line and quote validity." />
      </Card>
    </>
  );
}

function SettingsReturning({ profile }: { profile: Profile | null }) {
  return (
    <>
      <Heading>Your setup, at a glance.</Heading>
      <Lede>The essentials that power your quotes and jobs.</Lede>
      <Card padding={16}>
        <SettingsCheck done={!!(profile?.business_name || profile?.full_name)} label="Business details" />
        <Divider />
        <SettingsCheck done={!!profile?.trade} label="Trade and callout charge" />
        <Divider />
        <SettingsCheck done={!!profile?.payment_terms} label="Payment terms" />
        <Divider />
        <SettingsCheck done={!!(profile?.default_labour_charge || profile?.default_labour_description)} label="Quote defaults" />
        <Divider />
        <SettingsCheck done={!!profile?.phone} label="Contact phone" />
      </Card>
    </>
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

/* ============================================================
   Shared primitives
   ============================================================ */
function Card({ children, padding = 20 }: { children: ReactNode; padding?: number }) {
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

function Heading({ children }: { children: ReactNode }) {
  return (
    <h3 className="text-lg font-semibold tracking-[-0.2px]" style={{ color: 'var(--ink)' }}>
      {children}
    </h3>
  );
}

function Lede({ children }: { children: ReactNode }) {
  return <p className="text-sm leading-relaxed" style={{ color: 'var(--muted)' }}>{children}</p>;
}

function Stat({
  label,
  value,
  delta,
  tone,
}: {
  label: string;
  value: string;
  delta: string;
  tone: 'up' | 'warn' | 'neutral';
}) {
  const toneColor = tone === 'up' ? 'var(--success)' : tone === 'warn' ? 'var(--warning)' : 'var(--muted)';
  return (
    <Card padding={16}>
      <div className="text-xs font-medium mb-1.5" style={{ color: 'var(--muted)' }}>{label}</div>
      <div className="text-2xl font-semibold tracking-[-0.6px] leading-tight" style={{ color: 'var(--ink)' }}>
        {value}
      </div>
      <div className="text-xs font-medium mt-1.5" style={{ color: toneColor }}>
        {delta}
      </div>
    </Card>
  );
}

function ActivityRow({ icon, title, meta }: { icon: 'quote' | 'pay' | 'job' | 'note'; title: string; meta: string }) {
  return (
    <div className="flex items-center gap-3 py-2">
      <IconChip kind={icon} />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold truncate" style={{ color: 'var(--ink)' }}>{title}</div>
        <div className="text-xs" style={{ color: 'var(--muted)' }}>{meta}</div>
      </div>
    </div>
  );
}

function IconChip({ kind }: { kind: 'quote' | 'pay' | 'job' | 'note' }) {
  const paths: Record<typeof kind, ReactElement> = {
    quote: <><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></>,
    pay: <><path d="M12 1v22" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></>,
    job: <><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></>,
    note: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></>,
  };
  return (
    <span
      className="w-8 h-8 rounded-lg grid place-items-center shrink-0"
      style={{ background: 'var(--surface-card)', color: 'var(--ink)' }}
    >
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        {paths[kind]}
      </svg>
    </span>
  );
}

function Divider() {
  return <div className="h-px" style={{ background: 'var(--hairline-soft)', margin: '2px 0' }} />;
}
function Highlight({ tone, title, body }: { tone: string; title: string; body: string }) {
  return (
    <div
      className="flex gap-3 items-start rounded-xl p-3"
      style={{ background: 'var(--canvas)', border: '1px solid var(--hairline)', boxShadow: '0 1px 2px rgba(0,0,0,0.03)' }}
    >
      <span className="w-2 h-2 rounded-full mt-2 shrink-0" style={{ background: tone }} />
      <div>
        <div className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>{title}</div>
        <div className="text-sm" style={{ color: 'var(--muted)' }}>{body}</div>
      </div>
    </div>
  );
}

function SetupRow({ n, title, hint }: { n: number; title: string; hint: string }) {
  return (
    <div className="flex gap-3 py-2.5 items-start">
      <span
        className="w-[22px] h-[22px] rounded-full text-white text-xs font-semibold grid place-items-center shrink-0 mt-0.5"
        style={{ background: 'var(--ink)' }}
      >
        {n}
      </span>
      <div>
        <div className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>{title}</div>
        <div className="text-xs" style={{ color: 'var(--muted)' }}>{hint}</div>
      </div>
    </div>
  );
}

function SettingsCheck({ label, done = false }: { label: string; done?: boolean }) {
  return (
    <div className="flex items-center gap-3 py-2">
      <span
        className="w-[18px] h-[18px] rounded-full grid place-items-center shrink-0"
        style={{
          background: done ? 'var(--ink)' : 'transparent',
          border: done ? '0' : '1.5px dashed #c8ccd3',
        }}
      >
        {done && (
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        )}
      </span>
      <span className="text-sm" style={{ fontWeight: done ? 500 : 600, color: done ? 'var(--muted)' : 'var(--ink)' }}>
        {label}
      </span>
      {!done && (
        <span className="ml-auto text-xs font-semibold" style={{ color: 'var(--warning)' }}>
          Unset
        </span>
      )}
    </div>
  );
}

function ProTip({ children }: { children: ReactNode }) {
  return (
    <div
      className="flex gap-2.5 items-start rounded-lg p-3 text-sm leading-relaxed"
      style={{ background: 'var(--surface-card)', color: 'var(--body)' }}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 mt-0.5" style={{ color: 'var(--ink)' }}>
        <path d="M9 18h6" /><path d="M10 22h4" /><path d="M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2z" />
      </svg>
      <div>{children}</div>
    </div>
  );
}

function FlowDiagram() {
  const steps = ['Quote', 'Schedule', 'On site', 'Paid'];
  return (
    <div className="flex items-center justify-between gap-2">
      {steps.map((s, i) => (
        <div key={s} className="flex items-center gap-2" style={{ flex: i < steps.length - 1 ? 1 : '0 0 auto' }}>
          <div
            className="px-3.5 py-2 rounded-full text-xs font-semibold whitespace-nowrap"
            style={{
              background: i === 0 ? 'var(--ink)' : 'var(--surface-card)',
              color: i === 0 ? '#fff' : 'var(--ink)',
            }}
          >
            {s}
          </div>
          {i < steps.length - 1 && (
            <div className="flex-1 h-px relative" style={{ background: 'var(--hairline)' }}>
              <span
                className="absolute -right-0.5 -top-1.5 w-1.5 h-1.5"
                style={{
                  borderRight: '1.5px solid var(--muted)',
                  borderTop: '1.5px solid var(--muted)',
                  transform: 'rotate(45deg)',
                }}
              />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
