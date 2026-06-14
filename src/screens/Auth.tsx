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

type AuthStep = 'email' | 'otp';

function validateEmail(email: string): string | null {
  const trimmed = email.trim().toLowerCase();
  if (!trimmed) return 'Enter your email address';
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!re.test(trimmed)) return 'Enter a valid email address';
  return null;
}

export default function Auth() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const action = searchParams.get('action') === 'signin' ? 'signin' : 'signup';
  const [step, setStep] = useState<AuthStep>('email');
  const [emailInput, setEmailInput] = useState('');
  const [otp, setOtp] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [countdown, setCountdown] = useState(0);

  useEffect(() => {
    if (countdown <= 0) return;
    const t = setTimeout(() => setCountdown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

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

  const handleEmailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setEmailInput(e.target.value);
    setError('');
  };

  const handleOtpChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.replace(/\D/g, '').slice(0, 6);
    setOtp(val);
    setError('');
  };

  const handleSendOtp = async () => {
    const email = emailInput.trim().toLowerCase();
    const validationError = validateEmail(email);
    if (validationError) {
      setError(validationError);
      return;
    }

    setError('');
    setLoading(true);
    try {
      const { error: otpError } = await supabase.auth.signInWithOtp({
        email,
        options: { shouldCreateUser: true, emailRedirectTo: 'https://buildlogg.com/app/auth' },
      });
      if (otpError) {
        console.error('[Auth] OTP send error:', otpError);
        hapticError();
        showError(otpError.message || 'Could not send code. Try again.');
        setLoading(false);
        return;
      }
      hapticSuccess();
      showToast(`Code sent to ${email}`, 'info', 3000);
      setStep('otp');
      setCountdown(60);
    } catch (err) {
      console.error('[Auth] Send OTP exception:', err);
      hapticError();
      showError('Something went wrong. Try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (otp.length !== 6) {
      setError('Enter the 6-digit code');
      return;
    }
    const email = emailInput.trim().toLowerCase();
    setError('');
    setLoading(true);
    try {
      const { data, error: verifyError } = await supabase.auth.verifyOtp({
        email,
        token: otp,
        type: 'email',
      });
      if (verifyError || !data.session) {
        console.error('[Auth] Verify error:', verifyError);
        hapticError();
        showError(verifyError?.message || 'Invalid code. Try again.');
        setLoading(false);
        return;
      }

      hapticSuccess();
      showSuccess("You're in");
      const userId = data.session.user.id;
      identifyUser(userId, { email });
      captureUserSignedIn();

      const profile = await db.profiles.get(userId);
      navigate(profile ? '/' : '/onboarding', { replace: true });
    } catch (err) {
      console.error('[Auth] Verify exception:', err);
      hapticError();
      showError('Something went wrong. Try again.');
      setLoading(false);
    }
  };

  const handleResendOtp = async () => {
    if (countdown > 0) return;
    const email = emailInput.trim().toLowerCase();
    setLoading(true);
    try {
      const { error: otpError } = await supabase.auth.signInWithOtp({
        email,
        options: { shouldCreateUser: true, emailRedirectTo: 'https://buildlogg.com/app/auth' },
      });
      if (otpError) {
        showError(otpError.message || 'Could not resend code.');
        return;
      }
      hapticSuccess();
      showToast('Code resent', 'info', 2000);
      setCountdown(60);
      setError('');
    } catch (err) {
      showError('Something went wrong. Try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleChangeEmail = () => {
    setStep('email');
    setOtp('');
    setError('');
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

  const email = emailInput.trim().toLowerCase();

  return (
    <AuthDesktopLayout variant="auth">
    
      <div className="text-hero font-extrabold text-brand-black mb-8 lg:hidden">
        Buildlogg
      </div>

      <div className="w-full flex flex-col gap-4">
        {step === 'email' && (
          <>
            <div>
              <h1 className="text-xl font-bold text-brand-black">
                {action === 'signin' ? 'Welcome back' : 'Get started'}
              </h1>
              <p className="text-sm text-brand-muted mt-1">
                {action === 'signin'
                  ? "We\'ll send you a code to sign in. No password needed."
                  : "We\'ll send you a 6-digit code. No password needed."}
              </p>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-label font-bold tracking-[0.4px] text-brand-muted">Email</label>
              <div className={`flex items-center border-2 rounded-xl min-h-12 overflow-hidden transition-colors ${error ? 'border-red-500' : 'border-brand-border'}`}>
                <input
                  type="email"
                  inputMode="email"
                  placeholder="you@example.com"
                  value={emailInput}
                  onChange={handleEmailChange}
                  className="flex-1 text-base text-brand-black outline-none min-h-12 px-4 bg-transparent"
                  autoFocus
                />
              </div>
              {error && <p className="text-sm text-status-red mt-1">{error}</p>}
            </div>

            <div className="mt-2">
              <Button
                variant="primary"
                onClick={handleSendOtp}
                disabled={loading}
                fullWidth
              >
                {loading ? 'Sending code...' : 'Send code'}
              </Button>
            </div>
          </>
        )}

        {step === 'otp' && (
          <>
            <div>
              <h1 className="text-xl font-bold text-brand-black">Enter code</h1>
              <p className="text-sm text-brand-muted mt-1">
                We sent a 6-digit code to <span className="font-medium text-brand-black">{email}</span>
              </p>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-label font-bold tracking-[0.4px] text-brand-muted">Verification Code</label>
              <div className={`flex items-center border-2 rounded-xl min-h-12 overflow-hidden transition-colors ${error ? 'border-red-500' : 'border-brand-border'}`}>
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="000000"
                  value={otp}
                  onChange={handleOtpChange}
                  className="flex-1 text-base text-brand-black outline-none min-h-12 px-4 bg-transparent tracking-[0.5em] text-center"
                  autoFocus
                />
              </div>
              {error && <p className="text-sm text-status-red mt-1">{error}</p>}
            </div>

            <div className="mt-2">
              <Button
                variant="primary"
                onClick={handleVerifyOtp}
                disabled={loading || otp.length !== 6}
                fullWidth
                hapticPattern="medium"
              >
                {loading ? 'Verifying...' : 'Verify'}
              </Button>
            </div>

            <div className="text-center mt-2 flex flex-col gap-2">
              <button
                onClick={handleResendOtp}
                disabled={countdown > 0 || loading}
                className="text-sm font-medium text-brand-mid min-h-11 px-4 cursor-pointer disabled:opacity-50 active:opacity-70 transition-opacity duration-100"
              >
                {countdown > 0 ? `Resend code in ${countdown}s` : 'Resend code'}
              </button>
              <button
                onClick={handleChangeEmail}
                className="text-sm font-medium text-brand-mid min-h-11 px-4 cursor-pointer active:opacity-70 transition-opacity duration-100"
              >
                Change email
              </button>
            </div>
          </>
        )}

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
              onClick={() => { haptic('light'); setEmailInput('test@example.com'); }}
              className="h-11 w-full rounded-lg text-sm font-medium text-brand-mid cursor-pointer bg-transparent active:opacity-70 transition-opacity duration-100"
            >
              Fill Test Email
            </button>
            <button
              onClick={handleResetDevData}
              className="h-11 w-full rounded-lg text-sm font-medium text-status-red cursor-pointer active:opacity-70 transition-opacity duration-100"
            >
              Reset All Local Data
            </button>
          </div>
        )}
      </div>
    </AuthDesktopLayout>
  );
}
