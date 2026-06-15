import { createClient } from '@supabase/supabase-js';

// Persist the Supabase session in localStorage so users stay signed in across
// page reloads and PWA backgrounding. This uses the browser's default storage
// behaviour (no conditional "remember me" filtering), which fixes the bug
// where refreshing the dashboard would immediately log the user out because
// the session had never been written to storage.
export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL || '',
  import.meta.env.VITE_SUPABASE_ANON_KEY || '',
  {
    auth: {
      detectSessionInUrl: true,
      flowType: 'pkce',
      persistSession: true,
      autoRefreshToken: true,
    },
  }
);
