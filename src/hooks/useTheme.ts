import { useEffect, useState, useCallback } from 'react';
import { useLocation } from 'react-router-dom';

const STORAGE_KEY = 'buildlogg_dark_mode';

function isAuthPage(path?: string): boolean {
  if (typeof window === 'undefined') return false;
  const p = path || window.location.pathname;
  return p === '/app/auth' || p.startsWith('/app/auth');
}

function getStoredTheme(): boolean {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored !== null ? stored === 'true' : false;
  } catch {
    return false;
  }
}

function getInitialTheme(): boolean {
  // Auth pages are always light mode, regardless of stored preference.
  if (isAuthPage()) return false;
  return getStoredTheme();
}

export function useTheme() {
  const location = useLocation();
  const [isDark, setIsDark] = useState<boolean>(() => getInitialTheme());

  // Re-evaluate theme when route changes (e.g., navigating from /auth to /)
  // This fixes: user logs in on /auth (light mode forced), navigates to Home,
  // but dark mode wasn't applied because the initial state was locked to false.
  useEffect(() => {
    if (!isAuthPage(location.pathname)) {
      const stored = getStoredTheme();
      setIsDark(stored);
    } else {
      setIsDark(false);
    }
  }, [location.pathname]);

  useEffect(() => {
    const root = document.documentElement;
    if (isDark) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    try {
      const meta = document.querySelector('meta[name="theme-color"]');
      if (meta) meta.setAttribute('content', isDark ? '#0a0a0a' : '#FFFFFF');
    } catch { /* ignore */ }
    try {
      localStorage.setItem(STORAGE_KEY, String(isDark));
    } catch {
      // ignore storage errors
    }
  }, [isDark]);

  const toggle = useCallback(() => setIsDark((prev) => !prev), []);
  const setDark = useCallback((value: boolean) => setIsDark(value), []);

  return { isDark, toggle, setDark };
}

export function isDarkModeEnabled(): boolean {
  return getInitialTheme();
}
