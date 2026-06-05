import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { db } from '../../lib/db';
import type { Profile } from '../../lib/db';
import { ProgressDots } from '../../components/ProgressDots';
import { StickyFooter } from '../../components/StickyFooter';
import { Button } from '../../components/Button';
import { SegmentedControl } from '../../components/SegmentedControl';
import { Check } from 'lucide-react';

type TradeType = 'plumber' | 'electrician' | 'builder' | 'other';
type PaymentTerms = 'on_completion' | 'deposit' | 'invoice';
type Step = 1 | 2 | 3 | 4;

const TRADE_OPTIONS: Array<{ value: TradeType; label: string }> = [
  { value: 'plumber', label: 'Plumber' },
  { value: 'electrician', label: 'Electrician' },
  { value: 'builder', label: 'Builder' },
  { value: 'other', label: 'Other' },
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
        // Try to get phone from user metadata or phone field
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

    // Add to sync queue for background sync
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
              <label className="text-sm font-medium text-[#374151] mb-1.5 block">
                Your name
              </label>
              <div
                className={`flex items-center border-[1.5px] rounded-xl min-h-[48px] overflow-hidden transition-colors ${
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
                  className="flex-1 text-base text-[#111827] outline-none min-h-[48px] px-4 bg-transparent"
                  autoFocus
                />
              </div>
            </div>

            {/* Phone (read-only, pre-filled) */}
            <div>
              <label className="text-sm font-medium text-[#374151] mb-1.5 block">
                Your phone number
              </label>
              <div className="flex items-center border-[1.5px] rounded-xl min-h-[48px] overflow-hidden bg-[#F9FAFB] border-[#E5E7EB]">
                <input
                  type="tel"
                  value={phone}
                  readOnly
                  className="flex-1 text-base text-[#6B7280] min-h-[48px] px-4 bg-transparent outline-none cursor-not-allowed"
                />
              </div>
              <p className="text-xs text-[#9CA3AF] mt-1">
                You can update this in Settings
              </p>
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
              <label className="text-sm font-medium text-[#374151] mb-1.5 block">
                Business name
              </label>
              <div className="flex items-center border-[1.5px] rounded-xl min-h-[48px] overflow-hidden border-[#E5E7EB]">
                <input
                  type="text"
                  inputMode="text"
                  placeholder="Dave's Plumbing & Heating"
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  className="flex-1 text-base text-[#111827] outline-none min-h-[48px] px-4 bg-transparent"
                />
              </div>
            </div>

            {/* Trade type — 2×2 grid */}
            <div>
              <label className="text-sm font-medium text-[#374151] mb-2 block">
                Trade type
              </label>
              <div className="grid grid-cols-2 gap-2">
                {TRADE_OPTIONS.map((opt) => {
                  const isSelected = trade === opt.value;
                  return (
                    <button
                      key={opt.value}
                      onClick={() => toggleTrade(opt.value)}
                      className={`h-[48px] rounded-xl border-[1.5px] font-medium text-[15px] transition-all cursor-pointer ${
                        isSelected
                          ? 'border-[#111827] bg-[#F9FAFB] text-[#111827]'
                          : 'border-[#E5E7EB] text-[#6B7280]'
                      }`}
                    >
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
              <label className="text-sm font-medium text-[#374151] mb-1.5 block">
                Callout charge
              </label>
              <div className="flex items-center border-[1.5px] rounded-xl min-h-[48px] overflow-hidden border-[#E5E7EB]">
                <span className="text-[15px] text-[#6B7280] px-3 shrink-0">£</span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={calloutCharge}
                  onChange={(e) => setCalloutCharge(e.target.value.replace(/[^0-9.]/g, ''))}
                  className="flex-1 text-base text-[#111827] outline-none min-h-[48px] bg-transparent"
                />
              </div>
              <p className="text-xs text-[#9CA3AF] mt-1">
                Charged when customer not home
              </p>
            </div>

            {/* Payment terms */}
            <div>
              <label className="text-sm font-medium text-[#374151] mb-2 block">
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
              <label className="text-sm font-medium text-[#374151] mb-1.5 block">
                Quote valid for
              </label>
              <div className="flex items-center border-[1.5px] rounded-xl min-h-[48px] overflow-hidden border-[#E5E7EB]">
                <input
                  type="text"
                  inputMode="numeric"
                  value={quoteValidDays}
                  onChange={(e) => setQuoteValidDays(e.target.value.replace(/\D/g, ''))}
                  className="flex-1 text-base text-[#111827] outline-none min-h-[48px] px-4 bg-transparent"
                />
                <span className="text-[15px] text-[#6B7280] pr-4 shrink-0">days</span>
              </div>
              <p className="text-xs text-[#9CA3AF] mt-1">
                After this, quote expires automatically
              </p>
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
