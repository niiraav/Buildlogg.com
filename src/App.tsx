import { useEffect, useRef, useState } from 'react';
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
  Outlet,
  useNavigate,
  useLocation,
} from 'react-router-dom';
import { supabase } from './lib/supabase';
import { db, type Profile } from './lib/db';
import { seedMissingTemplates, deduplicateTemplates } from './lib/seedMessageTemplates';
import { useAppStore } from './store/useAppStore';
import { syncWorker } from './lib/sync';
import { identifyUser, capture, initAnalytics } from './lib/analytics';
import { initialSync } from './lib/initialSync';
import { subscribeRealtime } from './lib/realtime';
import { checkEndOfDay } from './lib/notifications';
import DesktopNudge from './components/DesktopNudge';
import { SkeletonAppScreen } from './components/Skeleton';
import { useTheme } from './hooks/useTheme';
import { useUpdateCheck } from './hooks/useUpdateCheck';
import { ToastContainer } from './components/Toast';
import { TabBar } from './components/TabBar';
import Auth from './screens/Auth';
import Onboarding from './screens/Onboarding';
import Home from './screens/Home';
import Jobs from './screens/Jobs';
import JobDetail from './screens/JobDetail';
import Quote from './screens/Quote';
import Settings from './screens/Settings';
import CustomItems from './screens/Settings/CustomItems';
import Booking from './screens/Settings/Booking';
import MessageTemplates from './screens/Settings/MessageTemplates';
import Reminders from './screens/Settings/Reminders';
import Dashboard from './screens/Dashboard';
import Customers from './screens/Customers';
import CustomerDetail from './screens/Customers/CustomerDetail';
import AddCustomer from './screens/Customers/AddCustomer';
import Activity from './screens/Activity';
import AppDesktopContext from './components/AppDesktopContext';

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('Timeout')), ms)),
  ]);
}

/* ─── Route animation config ─── */
const TAB_PATHS = ['/', '/jobs', '/settings', '/activity'];
function isTab(path: string): boolean {
  return TAB_PATHS.includes(path);
}

/* ─── AuthGuard (no animation — just renders Outlet) ─── */
function AuthGuard() {
  const navigate = useNavigate();
  const setUserId = useAppStore((s) => s.setUserId);
  const setOnline = useAppStore((s) => s.setOnline);
  const location = useLocation();
  const [checking, setChecking] = useState(true);
  const initialCheckDone = useRef(false);
  const realtimeCleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    let mounted = true;
    let syncInterval: ReturnType<typeof setInterval> | null = null;

    async function checkSession() {
     try {
      let session = null;
      try {
        const { data } = await withTimeout(supabase.auth.getSession(), 5000);
        session = data?.session ?? null;
      } catch {
        session = null;
      }

      if (!mounted) return;

      // Dev fallback: mock sign-in only sets the app-store userId, not a real Supabase session.
      let devUserId = import.meta.env.DEV ? useAppStore.getState().userId : null;
      if (import.meta.env.DEV && !devUserId) {
        try {
          const mock = localStorage.getItem('buildlogg_mock_user');
          if (mock) devUserId = JSON.parse(mock).id || null;
        } catch {}
      }

      if (!session && !devUserId) {
        navigate('/auth' + window.location.search, { replace: true });
        setChecking(false);
        return;
      }

      const resolvedUserId = session?.user.id ?? devUserId ?? null;
      setUserId(resolvedUserId);
      if (resolvedUserId) identifyUser(resolvedUserId);

      // Ensure the user's profile exists locally. If it doesn't, try to restore
      // it directly from Supabase before deciding they need onboarding. This
      // fixes the bug where existing users were sent back to onboarding on
      // refresh because the full initialSync bundle (which waits for jobs,
      // customers, etc.) timed out before the profile could be written.
      let profile = resolvedUserId ? await db.profiles.get(resolvedUserId) : null;
      if (!profile && navigator.onLine && resolvedUserId) {
        try {
          // .single() returns a PostgrestBuilder, not a native Promise. Chain
          // .then() so withTimeout receives a real Promise and TypeScript is happy.
          const { data, error } = await withTimeout(
            (supabase.from('profiles').select('*').eq('id', resolvedUserId).single().then((r: { data: Profile | null; error: Error | null }) => r) as Promise<{ data: Profile | null; error: Error | null }>),
            5000
          );
          if (data && !error) {
            await db.profiles.put({ ...data, _sync_status: 'synced' });
            profile = await db.profiles.get(resolvedUserId);
          }
        } catch {
          // silently fall through to local-only check
        }
      }

      if (!profile) {
        navigate('/onboarding', { replace: true });
        setChecking(false);
        return;
      }

      // User has reached the dashboard with a valid profile: mark them as returning.
      try {
        localStorage.setItem('buildlogg_has_seen_dashboard', 'true');
      } catch {
        // ignore storage errors
      }

      if (location.pathname === '/onboarding') {
        navigate('/', { replace: true });
      }

      // Pull the rest of the user's data in the background; don't block the
      // dashboard on this large sync.
      if (navigator.onLine && resolvedUserId) {
        withTimeout(initialSync(resolvedUserId), 30000).catch(() => {});
        syncWorker().catch(() => {});
      }

      // W3-2: Subscribe to realtime changes for multi-device sync
      if (resolvedUserId) {
        if (realtimeCleanupRef.current) realtimeCleanupRef.current();
        realtimeCleanupRef.current = subscribeRealtime(resolvedUserId, () => {
          // Trigger a refresh by toggling the sync status — screens re-read
          // from Dexie on their own effects, so this is a lightweight nudge.
          if (navigator.onLine) syncWorker().catch(() => {});
        });
      }

      // Ensure existing users get new default templates (receipt, update, etc.)
      if (resolvedUserId) {
        seedMissingTemplates(resolvedUserId).catch(() => {});
        // Fix: remove duplicate templates caused by the seed/sync race condition
        deduplicateTemplates(resolvedUserId).catch(() => {});
        // One-time migration: normalise all local phone numbers to E.164
        if (!localStorage.getItem('buildlogg_phone_migrated')) {
          import('./lib/phone').then(({ normalizePhone }) => {
            db.customers.toArray().then((customers) => {
              for (const c of customers) {
                if (c.phone) {
                  const normalized = normalizePhone(c.phone);
                  if (normalized !== c.phone) {
                    db.customers.update(c.id, { phone: normalized });
                  }
                }
              }
            }).catch(() => {});
            db.profiles.get(resolvedUserId).then((profile) => {
              if (profile?.phone) {
                const normalized = normalizePhone(profile.phone);
                if (normalized !== profile.phone) {
                  db.profiles.update(resolvedUserId, { phone: normalized });
                }
              }
            }).catch(() => {});
            localStorage.setItem('buildlogg_phone_migrated', 'true');
          }).catch(() => {});
        }
      }
      initialCheckDone.current = true;
      setChecking(false);
     } catch (err) {
      console.error('[AuthGuard] checkSession error:', err);
      setChecking(false);
     } finally {
      // Guarantee: checking is always false after checkSession, no matter what
      setChecking(false);
     }
    }

    checkSession();

    const handleOnline = () => {
      setOnline(true);
      syncWorker().catch(() => {});
    };
    const handleOffline = () => {
      setOnline(false);
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && navigator.onLine) {
        syncWorker().catch(() => {});
        const uid = useAppStore.getState().userId;
        if (uid) initialSync(uid).catch(() => {});
      }
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    syncInterval = setInterval(() => {
      if (navigator.onLine) syncWorker().catch(() => {});
    }, 30000);

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      if (!session) {
        // Only react to sign-out events once the initial session check has
        // finished. The initial onAuthStateChange event can fire with null
        // before getSession() has read the persisted session from storage,
        // which would otherwise redirect the user to /auth prematurely.
        if (initialCheckDone.current) {
          const devUserId = import.meta.env.DEV ? useAppStore.getState().userId : null;
          if (!devUserId) {
            setUserId(null);
            if (realtimeCleanupRef.current) {
              realtimeCleanupRef.current();
              realtimeCleanupRef.current = null;
            }
            navigate('/auth' + window.location.search, { replace: true });
          }
        }
      } else {
        setUserId(session.user.id);
        identifyUser(session.user.id);
        // If the persisted session arrives after the initial getSession() race
        // sent us to /auth, mark the initial check done and recover the user
        // into the app so they don't stay stuck on the sign-in screen.
        if (location.pathname === '/auth') {
          db.profiles.get(session.user.id).then((profile) => {
            if (!mounted) return;
            navigate(profile ? '/' : '/onboarding', { replace: true });
          });
        }
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (syncInterval) clearInterval(syncInterval);
    };
  }, [navigate, setUserId, setOnline]);

  if (checking) {
    return <SkeletonAppScreen />;
  }

  return <Outlet />;
}

/* ─── Screen analytics tracker ─── */
function ScreenTracker() {
  const location = useLocation();
  useTheme();

  useEffect(() => {
    capture('screen_viewed', { screen: location.pathname });
    const shell = document.getElementById('app-shell');
    if (shell) shell.scrollTop = 0;
  }, [location.pathname]);

  return null;
}

/* ─── Route-aware shell width helper ─── */
function DesktopSplitShell() {
  useEffect(() => {
    const shell = document.getElementById('app-shell');
    if (!shell) return;
    // The whole app shell is now full-width on desktop so the two-column
    // layout (auth, onboarding, or in-app contextual panel) can use the space.
    shell.classList.add('desktop-split');
  }, []);

  return null;
}

/* ─── Body-scroll routes (site-wide) ─── */
function AppRoutes() {
  const location = useLocation();
  const navigate = useNavigate();

  const activeTab =
    location.pathname === '/' ? 'home' :
    location.pathname === '/jobs' ? 'jobs' :
    location.pathname === '/settings' ? 'settings' :
    location.pathname === '/activity' ? 'activity' : 'home';

  const handleTabNavigate = (tab: 'home' | 'jobs' | 'settings' | 'activity') => {
    if (tab === 'home') {
      navigate('/');
    } else {
      navigate('/' + tab);
    }
  };

  const isAuthOrOnboarding =
    location.pathname === '/auth' || location.pathname === '/onboarding';

  const routes = (
    <div key={location.pathname} className="page-enter h-full">
    <Routes location={location}>
      <Route path="/auth" element={<Auth />} />
      <Route element={<AuthGuard />}>
        <Route path="/onboarding" element={<Onboarding />} />
        <Route path="/" element={<Home />} />
        <Route path="/jobs" element={<Jobs />} />
        <Route path="/activity" element={<Activity />} />
        <Route path="/jobs/:jobId" element={<JobDetail />} />
        <Route path="/quote" element={<Quote />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/settings/custom-items" element={<CustomItems />} />
        <Route path="/settings/booking" element={<Booking />} />
        <Route path="/settings/reminders" element={<Reminders />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/customers" element={<Customers />} />
        <Route path="/customers/new" element={<AddCustomer />} />
        <Route path="/customers/:customerId" element={<CustomerDetail />} />
        <Route path="/settings/message-templates" element={<MessageTemplates />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
    </div>
  );

  const appContent = (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex-1 min-h-0">{routes}</div>
      {isTab(location.pathname) && (
        <div className="sticky bottom-0 z-50 flex-shrink-0">
          <TabBar activeTab={activeTab} onNavigate={handleTabNavigate} />
        </div>
      )}
    </div>
  );

  const rightPanelClass = 'relative flex flex-col flex-1 h-full min-h-0 bg-[var(--app-shell-bg)] md:overflow-y-auto';

  if (isAuthOrOnboarding) {
    return <div className="relative flex flex-col flex-1 h-full min-h-0">{appContent}</div>;
  }

  return (
    <div className="flex-1 min-h-[100dvh] flex flex-col md:flex-row md:justify-center bg-gradient-to-br from-[#e5e7eb] to-[#eef0f4] dark:from-[#141416] dark:to-[#0d0d0f]">
      <div className="flex-1 flex flex-col md:flex-row md:max-w-[1440px]">
        {/* Left panel — contextual help (40%) */}
        <div className="hidden md:flex flex-col auth-left-panel p-8 lg:p-10 overflow-y-auto md:w-[40%] md:sticky md:top-0 md:h-[100dvh]">
          <AppDesktopContext />
        </div>

        {/* Right panel — app content */}
        <div className={rightPanelClass}>
          {appContent}
        </div>
      </div>
    </div>
  );
}

/* ─── PWA update banner ─── */
function UpdateBanner() {
  const { updateAvailable, dismiss, applyUpdate } = useUpdateCheck();
  if (!updateAvailable) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-[60] bg-[#111827] text-white px-4 shadow-lg" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 12px)', paddingBottom: '12px' }}>
      <div className="flex items-center justify-between gap-4 max-w-sm mx-auto">
        <span className="text-sm font-medium">A new version is available</span>
        <div className="flex items-center gap-4 shrink-0">
          <button onClick={dismiss} className="text-sm font-medium text-white/60 underline underline-offset-2 cursor-pointer">
            Later
          </button>
          <button onClick={applyUpdate} className="text-sm font-bold text-white bg-white/15 px-3 py-1.5 rounded-lg cursor-pointer active:opacity-70 transition-opacity">
            Refresh
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── App root ─── */
export default function App() {
  useEffect(() => {
    initAnalytics();
    checkEndOfDay().catch(() => {});
    const interval = setInterval(() => {
      checkEndOfDay().catch(() => {});
    }, 60 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div id="app-shell" className="flex flex-col h-[100dvh] overflow-x-clip overflow-y-auto md:overflow-y-hidden">
      <DesktopNudge />
      <ToastContainer />
      <UpdateBanner />
      <div className="flex-1 min-h-0 flex flex-col relative">
        <Router basename="/app" future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <ScreenTracker />
          <DesktopSplitShell />
          <AppRoutes />
        </Router>
      </div>
    </div>
  );
}
