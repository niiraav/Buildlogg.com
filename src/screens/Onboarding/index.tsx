import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { db } from '../../lib/db';
import type { Profile } from '../../lib/db';
import { ProgressDots } from '../../components/ProgressDots';
import { StickyFooter } from '../../components/StickyFooter';
import { Button } from '../../components/Button';
import { SegmentedControl } from '../../components/SegmentedControl';
import { Check, Wrench, Zap, HardHat, Hammer } from 'lucide-react';

type TradeType = 'plumber' | 'electrician' | 'builder' | 'other';
type PaymentTerms = 'on_completion' | 'deposit' | 'invoice';
type Step = 1 | 2 | 3 | 4;

const TRADE_OPTIONS: Array<{ value: TradeType; label: string; icon: React.ReactNode }> = [
  { value: 'plumber', label: 'Plumber', icon: <Wrench size={18} /> },
  { value: 'electrician', label: 'Electrician', icon: <Zap size={18} /> },
  { value: 'builder', label: 'Builder', icon: <HardHat size={18} /> },
  { value: 'other', label: 'Other', icon: <Hammer size={18} /> },
];

const PAYMENT_TERMS_OPTIONS = [
  { value: 'on_completion', label: 'On completion' },
  { value: 'deposit', label: 'Deposit' },
  { value: 'invoice', label: 'Invoice' },
];

export default function Onboarding() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>(1);
  const [userId, setUserId] = useState<string | null>(null);
  const [phone, setPhone] = useState('');

  // Form data
  const [fullName, setFullName] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [trade, setTrade] = useState<TradeType | undefined>();
  const [calloutCharge, setCalloutCharge] = useState('75');
  const [paymentTerms, setPaymentTerms] = useState<PaymentTerms>('on_completion');
  const [quoteValidDays, setQuoteValidDays] = useState('30');

  // Get user on mount
  useEffect(() => {
    async function fetchUser() {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setUserId(user.id);
        const phoneFromAuth = user.phone || user.user_metadata?.phone || '';
        setPhone(phoneFromAuth);
      }
    }
    fetchUser();
  }, []);

  const toggleTrade = useCallback((value: TradeType) => {
    setTrade((prev) => (prev === value ? undefined : value));
  }, []);

  const handleWriteProfile = useCallback(async () => {
    if (!userId) return;

    const now = new Date().toISOString();
    const profile: Profile = {
      id: userId,
      full_name: fullName.trim(),
      phone,
      business_name: businessName.trim() || undefined,
      trade,
      callout_charge: parseFloat(calloutCharge) || 75,
      payment_terms: paymentTerms,
      quote_valid_days: parseInt(quoteValidDays, 10) || 30,
      created_at: now,
      updated_at: now,
      _sync_status: 'pending',
    };

    await db.profiles.put(profile);

    await db.sync_queue.add({
      operation: 'insert',
      table_name: 'profiles',
      record_id: userId,
      payload: {
        id: userId,
        full_name: profile.full_name,
        phone: profile.phone,
        business_name: profile.business_name,
        trade: profile.trade,
        callout_charge: profile.callout_charge,
        payment_terms: profile.payment_terms,
        quote_valid_days: profile.quote_valid_days,
        created_at: profile.created_at,
        updated_at: profile.updated_at,
      },
      created_at: now,
      retry_count: 0,
    });
  }, [userId, fullName, phone, businessName, trade, calloutCharge, paymentTerms, quoteValidDays]);

  const nextStep = () => setStep((s) => (s < 4 ? ((s + 1) as Step) : s));
  const skip = () => nextStep();

  const handleContinueS1 = () => {
    if (fullName.trim().length === 0) return;
    nextStep();
  };

  const handleContinueS4 = () => {
    handleWriteProfile();
    navigate('/');
  };

  const firstName = fullName.trim().split(' ')[0] || 'there';

  return (
    <div className="flex flex-col min-h-[100svh]">
      <ProgressDots total={4} current={step} />

      {/* ── S1: Welcome ── */}
      {step === 1 && (
        <div className="flex-1 flex flex-col px-6 pt-4">
          <div className="mb-6">
            <h1 className="text-[26px] font-extrabold text-[#111827]">
              Hi, what&apos;s your name?
            </h1>
            <p className="text-[15px] text-[#9CA3AF] mt-1">
              Just you for now — you can add your team later.
            </p>
          </div>

          <div className="flex flex-col gap-4">
            {/* Full name */}
            <div>
              <label className="text-[11px] font-bold uppercase tracking-[0.4px] text-[#9CA3AF] mb-1.5 block">
                Your name
              </label>
              <div
                className={`flex items-center border-[1.5px] rounded-xl min-h-[52px] overflow-hidden transition-colors ${
                  fullName.trim().length === 0
                    ? 'border-[#E5E7EB]'
                    : 'border-[#111827]'
                }`}
              >
                <input
                  type="text"
                  inputMode="text"
                  placeholder="e.g. Dave Smith"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="flex-1 text-base text-[#111827] outline-none min-h-[52px] px-4 bg-transparent"
                  autoFocus
                />
              </div>
            </div>

            {/* Phone (read-only, pre-filled) */}
            <div>
              <label className="text-[11px] font-bold uppercase tracking-[0.4px] text-[#9CA3AF] mb-1.5 block">
                Your phone number
              </label>
              <div className="flex items-center border-[1.5px] rounded-xl min-h-[52px] overflow-hidden bg-[#F9FAFB] border-[#E5E7EB]">
                <input
                  type="tel"
                  value={phone}
                  readOnly
                  className="flex-1 text-base text-[#6B7280] min-h-[52px] px-4 bg-transparent outline-none cursor-not-allowed"
                />
              </div>
            </div>
          </div>

          <div className="flex-1" />

          <StickyFooter>
            <Button
              variant="primary"
              onClick={handleContinueS1}
              disabled={fullName.trim().length === 0}
            >
              Continue →
            </Button>
          </StickyFooter>
        </div>
      )}

      {/* ── S2: Business ── */}
      {step === 2 && (
        <div className="flex-1 flex flex-col px-6 pt-4">
          <div className="mb-6">
            <h1 className="text-[26px] font-extrabold text-[#111827]">
              Tell us about your business
            </h1>
            <p className="text-[15px] text-[#9CA3AF] mt-1">
              This appears on quotes. You can update it any time.
            </p>
          </div>

          <div className="flex flex-col gap-4">
            {/* Business name */}
            <div>
              <label className="text-[11px] font-bold uppercase tracking-[0.4px] text-[#9CA3AF] mb-1.5 block">
                Business name <span className="font-normal normal-case tracking-normal text-[11px] ml-1">(optional)</span>
              </label>
              <div className="flex items-center border-[1.5px] rounded-xl min-h-[52px] overflow-hidden border-[#E5E7EB]">
                <input
                  type="text"
                  inputMode="text"
                  placeholder="Dave's Plumbing & Heating"
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  className="flex-1 text-base text-[#111827] outline-none min-h-[52px] px-4 bg-transparent"
                />
              </div>
            </div>

            {/* Trade type — 2×2 grid */}
            <div>
              <label className="text-[11px] font-bold uppercase tracking-[0.4px] text-[#9CA3AF] mb-2 block">
                Trade type
              </label>
              <div className="grid grid-cols-2 gap-2">
                {TRADE_OPTIONS.map((opt) => {
                  const isSelected = trade === opt.value;
                  return (
                    <button
                      key={opt.value}
                      onClick={() => toggleTrade(opt.value)}
                      className={`h-[52px] rounded-xl border-[1.5px] font-semibold text-[14px] transition-all cursor-pointer flex items-center justify-center gap-2 ${
                        isSelected
                          ? 'border-[#111827] bg-[#F9FAFB] text-[#111827]'
                          : 'border-[#E5E7EB] text-[#6B7280]'
                      }`}
                    >
                      <span className={isSelected ? 'text-[#111827]' : 'text-[#9CA3AF]'}>{opt.icon}</span>
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="flex-1" />

          <StickyFooter>
            <Button variant="primary" onClick={nextStep}>
              Continue →
            </Button>
            <Button variant="ghost" onClick={skip}>
              Skip — I&apos;ll set this up later
            </Button>
          </StickyFooter>
        </div>
      )}

      {/* ── S3: Defaults ── */}
      {step === 3 && (
        <div className="flex-1 flex flex-col px-6 pt-4">
          <div className="mb-6">
            <h1 className="text-[26px] font-extrabold text-[#111827]">
              Set your defaults
            </h1>
            <p className="text-[15px] text-[#9CA3AF] mt-1">
              Saves you time on every job. Change any time in Settings.
            </p>
          </div>

          <div className="flex flex-col gap-5">
            {/* Callout charge */}
            <div>
              <label className="text-[11px] font-bold uppercase tracking-[0.4px] text-[#9CA3AF] mb-1.5 block">
                Callout charge
              </label>
              <div className="flex items-center gap-2.5">
                <div className="flex items-center border-[1.5px] rounded-xl min-h-[52px] overflow-hidden border-[#E5E7EB] flex-1">
                  <span className="text-[15px] text-[#111827] px-4 shrink-0">£</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={calloutCharge}
                    onChange={(e) => setCalloutCharge(e.target.value.replace(/[^0-9.]/g, ''))}
                    className="flex-1 text-base text-[#111827] outline-none min-h-[52px] bg-transparent pr-4"
                  />
                </div>
                <span className="text-[12px] text-[#9CA3AF] leading-relaxed shrink-0">
                  Charged when<br />customer not home
                </span>
              </div>
            </div>

            {/* Payment terms */}
            <div>
              <label className="text-[11px] font-bold uppercase tracking-[0.4px] text-[#9CA3AF] mb-2 block">
                Default payment terms
              </label>
              <SegmentedControl
                options={PAYMENT_TERMS_OPTIONS}
                value={paymentTerms}
                onChange={(v) => setPaymentTerms(v as PaymentTerms)}
              />
            </div>

            {/* Quote valid for */}
            <div>
              <label className="text-[11px] font-bold uppercase tracking-[0.4px] text-[#9CA3AF] mb-1.5 block">
                Quote valid for
              </label>
              <div className="flex items-center gap-2.5">
                <div className="flex items-center border-[1.5px] rounded-xl min-h-[52px] overflow-hidden border-[#E5E7EB] flex-1">
                  <input
                    type="text"
                    inputMode="numeric"
                    value={quoteValidDays}
                    onChange={(e) => setQuoteValidDays(e.target.value.replace(/\D/g, ''))}
                    className="flex-1 text-[15px] font-semibold text-[#111827] outline-none min-h-[52px] px-4 bg-transparent"
                  />
                  <span className="text-[15px] text-[#6B7280] pr-4 shrink-0">days</span>
                </div>
                <span className="text-[12px] text-[#9CA3AF] leading-relaxed shrink-0">
                  After this, quote<br />expires automatically
                </span>
              </div>
            </div>
          </div>

          <div className="flex-1" />

          <StickyFooter>
            <Button variant="primary" onClick={nextStep}>
              Continue →
            </Button>
            <Button variant="ghost" onClick={skip}>
              Skip — I&apos;ll set this up later
            </Button>
          </StickyFooter>
        </div>
      )}

      {/* ── S4: Done ── */}
      {step === 4 && (
        <div className="flex-1 flex flex-col px-6 pt-4">
          <div className="flex-1 flex flex-col items-center justify-center gap-4">
            <div className="w-20 h-20 rounded-full bg-[#F0FDF4] flex items-center justify-center">
              <Check size={36} strokeWidth={2.5} className="text-[#15803D]" />
            </div>
            <div className="text-center">
              <h1 className="text-[26px] font-extrabold text-[#111827]">
                You&apos;re all set, {firstName}
              </h1>
              <p className="text-[15px] text-[#6B7280] mt-2">
                Log a missed call or create your first quote to get started.
              </p>
              <p className="text-[15px] text-[#6B7280] mt-1">
                Your jobs will appear on the home screen as soon as they&apos;re booked.
              </p>
            </div>
          </div>

          <StickyFooter>
            <Button variant="primary" onClick={handleContinueS4}>
              Go to home →
            </Button>
          </StickyFooter>
        </div>
      )}
    </div>
  );
}
