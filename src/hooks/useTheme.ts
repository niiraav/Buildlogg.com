import { useEffect, useState, useCallback } from 'react';

const STORAGE_KEY = 'buildlogg_dark_mode';

function getInitialTheme(): boolean {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored !== null) return stored === 'true';
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
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
