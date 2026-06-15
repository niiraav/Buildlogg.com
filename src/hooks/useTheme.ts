import { useEffect, useState, useCallback } from 'react';

const STORAGE_KEY = 'buildlogg_dark_mode';

function isAuthPage(): boolean {
  if (typeof window === 'undefined') return false;
  const path = window.location.pathname;
  return path === '/app/auth' || path.startsWith('/app/auth');
}

function getInitialTheme(): boolean {
  try {
    // Auth pages are always light mode, regardless of stored preference.
    // In-app pages use the stored preference, defaulting to light.
    if (isAuthPage()) return false;
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored !== null ? stored === 'true' : false;
  } catch {
    return false;
  }
}

export function useTheme() {
  const [isDark, setIsDark] = useState<boolean>(() => getInitialTheme());

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
