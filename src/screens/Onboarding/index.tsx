import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

import { useAppStore } from '../../store/useAppStore';
import { captureUserSignedUp, capture } from '../../lib/analytics';
import { showSuccess, showError } from '../../components/Toast/store';
import { supabase } from '../../lib/supabase';
import { db } from '../../lib/db';
import type { Profile } from '../../lib/db';
import { ProgressDots } from '../../components/ProgressDots';
import { hapticSuccess, haptic } from '../../lib/haptics';
import { StickyFooter } from '../../components/StickyFooter';
import { Button } from '../../components/Button';
import AuthDesktopLayout from '../../components/AuthDesktopLayout';
import { Check, Wrench, Zap, HardHat, Hammer, HelpCircle } from 'lucide-react';
import AddToHomeScreen from '../../components/AddToHomeScreen';
import { seedTradeTemplates, seedBeautyTemplates } from '../../lib/seedTemplates';
import { getVerticalFromUrl, type BusinessType } from '../../lib/verticalConfig';
import { captureVerticalSelected } from '../../lib/analytics';
import { seedMessageTemplates } from '../../lib/seedMessageTemplates';
import { seedSampleJob } from '../../lib/seedSampleJob';
import { captureTradeTemplatesSeeded } from '../../lib/analytics';

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('Timeout')), ms)),
  ]);
}

type TradeType = 'plumber' | 'electrician' | 'builder' | 'other';
type PaymentTerms = 'on_completion' | 'deposit' | 'invoice';
type Step = 1 | 2 | 3 | 4;

type BeautySpecialty = 'nail_tech' | 'lash_tech' | 'salon' | 'barber' | 'tattoo' | 'other';

const BEAUTY_SPECIALTIES: Array<{ value: BeautySpecialty; label: string }> = [
  { value: 'nail_tech', label: 'Nail tech' },
  { value: 'lash_tech', label: 'Lash tech' },
  { value: 'salon', label: 'Salon' },
  { value: 'barber', label: 'Barber' },
  { value: 'tattoo', label: 'Tattoo artist' },
  { value: 'other', label: 'Other' },
];

const TRADE_OPTIONS: Array<{ value: TradeType; label: string; icon: React.ReactNode }> = [
  { value: 'plumber', label: 'Plumber', icon: <Wrench size={18} /> },
  { value: 'electrician', label: 'Electrician', icon: <Zap size={18} /> },
  { value: 'builder', label: 'Builder', icon: <HardHat size={18} /> },
  { value: 'other', label: 'Other', icon: <Hammer size={18} /> },
];

const PAYMENT_TERMS: Array<{ value: PaymentTerms; label: string; description: string }> = [
  { value: 'on_completion', label: 'On completion', description: 'Customer pays the full amount once the job is done — in cash, by card, or bank transfer.' },
  { value: 'deposit', label: 'Deposit', description: 'Customer pays a percentage upfront (e.g. 20%) to secure the booking. The rest is collected when the job is finished.' },
  { value: 'invoice', label: 'Invoice', description: 'You send an invoice after the job. The customer pays within agreed terms (usually 7–14 days). The app tracks who has paid and who needs chasing.' },
];

export default function Onboarding() {
  const [step, setStep] = useState<Step>(1);
  const navigate = useNavigate();
  
  const setUserId = useAppStore((s) => s.setUserId);
  const storeUserId = useAppStore((s) => s.userId);
  const [userId, setLocalUserId] = useState<string | null>(null);
  const [email, setEmail] = useState('');

  // Form data
  const [fullName, setFullName] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [trade, setTrade] = useState<TradeType | undefined>();
  const [businessType, setBusinessType] = useState<BusinessType>('trades');
  const [beautySpecialty, setBeautySpecialty] = useState<BeautySpecialty | undefined>();
  const [tradeOther, setTradeOther] = useState('');
  const [calloutCharge, setCalloutCharge] = useState('75');
  const [paymentTerms, setPaymentTerms] = useState<PaymentTerms>('on_completion');
  const [quoteValidDays, setQuoteValidDays] = useState('30');
  const [defaultLabourDesc, setDefaultLabourDesc] = useState('Labour');
  const [defaultLabourCharge, setDefaultLabourCharge] = useState('150');
  const [autoFillDefault, setAutoFillDefault] = useState(true);
  const [showTermsHelp, setShowTermsHelp] = useState(false);

  // Track onboarding step progress
  useEffect(() => {
    capture('onboarding_step_viewed', { step, total_steps: 4 });
  }, [step]);

  // Detect vertical from URL (beauty-landing → beauty)
  useEffect(() => {
    const detected = getVerticalFromUrl();
    if (detected === 'beauty') {
      setBusinessType('beauty');
      captureVerticalSelected({ businessType: 'beauty', source: 'url' });
    }
  }, []);

  // Get user on mount
  useEffect(() => {
    async function fetchUser() {
      try {
        const { data: { user } } = await withTimeout(supabase.auth.getUser(), 5000);
        if (user) {
          setLocalUserId(user.id);
          const emailFromAuth = user.email || user.user_metadata?.email || '';
          setEmail(emailFromAuth);
          return;
        }
      } catch {
        // Supabase not available
      }
    }
    fetchUser();
  }, []);

  const toggleTrade = useCallback((value: TradeType) => {
    setTrade((prev) => (prev === value ? undefined : value));
  }, []);

  const handleWriteProfile = useCallback(async () => {
    let resolvedUserId = userId || storeUserId;
    if (!resolvedUserId) return;

    const now = new Date().toISOString();
    const profile: Profile = {
      id: resolvedUserId,
      full_name: fullName.trim(),
      phone: '',
      business_name: businessName.trim() || undefined,
      trade,
      business_type: businessType,
      specialty: businessType === 'beauty' ? beautySpecialty : trade,
      trade_other: trade === 'other' ? tradeOther.trim() || undefined : undefined,
      callout_charge: parseFloat(calloutCharge) || 75,
      payment_terms: paymentTerms,
      default_labour_description: defaultLabourDesc.trim() || 'Labour',
      default_labour_charge: autoFillDefault ? (parseFloat(defaultLabourCharge) || 0) : 0,
      quote_valid_days: parseInt(quoteValidDays, 10) || 30,
      created_at: now,
      updated_at: now,
      _sync_status: 'pending',
    };

    await db.profiles.put(profile);

    // Try to persist directly to Supabase immediately so the profile survives cross-origin/device reloads.
    // If it fails, the sync queue will retry later.
    if (navigator.onLine) {
      try {
        const { error: upsertError } = await supabase.from('profiles').upsert({
          id: profile.id,
          full_name: profile.full_name,
          phone: profile.phone,
          business_name: profile.business_name,
          trade: profile.trade,
          trade_other: profile.trade_other,
          callout_charge: profile.callout_charge,
          payment_terms: profile.payment_terms,
          default_labour_description: profile.default_labour_description,
          default_labour_charge: profile.default_labour_charge,
          quote_valid_days: profile.quote_valid_days,
          created_at: profile.created_at,
          updated_at: profile.updated_at,
        }, { onConflict: 'id' });
        if (!upsertError) {
          await db.profiles.update(profile.id, { _sync_status: 'synced' });
        }
      } catch (err) {
        console.error('[Onboarding] direct Supabase upsert failed:', err);
      }
    }

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
        trade_other: profile.trade_other,
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
    return resolvedUserId;
  }, [userId, fullName, businessName, trade, tradeOther, calloutCharge, paymentTerms, defaultLabourDesc, defaultLabourCharge, autoFillDefault, quoteValidDays]);

  const nextStep = () => setStep((s) => (s < 4 ? ((s + 1) as Step) : s));
  const skip = () => nextStep();

  const handleContinueS1 = () => {
    if (fullName.trim().length === 0) return;
    nextStep();
  };

  const handleContinueS2 = () => {
    if (businessType === 'trades' && !trade) return;
    if (businessType === 'beauty' && !beautySpecialty) return;
    if (trade === 'other' && tradeOther.trim().length === 0) return;
    nextStep();
  };

  const handleContinueS4 = async () => {
    const resolvedUserId = await handleWriteProfile();
    if (!resolvedUserId) {
      showError('Could not save profile. Please try again.');
      return;
    }
    setUserId(resolvedUserId);
    businessType === 'beauty' ? seedBeautyTemplates(resolvedUserId) : seedTradeTemplates(resolvedUserId, trade || 'other')
      .then((count: number) => { if (count > 0) captureTradeTemplatesSeeded({ trade: trade || 'other', count }); })
      .catch(() => {});
    seedMessageTemplates(resolvedUserId).catch(() => {});
    // Seed a sample job so the user lands on a populated home screen
    const profileData = await db.profiles.get(resolvedUserId);
    seedSampleJob(resolvedUserId, profileData || null, trade || 'other', businessType, beautySpecialty).catch(() => {});
    capture('sample_job_seeded', { trade: trade || 'other', businessType });
    hapticSuccess();
    showSuccess("Profile saved — let's go!");
    captureUserSignedUp(trade, window.location.search);
    navigate('/', { replace: true });
  };

  // Advance on Enter key from anywhere in the onboarding flow
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Enter') return;
      // Let buttons handle their own Enter/click behaviour
      if (e.target instanceof HTMLButtonElement) return;
      // Don't submit inside textareas
      if (e.target instanceof HTMLTextAreaElement) return;

      e.preventDefault();

      if (step === 1 && fullName.trim().length > 0) {
        handleContinueS1();
      } else if (
        step === 2 &&
        trade &&
        (trade !== 'other' || tradeOther.trim().length > 0)
      ) {
        handleContinueS2();
      } else if (step === 3) {
        nextStep();
      } else if (step === 4) {
        handleContinueS4();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [step, fullName, trade, tradeOther, handleContinueS1, handleContinueS2, handleContinueS4, nextStep]);

  const firstName = fullName.trim().split(' ')[0] || 'there';

  return (
    <AuthDesktopLayout variant="onboarding">
      <div className="flex flex-col min-h-[100dvh] w-full md:max-w-xl md:mx-auto">
        <ProgressDots total={4} current={step} />

        {/* ── S1: Welcome ── */}
        {step === 1 && (
          <div className="flex-1 flex flex-col">
            <div className="px-6 pt-8 flex-1">
              <div className="mb-6">
                <h1 className="text-xl font-extrabold text-brand-black">
                  Hi, what's your name?
                </h1>
                <p className="text-md text-brand-muted mt-1">
                  Just you for now. You can add your team later.
                </p>
              </div>

              <div className="flex flex-col gap-6">
                {/* Full name */}
                <div>
                  <label className="text-label font-bold tracking-[0.4px] text-brand-dark mb-1.5 block">
                    Your Name
                  </label>
                  <div
                    className={`flex items-center border-2 rounded-xl min-h-13 overflow-hidden transition-colors ${
                      fullName.trim().length === 0
                        ? 'border-brand-border'
                        : 'border-brand-black'
                    }`}
                  >
                    <input
                      type="text"
                      inputMode="text"
                      placeholder="e.g. Dave Smith"
                      autoCapitalize="words"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      className="flex-1 text-base text-brand-black outline-none min-h-13 px-4 bg-transparent"
                      autoFocus
                    />
                  </div>
                </div>

                {/* Email (read-only, pre-filled from auth) */}
                <div>
                  <label className="text-label font-bold tracking-[0.4px] text-brand-dark mb-1.5 block">
                    Your Email
                  </label>
                  <div className="flex items-center border-2 rounded-xl min-h-13 overflow-hidden bg-brand-surface border-brand-border">
                    <input
                      type="email"
                      value={email || 'Not required in test mode'}
                      readOnly
                      className="flex-1 text-base text-brand-mid min-h-13 px-4 bg-transparent outline-none cursor-not-allowed"
                    />
                  </div>
                </div>
              </div>
            </div>

            <StickyFooter className="px-0">
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
            <div className="px-6 pt-8 flex-1">
              <div className="mb-6">
                <h1 className="text-xl font-extrabold text-brand-black">
                  Tell us about your business
                </h1>
                <p className="text-md text-brand-muted mt-1">
                  This appears on quotes. You can update it any time.
                </p>
              </div>

              <div className="flex flex-col gap-6">
                {/* Business Name */}
                <div>
                  <label className="text-label font-bold tracking-[0.4px] text-brand-dark mb-1.5 block">
                    Business Name <span className="font-normal normal-case tracking-normal text-label ml-1">(optional)</span>
                  </label>
                  <div className="flex items-center border-2 rounded-xl min-h-13 overflow-hidden border-brand-border">
                    <input
                      type="text"
                      inputMode="text"
                      placeholder="Dave's Plumbing & Heating"
                      autoCapitalize="words"
                      value={businessName}
                      onChange={(e) => setBusinessName(e.target.value)}
                      className="flex-1 text-base text-brand-black outline-none min-h-13 px-4 bg-transparent"
                    />
                  </div>
                </div>

                {/* Trade Type / Beauty Specialty — 2×2 grid */}
                <div>
                  <label className="text-label font-bold tracking-[0.4px] text-brand-dark mb-2 block">
                    {businessType === 'beauty' ? 'Specialty' : 'Trade Type'}
                  </label>
                  {businessType === 'beauty' ? (
                    <div className="grid grid-cols-2 gap-2">
                      {BEAUTY_SPECIALTIES.map((opt) => {
                        const isSelected = beautySpecialty === opt.value;
                        return (
                          <button
                            key={opt.value}
                            onClick={() => { setBeautySpecialty(opt.value); haptic('light'); }}
                            className={`h-13 rounded-xl border-2 font-semibold text-sm transition-all cursor-pointer flex items-center justify-center ${
                              isSelected
                                ? 'border-brand-black bg-brand-surface text-brand-black'
                                : 'border-brand-border text-brand-mid'
                            }`}
                          >
                            {opt.label}
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-2">
                      {TRADE_OPTIONS.map((opt) => {
                        const isSelected = trade === opt.value;
                        return (
                          <button
                            key={opt.value}
                            onClick={() => toggleTrade(opt.value)}
                            className={`h-13 rounded-xl border-2 font-semibold text-sm transition-all cursor-pointer flex items-center justify-center gap-2 ${
                              isSelected
                                ? 'border-brand-black bg-brand-surface text-brand-black'
                                : 'border-brand-border text-brand-mid'
                            }`}
                          >
                            <span className={isSelected ? 'text-brand-black' : 'text-brand-muted'}>{opt.icon}</span>
                            {opt.label}
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {trade === 'other' && (
                    <div className="mt-3">
                      <label className="text-label font-bold tracking-[0.4px] text-brand-dark mb-1.5 block">
                        What Trade?
                      </label>
                      <div className="flex items-center border-2 rounded-xl min-h-13 overflow-hidden border-brand-border">
                        <input
                          type="text"
                          inputMode="text"
                          placeholder="e.g. Landscaper, Painter, Roofer"
                          autoCapitalize="words"
                          value={tradeOther}
                          onChange={(e) => setTradeOther(e.target.value)}
                          className="flex-1 text-base text-brand-black outline-none min-h-13 px-4 bg-transparent"
                          autoFocus
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <StickyFooter className="px-0">
              <Button
                variant="primary"
                onClick={handleContinueS2}
                disabled={!trade || (trade === 'other' && tradeOther.trim().length === 0)}
              >
                Continue →
              </Button>
            </StickyFooter>
          </div>
        )}

        {/* ── S3: Defaults ── */}
        {step === 3 && (
          <div className="flex-1 flex flex-col">
            <div className="px-6 pt-8 flex-1">
              <div className="mb-6">
                <h1 className="text-xl font-extrabold text-brand-black">
                  Set your defaults
                </h1>
                <p className="text-md text-brand-muted mt-1">
                  Saves you time on every job. Change any time in Settings.
                </p>
              </div>

              <div className="flex flex-col gap-5">
                {/* Callout Charge */}
                <div>
                  <label className="text-label font-bold tracking-[0.4px] text-brand-dark mb-1.5 block">
                    Callout Charge
                  </label>
                  <div className="flex items-center border-2 rounded-xl min-h-13 overflow-hidden border-brand-border">
                    <span className="text-md text-brand-black px-4 shrink-0">£</span>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={calloutCharge}
                      onChange={(e) => setCalloutCharge(e.target.value.replace(/[^0-9.]/g, ''))}
                      className="flex-1 text-base text-brand-black outline-none min-h-13 bg-transparent pr-4"
                    />
                  </div>
                  <p className="text-sm text-brand-muted mt-1.5 leading-relaxed">
                    A fee you charge when you turn up but can't do the job — e.g. customer isn't home. Most tradespeople charge £50–£100.
                  </p>
                </div>

                {/* Default Labour Charge */}
                <div>
                  <label className="text-label font-bold tracking-[0.4px] text-brand-dark mb-1.5 block">
                    Default Labour Charge
                  </label>
                  <div className="flex items-center border-2 rounded-xl min-h-13 overflow-hidden border-brand-border mb-2">
                    <span className="text-md text-brand-black px-4 shrink-0">£</span>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={defaultLabourCharge}
                      onChange={(e) => setDefaultLabourCharge(e.target.value.replace(/[^0-9.]/g, ''))}
                      className="flex-1 text-base text-brand-black outline-none min-h-13 bg-transparent pr-4"
                    />
                  </div>
                  <div className="flex items-center border-2 rounded-xl min-h-13 overflow-hidden border-brand-border">
                    <input
                      type="text"
                      inputMode="text"
                      value={defaultLabourDesc}
                      onChange={(e) => setDefaultLabourDesc(e.target.value)}
                      placeholder="e.g. Labour, Day rate, Call-out fee"
                      className="flex-1 text-base text-brand-black outline-none min-h-13 bg-transparent px-4"
                    />
                  </div>
                  <p className="text-sm text-brand-mid mt-1.5 leading-relaxed">
                    The label shown next to your labour charge on the quote. Common choices: 'Labour', 'Day rate', 'Call-out fee'.
                  </p>

                  {/* Toggle */}
                  <div className="flex items-center gap-3 mt-3">
                    <button
                      onClick={() => setAutoFillDefault(!autoFillDefault)}
                      className={`relative h-7 w-12 rounded-full transition-colors cursor-pointer ${
                        autoFillDefault ? 'bg-brand-black' : 'bg-brand-border'
                      }`}
                      aria-label={autoFillDefault ? 'Auto-fill enabled' : 'Auto-fill disabled'}
                    >
                      <span
                        className={`absolute top-0.5 left-0.5 h-6 w-6 rounded-full bg-white shadow-sm transition-transform ${
                          autoFillDefault ? 'translate-x-5' : 'translate-x-0'
                        }`}
                      />
                    </button>
                    <span className="text-sm text-brand-mid">
                      Auto-fill on new quotes
                    </span>
                  </div>

                  <p className="text-sm text-brand-muted mt-2 leading-relaxed">
                    {autoFillDefault
                      ? "Automatically adds this labour charge to every new quote so you don't type it each time. Edit or remove it per quote."
                      : "You'll start each quote with a blank items list. You can still add saved items from your library."}
                  </p>
                </div>

                {/* Payment terms — radio cards with descriptions */}
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <label className="text-label font-bold tracking-[0.4px] text-brand-dark">
                      Default Payment Terms
                    </label>
                    <button
                      onClick={() => setShowTermsHelp(!showTermsHelp)}
                      className="w-5 h-5 rounded-full bg-brand-borderLight flex items-center justify-center text-brand-mid"
                      aria-label="What are payment terms?"
                    >
                      <HelpCircle size={12} />
                    </button>
                  </div>

                  {showTermsHelp && (
                    <div className="bg-brand-surface rounded-lg p-3 mb-2 border border-brand-border">
                      <p className="text-sm text-sky-700 leading-relaxed">
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
                          className={`flex flex-col gap-0.5 min-h-13 rounded-xl border-2 px-4 py-2.5 transition-all cursor-pointer text-left ${
                            isSelected
                              ? 'border-brand-black bg-brand-surface'
                              : 'border-brand-border bg-white'
                          }`}
                        >
                          <span className={`font-semibold text-sm ${isSelected ? 'text-brand-black' : 'text-brand-mid'}`}>
                            {opt.label}
                          </span>
                          <span className={`text-sm leading-relaxed ${isSelected ? 'text-brand-black' : 'text-brand-muted'}`}>
                            {opt.description}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Quote Valid For */}
                <div>
                  <label className="text-label font-bold tracking-[0.4px] text-brand-dark mb-1.5 block">
                    Quote Valid For
                  </label>
                  <div className="flex items-center border-2 rounded-xl min-h-13 overflow-hidden border-brand-border">
                    <input
                      type="text"
                      inputMode="numeric"
                      value={quoteValidDays}
                      onChange={(e) => setQuoteValidDays(e.target.value.replace(/\D/g, ''))}
                      className="flex-1 text-md font-semibold text-brand-black outline-none min-h-13 px-4 bg-transparent"
                    />
                    <span className="text-md text-brand-mid pr-4 shrink-0">days</span>
                  </div>
                  <p className="text-sm text-brand-muted mt-1.5 leading-relaxed">
                    After this many days, the quote is automatically marked as expired. The customer sees it's no longer valid. Most tradespeople use 30 days.
                  </p>
                </div>
              </div>
            </div>

            <StickyFooter className="px-0">
              <Button variant="primary" onClick={nextStep}>
                Continue →
              </Button>
              <Button variant="ghost" onClick={skip}>
                Skip — I'll set this up later
              </Button>
            </StickyFooter>
          </div>
        )}

        {/* ── S4: Done ── */}
        {step === 4 && (
          <div className="flex-1 flex flex-col">
            <div className="px-6 pt-8 flex-1 flex flex-col items-center justify-center gap-4">
              <div className="w-20 h-20 rounded-full bg-status-greenBg flex items-center justify-center">
                <Check size={36} strokeWidth={2.5} className="text-status-green" />
              </div>
              <div className="text-center">
                <h1 className="text-xl font-extrabold text-brand-black">
                  You're all set, {firstName}
                </h1>
                <p className="text-md text-brand-mid mt-2">
                  Log a missed call or create your first quote to get started.
                </p>
                <p className="text-md text-brand-mid mt-1">
                  Your jobs will appear on the home screen as soon as they're booked.
                </p>
              </div>
            </div>

            <div className="px-6 w-full">
              <AddToHomeScreen />
            </div>

            <StickyFooter className="px-0">
              <Button variant="primary" onClick={handleContinueS4} fullWidth>
                Go to home →
              </Button>
            </StickyFooter>
          </div>
        )}
      </div>
    </AuthDesktopLayout>
  );
}
