import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, ChevronRight, ExternalLink } from 'lucide-react';
import { db, type Profile } from '../../lib/db';
import { useAppStore } from '../../store/useAppStore';
import { supabase } from '../../lib/supabase';
import { BottomSheet, SheetRow } from '../../components/BottomSheet';
import { SegmentedControl } from '../../components/SegmentedControl';
import { TabBar } from '../../components/TabBar';
import { InlineEditRow } from '../../components/InlineEditRow';
import SyncIndicator from '../../components/SyncIndicator';

const TRADE_OPTIONS: Array<{ value: Profile['trade']; label: string }> = [
  { value: 'plumber', label: 'Plumber' },
  { value: 'electrician', label: 'Electrician' },
  { value: 'builder', label: 'Builder' },
  { value: 'other', label: 'Other' },
];

const PAYMENT_OPTIONS = [
  { value: 'on_completion', label: 'On completion' },
  { value: 'deposit', label: 'Deposit' },
  { value: 'invoice', label: 'Invoice' },
];

function validateUKPhone(value: string): string | null {
  // Normalize: remove spaces, dashes, and leading +
  const cleaned = value.replace(/[\s-]/g, '').replace(/^\+/, '');
  // UK mobile: 44 7... or 07... (11 digits total after normalization)
  const ukMobile = /^44?7\d{9}$/;
  if (!ukMobile.test(cleaned)) {
    return 'Enter a valid UK mobile number';
  }
  return null;
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

  useEffect(() => {
    if (!userId) return;
    db.profiles.get(userId).then((p) => {
      setProfile(p || null);
      setLoading(false);
    });
  }, [userId]);

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
    await supabase.auth.signOut();
    localStorage.removeItem('tradepad_mock_user');
    useAppStore.getState().setUserId(null);
    await db.delete();
    navigate('/auth', { replace: true });
  };

  const handleNavigate = (tab: 'home' | 'jobs' | 'settings') => {
    if (tab === 'settings') return;
    navigate(tab === 'home' ? '/' : '/jobs');
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
    return (
      <div className="flex flex-col min-h-[100svh] bg-brand-surface">
        <div className="flex-1 flex items-center justify-center">
          <div className="text-sm text-brand-muted">Loading…</div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-[100svh] bg-brand-surface">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 bg-white border-b border-brand-borderLight flex-shrink-0">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-extrabold text-brand-black">Settings</h1>
          <SyncIndicator />
        </div>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto px-4 pt-4 pb-4 min-h-0">
        {/* Nudge banner */}
        {showNudge && (
          <div className="bg-status-redBg border border-red-200 rounded-lg p-3 mb-4 flex items-start gap-2.5">
            <AlertTriangle size={16} className="text-status-red flex-shrink-0 mt-0.5" />
            <div className="text-xs text-brand-dark leading-relaxed">
              <strong className="text-status-red">Add your business name</strong> — it appears on every quote you send. Tap Business name below to add it.
            </div>
          </div>
        )}

        {/* Business profile */}
        <div className="mb-6">
          <div className="text-micro font-bold uppercase tracking-[0.7px] text-brand-muted mb-2 px-0.5">
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
                        className="text-xs font-semibold text-brand-black underline underline-offset-2"
                      >
                        Done
                      </button>
                    </>
                  ) : (
                    <>
                      <span className={`text-sm font-medium ${businessNameEmpty ? 'text-status-error italic' : 'text-brand-black'}`}>
                        {businessNameEmpty ? 'Tap to add ›' : businessName}
                      </span>
                      <ChevronRight size={14} className="text-gray-300" />
                    </>
                  )}
                </div>
              </div>
            </div>
            <div className="px-4">
              <InlineEditRow
                label="Phone"
                value={phone}
                onSave={(v) => saveField('phone', v)}
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
                <span className="text-sm font-medium text-brand-black">
                  {trade
                    ? trade === 'other' && profile?.trade_other
                      ? profile.trade_other
                      : TRADE_OPTIONS.find((t) => t.value === trade)?.label || trade
                    : '—'}
                </span>
                <ChevronRight size={14} className="text-gray-300" />
              </div>
            </div>
          </div>
        </div>

        {/* Quote defaults */}
        <div className="mb-6">
          <div className="text-micro font-bold uppercase tracking-[0.7px] text-brand-muted mb-2 px-0.5">
            Quote defaults
          </div>
          <div className="bg-white border border-brand-border rounded-xl overflow-hidden">
            <div
              className="px-4 min-h-13 flex items-center justify-between border-b border-brand-borderLight cursor-pointer"
              onClick={() => setPaymentSheetOpen(true)}
            >
              <span className="text-sm font-medium text-brand-dark">Payment terms</span>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-brand-black">
                  {PAYMENT_OPTIONS.find((p) => p.value === paymentTerms)?.label || paymentTerms}
                </span>
                <ChevronRight size={14} className="text-gray-300" />
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
          <div className="text-micro font-bold uppercase tracking-[0.7px] text-brand-muted mb-2 px-0.5">
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

        {/* About */}
        <div className="mb-6">
          <div className="text-micro font-bold uppercase tracking-[0.7px] text-brand-muted mb-2 px-0.5">
            About
          </div>
          <div className="bg-white border border-brand-border rounded-xl overflow-hidden">
            <div className="min-h-13 flex items-center justify-between px-4 border-b border-brand-surface">
              <span className="text-sm text-brand-dark">Version</span>
              <span className="text-sm text-brand-muted">1.0.0</span>
            </div>
            <div
              className="min-h-13 flex items-center justify-between px-4 border-b border-brand-surface cursor-pointer"
              onClick={() => window.open('https://tradepad.app/privacy', '_blank')}
            >
              <span className="text-sm text-brand-dark">Privacy policy</span>
              <div className="flex items-center gap-2">
                <ExternalLink size={14} className="text-gray-300" />
              </div>
            </div>
            <div
              className="min-h-13 flex items-center justify-between px-4 border-b border-brand-surface cursor-pointer"
              onClick={() => window.open('https://tradepad.app/terms', '_blank')}
            >
              <span className="text-sm text-brand-dark">Terms of service</span>
              <div className="flex items-center gap-2">
                <ExternalLink size={14} className="text-gray-300" />
              </div>
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
              <label className="text-micro font-bold uppercase tracking-[0.7px] text-brand-muted mb-2 block">
                Your trade
              </label>
              <input
                type="text"
                value={tradeOtherInput}
                onChange={(e) => setTradeOtherInput(e.target.value)}
                placeholder="e.g. Roofer, Tiler, Glazier"
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
                className="mt-3 w-full h-13 bg-brand-black text-white rounded-xl text-base font-semibold cursor-pointer"
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
        <div className="py-3">
          <SegmentedControl
            options={PAYMENT_OPTIONS}
            value={paymentTerms}
            onChange={(val) => {
              saveField('payment_terms', val);
              setPaymentSheetOpen(false);
            }}
          />
        </div>
      </BottomSheet>

      {/* Footer spacer — matches Jobs/Home so content clears the TabBar */}
      <div className="shrink-0 pb-[env(safe-area-inset-bottom)]">
        <div className="h-3" />
      </div>

      {/* Tab bar */}
      <TabBar activeTab="settings" onNavigate={handleNavigate} />
    </div>
  );
}
