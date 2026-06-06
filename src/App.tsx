import { useEffect, useState } from 'react';
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
  Outlet,
  useNavigate,
} from 'react-router-dom';
import { supabase } from './lib/supabase';
import { db } from './lib/db';
import { useAppStore } from './store/useAppStore';
import { syncWorker } from './lib/sync';
import { initialSync } from './lib/initialSync';
import { checkEndOfDay } from './lib/notifications';
import DesktopNudge from './components/DesktopNudge';
import Auth from './screens/Auth';
import Onboarding from './screens/Onboarding';
import Home from './screens/Home';
import Jobs from './screens/Jobs';
import JobDetail from './screens/JobDetail';
import Quote from './screens/Quote';
import Settings from './screens/Settings';
import Activity from './screens/Activity';

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('Timeout')), ms)),
  ]);
}

function AuthGuard() {
  const navigate = useNavigate();
  const setUserId = useAppStore((s) => s.setUserId);
  const setOnline = useAppStore((s) => s.setOnline);
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
        // Check for mock user session (development testing)
        const mockUser = localStorage.getItem('tradepad_mock_user');
        if (mockUser) {
          const mock = JSON.parse(mockUser);
          setUserId(mock.id);
          // Check if profile exists in Dexie for mock user
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
          setChecking(false);
          return;
        }
        navigate('/auth' + window.location.search, { replace: true });
        setChecking(false);
        return;
      }

      setUserId(session.user.id);

      // Check if profile exists in Dexie
      const profile = await db.profiles.get(session.user.id);

      if (!profile) {
        navigate('/onboarding', { replace: true });
        setChecking(false);
        return;
      }

      // Run initial sync (pull from Supabase) if online
      if (navigator.onLine) {
        try {
          await withTimeout(initialSync(session.user.id), 15000);
        } catch {
          // silently fail initial sync — data will be local
        }
        // Run sync worker to push any pending local changes
        await syncWorker().catch(() => {});
      }

      setChecking(false);
    }

    checkSession();

    // Online/offline listeners
    const handleOnline = () => {
      setOnline(true);
      syncWorker().catch(() => {});
    };

    const handleOffline = () => {
      setOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Sync on window focus (user returns to app)
    const handleFocus = () => {
      if (navigator.onLine) {
        syncWorker().catch(() => {});
      }
    };
    window.addEventListener('focus', handleFocus);

    // Periodic sync every 30s
    syncInterval = setInterval(() => {
      if (navigator.onLine) {
        syncWorker().catch(() => {});
      }
    }, 30000);

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      if (!session) {
        // Don't redirect mock users — AuthGuard checkSession handles routing
        const mockUser = localStorage.getItem('tradepad_mock_user');
        if (mockUser) return;

        setUserId(null);
        navigate('/auth' + window.location.search, { replace: true });
      } else {
        setUserId(session.user.id);
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
      <div className="flex items-center justify-center min-h-[100svh]">
        <div className="w-8 h-8 border-2 border-brand-border border-t-brand-black rounded-full animate-spin" />
      </div>
    );
  }

  return <Outlet />;
}

export default function App() {
  useEffect(() => {
    // Run once immediately on mount (after 6pm it will check)
    checkEndOfDay().catch(() => {});
    // Hourly check
    const interval = setInterval(() => {
      checkEndOfDay().catch(() => {});
    }, 60 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div id="app-shell">
      <DesktopNudge />
      <Router>
        <Routes>
          <Route path="/auth" element={<Auth />} />
          <Route element={<AuthGuard />}>
            <Route path="/onboarding" element={<Onboarding />} />
            <Route path="/" element={<Home />} />
            <Route path="/jobs" element={<Jobs />} />
            <Route path="/activity" element={<Activity />} />
            <Route path="/jobs/:jobId" element={<JobDetail />} />
            <Route path="/quote" element={<Quote />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </Router>
    </div>
  );
}
