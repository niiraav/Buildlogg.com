import { useState, useCallback, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { db } from '../lib/db';
import { useAppStore } from '../store/useAppStore';
import { identifyUser, captureUserSignedIn } from '../lib/analytics';
import { showSuccess, showError, showToast } from '../components/Toast/store';
import { haptic, hapticError, hapticSuccess } from '../lib/haptics';
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

export default function Auth() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const action = searchParams.get('action') === 'signup' ? 'signup' : 'signin';
  const [mode, setMode] = useState<AuthMode>(action);

  const [emailInput, setEmailInput] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [emailConfirmed, setEmailConfirmed] = useState(false);

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
        let session = null;

        if (code) {
          const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
          if (exchangeError) throw exchangeError;
          session = data.session;
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

        const profile = await db.profiles.get(data.session.user.id);
        navigate(profile ? '/' : '/onboarding', { replace: true });
      } else {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: 'https://buildlogg.com/app/auth',
          },
        });

        if (signUpError) {
          hapticError();
          const message = signUpError?.message || 'Could not create account';
          showError(message);
          setError(message);
          setLoading(false);
          return;
        }

        if (!data.session) {
          // Email confirmation is required on the Supabase side.
          hapticSuccess();
          showToast('Account created. Check your email to confirm.', 'info', 4000);
          setEmailConfirmed(true);
          setLoading(false);
          return;
        }

        hapticSuccess();
        showSuccess('Account created');
        identifyUser(data.session.user.id, { email });
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

  const handleMockSignIn = useCallback(async () => {
    setLoading(true);
    setError('');
    console.log('[Auth] Mock sign-in started');
    try {
      try {
        await db.open();
        console.log('[Auth] Dexie DB opened, tables:', db.tables.map(t => t.name).join(', '));
      } catch (dbErr) {
        console.warn('[Auth] Dexie open failed:', dbErr);
      }

      const existingMock = localStorage.getItem('buildlogg_mock_user');
      let mockUserId: string;
      let mockEmail: string;

      if (existingMock) {
        try {
          const mock = JSON.parse(existingMock);
          mockUserId = mock.id;
          mockEmail = mock.email || 'test@example.com';
          console.log('[Auth] Reusing existing mock user:', mockUserId);
        } catch {
          mockUserId = 'mock_' + Date.now();
          mockEmail = 'test@example.com';
          localStorage.setItem('buildlogg_mock_user', JSON.stringify({
            id: mockUserId,
            email: mockEmail,
            created_at: new Date().toISOString(),
          }));
          console.log('[Auth] Created new mock user (old was corrupted):', mockUserId);
        }
      } else {
        mockUserId = 'mock_' + Date.now();
        mockEmail = 'test@example.com';
        localStorage.setItem('buildlogg_mock_user', JSON.stringify({
          id: mockUserId,
          email: mockEmail,
          created_at: new Date().toISOString(),
        }));
        console.log('[Auth] Created new mock user:', mockUserId);
      }

      useAppStore.getState().setUserId(mockUserId);
      console.log('[Auth] Set userId in store:', mockUserId);

      let profile = null;
      try {
        profile = await Promise.race([
          db.profiles.get(mockUserId),
          new Promise<null>((resolve) => setTimeout(() => resolve(null), 2000))
        ]);
        console.log('[Auth] Profile found:', !!profile);
      } catch (profileErr) {
        console.warn('[Auth] Profile read failed:', profileErr);
      }

      hapticSuccess();
      showToast('Signed in as test user', 'info', 2000);

      if (profile && profile.full_name) {
        console.log('[Auth] Navigating to Home (profile exists)');
        navigate('/', { replace: true });
      } else {
        console.log('[Auth] Navigating to Onboarding (no profile)');
        navigate('/onboarding', { replace: true });
      }
    } catch (err) {
      console.error('[Auth] Mock sign-in error:', err);
      hapticError();
      showError('Mock sign-in failed');
      setError('Mock sign-in failed: ' + ((err as Error)?.message || 'Unknown error'));
    } finally {
      setLoading(false);
    }
  }, [navigate]);

  const handleResetDevData = () => {
    haptic('light');
    localStorage.removeItem('buildlogg_mock_user');
    db.delete().then(() => {
      navigate('/auth', { replace: true });
      window.location.reload();
    }).catch(() => {
      navigate('/auth', { replace: true });
      window.location.reload();
    });
  };

  const switchMode = () => {
    setMode(mode === 'signin' ? 'signup' : 'signin');
    setError('');
    setPassword('');
    setConfirmPassword('');
  };

  return (
    <AuthDesktopLayout variant="auth">
      <div className="flex flex-col min-h-full">
        {/* Mobile brand wordmark */}
        <a href="https://buildlogg.com" className="inline-flex items-center gap-2 text-[22px] font-extrabold text-brand-black mb-8 md:hidden px-6 pt-8">
          <img src="/assets/icon-black-square.png" alt="" className="w-[54px] h-[54px]" />
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
        <main className="flex-1 flex flex-col md:justify-center px-6 md:px-10">
          <div className="w-full md:max-w-sm mx-auto">
            <form onSubmit={handleSubmit} className="w-full flex flex-col gap-5">
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

              {emailConfirmed ? (
                <div className="bg-brand-surface rounded-xl p-4 border border-brand-border">
                  <p className="text-sm text-brand-dark leading-relaxed">
                    Check your email for a confirmation link. Once confirmed, you can sign in.
                  </p>
                </div>
              ) : (
                <>
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

                  {import.meta.env.DEV && (
                    <div className="flex flex-col gap-2 mt-6 pt-6 border-t border-brand-border">
                      <p className="text-label font-bold tracking-[0.4px] text-brand-muted text-center">Dev Testing</p>
                      <Button
                        variant="secondary"
                        onClick={handleMockSignIn}
                        disabled={loading}
                        fullWidth
                      >
                        Mock Sign In (Test Mode)
                      </Button>
                      <button
                        type="button"
                        onClick={() => { haptic('light'); setEmailInput('test@example.com'); setPassword('password123'); }}
                        className="h-11 w-full rounded-lg text-sm font-medium text-brand-mid cursor-pointer bg-transparent active:opacity-70 transition-opacity duration-100"
                      >
                        Fill Test Credentials
                      </button>
                      <button
                        type="button"
                        onClick={handleResetDevData}
                        className="h-11 w-full rounded-lg text-sm font-medium text-status-red cursor-pointer active:opacity-70 transition-opacity duration-100"
                      >
                        Reset All Local Data
                      </button>
                    </div>
                  )}
                </>
              )}
            </form>
          </div>
        </main>

        {/* Desktop/tablet footer */}
        <footer className="hidden md:flex items-center justify-between px-6 py-5 lg:px-10 lg:py-6 text-sm text-brand-muted">
          <span>© 2026 Buildlogg Ltd.</span>
          <div className="flex gap-6">
            <a href="#" className="hover:text-brand-black transition-colors">Terms</a>
            <a href="#" className="hover:text-brand-black transition-colors">Privacy</a>
            <a href="#" className="hover:text-brand-black transition-colors">Support</a>
          </div>
        </footer>
      </div>
    </AuthDesktopLayout>
  );
}
