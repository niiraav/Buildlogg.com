import { createClient } from '@supabase/supabase-js';

const REMEMBER_ME_KEY = 'buildlogg_remember_me';

function isRememberMeEnabled(): boolean {
  try {
    return localStorage.getItem(REMEMBER_ME_KEY) !== 'false';
  } catch {
    return true;
  }
}

// Custom storage adapter that respects the 'Remember me' preference.
// When 'Remember me' is unchecked, the session is kept in memory only and
// is not written to localStorage, so the user is signed out on tab close/reload.
const rememberMeStorage = {
  getItem: (key: string): string | null => {
    if (!isRememberMeEnabled()) return null;
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  setItem: (key: string, value: string): void => {
    if (!isRememberMeEnabled()) return;
    try {
      localStorage.setItem(key, value);
    } catch {
      // ignore storage errors
    }
  },
  removeItem: (key: string): void => {
    try {
      localStorage.removeItem(key);
    } catch {
      // ignore storage errors
    }
  },
};

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL || '',
  import.meta.env.VITE_SUPABASE_ANON_KEY || '',
  {
    auth: {
      detectSessionInUrl: true,
      flowType: 'pkce',
      persistSession: true,
      autoRefreshToken: true,
      storage: rememberMeStorage,
    },
  }
);
