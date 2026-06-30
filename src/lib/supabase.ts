import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL || '',
  import.meta.env.VITE_SUPABASE_ANON_KEY || '',
  {
    auth: {
      // MUST be false: Auth.tsx manually calls exchangeCodeForSession(code) /
      // verifyOtp() in its useEffect. If true, the Supabase client auto-detects
      // ?code= from the URL and exchanges it FIRST — consuming the single-use
      // PKCE code before Auth.tsx can. That leaves Auth.tsx's call failing with
      // "invalid or expired", which is the exact bug that blocked sign-ups.
      detectSessionInUrl: false,
      flowType: 'pkce',
      persistSession: true,
      autoRefreshToken: true,
    },
  }
);
