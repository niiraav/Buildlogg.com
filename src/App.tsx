import { useEffect, useState } from 'react';
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
  Outlet,
  useNavigate,
  useLocation,
} from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { supabase } from './lib/supabase';
import { db } from './lib/db';
import { useAppStore } from './store/useAppStore';
import { syncWorker } from './lib/sync';
import { identifyUser, capture, initAnalytics } from './lib/analytics';
import { initialSync } from './lib/initialSync';
import { checkEndOfDay } from './lib/notifications';
import DesktopNudge from './components/DesktopNudge';
import { isDarkModeEnabled } from './hooks/useTheme';
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
import Activity from './screens/Activity';

// Initialise theme before first paint
if (isDarkModeEnabled()) document.documentElement.classList.add('dark');

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

const forwardVariants = {
  initial: { opacity: 0, x: 40 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -40 },
};

const backVariants = {
  initial: { opacity: 0, x: -40 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: 40 },
};

/* ─── AuthGuard (no animation — just renders Outlet) ─── */
function AuthGuard() {
  const navigate = useNavigate();
  const setUserId = useAppStore((s) => s.setUserId);
  const setOnline = useAppStore((s) => s.setOnline);
  const location = useLocation();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let mounted = true;
    let syncInterval: ReturnType<typeof setInterval> | null = null;

    async function checkSession() {
      let session = null;
      try {
        const { data } = await withTimeout(supabase.auth.getSession(), 5000);
        session = data?.session ?? null;
      } catch {
        session = null;
      }

      if (!mounted) return;

      if (!session) {
        const mockUser = localStorage.getItem('tradepad_mock_user');
        if (mockUser) {
          let mock: { id: string; email?: string } | null = null;
          try {
            mock = JSON.parse(mockUser);
          } catch {
            localStorage.removeItem('tradepad_mock_user');
          }
          if (!mock) {
            navigate('/auth' + window.location.search, { replace: true });
            setChecking(false);
            return;
          }
          setUserId(mock.id);
          identifyUser(mock.id);
          let profile = null;
          try {
            profile = await db.profiles.get(mock.id);
          } catch {
            profile = null;
          }
          if (!profile) {
            navigate('/onboarding', { replace: true });
            setChecking(false);
            return;
          }
          if (location.pathname === '/onboarding') {
            navigate('/', { replace: true });
          }
          setChecking(false);
          return;
        }
        navigate('/auth' + window.location.search, { replace: true });
        setChecking(false);
        return;
      }

      setUserId(session.user.id);
      identifyUser(session.user.id);
      const profile = await db.profiles.get(session.user.id);

      if (!profile) {
        navigate('/onboarding', { replace: true });
        setChecking(false);
        return;
      }

      if (location.pathname === '/onboarding') {
        navigate('/', { replace: true });
      }

      if (navigator.onLine) {
        try {
          await withTimeout(initialSync(session.user.id), 15000);
        } catch {
          // silently fail
        }
        await syncWorker().catch(() => {});
      }

      setChecking(false);
    }

    checkSession();

    const handleOnline = () => {
      setOnline(true);
      syncWorker().catch(() => {});
    };
    const handleOffline = () => {
      setOnline(false);
    };
    const handleFocus = () => {
      if (navigator.onLine) syncWorker().catch(() => {});
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('focus', handleFocus);

    syncInterval = setInterval(() => {
      if (navigator.onLine) syncWorker().catch(() => {});
    }, 30000);

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      if (!session) {
        const mockUser = localStorage.getItem('tradepad_mock_user');
        if (mockUser) return;
        setUserId(null);
        navigate('/auth' + window.location.search, { replace: true });
      } else {
        setUserId(session.user.id);
        identifyUser(session.user.id);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('focus', handleFocus);
      if (syncInterval) clearInterval(syncInterval);
    };
  }, [navigate, setUserId, setOnline]);

  if (checking) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-8 h-8 border-2 border-brand-border border-t-brand-black rounded-full animate-spin" />
      </div>
    );
  }

  return <Outlet />;
}

/* ─── Screen analytics tracker ─── */
function ScreenTracker() {
  const location = useLocation();
  useEffect(() => {
    capture('screen_viewed', { screen: location.pathname });
  }, [location.pathname]);
  return null;
}

/* ─── Animated Routes (TabBar outside AnimatePresence) ─── */
function AppRoutes() {
  const location = useLocation();
  const navigate = useNavigate();
  const [history, setHistory] = useState<string[]>([location.pathname]);

  // Track navigation history to detect back vs forward
  useEffect(() => {
    setHistory((prev) => {
      const current = location.pathname;
      const last = prev[prev.length - 1];
      if (current === last) return prev;

      const idx = prev.indexOf(current);
      if (idx !== -1 && idx < prev.length - 1) {
        // Going back — trim history to this point
        return prev.slice(0, idx + 1);
      }
      // Going forward
      return [...prev, current];
    });
  }, [location.pathname]);

  const prevPath = history[history.length - 2] || history[0];
  const isTabSwitch = isTab(location.pathname) && isTab(prevPath);
  const isBack = history.length > 1 && history.indexOf(location.pathname) < history.length - 1;

  // Determine active tab for the persistent TabBar
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

  // For tab switches: no animation (instant). For deep nav: slide.
  const variants = isTabSwitch
    ? { initial: {}, animate: {}, exit: {} }
    : isBack
      ? backVariants
      : forwardVariants;

  const transition = isTabSwitch
    ? { duration: 0 }
    : { type: 'spring' as const, stiffness: 400, damping: 35 };

  const animatePresenceMode = isTabSwitch ? 'sync' : 'wait';

  return (
    <div className="flex flex-col h-full">
      {/* Content area — animated only for deep navigation */}
      <div className={`flex-1 min-h-0 relative overflow-hidden ${isTab(location.pathname) ? 'pb-[calc(56px_+_env(safe-area-inset-bottom))]' : ''}`}>
        <AnimatePresence mode={animatePresenceMode} initial={false}>
          <motion.div
            key={location.pathname}
            initial={isTabSwitch ? false : 'initial'}
            animate="animate"
            exit={isTabSwitch ? undefined : 'exit'}
            variants={variants}
            transition={transition}
            className="absolute inset-0 flex flex-col"
          >
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
                <Route path="*" element={<Navigate to="/" replace />} />
              </Route>
            </Routes>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Persistent TabBar — never animates, only visible on tab routes */}
      {isTab(location.pathname) && (
        <TabBar activeTab={activeTab} onNavigate={handleTabNavigate} />
      )}
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
    <div id="app-shell" className="flex flex-col h-[100dvh]">
      <DesktopNudge />
      <ToastContainer />
      <div className="flex-1 min-h-0 flex flex-col relative">
        <Router>
          <ScreenTracker />
          <AppRoutes />
        </Router>
      </div>
    </div>
  );
}
