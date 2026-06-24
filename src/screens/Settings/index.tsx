import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, ChevronRight, ExternalLink, HelpCircle, MessageSquare, Moon, Sun } from 'lucide-react';
import { db, type Profile } from '../../lib/db';
import { useAppStore } from '../../store/useAppStore';
import { useTheme } from '../../hooks/useTheme';
import { supabase } from '../../lib/supabase';
import { BottomSheet, SheetRow } from '../../components/BottomSheet';
import { InlineEditRow } from '../../components/InlineEditRow';
import SyncIndicator from '../../components/SyncIndicator';
import AddToHomeScreen from '../../components/AddToHomeScreen';
import BrandedLoader from '../../components/BrandedLoader';
import FeedbackSheet from '../../components/FeedbackSheet';

const TRADE_OPTIONS: Array<{ value: Profile['trade']; label: string }> = [
  { value: 'plumber', label: 'Plumber' },
  { value: 'electrician', label: 'Electrician' },
  { value: 'builder', label: 'Builder' },
  { value: 'other', label: 'Other' },
];

const PAYMENT_OPTIONS: Array<{ value: string; label: string; description: string }> = [
  { value: 'on_completion', label: 'On completion', description: 'Customer pays after the job is finished' },
  { value: 'deposit', label: 'Deposit', description: 'Ask for a deposit upfront, then balance on completion' },
  { value: 'invoice', label: 'Invoice', description: 'Send an invoice after the job is done' },
];

function normalizeUKPhone(value: string): string {
  const cleaned = value.replace(/[\s-]/g, '').replace(/^\+/, '');
  if (/^0?7\d{9}$/.test(cleaned)) {
    return '+44' + cleaned.replace(/^0/, '');
  }
  if (/^447\d{9}$/.test(cleaned)) {
    return '+' + cleaned;
  }
  return value;
}

function validateUKPhone(value: string): string | null {
  const cleaned = value.replace(/[\s-]/g, '').replace(/^\+/, '');
  if (/^(0?7\d{9}|447\d{9})$/.test(cleaned)) {
    return null;
  }
  return 'Enter a valid UK mobile number';
}

function now() {
  return new Date().toISOString();
}

export default function Settings() {
  const userId = useAppStore((s) => s.userId);
  const navigate = useNavigate();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [editingField, setEditingField] = useState<string | null>(null);
  const [tradeSheetOpen, setTradeSheetOpen] = useState(false);
  const [tradeOtherMode, setTradeOtherMode] = useState(false);
  const [tradeOtherInput, setTradeOtherInput] = useState('');
  const [paymentSheetOpen, setPaymentSheetOpen] = useState(false);
  const [nudgeDismissed] = useState(false);
  const [showTermsHelp, setShowTermsHelp] = useState(false);
  const [feedbackSheetOpen, setFeedbackSheetOpen] = useState(false);
  const { isDark, toggle } = useTheme();
  
  // Detect active quote draft for quick resume
  const [draftInfo, setDraftInfo] = useState<{ customerName: string; step: string; jobId: string } | null>(null);
  const [customItemCount, setCustomItemCount] = useState(0);


  useEffect(() => {
    if (!userId) return;
    db.profiles.get(userId).then((p) => {
      setProfile(p || null);
      setLoading(false);
    });
    db.custom_items.where('user_id').equals(userId).count().then(setCustomItemCount);
  }, [userId]);
  
  // Check for active quote draft in localStorage (always check, not just when redirected)
  useEffect(() => {
    const saved = localStorage.getItem('buildlogg_quote_state');
    if (!saved) return;
    try {
      const parsed = JSON.parse(saved);
      const TTL = 24 * 60 * 60 * 1000; // 24 hours
      if (!parsed.timestamp || Date.now() - parsed.timestamp > TTL) return;
      if (!parsed.jobId || parsed.step === 'sent' || parsed.step === 'missed_call') return;
      
      // Look up customer name from the job's customer
      db.jobs.get(parsed.jobId).then((job) => {
        if (!job) return;
        db.customers.get(job.customer_id).then((customer) => {
          if (customer) {
            setDraftInfo({
              customerName: customer.name,
              step: parsed.step,
              jobId: parsed.jobId,
            });
          }
        });
      });
    } catch {
      // ignore parse errors
    }
  }, []);

  const saveField = useCallback(
    async (field: keyof Profile, value: string | number) => {
      if (!userId || !profile) return;
      const n = now();
      const update: Partial<Profile> = { [field]: value, updated_at: n, _sync_status: 'pending' } as Partial<Profile>;
      await db.profiles.update(userId, update);
      await db.sync_queue.add({
        operation: 'update',
        table_name: 'profiles',
        record_id: userId,
        payload: { [field]: value, updated_at: n },
        created_at: n,
        retry_count: 0,
      });
      setProfile((prev) => (prev ? { ...prev, ...update } : prev));
    },
    [userId, profile]
  );

  const handleLogout = async () => {
    const confirmed = window.confirm('Are you sure? You\'ll need to sign in again.');
    if (!confirmed) return;

    // Clear local auth markers
    localStorage.removeItem('buildlogg_mock_user');
    useAppStore.getState().setUserId(null);

    // Tear down session + DB (fire-and-forget to prevent hang blocking reload)
    supabase.auth.signOut().catch(() => {});
    db.delete().catch(() => {});

    // Navigate to the in-app login page and reload — prevents blank-screen race
    navigate('/auth', { replace: true });
    window.location.reload();
  };

  const fullName = profile?.full_name || '';
  const businessName = profile?.business_name || '';
  const phone = profile?.phone || '';
  const trade = profile?.trade || null;
  const paymentTerms = profile?.payment_terms || 'on_completion';
  const quoteValidDays = profile?.quote_valid_days ?? 30;
  const calloutCharge = profile?.callout_charge ?? 75;

  const showNudge = !nudgeDismissed && !businessName.trim();
  const businessNameEmpty = !businessName.trim();

  if (loading) {
    return <BrandedLoader fullscreen />;
  }

  return (
    <div className="bg-[var(--app-shell-bg)] flex flex-col min-h-[100dvh]">
      {/* Header */}
      <div className="sticky top-0 z-40 px-4 pt-4 pb-3 bg-[var(--app-shell-bg)] border-b border-brand-borderLight">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-extrabold text-brand-black">Settings</h1>
          <SyncIndicator />
        </div>
      </div>

      {/* Body */}
      <div className="px-4 md:px-6 pt-4 md:pt-6 pb-[calc(44px + env(safe-area-inset-bottom))]">
        {/* Resume draft banner */}
        {draftInfo && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4 flex items-start gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-amber-800">
                Draft quote for {draftInfo.customerName}
              </p>
              <p className="text-sm text-amber-700 mt-0.5">
                {draftInfo.step === 'builder'
                  ? 'In progress — add items or preview'
                  : draftInfo.step === 'preview'
                  ? 'Ready to send'
                  : 'Continue where you left off'}
              </p>
            </div>
            <button
              onClick={() => {
                localStorage.removeItem('buildlogg_redirected_from_quote');
                navigate(`/quote?step=${draftInfo.step}&jobId=${draftInfo.jobId}`);
              }}
              className="shrink-0 h-9 px-3 bg-amber-700 text-white text-sm font-semibold rounded-lg active:opacity-80 transition-opacity"
            >
              Resume →
            </button>
          </div>
        )}

        {/* Add to Home Screen — dismissible inline banner */}
        <AddToHomeScreen banner />

        {/* Nudge banner */}
        {showNudge && (
          <div className="bg-status-redBg border border-red-200 rounded-lg p-3 mb-4 flex items-start gap-2.5">
            <AlertTriangle size={16} className="text-status-red flex-shrink-0 mt-0.5" />
            <div className="text-sm text-brand-dark leading-relaxed">
              <strong className="text-status-red">Add your business name</strong> — it appears on every quote you send. Tap Business name below to add it.
            </div>
          </div>
        )}

        {/* Business profile */}
        <div className="mb-6">
          <div className="text-micro font-bold tracking-[0.7px] text-brand-mid mb-2 px-0.5">
            Business profile
          </div>
          <div className="bg-white border border-brand-border rounded-xl overflow-hidden">
            <div className="px-4">
              <InlineEditRow
                label="Your name"
                value={fullName}
                onSave={(v) => saveField('full_name', v)}
                isEditing={editingField === 'full_name'}
                onEditStart={() => setEditingField('full_name')}
                onEditEnd={() => setEditingField(null)}
                placeholder="Your name"
              />
            </div>
            <div className={`px-4 ${businessNameEmpty ? 'bg-red-50' : ''}`}>
              <div
                className={`min-h-13 flex items-center justify-between border-b border-brand-borderLight ${
                  businessNameEmpty ? 'border-red-200' : ''
                }`}
                onClick={() => {
                  if (editingField !== 'business_name') setEditingField('business_name');
                }}
              >
                <span className={`text-sm font-medium ${businessNameEmpty ? 'text-status-red' : 'text-brand-dark'}`}>
                  Business name
                </span>
                <div className="flex items-center gap-2">
                  {editingField === 'business_name' ? (
                    <>
                      <input
                        autoFocus
                        type="text"
                        defaultValue={businessName}
                        placeholder="Enter business name"
                        className="text-base text-brand-black text-right min-w-[120px] bg-transparent border-none outline-none p-0"
                        onBlur={(e) => {
                          saveField('business_name', e.target.value);
                          setEditingField(null);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            saveField('business_name', (e.target as HTMLInputElement).value);
                            setEditingField(null);
                          }
                        }}
                      />
                      <button
                        onClick={() => setEditingField(null)}
                        className="text-sm font-semibold text-brand-black underline underline-offset-2"
                      >
                        Done
                      </button>
                    </>
                  ) : (
                    <>
                      <span className={`text-base font-medium ${businessNameEmpty ? 'text-status-error italic' : 'text-brand-black'}`}>
                        {businessNameEmpty ? 'Tap to add ›' : businessName}
                      </span>
                      <ChevronRight size={14} className="text-brand-muted" />
                    </>
                  )}
                </div>
              </div>
            </div>
            <div className="px-4">
              <InlineEditRow
                label="Phone"
                value={phone}
                onSave={(v) => saveField('phone', normalizeUKPhone(v))}
                isEditing={editingField === 'phone'}
                onEditStart={() => setEditingField('phone')}
                onEditEnd={() => setEditingField(null)}
                inputType="tel"
                inputMode="tel"
                placeholder="Phone number"
                validate={validateUKPhone}
              />
            </div>
            <div
              className="px-4 min-h-13 flex items-center justify-between cursor-pointer"
              onClick={() => setTradeSheetOpen(true)}
            >
              <span className="text-sm font-medium text-brand-dark">Trade</span>
              <div className="flex items-center gap-2">
                <span className="text-base font-medium text-brand-black">
                  {trade
                    ? trade === 'other' && profile?.trade_other
                      ? profile.trade_other
                      : TRADE_OPTIONS.find((t) => t.value === trade)?.label || trade
                    : '—'}
                </span>
                <ChevronRight size={14} className="text-brand-muted" />
              </div>
            </div>
          </div>
        </div>

        {/* My Items */}
        <div className="mb-6">
          <div className="text-micro font-bold tracking-[0.7px] text-brand-mid mb-2 px-0.5">
            My items
          </div>
          <div className="bg-white border border-brand-border rounded-xl overflow-hidden">
            <div
              className="px-4 min-h-13 flex items-center justify-between cursor-pointer active:bg-brand-borderLight/50 transition-colors"
              onClick={() => navigate('/settings/custom-items')}
            >
              <span className="text-sm font-medium text-brand-dark">Saved items</span>
              <div className="flex items-center gap-2">
                <span className="text-base font-medium text-brand-black">
                  {customItemCount} saved
                </span>
                <ChevronRight size={14} className="text-brand-muted" />
              </div>
            </div>
            <div
              className="px-4 min-h-13 flex items-center justify-between cursor-pointer active:bg-brand-borderLight/50 transition-colors border-t border-brand-surface"
              onClick={() => navigate('/settings/message-templates')}
            >
              <span className="text-sm font-medium text-brand-dark">Message templates</span>
              <ChevronRight size={14} className="text-brand-muted" />
            </div>
          </div>
        </div>

        {/* Quote defaults */}
        <div className="mb-6">
          <div className="text-micro font-bold tracking-[0.7px] text-brand-mid mb-2 px-0.5">
            Quote defaults
          </div>
          <div className="bg-white border border-brand-border rounded-xl overflow-hidden">
            <div
              className="px-4 min-h-13 flex items-center justify-between border-b border-brand-borderLight cursor-pointer"
              onClick={() => setPaymentSheetOpen(true)}
            >
              <span className="text-sm font-medium text-brand-dark">Payment terms</span>
              <div className="flex items-center gap-2">
                <span className="text-base font-medium text-brand-black">
                  {PAYMENT_OPTIONS.find((p) => p.value === paymentTerms)?.label || paymentTerms}
                </span>
                <ChevronRight size={14} className="text-brand-muted" />
              </div>
            </div>
            <div className="px-4">
              <InlineEditRow
                label="Valid for"
                value={String(quoteValidDays)}
                onSave={(v) => {
                  const cleaned = v.replace(/days?/i, '').trim();
                  const num = parseInt(cleaned, 10);
                  if (!isNaN(num) && num > 0) saveField('quote_valid_days', num);
                }}
                isEditing={editingField === 'quote_valid_days'}
                onEditStart={() => setEditingField('quote_valid_days')}
                onEditEnd={() => setEditingField(null)}
                inputType="number"
                inputMode="numeric"
                placeholder="30"
                suffix="days"
              />
            </div>
          </div>
        </div>

        {/* Job defaults */}
        <div className="mb-6">
          <div className="text-micro font-bold tracking-[0.7px] text-brand-mid mb-2 px-0.5">
            Job defaults
          </div>
          <div className="bg-white border border-brand-border rounded-xl overflow-hidden">
            <div className="px-4">
              <InlineEditRow
                label="Callout charge"
                value={String(calloutCharge)}
                onSave={(v) => {
                  const num = parseFloat(v.trim());
                  if (!isNaN(num) && num >= 0) saveField('callout_charge', num);
                }}
                isEditing={editingField === 'callout_charge'}
                onEditStart={() => setEditingField('callout_charge')}
                onEditEnd={() => setEditingField(null)}
                inputType="number"
                inputMode="decimal"
                placeholder="75"
                prefix="£"
              />
            </div>
          </div>
        </div>

        {/* Appearance */}
        <div className="mb-6">
          <div className="text-micro font-bold tracking-[0.7px] text-brand-mid mb-2 px-0.5">
            Appearance
          </div>
          <div className="bg-white border border-brand-border rounded-xl overflow-hidden">
            <div
              className="min-h-13 flex items-center justify-between px-4 cursor-pointer"
              onClick={toggle}
            >
              <div className="flex items-center gap-2">
                {isDark ? (
                  <Moon size={16} className="text-brand-mid" />
                ) : (
                  <Sun size={16} className="text-brand-mid" />
                )}
                <span className="text-sm font-medium text-brand-dark">Dark mode</span>
              </div>
              <div
                className="relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200"
                style={{ backgroundColor: isDark ? 'var(--brand-black)' : 'var(--brand-border)' }}
              >
                <div
                  className={`inline-flex h-4 w-4 transform rounded-full bg-white shadow transition-transform duration-200 ${
                    isDark ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </div>
            </div>
          </div>
        </div>

        {/* About */}
        <div className="mb-6">
          <div className="text-micro font-bold tracking-[0.7px] text-brand-mid mb-2 px-0.5">
            About
          </div>
          <div className="bg-white border border-brand-border rounded-xl overflow-hidden">
            <div className="min-h-13 flex items-center justify-between px-4 border-b border-brand-surface">
              <span className="text-sm text-brand-dark">Version</span>
              <span className="text-sm text-brand-muted">1.0.0</span>
            </div>
            <div
              className="min-h-13 flex items-center justify-between px-4 border-b border-brand-surface cursor-pointer"
              onClick={() => window.open('https://buildlogg.com/privacy', '_blank')}
            >
              <span className="text-sm text-brand-dark">Privacy policy</span>
              <div className="flex items-center gap-2">
                <ExternalLink size={14} className="text-brand-muted" />
              </div>
            </div>
            <div
              className="min-h-13 flex items-center justify-between px-4 border-b border-brand-surface cursor-pointer"
              onClick={() => window.open('https://buildlogg.com/terms', '_blank')}
            >
              <span className="text-sm text-brand-dark">Terms of service</span>
              <div className="flex items-center gap-2">
                <ExternalLink size={14} className="text-brand-muted" />
              </div>
            </div>
            <div
              className="min-h-13 flex items-center justify-between px-4 border-b border-brand-surface cursor-pointer"
              onClick={() => setFeedbackSheetOpen(true)}
            >
              <div className="flex items-center gap-2">
                <MessageSquare size={16} className="text-brand-mid" />
                <span className="text-sm text-brand-dark">Send feedback</span>
              </div>
              <ChevronRight size={14} className="text-brand-muted" />
            </div>
            <div
              className="min-h-13 flex items-center justify-between px-4 cursor-pointer"
              onClick={handleLogout}
            >
              <span className="text-sm text-status-error">Log out</span>
            </div>
          </div>
        </div>
      </div>

      {/* Trade BottomSheet */}
      <BottomSheet isOpen={tradeSheetOpen} onClose={() => { setTradeSheetOpen(false); setTradeOtherMode(false); setTradeOtherInput(''); }} title="Select trade">
        <div className="flex flex-col">
          {TRADE_OPTIONS.map((opt, idx) => (
            <SheetRow
              key={opt.value}
              label={opt.label}
              onTap={() => {
                if (opt.value === 'other') {
                  setTradeOtherMode(true);
                  setTradeOtherInput(profile?.trade_other || '');
                } else {
                  saveField('trade', opt.value!);
                  setTradeSheetOpen(false);
                }
              }}
              isLast={idx === TRADE_OPTIONS.length - 1}
            />
          ))}
          {tradeOtherMode && (
            <div className="mt-4 pt-4 border-t border-brand-borderLight">
              <label className="text-micro font-bold tracking-[0.7px] text-brand-mid mb-2 block">
                Your trade
              </label>
              <input
                type="text"
                value={tradeOtherInput}
                onChange={(e) => setTradeOtherInput(e.target.value)}
                placeholder="Your trade, e.g. Roofer"
                className="w-full h-12 px-4 text-base font-medium text-brand-black border border-brand-border rounded-xl outline-none focus:border-brand-black bg-white"
                autoFocus
              />
              <button
                onClick={() => {
                  if (tradeOtherInput.trim()) {
                    saveField('trade', 'other');
                    saveField('trade_other', tradeOtherInput.trim());
                  }
                  setTradeSheetOpen(false);
                  setTradeOtherMode(false);
                  setTradeOtherInput('');
                }}
                className="mt-3 w-full h-13 bg-brand-black text-brand-surface rounded-xl text-base font-semibold cursor-pointer"
              >
                Done
              </button>
            </div>
          )}
        </div>
      </BottomSheet>

      {/* Payment terms BottomSheet */}
      <BottomSheet
        isOpen={paymentSheetOpen}
        onClose={() => setPaymentSheetOpen(false)}
        title="Payment terms"
        subtitle="Default for new quotes"
      >
        <div className="py-3 flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowTermsHelp(!showTermsHelp)}
              className="w-5 h-5 rounded-full bg-brand-borderLight flex items-center justify-center text-brand-mid"
              aria-label="What are payment terms?"
            >
              <HelpCircle size={12} />
            </button>
            <span className="text-sm text-brand-muted">What are payment terms?</span>
          </div>

          {showTermsHelp && (
            <div className="bg-sky-50 rounded-lg p-3 border border-sky-200">
              <p className="text-sm text-sky-700 leading-relaxed">
                This is the default way you ask to be paid. It appears on every quote you send. You can change it for any individual job.
              </p>
            </div>
          )}

          {PAYMENT_OPTIONS.map((opt) => {
            const isSelected = paymentTerms === opt.value;
            return (
              <button
                key={opt.value}
                onClick={() => { saveField('payment_terms', opt.value); setPaymentSheetOpen(false); }}
                className={`flex flex-col gap-0.5 min-h-13 rounded-xl border-2 px-4 py-2.5 transition-all cursor-pointer text-left ${
                  isSelected ? 'border-brand-black bg-brand-surface' : 'border-brand-border bg-white'
                }`}
              >
                <span className={`font-semibold text-sm ${isSelected ? 'text-brand-black' : 'text-brand-mid'}`}>{opt.label}</span>
                <span className={`text-sm leading-relaxed ${isSelected ? 'text-brand-black' : 'text-brand-muted'}`}>{opt.description}</span>
              </button>
            );
          })}
        </div>
      </BottomSheet>

      {/* Feedback sheet */}
      <FeedbackSheet isOpen={feedbackSheetOpen} onClose={() => setFeedbackSheetOpen(false)} />
    </div>
  );
}
