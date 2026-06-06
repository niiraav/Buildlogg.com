import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { db } from '../lib/db';
import { useAppStore } from '../store/useAppStore';
import { Button } from '../components/Button';

export default function Auth() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleEmailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setEmail(e.target.value);
    setError('');
  };

  const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPassword(e.target.value);
    setError('');
  };

  const handleSubmit = async () => {
    if (!email.trim() || !password.trim()) {
      setError('Enter email and password');
      return;
    }
    setError('');
    setLoading(true);
    try {
      if (mode === 'signin') {
        const { data, error: signInError } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password: password.trim(),
        });
        if (signInError || !data.session) {
          setError('Invalid email or password');
          setLoading(false);
          return;
        }
        // Profile check will happen in AuthGuard
        return;
      } else {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email: email.trim(),
          password: password.trim(),
        });
        if (signUpError) {
          setError(signUpError.message || 'Could not sign up');
          setLoading(false);
          return;
        }
        if (data.session) {
          navigate('/onboarding');
        } else {
          setError('Check your email for confirmation');
        }
      }
    } catch (err) {
      setError('Something went wrong. Try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleMockSignIn = async () => {
    setLoading(true);
    setError('');
    try {
      // Check if a mock user already exists — reuse it so profile persists
      const existingMock = localStorage.getItem('tradepad_mock_user');
      let mockUserId: string;
      let mockEmail: string;

      if (existingMock) {
        const mock = JSON.parse(existingMock);
        mockUserId = mock.id;
        mockEmail = mock.email || 'test@test.com';
      } else {
        mockUserId = 'mock_' + Date.now();
        mockEmail = 'test@test.com';
        localStorage.setItem('tradepad_mock_user', JSON.stringify({
          id: mockUserId,
          email: mockEmail,
          created_at: new Date().toISOString(),
        }));
      }

      // Set userId immediately so AuthGuard sees it on next render
      useAppStore.getState().setUserId(mockUserId);

      const profile = await db.profiles.get(mockUserId);
      if (profile) {
        navigate('/', { replace: true });
        setLoading(false);
        return;
      } else {
        navigate('/onboarding', { replace: true });
        setLoading(false);
        return;
      }
    } catch (err) {
      setError('Mock sign-in failed: ' + (err as Error).message);
      setLoading(false);
    }
  };

  const handleResetDevData = () => {
    localStorage.removeItem('tradepad_mock_user');
    db.delete().then(() => {
      navigate('/auth', { replace: true });
      window.location.reload();
    }).catch(() => {
      navigate('/auth', { replace: true });
      window.location.reload();
    });
  };

  return (
    <div className="flex flex-col items-center px-6 pt-12 pb-8 min-h-[100svh]">
      {/* Logo / Wordmark */}
      <div className="text-hero font-extrabold text-brand-black mb-8">
        TradePad
      </div>

      <div className="w-full flex flex-col gap-4">
        <div>
          <h1 className="text-xl font-bold text-brand-black">
            {mode === 'signin' ? 'Sign in' : 'Create account'}
          </h1>
          <p className="text-sm text-brand-muted mt-1">
            {mode === 'signin' ? 'Enter your details' : 'Get started with TradePad'}
          </p>
        </div>

        {/* Email input */}
        <div className="flex flex-col gap-1">
          <label className="text-label font-bold uppercase tracking-[0.4px] text-brand-muted">
            Email
          </label>
          <div className={`flex items-center border-2 rounded-xl min-h-12 overflow-hidden transition-colors ${error ? 'border-red-500' : 'border-brand-border'}`}>
            <input
              type="email"
              inputMode="email"
              placeholder="you@example.com"
              value={email}
              onChange={handleEmailChange}
              className="flex-1 text-base text-brand-black outline-none min-h-12 px-4 bg-transparent"
              autoFocus
            />
          </div>
        </div>

        {/* Password input */}
        <div className="flex flex-col gap-1">
          <label className="text-label font-bold uppercase tracking-[0.4px] text-brand-muted">
            Password
          </label>
          <div className={`flex items-center border-2 rounded-xl min-h-12 overflow-hidden transition-colors ${error ? 'border-red-500' : 'border-brand-border'}`}>
            <input
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={handlePasswordChange}
              className="flex-1 text-base text-brand-black outline-none min-h-12 px-4 bg-transparent"
            />
          </div>
        </div>

        {error && (
          <p className="text-sm text-status-red">{error}</p>
        )}

        <div className="mt-2">
          <Button
            variant="primary"
            onClick={handleSubmit}
            disabled={loading}
            fullWidth
          >
            {loading ? (mode === 'signin' ? 'Signing in...' : 'Creating...') : (mode === 'signin' ? 'Sign in' : 'Create account')}
          </Button>
        </div>

        <div className="text-center mt-2">
          <button
            onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setError(''); }}
            className="text-sm font-medium text-brand-mid min-h-11 px-4 cursor-pointer"
          >
            {mode === 'signin' ? 'No account? Create one' : 'Already have an account? Sign in'}
          </button>
        </div>

        {/* Dev-only test tools */}
        <div className="flex flex-col gap-2 mt-6 pt-6 border-t border-brand-border">
          <p className="text-label font-bold uppercase tracking-[0.4px] text-brand-muted text-center">Dev testing</p>
          <Button
            variant="secondary"
            onClick={handleMockSignIn}
            disabled={loading}
            fullWidth
          >
            Mock sign in (test mode)
          </Button>
          <button
            onClick={() => { setEmail('test@test.com'); setPassword('password123'); }}
            className="h-11 w-full rounded-lg text-xs font-medium text-brand-mid cursor-pointer"
          >
            Fill test credentials
          </button>
          <button
            onClick={handleResetDevData}
            className="h-11 w-full rounded-lg text-xs font-medium text-status-red cursor-pointer"
          >
            Reset all local data
          </button>
        </div>
      </div>
    </div>
  );
}
