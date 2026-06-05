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
import DesktopNudge from './components/DesktopNudge';
import Auth from './screens/Auth';
import Onboarding from './screens/Onboarding';
import Home from './screens/Home';
import Jobs from './screens/Jobs';
import JobDetail from './screens/JobDetail';
import Quote from './screens/Quote';
import Settings from './screens/Settings';
import Activity from './screens/Activity';

function AuthGuard() {
  const navigate = useNavigate();
  const setUserId = useAppStore((s) => s.setUserId);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function checkSession() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!mounted) return;

      if (!session) {
        navigate('/auth', { replace: true });
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

      setChecking(false);
    }

    checkSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      if (!session) {
        setUserId(null);
        navigate('/auth', { replace: true });
      } else {
        setUserId(session.user.id);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [navigate, setUserId]);

  if (checking) {
    return (
      <div className="flex items-center justify-center min-h-[100svh]">
        <div className="w-8 h-8 border-2 border-[#E5E7EB] border-t-[#111827] rounded-full animate-spin" />
      </div>
    );
  }

  return <Outlet />;
}

export default function App() {
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
