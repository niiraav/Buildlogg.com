import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { db } from '../lib/db';
import { Button } from '../components/Button';

const UK_PHONE_REGEX = /^(\+44|0)7\d{9}$/;

function normalizePhone(raw: string): string {
  const cleaned = raw.replace(/\s/g, '');
  if (cleaned.startsWith('0')) {
    return '+44' + cleaned.slice(1);
  }
  return cleaned;
}

function formatPhoneForDisplay(phone: string): string {
  if (phone.startsWith('+44')) {
    return phone.replace('+44', '+44 ').replace(/(\d{4})(\d{3})(\d{3})/, '$1 $2 $3');
  }
  return phone;
}

export default function Auth() {
  const navigate = useNavigate();
  const [step, setStep] = useState<'phone' | 'otp'>('phone');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [countdown, setCountdown] = useState(30);
  const [canResend, setCanResend] = useState(false);
  const otpRef = useRef<HTMLInputElement>(null);
  const normalizedPhone = normalizePhone(phone);

  // Countdown timer for resend
  useEffect(() => {
    if (step !== 'otp') return;
    setCountdown(30);
    setCanResend(false);
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          setCanResend(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [step]);

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPhone(e.target.value);
    setError('');
  };

  const handleOtpChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.replace(/\D/g, '').slice(0, 6);
    setOtp(val);
    setError('');
  };

  const handleContinue = async () => {
    if (!UK_PHONE_REGEX.test(phone.replace(/\s/g, ''))) {
      setError('Enter a valid UK mobile number');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const { error: signInError } = await supabase.auth.signInWithOtp({
        phone: normalizedPhone,
      });
      if (signInError) {
        setError('Could not send code. Please try again.');
        return;
      }
      setStep('otp');
    } catch {
      setError('Could not send code. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async () => {
    if (otp.length !== 6) {
      setError('Enter the 6-digit code');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const { data, error: verifyError } = await supabase.auth.verifyOtp({
        phone: normalizedPhone,
        token: otp,
        type: 'sms',
      });
      if (verifyError || !data.session) {
        setError('Invalid code. Please try again.');
        return;
      }
      // Check if profile exists in Dexie
      const userId = data.session.user.id;
      const profile = await db.profiles.get(userId);
      if (profile) {
        navigate('/');
      } else {
        navigate('/onboarding');
      }
    } catch {
      setError('Could not verify code. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (!canResend) return;
    setLoading(true);
    try {
      const { error: resendError } = await supabase.auth.signInWithOtp({
        phone: normalizedPhone,
      });
      if (resendError) {
        setError('Could not resend code. Please try again.');
      } else {
        setError('');
        setCountdown(30);
        setCanResend(false);
      }
    } catch {
      setError('Could not resend code. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Focus OTP input when entering OTP step
  useEffect(() => {
    if (step === 'otp' && otpRef.current) {
      otpRef.current.focus();
    }
  }, [step]);

  return (
    <div className="flex flex-col items-center px-6 pt-12 pb-8 min-h-[100svh]">
      {/* Logo / Wordmark */}
      <div className="text-[28px] font-extrabold text-[#111827] mb-8">
        TradePad
      </div>

      {step === 'phone' && (
        <div className="w-full flex flex-col gap-4">
          <div>
            <h1 className="text-[22px] font-bold text-[#111827]">
              Enter your mobile number
            </h1>
            <p className="text-sm text-[#9CA3AF] mt-1">
              We&apos;ll send you a code
            </p>
          </div>

          {/* Phone input */}
          <div
            className={`flex items-center border-[1.5px] rounded-xl min-h-[48px] overflow-hidden transition-colors ${
              error ? 'border-red-500' : 'border-[#E5E7EB]'
            }`}
          >
            <span className="text-[15px] text-[#111827] px-4 py-3 shrink-0">
              +44
            </span>
            <input
              type="tel"
              inputMode="tel"
              placeholder="7XXX XXXXXX"
              value={phone}
              onChange={handlePhoneChange}
              className="flex-1 text-[15px] text-[#111827] outline-none min-h-[48px] bg-transparent"
              autoFocus
            />
          </div>
          {error && (
            <p className="text-sm text-[#DC2626] -mt-2">{error}</p>
          )}

          <div className="mt-2">
            <Button
              variant="primary"
              onClick={handleContinue}
              disabled={loading}
              fullWidth
            >
              {loading ? 'Sending...' : 'Continue'}
            </Button>
          </div>

          <p className="text-xs text-[#9CA3AF] text-center mt-2">
            UK mobile numbers only
          </p>
        </div>
      )}

      {step === 'otp' && (
        <div className="w-full flex flex-col gap-4">
          <div>
            <h1 className="text-[22px] font-bold text-[#111827]">
              Check your messages
            </h1>
            <p className="text-sm text-[#9CA3AF] mt-1">
              Sent to {formatPhoneForDisplay(normalizedPhone)}
            </p>
          </div>

          {/* OTP input — single input overlaid on 6 visual boxes */}
          <div className="flex justify-center gap-2 mt-4 relative">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className={`w-11 h-12 border-[1.5px] rounded-lg flex items-center justify-center text-[20px] font-bold text-[#111827] ${
                  error
                    ? 'border-red-500'
                    : i < otp.length
                    ? 'border-[#111827]'
                    : 'border-[#E5E7EB]'
                }`}
              >
                {otp[i] || ''}
              </div>
            ))}
            <input
              ref={otpRef}
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={otp}
              onChange={handleOtpChange}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer text-base"
              autoComplete="one-time-code"
            />
          </div>
          {error && (
            <p className="text-sm text-[#DC2626] text-center">{error}</p>
          )}

          <div className="mt-2">
            <Button
              variant="primary"
              onClick={handleVerify}
              disabled={loading || otp.length !== 6}
              fullWidth
            >
              {loading ? 'Verifying...' : 'Verify'}
            </Button>
          </div>

          <div className="text-center mt-2">
            {canResend ? (
              <button
                onClick={handleResend}
                className="text-sm font-medium text-[#111827] underline underline-offset-2 min-h-[44px] px-4"
                disabled={loading}
              >
                Resend code
              </button>
            ) : (
              <span className="text-sm text-[#9CA3AF] min-h-[44px] inline-block leading-[44px]">
                Resend in {countdown}s
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
