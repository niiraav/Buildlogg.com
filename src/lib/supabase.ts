import { createClient } from '@supabase/supabase-js';

const REMEMBER_ME_KEY = 'buildlogg_remember_me';

function rememberMeEnabled(): boolean {
  try {
    const value = localStorage.getItem(REMEMBER_ME_KEY);
    // Default to remembering so returning users stay signed in unless they explicitly opt out.
    return value !== 'false';
  } catch {
    return true;
  }
}

function getStorage() {
  return rememberMeEnabled() ? localStorage : sessionStorage;
}

// Custom storage lets "Remember me" control whether the Supabase session is persisted
// in localStorage (survives tab/browser restarts) or sessionStorage (survives only the
// current tab). The flag is written by Auth.tsx before each sign-in attempt.
const customStorage = {
  getItem(key: string): string | null {
    return getStorage().getItem(key);
  },
  setItem(key: string, value: string): void {
    getStorage().setItem(key, value);
  },
  removeItem(key: string): void {
    getStorage().removeItem(key);
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
      storage: customStorage,
    },
  }
);
