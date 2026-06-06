import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../../store/useAppStore';
import { supabase } from '../../lib/supabase';
import { db } from '../../lib/db';
import type { Profile } from '../../lib/db';
import { ProgressDots } from '../../components/ProgressDots';
import { StickyFooter } from '../../components/StickyFooter';
import { Button } from '../../components/Button';
import { Check, Wrench, Zap, HardHat, Hammer, HelpCircle } from 'lucide-react';

type TradeType = 'plumber' | 'electrician' | 'builder' | 'other';
type PaymentTerms = 'on_completion' | 'deposit' | 'invoice';
type Step = 1 | 2 | 3 | 4;

const TRADE_OPTIONS: Array<{ value: TradeType; label: string; icon: React.ReactNode }> = [
  { value: 'plumber', label: 'Plumber', icon: <Wrench size={18} /> },
  { value: 'electrician', label: 'Electrician', icon: <Zap size={18} /> },
  { value: 'builder', label: 'Builder', icon: <HardHat size={18} /> },
  { value: 'other', label: 'Other', icon: <Hammer size={18} /> },
];

const PAYMENT_TERMS: Array<{ value: PaymentTerms; label: string; description: string }> = [
  { value: 'on_completion', label: 'On completion', description: 'Customer pays after the job is finished' },
  { value: 'deposit', label: 'Deposit', description: 'Ask for a deposit upfront, then balance on completion' },
  { value: 'invoice', label: 'Invoice', description: 'Send an invoice after the job is done' },
];

export default function Onboarding() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>(1);
  const setUserId = useAppStore((s) => s.setUserId);
  const [userId, setLocalUserId] = useState<string | null>(null);
  const [phone, setPhone] = useState('');

  // Form data
  const [fullName, setFullName] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [trade, setTrade] = useState<TradeType | undefined>();
  const [calloutCharge, setCalloutCharge] = useState('75');
  const [paymentTerms, setPaymentTerms] = useState<PaymentTerms>('on_completion');
  const [quoteValidDays, setQuoteValidDays] = useState('30');
  const [defaultLabourDesc, setDefaultLabourDesc] = useState('Labour');
  const [defaultLabourCharge, setDefaultLabourCharge] = useState('150');
  const [showTermsHelp, setShowTermsHelp] = useState(false);

  // Get user on mount
  useEffect(() => {
    async function fetchUser() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          setLocalUserId(user.id);
          const phoneFromAuth = user.phone || user.user_metadata?.phone || '';
          setPhone(phoneFromAuth);
          return;
        }
      } catch {
        // Supabase not available, continue to mock user check
      }
      // Check for mock user (dev testing)
      const mockUser = localStorage.getItem('tradepad_mock_user');
      if (mockUser) {
        const mock = JSON.parse(mockUser);
        setLocalUserId(mock.id);
        setPhone(mock.phone || mock.email || '');
      }
    }
    fetchUser();
  }, []);

  const toggleTrade = useCallback((value: TradeType) => {
    setTrade((prev) => (prev === value ? undefined : value));
  }, []);

  const handleWriteProfile = useCallback(async () => {
    let resolvedUserId = userId;
    if (!resolvedUserId) {
      const mockUser = localStorage.getItem('tradepad_mock_user');
      if (mockUser) {
        resolvedUserId = JSON.parse(mockUser).id;
      }
    }
    if (!resolvedUserId) return;

    const now = new Date().toISOString();
    const profile: Profile = {
      id: resolvedUserId,
      full_name: fullName.trim(),
      phone: phone.trim() || '00000000000',
      business_name: businessName.trim() || undefined,
      trade,
      callout_charge: parseFloat(calloutCharge) || 75,
      payment_terms: paymentTerms,
      default_labour_description: defaultLabourDesc.trim() || 'Labour',
      default_labour_charge: parseFloat(defaultLabourCharge) || 0,
      quote_valid_days: parseInt(quoteValidDays, 10) || 30,
      created_at: now,
      updated_at: now,
      _sync_status: 'pending',
    };

    await db.profiles.put(profile);

    await db.sync_queue.add({
      operation: 'insert',
      table_name: 'profiles',
      record_id: resolvedUserId,
      payload: {
        id: resolvedUserId,
        full_name: profile.full_name,
        phone: profile.phone,
        business_name: profile.business_name,
        trade: profile.trade,
        callout_charge: profile.callout_charge,
        payment_terms: profile.payment_terms,
        default_labour_description: profile.default_labour_description,
        default_labour_charge: profile.default_labour_charge,
        quote_valid_days: profile.quote_valid_days,
        created_at: profile.created_at,
        updated_at: profile.updated_at,
      },
      created_at: now,
      retry_count: 0,
    });
  }, [userId, fullName, phone, businessName, trade, calloutCharge, paymentTerms, defaultLabourDesc, defaultLabourCharge, quoteValidDays]);

  const nextStep = () => setStep((s) => (s < 4 ? ((s + 1) as Step) : s));
  const skip = () => nextStep();

  const handleContinueS1 = () => {
    if (fullName.trim().length === 0) return;
    nextStep();
  };

  const handleContinueS4 = async () => {
    await handleWriteProfile();
    if (userId) setUserId(userId);
    navigate('/');
  };

  const firstName = fullName.trim().split(' ')[0] || 'there';

  return (
    <div className="flex flex-col min-h-[100svh]">
      <ProgressDots total={4} current={step} />

      {/* ── S1: Welcome ── */}
      {step === 1 && (
        <div className="flex-1 flex flex-col">
          <div className="px-6 pt-4 flex-1">
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
                    value={phone || 'Not provided'}
                    readOnly
                    className="flex-1 text-base text-[#6B7280] min-h-[52px] px-4 bg-transparent outline-none cursor-not-allowed"
                  />
                </div>
              </div>
            </div>
          </div>

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
        <div className="flex-1 flex flex-col">
          <div className="px-6 pt-4 flex-1">
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
          </div>

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
        <div className="flex-1 flex flex-col">
          <div className="px-6 pt-4 flex-1">
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
                <div className="flex items-center border-[1.5px] rounded-xl min-h-[52px] overflow-hidden border-[#E5E7EB]">
                  <span className="text-[15px] text-[#111827] px-4 shrink-0">£</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={calloutCharge}
                    onChange={(e) => setCalloutCharge(e.target.value.replace(/[^0-9.]/g, ''))}
                    className="flex-1 text-base text-[#111827] outline-none min-h-[52px] bg-transparent pr-4"
                  />
                </div>
                <p className="text-[12px] text-[#9CA3AF] mt-1.5 leading-relaxed">
                  Charged when customer not home
                </p>
              </div>

              {/* Default labour charge */}
              <div>
                <label className="text-[11px] font-bold uppercase tracking-[0.4px] text-[#9CA3AF] mb-1.5 block">
                  Default labour charge
                </label>
                <div className="flex items-center border-[1.5px] rounded-xl min-h-[52px] overflow-hidden border-[#E5E7EB] mb-2">
                  <span className="text-[15px] text-[#111827] px-4 shrink-0">£</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={defaultLabourCharge}
                    onChange={(e) => setDefaultLabourCharge(e.target.value.replace(/[^0-9.]/g, ''))}
                    className="flex-1 text-base text-[#111827] outline-none min-h-[52px] bg-transparent pr-4"
                  />
                </div>
                <div className="flex items-center border-[1.5px] rounded-xl min-h-[52px] overflow-hidden border-[#E5E7EB]">
                  <input
                    type="text"
                    inputMode="text"
                    value={defaultLabourDesc}
                    onChange={(e) => setDefaultLabourDesc(e.target.value)}
                    placeholder="e.g. Labour, Day rate, Call-out fee"
                    className="flex-1 text-base text-[#111827] outline-none min-h-[52px] bg-transparent px-4"
                  />
                </div>
                <p className="text-[12px] text-[#9CA3AF] mt-1.5 leading-relaxed">
                  Automatically added to every new quote. Edit or remove per quote.
                </p>
              </div>

              {/* Payment terms — radio cards with descriptions */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <label className="text-[11px] font-bold uppercase tracking-[0.4px] text-[#9CA3AF]">
                    Default payment terms
                  </label>
                  <button
                    onClick={() => setShowTermsHelp(!showTermsHelp)}
                    className="w-5 h-5 rounded-full bg-[#F3F4F6] flex items-center justify-center text-[#6B7280]"
                    aria-label="What are payment terms?"
                  >
                    <HelpCircle size={12} />
                  </button>
                </div>

                {showTermsHelp && (
                  <div className="bg-[#F0F9FF] rounded-lg p-3 mb-2 border border-[#BAE6FD]">
                    <p className="text-[13px] text-[#0369A1] leading-relaxed">
                      This is the default way you ask to be paid. It appears on every quote you send. You can change it for any individual job.
                    </p>
                  </div>
                )}

                <div className="flex flex-col gap-2">
                  {PAYMENT_TERMS.map((opt) => {
                    const isSelected = paymentTerms === opt.value;
                    return (
                      <button
                        key={opt.value}
                        onClick={() => setPaymentTerms(opt.value)}
                        className={`flex flex-col gap-0.5 min-h-[52px] rounded-xl border-[1.5px] px-4 py-2.5 transition-all cursor-pointer text-left ${
                          isSelected
                            ? 'border-[#111827] bg-[#F9FAFB]'
                            : 'border-[#E5E7EB] bg-white'
                        }`}
                      >
                        <span className={`font-semibold text-[14px] ${isSelected ? 'text-[#111827]' : 'text-[#6B7280]'}`}>
                          {opt.label}
                        </span>
                        <span className={`text-[12px] leading-relaxed ${isSelected ? 'text-[#111827]' : 'text-[#9CA3AF]'}`}>
                          {opt.description}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Quote valid for */}
              <div>
                <label className="text-[11px] font-bold uppercase tracking-[0.4px] text-[#9CA3AF] mb-1.5 block">
                  Quote valid for
                </label>
                <div className="flex items-center border-[1.5px] rounded-xl min-h-[52px] overflow-hidden border-[#E5E7EB]">
                  <input
                    type="text"
                    inputMode="numeric"
                    value={quoteValidDays}
                    onChange={(e) => setQuoteValidDays(e.target.value.replace(/\D/g, ''))}
                    className="flex-1 text-[15px] font-semibold text-[#111827] outline-none min-h-[52px] px-4 bg-transparent"
                  />
                  <span className="text-[15px] text-[#6B7280] pr-4 shrink-0">days</span>
                </div>
                <p className="text-[12px] text-[#9CA3AF] mt-1.5 leading-relaxed">
                  After this, the quote expires automatically. Common choices: 7, 14, 30, 60, or 90 days.
                </p>
              </div>
            </div>
          </div>

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
        <div className="flex-1 flex flex-col">
          <div className="px-6 pt-4 flex-1 flex flex-col items-center justify-center gap-4">
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
