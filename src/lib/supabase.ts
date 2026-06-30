import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL || '',
  import.meta.env.VITE_SUPABASE_ANON_KEY || '',
  {
    auth: {
      // MUST be false: Auth.tsx manually calls exchangeCodeForSession(code) /
      // verifyOtp() in its useEffect. If true, the Supabase client auto-detects
      // ?code= from the URL and exchanges it FIRST — consuming the single-use
      // PKCE code before Auth.tsx can.
      detectSessionInUrl: false,
      // 'implicit' instead of 'pkce': with PKCE, signUp() generates a code_verifier
      // stored in localStorage. When the user clicks the confirmation email link,
      // exchangeCodeForSession needs BOTH the code and that verifier. If the link
      // is opened in a different browser/tab (or the SW serves a cached shell and
      // localStorage state is lost), the verifier is gone → "invalid or expired".
      // The implicit flow returns a token_hash in the redirect URL that verifyOtp()
      // can exchange without any pre-stored state — robust for email confirmation.
      flowType: 'implicit',
      persistSession: true,
      autoRefreshToken: true,
    },
  }
);
