import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { identifyUser, captureUserSignedIn, captureUserSignedUp, capture } from '../lib/analytics';
import { showSuccess, showError, showToast } from '../components/Toast/store';
import { hapticError, hapticSuccess } from '../lib/haptics';
import { Button } from '../components/Button';
import AuthDesktopLayout from '../components/AuthDesktopLayout';
import { Eye, EyeOff } from 'lucide-react';

type AuthMode = 'signin' | 'signup';

function validateEmail(email: string): string | null {
  const trimmed = email.trim().toLowerCase();
  if (!trimmed) return 'Enter your email address';
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!re.test(trimmed)) return 'Enter a valid email address';
  return null;
}

function validatePassword(password: string): string | null {
  if (!password) return 'Enter a password';
  if (password.length < 8) return 'Password must be at least 8 characters';
  return null;
}

// Map a recipient domain to its webmail inbox so the "Check email" button can
// deep-link straight to the mailbox for known providers. For unknown domains we
// fall back to `mailto:` which launches the OS default email client.
function getInboxUrl(domain: string): string {
  const map: Record<string, string> = {
    'gmail.com': 'https://mail.google.com/mail/',
    'googlemail.com': 'https://mail.google.com/mail/',
    'outlook.com': 'https://outlook.live.com/mail/',
    'hotmail.com': 'https://outlook.live.com/mail/',
    'live.com': 'https://outlook.live.com/mail/',
    'msn.com': 'https://outlook.live.com/mail/',
    'yahoo.com': 'https://mail.yahoo.com/',
    'yahoo.co.uk': 'https://mail.yahoo.com/',
    'icloud.com': 'https://www.icloud.com/mail/',
    'me.com': 'https://www.icloud.com/mail/',
    'mac.com': 'https://www.icloud.com/mail/',
    'proton.me': 'https://mail.proton.me/',
    'protonmail.com': 'https://mail.proton.me/',
    'zoho.com': 'https://mail.zoho.com/',
    'aol.com': 'https://mail.aol.com/',
    'gmx.com': 'https://www.gmx.com/mail/',
    'mail.com': 'https://www.mail.com/mail/',
  };
  return map[domain] || 'mailto:';
}

export default function Auth() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const action = searchParams.get('action') === 'signup' ? 'signup' : 'signin';
  const source = searchParams.get('source') || 'organic';
  const [mode, setMode] = useState<AuthMode>(action);

  const [emailInput, setEmailInput] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [emailConfirmed, setEmailConfirmed] = useState(false);
  const [resendCountdown, setResendCountdown] = useState(0);
  const [resending, setResending] = useState(false);

  // Handle magic-link / email-confirmation callbacks from the URL.
  // This catches PKCE (?code=...), token_hash (?token_hash=...), and implicit flow (#access_token...).
  useEffect(() => {
    let mounted = true;

    async function handleCallback() {
      const url = new URL(window.location.href);
      const code = url.searchParams.get('code');
      const tokenHash = url.searchParams.get('token_hash');
      const token = url.searchParams.get('token');
      const type = url.searchParams.get('type') || 'email';
      const hashParams = new URLSearchParams(url.hash.replace(/^#/, ''));
      const hasAccessToken = hashParams.has('access_token') || hashParams.has('refresh_token');

      if (!code && !tokenHash && !token && !hasAccessToken) return;

      if (!mounted) return;
      setLoading(true);
      setError('');

      try {
        // Clear any existing session before exchanging the confirmation code.
        // This prevents the bug where a user is signed in to account A, creates
        // account B, clicks the confirmation link, and lands in account A's
        // dashboard instead of account B's onboarding.
        await supabase.auth.signOut({ scope: 'global' }).catch(() => {});

        let session = null;

        if (code) {
          // PKCE flow: exchange the one-time code for a session.
          const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
          if (exchangeError) {
            // Fallback: if the code was already consumed (e.g. by a previous
            // page load or a browser pre-fetch), check if a session already
            // exists from that earlier exchange rather than erroring out.
            const { data: existing } = await supabase.auth.getSession();
            if (existing.session) {
              session = existing.session;
            } else {
              throw exchangeError;
            }
          } else {
            session = data.session;
          }
        } else if (tokenHash) {
          const { data, error: verifyError } = await supabase.auth.verifyOtp({
            token_hash: tokenHash,
            type: type as 'email' | 'recovery' | 'invite' | 'email_change' | 'signup' | 'magiclink',
          });
          if (verifyError) throw verifyError;
          session = data.session;
        } else if (token) {
          // Older Supabase confirmation URLs use ?token=...&type=...; treat as token_hash.
          const { data, error: verifyError } = await supabase.auth.verifyOtp({
            token_hash: token,
            type: type as 'email' | 'recovery' | 'invite' | 'email_change' | 'signup' | 'magiclink',
          });
          if (verifyError) throw verifyError;
          session = data.session;
        } else if (hasAccessToken) {
          const { data } = await supabase.auth.getSession();
          session = data.session;
        }

        if (!session) {
          throw new Error('No session returned from callback');
        }

        if (!mounted) return;
        hapticSuccess();
        showSuccess("You're in");
        identifyUser(session.user.id, { email: session.user.email || undefined });
        captureUserSignedIn();

        // Strip auth params from the URL so a refresh doesn't re-trigger the flow.
        window.history.replaceState({}, document.title, url.pathname + url.search.replace(/[?&](code|token_hash|token|type)=[^&]*/g, '').replace(/\?(?=&|$)/, '') + url.hash.replace(/#access_token=[^&]*&?/g, '').replace(/&?refresh_token=[^&]*&?/g, '').replace(/&?expires_in=[^&]*&?/g, '').replace(/&?token_type=[^&]*&?/g, '').replace(/#$/, ''));

        // Let AuthGuard check the profile and route to onboarding or home.
        navigate('/', { replace: true });
      } catch (err) {
        console.error('[Auth] Magic link callback error:', err);
        if (!mounted) return;
        hapticError();
        showError('This sign-in link is invalid or expired. Please try again.');
        setLoading(false);
      }
    }

    handleCallback();

    return () => {
      mounted = false;
    };
  }, [navigate]);

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();

    const email = emailInput.trim().toLowerCase();
    const emailError = validateEmail(email);
    if (emailError) {
      setError(emailError);
      return;
    }

    const passwordError = validatePassword(password);
    if (passwordError) {
      setError(passwordError);
      return;
    }

    if (mode === 'signup' && password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setError('');
    setLoading(true);

    try {
      if (mode === 'signin') {
        const { data, error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (signInError || !data.session) {
          hapticError();
          const message = signInError?.message || 'Could not sign in';
          showError(message);
          setError(message);
          setLoading(false);
          return;
        }

        hapticSuccess();
        showSuccess('Signed in');
        identifyUser(data.session.user.id, { email });
        captureUserSignedIn();
        if (source !== 'organic') capture('user_signed_in_from_email', { source });

        // Navigate immediately — AuthGuard's checkSession will handle
        // profile lookup (from Dexie or Supabase). This avoids a hang
        // on iPhone Safari where IndexedDB can be slow on first access.
        navigate('/', { replace: true });
      } else {
        // Sign out any existing session before creating a new account.
        // Without this, the old session persists in localStorage and the
        // confirmation email link may land the user in the old account.
        await supabase.auth.signOut({ scope: 'global' }).catch(() => {});

        const { data, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: 'https://buildlogg.com/app/auth',
          },
        });

        if (signUpError) {
          hapticError();
          // Supabase returns 429 / "over_email_send_rate_limit" when its built-in email service
          // is throttled (or no custom SMTP is configured). Surface a clear, actionable message
          // instead of the raw "email rate limit exceeded". See docs/SUPABASE-EMAIL-SETUP.md
          // for the permanent SMTP (Resend) fix.
          const code = (signUpError as { code?: string; status?: number })?.code;
          const raw = (signUpError?.message || '').toLowerCase();
          const isEmailSendError =
            code === '429' ||
            code === 'over_email_send_rate_limit' ||
            raw.includes('rate limit') ||
            raw.includes('email_send') ||
            raw.includes('over_email_send');
          const message = isEmailSendError
            ? 'We could not send your confirmation email right now. Please try again in a few minutes.'
            : signUpError?.message || 'Could not create account';
          showError(message);
          setError(message);
          setLoading(false);
          return;
        }

        if (!data.session) {
          // Email confirmation is required on the Supabase side.
          hapticSuccess();
          showToast('Account created. Check your email (and spam folder) to confirm.', 'info', 5000);
          captureUserSignedUp(undefined, source);
          setEmailConfirmed(true);
          setLoading(false);
          return;
        }

        hapticSuccess();
        showSuccess('Account created');
        identifyUser(data.session.user.id, { email });
        captureUserSignedUp(undefined, source);
        captureUserSignedIn();

        navigate('/onboarding', { replace: true });
      }
    } catch (err) {
      console.error('[Auth] Password auth error:', err);
      hapticError();
      showError('Something went wrong. Try again.');
      setError('Something went wrong. Try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    const email = emailInput.trim().toLowerCase();
    const emailError = validateEmail(email);
    if (emailError) {
      setError(emailError);
      return;
    }

    setLoading(true);
    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: 'https://buildlogg.com/app/auth',
      });
      if (resetError) {
        showError(resetError.message || 'Could not send reset email');
        setError(resetError.message || 'Could not send reset email');
      } else {
        hapticSuccess();
        showToast('Password reset email sent', 'info', 3000);
      }
    } catch (err) {
      showError('Something went wrong. Try again.');
      setError('Something went wrong. Try again.');
    } finally {
      setLoading(false);
    }
  };



  const switchMode = () => {
    setMode(mode === 'signin' ? 'signup' : 'signin');
    setError('');
    setPassword('');
    setConfirmPassword('');
  };

  // "Check email" button: open the user's inbox. Deep-links to webmail for
  // known providers (Gmail/Outlook/iCloud/etc.); otherwise launches the OS
  // default email client via a hidden mailto: anchor (avoids a blank tab).
  const handleCheckEmail = () => {
    const email = emailInput.trim().toLowerCase();
    const domain = email.split('@')[1]?.toLowerCase() || '';
    const inboxUrl = getInboxUrl(domain);
    if (inboxUrl.startsWith('http')) {
      window.open(inboxUrl, '_blank', 'noopener,noreferrer');
    } else {
      const a = document.createElement('a');
      a.href = inboxUrl;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  };

  // "Back to signup" button: return to the signup form (keep the entered email
  // so the user doesn't have to retype it).
  const handleBackToSignup = () => {
    setEmailConfirmed(false);
    setMode('signup');
    setError('');
  };

  // "Resend confirmation email" — calls Supabase resend for signup type.
  // Rate-limited with a 30-second countdown to prevent spamming.
  const handleResend = async () => {
    if (resendCountdown > 0 || resending) return;
    const email = emailInput.trim().toLowerCase();
    if (!email) return;
    setResending(true);
    try {
      // Clear any existing session first — a stale session from another
      // account can interfere with the resend call.
      await supabase.auth.signOut({ scope: 'global' }).catch(() => {});

      const { error: resendError } = await supabase.auth.resend({
        email,
        type: 'signup',
      });
      if (resendError) {
        showError(resendError.message || 'Could not resend email');
      } else {
        showToast('Confirmation email resent', 'info', 3000);
        setResendCountdown(30);
        // Countdown timer
        const interval = setInterval(() => {
          setResendCountdown((prev) => {
            if (prev <= 1) {
              clearInterval(interval);
              return 0;
            }
            return prev - 1;
          });
        }, 1000);
      }
    } catch {
      showError('Could not resend email. Try again.');
    } finally {
      setResending(false);
    }
  };

  return (
    <AuthDesktopLayout variant="auth">
      <div className="flex flex-col min-h-[100dvh]">
        {/* Mobile brand wordmark */}
        <a href="https://buildlogg.com" className="inline-flex items-center gap-2 text-[22px] font-extrabold text-brand-black mb-8 md:hidden px-4 pt-8">
          <img src="/assets/icon-black-square.png" alt="" className="w-[34px] h-[34px]" />
          Buildlogg
        </a>

        {/* Desktop/tablet header */}
        <header className="hidden md:flex items-center justify-end px-6 py-5 lg:px-10 lg:py-6">
          <div className="text-sm text-brand-mid">
            {mode === 'signin' ? "New here?" : "Already have an account?"}{' '}
            <button
              type="button"
              onClick={switchMode}
              className="font-semibold text-brand-black hover:underline"
            >
              {mode === 'signin' ? 'Create an account' : 'Sign in'}
            </button>
          </div>
        </header>

        {/* Main form */}
        <main className="flex-1 flex flex-col md:justify-center px-4 md:px-10">
          <div className="w-full md:max-w-sm mx-auto">
            <form onSubmit={handleSubmit} className="w-full flex flex-col gap-5">
              {emailConfirmed ? (
                <>
                  <div>
                    <h1 className="text-3xl font-semibold tracking-tight text-brand-black">
                      Check your email
                    </h1>
                    <p className="text-base text-brand-mid mt-2">
                      We've sent you a confirmation link to activate your account. Check your inbox at{' '}
                      <span className="font-semibold text-brand-dark break-all">
                        {emailInput.trim().toLowerCase()}
                      </span>.
                    </p>
                  </div>

                  <div className="mt-1 flex flex-col gap-3">
                    <Button
                      type="button"
                      variant="primary"
                      onClick={handleCheckEmail}
                      fullWidth
                      size="sm"
                    >
                      Check email
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={handleBackToSignup}
                      fullWidth
                      size="sm"
                    >
                      Back to signup
                    </Button>
                  </div>

                  {/* Provider-specific hint for Outlook/Hotmail */}
                  {(() => {
                    const domain = emailInput.trim().toLowerCase().split('@')[1] || '';
                    const isOutlook = ['outlook.com', 'hotmail.com', 'live.com', 'msn.com'].includes(domain);
                    return isOutlook ? (
                      <div className="bg-status-blueBg border border-status-blueBorder rounded-lg px-3.5 py-2.5 mt-2">
                        <p className="text-sm text-status-blue text-left leading-relaxed">
                          Outlook sometimes sends new senders to <strong>Junk</strong>. Check there if you don't see it in your inbox.
                        </p>
                      </div>
                    ) : null;
                  })()}

                  <p className="text-sm text-brand-mid text-center mt-2">
                    Didn't get it? Check your spam folder or resend.
                  </p>

                  <button
                    type="button"
                    onClick={handleResend}
                    disabled={resendCountdown > 0 || resending}
                    className="w-full h-11 flex items-center justify-center text-sm font-medium text-brand-mid cursor-pointer underline underline-offset-2 disabled:opacity-50 disabled:no-underline mt-1"
                  >
                    {resending
                      ? 'Sending...'
                      : resendCountdown > 0
                      ? `Resend in ${resendCountdown}s`
                      : 'Resend confirmation email'}
                  </button>
                </>
              ) : (
                <>
                  <div>
                    <h1 className="text-3xl font-semibold tracking-tight text-brand-black">
                      {mode === 'signin' ? 'Welcome back' : 'Create your account'}
                    </h1>
                    <p className="text-base text-brand-mid mt-2">
                      {mode === 'signin'
                        ? 'Sign in to continue to your Buildlogg dashboard.'
                        : 'Enter your email and password to get started.'}
                    </p>
                  </div>
                  <div className="flex flex-col gap-2">
                    <label htmlFor="email" className="text-sm font-medium text-brand-black">
                      Email
                    </label>
                    <input
                      id="email"
                      type="email"
                      inputMode="email"
                      placeholder="you@example.com"
                      value={emailInput}
                      onChange={(e) => { setEmailInput(e.target.value); setError(''); }}
                      onBlur={() => {
                        const trimmed = emailInput.trim().toLowerCase();
                        if (trimmed && validateEmail(trimmed)) {
                          setError('Enter a valid email address');
                        }
                      }}
                      className={`w-full h-11 px-3.5 text-base text-brand-black bg-transparent border rounded-md outline-none transition-all focus:border-brand-black focus:ring-4 focus:ring-brand-black/5 ${
                        error && !emailInput.trim() ? 'border-red-500' : 'border-brand-border'
                      }`}
                      autoFocus
                    />
                  </div>

                  <div className="flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <label htmlFor="password" className="text-sm font-medium text-brand-black">
                        Password
                      </label>
                      {mode === 'signin' && (
                        <button
                          type="button"
                          onClick={handleForgotPassword}
                          disabled={loading}
                          className="text-sm text-brand-mid hover:text-brand-black disabled:opacity-50 transition-colors"
                        >
                          Forgot password?
                        </button>
                      )}
                    </div>
                    <div className="relative">
                      <input
                        id="password"
                        type={showPassword ? 'text' : 'password'}
                        placeholder="Enter your password"
                        value={password}
                        onChange={(e) => { setPassword(e.target.value); setError(''); }}
                        className={`w-full h-11 px-3.5 pr-11 text-base text-brand-black bg-transparent border rounded-md outline-none transition-all focus:border-brand-black focus:ring-4 focus:ring-brand-black/5 ${
                          error && !password ? 'border-red-500' : 'border-brand-border'
                        }`}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-brand-mid hover:text-brand-black transition-colors"
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                      >
                        {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>
                  </div>

                  {mode === 'signup' && (
                    <div className="flex flex-col gap-2">
                      <label htmlFor="confirmPassword" className="text-sm font-medium text-brand-black">
                        Confirm Password
                      </label>
                      <div className="relative">
                        <input
                          id="confirmPassword"
                          type={showConfirmPassword ? 'text' : 'password'}
                          placeholder="Enter your password again"
                          value={confirmPassword}
                          onChange={(e) => { setConfirmPassword(e.target.value); setError(''); }}
                          className={`w-full h-11 px-3.5 pr-11 text-base text-brand-black bg-transparent border rounded-md outline-none transition-all focus:border-brand-black focus:ring-4 focus:ring-brand-black/5 ${
                            error && password !== confirmPassword ? 'border-red-500' : 'border-brand-border'
                          }`}
                        />
                        <button
                          type="button"
                          onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                          className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-brand-mid hover:text-brand-black transition-colors"
                          aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                        >
                          {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                        </button>
                      </div>
                    </div>
                  )}

                  {error && <p className="text-sm text-status-red">{error}</p>}

                  <div className="mt-1">
                    <Button
                      type="submit"
                      variant="primary"
                      disabled={loading}
                      fullWidth
                      size="sm"
                    >
                      {loading
                        ? mode === 'signin' ? 'Signing in...' : 'Creating account...'
                        : mode === 'signin' ? 'Sign in' : 'Create account'}
                    </Button>
                  </div>

                  <div className="text-center mt-1">
                    <button
                      type="button"
                      onClick={switchMode}
                      className="text-sm font-semibold text-brand-black hover:underline min-h-11 px-4 cursor-pointer"
                    >
                      {mode === 'signin' ? "Don't have an account? Sign up" : 'Already have an account? Sign in'}
                    </button>
                  </div>

                </>
              )}
            </form>
          </div>
        </main>

        {/* Desktop/tablet footer */}
        <footer className="hidden md:flex items-center justify-between px-6 py-5 lg:px-10 lg:py-6 text-sm text-brand-muted">
          <span>© 2026 Buildlogg Ltd.</span>
          <div className="flex gap-6">
            <a href="https://buildlogg.com/terms" className="hover:text-brand-black transition-colors">Terms</a>
            <a href="https://buildlogg.com/privacy" className="hover:text-brand-black transition-colors">Privacy</a>
            <a href="mailto:hello@buildlogg.com" className="hover:text-brand-black transition-colors">Support</a>
          </div>
        </footer>
      </div>
    </AuthDesktopLayout>
  );
}
