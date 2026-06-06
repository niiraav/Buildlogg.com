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
      <div className="flex flex-col min-h-[100svh] bg-[#F9FAFB]">
        <div className="flex-1 flex items-center justify-center">
          <div className="text-[14px] text-[#9CA3AF]">Loading…</div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-[100svh] bg-[#F9FAFB]">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 bg-white border-b border-[#F3F4F6] flex-shrink-0">
        <div className="flex items-center justify-between">
          <h1 className="text-[26px] font-extrabold text-[#111827]">Settings</h1>
          <SyncIndicator />
        </div>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto px-4 pt-4 pb-4 min-h-0">
        {/* Nudge banner */}
        {showNudge && (
          <div className="bg-[#FEF2F2] border border-[#FECACA] rounded-[10px] p-3 mb-4 flex items-start gap-2.5">
            <AlertTriangle size={16} className="text-[#DC2626] flex-shrink-0 mt-0.5" />
            <div className="text-[13px] text-[#374151] leading-relaxed">
              <strong className="text-[#DC2626]">Add your business name</strong> — it appears on every quote you send. Tap Business name below to add it.
            </div>
          </div>
        )}

        {/* Business profile */}
        <div className="mb-6">
          <div className="text-[10px] font-bold uppercase tracking-[0.7px] text-[#9CA3AF] mb-2 px-0.5">
            Business profile
          </div>
          <div className="bg-white border border-[#E5E7EB] rounded-xl overflow-hidden">
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
            <div className={`px-4 ${businessNameEmpty ? 'bg-[#FFF5F5]' : ''}`}>
              <div
                className={`min-h-[52px] flex items-center justify-between border-b border-[#F3F4F6] ${
                  businessNameEmpty ? 'border-[#FECACA]' : ''
                }`}
                onClick={() => {
                  if (editingField !== 'business_name') setEditingField('business_name');
                }}
              >
                <span className={`text-sm font-medium ${businessNameEmpty ? 'text-[#DC2626]' : 'text-[#374151]'}`}>
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
                        className="text-base text-[#111827] text-right min-w-[120px] bg-transparent border-none outline-none p-0"
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
                        className="text-[13px] font-semibold text-[#111827] underline underline-offset-2"
                      >
                        Done
                      </button>
                    </>
                  ) : (
                    <>
                      <span className={`text-sm font-medium ${businessNameEmpty ? 'text-[#EF4444] italic' : 'text-[#111827]'}`}>
                        {businessNameEmpty ? 'Tap to add ›' : businessName}
                      </span>
                      <ChevronRight size={14} className="text-[#D1D5DB]" />
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
              className="px-4 min-h-[52px] flex items-center justify-between cursor-pointer"
              onClick={() => setTradeSheetOpen(true)}
            >
              <span className="text-sm font-medium text-[#374151]">Trade</span>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-[#111827]">
                  {trade
                    ? trade === 'other' && profile?.trade_other
                      ? profile.trade_other
                      : TRADE_OPTIONS.find((t) => t.value === trade)?.label || trade
                    : '—'}
                </span>
                <ChevronRight size={14} className="text-[#D1D5DB]" />
              </div>
            </div>
          </div>
        </div>

        {/* Quote defaults */}
        <div className="mb-6">
          <div className="text-[10px] font-bold uppercase tracking-[0.7px] text-[#9CA3AF] mb-2 px-0.5">
            Quote defaults
          </div>
          <div className="bg-white border border-[#E5E7EB] rounded-xl overflow-hidden">
            <div
              className="px-4 min-h-[52px] flex items-center justify-between border-b border-[#F3F4F6] cursor-pointer"
              onClick={() => setPaymentSheetOpen(true)}
            >
              <span className="text-sm font-medium text-[#374151]">Payment terms</span>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-[#111827]">
                  {PAYMENT_OPTIONS.find((p) => p.value === paymentTerms)?.label || paymentTerms}
                </span>
                <ChevronRight size={14} className="text-[#D1D5DB]" />
              </div>
            </div>
            <div className="px-4">
              <InlineEditRow
                label="Valid for"
                value={String(quoteValidDays)}
                onSave={(v) => {
                  const num = parseInt(v, 10);
                  if (!isNaN(num) && num > 0) saveField('quote_valid_days', num);
                }}
                isEditing={editingField === 'quote_valid_days'}
                onEditStart={() => setEditingField('quote_valid_days')}
                onEditEnd={() => setEditingField(null)}
                inputType="number"
                inputMode="numeric"
                placeholder="30"
              />
            </div>
          </div>
        </div>

        {/* Job defaults */}
        <div className="mb-6">
          <div className="text-[10px] font-bold uppercase tracking-[0.7px] text-[#9CA3AF] mb-2 px-0.5">
            Job defaults
          </div>
          <div className="bg-white border border-[#E5E7EB] rounded-xl overflow-hidden">
            <div className="px-4">
              <InlineEditRow
                label="Callout charge"
                value={String(calloutCharge)}
                onSave={(v) => {
                  const num = parseFloat(v);
                  if (!isNaN(num) && num >= 0) saveField('callout_charge', num);
                }}
                isEditing={editingField === 'callout_charge'}
                onEditStart={() => setEditingField('callout_charge')}
                onEditEnd={() => setEditingField(null)}
                inputType="number"
                inputMode="decimal"
                placeholder="75"
              />
            </div>
          </div>
        </div>

        {/* About */}
        <div className="mb-6">
          <div className="text-[10px] font-bold uppercase tracking-[0.7px] text-[#9CA3AF] mb-2 px-0.5">
            About
          </div>
          <div className="bg-white border border-[#E5E7EB] rounded-xl overflow-hidden">
            <div className="min-h-[52px] flex items-center justify-between px-4 border-b border-[#F9FAFB]">
              <span className="text-sm text-[#374151]">Version</span>
              <span className="text-sm text-[#9CA3AF]">1.0.0</span>
            </div>
            <div
              className="min-h-[52px] flex items-center justify-between px-4 border-b border-[#F9FAFB] cursor-pointer"
              onClick={() => window.open('https://tradepad.app/privacy', '_blank')}
            >
              <span className="text-sm text-[#374151]">Privacy policy</span>
              <div className="flex items-center gap-2">
                <ExternalLink size={14} className="text-[#D1D5DB]" />
              </div>
            </div>
            <div
              className="min-h-[52px] flex items-center justify-between px-4 border-b border-[#F9FAFB] cursor-pointer"
              onClick={() => window.open('https://tradepad.app/terms', '_blank')}
            >
              <span className="text-sm text-[#374151]">Terms of service</span>
              <div className="flex items-center gap-2">
                <ExternalLink size={14} className="text-[#D1D5DB]" />
              </div>
            </div>
            <div
              className="min-h-[52px] flex items-center justify-between px-4 cursor-pointer"
              onClick={handleLogout}
            >
              <span className="text-sm text-[#EF4444]">Log out</span>
            </div>
          </div>
        </div>
      </div>

      {/* Trade BottomSheet */}
      <BottomSheet isOpen={tradeSheetOpen} onClose={() => setTradeSheetOpen(false)} title="Select trade">
        <div className="flex flex-col">
          {TRADE_OPTIONS.map((opt, idx) => (
            <SheetRow
              key={opt.value}
              label={opt.label}
              onTap={() => {
                saveField('trade', opt.value!);
                setTradeSheetOpen(false);
              }}
              isLast={idx === TRADE_OPTIONS.length - 1}
            />
          ))}
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

      {/* Tab bar */}
      <TabBar activeTab="settings" onNavigate={handleNavigate} />
    </div>
  );
}
