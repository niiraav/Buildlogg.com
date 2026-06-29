import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { AlertTriangle, ChevronRight, ExternalLink, HelpCircle, MessageCircle, MessageSquare, Moon, Sun, Upload, FileText, Info, CreditCard, Check } from 'lucide-react';
import { db, type Profile } from '../../lib/db';
import { useAppStore } from '../../store/useAppStore';
import { useTheme } from '../../hooks/useTheme';
import { useDiscardGuard } from '../../hooks/useUnsavedChanges';
import { supabase } from '../../lib/supabase';
import { validatePhone, normalizePhone, phoneForWhatsApp } from '../../lib/phone';
import { BottomSheet } from '../../components/BottomSheet';
import { Button } from '../../components/Button';
import { InlineEditRow } from '../../components/InlineEditRow';
import SyncIndicator from '../../components/SyncIndicator';
import AddToHomeScreen from '../../components/AddToHomeScreen';
import { generateInvoicePDF } from '../../lib/pdfGenerator';
import { capturePDFGenerated } from '../../lib/analytics';
import PDFPreview from '../Quote/PDFPreview';
import { SkeletonSettingsScreen } from '../../components/Skeleton';
import FeedbackSheet from '../../components/FeedbackSheet';
import { showToast, showSuccess } from '../../components/Toast/store';
import { useEntitlements } from '../../hooks/useEntitlements';
import { ProBadge } from '../../components/ProBadge';

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

function now() {
  return new Date().toISOString();
}

function isValidGoogleReviewUrl(url: string): boolean {
  const lower = url.toLowerCase().trim();
  return lower.startsWith('https://maps.google.com') ||
         lower.startsWith('https://search.google.com') ||
         lower.startsWith('https://g.page/') ||
         lower.startsWith('https://www.google.com/maps');
}

export default function Settings() {
  const userId = useAppStore((s) => s.userId);
  const { can, upgradeUrl, isPro } = useEntitlements();
  const location = useLocation();
  const [subscriptionLoading, setSubscriptionLoading] = useState(false);
  const [stripeLoading, setStripeLoading] = useState(false);
  const navigate = useNavigate();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [editingField, setEditingField] = useState<string | null>(null);
  const [paymentSheetOpen, setPaymentSheetOpen] = useState(false);
  const [nudgeDismissed] = useState(false);
  const [showTermsHelp, setShowTermsHelp] = useState(false);
  const [feedbackSheetOpen, setFeedbackSheetOpen] = useState(false);
  const { isDark, toggle } = useTheme();
  const [showBrandingSheet, setShowBrandingSheet] = useState(false);
  const [showReviewsSheet, setShowReviewsSheet] = useState(false);
  const [showCardPaymentsSheet, setShowCardPaymentsSheet] = useState(false);
  const [showLogoHelp, setShowLogoHelp] = useState(false);
  const [showProfileSheet, setShowProfileSheet] = useState(false);
  const [editFullName, setEditFullName] = useState('');
  const [editBusinessName, setEditBusinessName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editTrade, setEditTrade] = useState<Profile['trade'] | null>(null);
  const [editTradeOther, setEditTradeOther] = useState('');
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [pdfBlob, setPdfBlob] = useState<Blob | null>(null);
  const [customItemCount, setCustomItemCount] = useState(0);


  useEffect(() => {
    if (!userId) return;
    db.profiles.get(userId).then((p) => {
      setProfile(p || null);
      setLoading(false);
    });
    db.custom_items.where('user_id').equals(userId).count().then(setCustomItemCount);
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

  const handleOpenProfile = () => {
    setEditFullName(fullName);
    setEditBusinessName(businessName);
    setEditPhone(phone);
    setEditTrade(trade);
    setEditTradeOther(profile?.trade_other || '');
    setPhoneError(null);
    setShowProfileSheet(true);
  };

  const handleSaveProfile = () => {
    const err = validatePhone(editPhone);
    if (err) { setPhoneError(err); return; }
    setPhoneError(null);
    saveField('full_name', editFullName);
    saveField('business_name', editBusinessName);
    saveField('phone', normalizePhone(editPhone));
    if (editTrade) {
      saveField('trade', editTrade);
      if (editTrade === 'other' && editTradeOther.trim()) {
        saveField('trade_other', editTradeOther.trim());
      }
    }
    setShowProfileSheet(false);
  };

  /* Unsaved changes guard for profile edit sheet — moved after derived vars below */

  const handlePreviewPDF = async () => {
    if (!profile) return;
    const dummyCustomer = { id: 'preview', user_id: '', name: 'Sample Customer', phone: '', created_at: '', updated_at: '', _sync_status: 'synced' as const };
    const dummyJob = { id: 'preview', user_id: '', customer_id: 'preview', title: 'Sample service', status: 'awaiting_payment' as const, is_multi_day: false, payment_terms: 'invoice' as const, created_at: '', updated_at: '', _sync_status: 'synced' as const };
    const dummyItems = [
      { id: '1', job_id: 'preview', description: 'Service call', amount: 100, sort_order: 0, added_on_site: false, created_at: '', _sync_status: 'synced' as const },
      { id: '2', job_id: 'preview', description: 'Materials', amount: 50, sort_order: 1, added_on_site: false, created_at: '', _sync_status: 'synced' as const },
    ];
    const blob = await generateInvoicePDF({ profile, customer: dummyCustomer, job: dummyJob, lineItems: dummyItems, total: 150, payments: [], amountDue: 150 });
    setShowBrandingSheet(false);
    setPdfBlob(blob);
    capturePDFGenerated({ jobId: 'preview', type: 'invoice', hasLogo: !!profile.logo_data_url, isVat: !!profile.vat_registered });
  };

  const updateProfile = useCallback(
    async (fields: Partial<Profile>) => {
      if (!userId || !profile) return;
      const n = now();
      const update = { ...fields, updated_at: n, _sync_status: 'pending' } as Partial<Profile>;
      await db.profiles.update(userId, update);
      await db.sync_queue.add({
        operation: 'update',
        table_name: 'profiles',
        record_id: userId,
        payload: { ...fields, updated_at: n },
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

    // In mock/dev mode there's no real Supabase session — skip signOut()
    // entirely as it can hang waiting for a network response that never comes.
    // In production, fire-and-forget signOut before navigating away.
    const isMockMode = !localStorage.getItem('buildlogg_supabase_session') && import.meta.env.DEV;
    if (!isMockMode) {
      supabase.auth.signOut().catch(() => {});
    }

    // db.delete() is fire-and-forget — don't await it.
    // Use window.location.replace() for immediate hard navigation away,
    // abandoning all pending JS (promises, IndexedDB transactions, etc).
    // This prevents the hang where db.delete() holds an IDB lock that
    // blocks window.location.reload().
    db.delete().catch(() => {});
    window.location.replace('/app/auth');
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

  /* Unsaved changes guard for profile edit sheet */
  const profileSheetDirty = showProfileSheet && (
    editFullName !== fullName ||
    editBusinessName !== businessName ||
    editPhone !== phone ||
    editTrade !== trade ||
    editTradeOther !== (profile?.trade_other || '')
  );
  const handleProfileSheetClose = useDiscardGuard(profileSheetDirty, () => setShowProfileSheet(false), 'You have unsaved profile changes. Discard and close?');

  if (loading) {
    return <SkeletonSettingsScreen />;
  }

  return (
    <div className="bg-[var(--app-shell-bg)] flex flex-col min-h-[100dvh]">
      {/* Header */}
      <div className="sticky top-0 z-40 px-4 pt-5 pb-3 bg-[var(--app-shell-bg)] border-b border-brand-borderLight">
        <div className="flex items-center justify-between">
          <h1 className="screen-title text-brand-black">Settings</h1>
          <SyncIndicator />
        </div>
      </div>

      {/* Body */}
      <div className="px-4 md:px-6 pt-4 md:pt-6 pb-[calc(44px + env(safe-area-inset-bottom))]">
        {/* Subscription redirect toast */}
        {(() => {
          const subParam = new URLSearchParams(location.search).get('subscription');
          const stripeParam = new URLSearchParams(location.search).get('stripe');
          if (subParam === 'success') {
            showToast('Welcome to Pro! Your subscription is active.', 'success', 4000);
          } else if (subParam === 'cancelled') {
            showToast('Subscription cancelled — you\'re still on the free plan', 'info', 3000);
          } else if (stripeParam === 'return') {
            showToast('Stripe setup complete — checking status...', 'success', 3000);
          } else if (stripeParam === 'refresh') {
            showToast('Stripe setup incomplete — try again', 'info', 3000);
          }
          return null;
        })()}

        {/* Your plan section */}
        <div className="mb-6">
          <div className="text-micro font-bold tracking-[0.7px] text-brand-mid mb-2 px-0.5">
            Your plan
          </div>
          <div className="bg-white border border-brand-border rounded-xl overflow-hidden">
            <div className="px-4 py-3.5 flex items-center justify-between">
              <div>
                {isPro ? (
                  <>
                    <span className="text-sm font-bold text-brand-black">Pro</span>
                    <p className="text-xs text-brand-muted mt-0.5">
                      {profile?.subscription_status === 'active' ? '£14/month — active' : 'Free during beta'}
                    </p>
                  </>
                ) : (
                  <>
                    <span className="text-sm font-bold text-brand-black">Free plan</span>
                    <p className="text-xs text-brand-muted mt-0.5">Upgrade to unlock all features</p>
                  </>
                )}
              </div>
              {isPro ? (
                <span className="w-2 h-2 rounded-full bg-status-green shrink-0" />
              ) : (
                <Button
                  variant="primary"
                  size="sm"
                  disabled={subscriptionLoading}
                  onClick={async () => {
                    if (!userId) return;
                    setSubscriptionLoading(true);
                    try {
                      const resp = await fetch('/api/create-subscription-session', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ userId }),
                      });
                      const data = await resp.json();
                      if (resp.ok && data.url) {
                        window.location.href = data.url;
                      } else {
                        showToast(data.error || 'Could not start checkout', 'error');
                      }
                    } catch {
                      showToast('Could not start checkout', 'error');
                    } finally {
                      setSubscriptionLoading(false);
                    }
                  }}
                >
                  Upgrade to Pro
                </Button>
              )}
            </div>
            {!isPro && (
              <div className="px-4 py-3 border-t border-brand-surface bg-brand-surface/50">
                <p className="text-xs text-brand-muted leading-relaxed">
                  Pro includes: online booking page, card payments, PDF quotes, auto-reminders, payment chasing, revenue dashboard, and more.
                </p>
              </div>
            )}
          </div>
        </div>

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

        {/* Business profile — summary card */}
        <div className="mb-6">
          <div className="text-micro font-bold tracking-[0.7px] text-brand-mid mb-2 px-0.5">
            Business profile
          </div>
          <div
            className="bg-white border border-brand-border rounded-xl p-4 flex items-center gap-3 cursor-pointer active:opacity-70 transition-opacity"
            onClick={handleOpenProfile}
          >
            {profile?.logo_data_url ? (
              <img src={profile.logo_data_url} alt="" className="w-12 h-12 rounded-full object-cover border border-brand-border shrink-0" />
            ) : (
              <div className="w-12 h-12 rounded-full bg-brand-black text-brand-surface flex items-center justify-center text-lg font-bold shrink-0">
                {(businessName || fullName || '?').charAt(0).toUpperCase()}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className={`text-base font-bold truncate ${businessNameEmpty ? 'text-status-amber italic' : 'text-brand-black'}`}>
                {businessNameEmpty ? 'Add business name' : businessName}
              </p>
              <p className="text-xs text-brand-muted mt-0.5">
                {trade
                  ? trade === 'other' && profile?.trade_other
                    ? profile.trade_other
                    : TRADE_OPTIONS.find((t) => t.value === trade)?.label || trade
                  : 'Trade not set'}
              </p>
            </div>
            <ChevronRight size={18} className="text-brand-muted shrink-0" />
          </div>
          {/* PDF & invoice branding — separate row */}
          <div
            className="mt-2 bg-white border border-brand-border rounded-xl px-4 min-h-13 flex items-center justify-between cursor-pointer active:bg-brand-borderLight/50 transition-colors"
            onClick={() => can('pdf_branding') ? setShowBrandingSheet(true) : undefined}
          >
            <span className="text-sm font-medium text-brand-dark">PDF & invoice branding</span>
            {can('pdf_branding') ? (
              <ChevronRight size={14} className="text-brand-muted" />
            ) : (
              <ProBadge upgradeUrl={upgradeUrl} />
            )}
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
              onClick={() => can('custom_item_library') ? navigate('/settings/custom-items') : undefined}
            >
              <span className="text-sm font-medium text-brand-dark">Saved items</span>
              {can('custom_item_library') ? (
                <div className="flex items-center gap-2">
                  <span className="text-base font-medium text-brand-black">
                    {customItemCount} saved
                  </span>
                  <ChevronRight size={14} className="text-brand-muted" />
                </div>
              ) : (
                <ProBadge upgradeUrl={upgradeUrl} />
              )}
            </div>
            <div
              className="px-4 py-3 flex items-center justify-between cursor-pointer active:bg-brand-borderLight/50 transition-colors border-t border-brand-surface"
              onClick={() => can('message_templates') ? navigate('/settings/message-templates') : undefined}
            >
              <div>
                <span className="text-sm font-medium text-brand-dark">Message templates</span>
                <p className="text-xs text-brand-muted mt-0.5">Pre-fill WhatsApp messages for common situations</p>
              </div>
              {can('message_templates') ? (
                <ChevronRight size={14} className="text-brand-muted" />
              ) : (
                <ProBadge upgradeUrl={upgradeUrl} />
              )}
            </div>
          </div>
        </div>

        {/* Grow — Online booking */}
        <div className="mb-6">
          <div className="text-micro font-bold tracking-[0.7px] text-brand-mid mb-2 px-0.5">
            Grow
          </div>
          <div className="bg-white border border-brand-border rounded-xl overflow-hidden">
            <div
              className="px-4 py-3 flex items-center justify-between cursor-pointer active:bg-brand-borderLight/50 transition-colors"
              onClick={() => navigate('/settings/booking')}
            >
              <div>
                <span className="text-sm font-medium text-brand-dark">Online booking</span>
                <p className="text-xs text-brand-muted mt-0.5">Let clients book you online</p>
              </div>
              <ChevronRight size={14} className="text-brand-muted" />
            </div>
          </div>
        </div>

        {/* Automation */}
        <div className="mb-6">
          <div className="text-micro font-bold tracking-[0.7px] text-brand-mid mb-2 px-0.5">
            Automation
          </div>
          <div className="bg-white border border-brand-border rounded-xl overflow-hidden">
            <div
              className="px-4 py-3 flex items-center justify-between cursor-pointer active:bg-brand-borderLight/50 transition-colors"
              onClick={() => navigate('/settings/reminders')}
            >
              <div>
                <span className="text-sm font-medium text-brand-dark">Smart reminders</span>
                <p className="text-xs text-brand-muted mt-0.5">Auto-message clients when recurring jobs are due</p>
              </div>
              <ChevronRight size={14} className="text-brand-muted" />
            </div>
          </div>
        </div>

        {/* App — Stats, Customers & Google reviews */}
        <div className="mb-6">
          <div className="text-micro font-bold tracking-[0.7px] text-brand-mid mb-2 px-0.5">
            More
          </div>
          <div className="bg-white border border-brand-border rounded-xl overflow-hidden">
            <div
              className="px-4 min-h-13 flex items-center justify-between cursor-pointer active:bg-brand-borderLight/50 transition-colors"
              onClick={() => navigate('/dashboard')}
            >
              <span className="text-sm font-medium text-brand-dark">Stats & revenue</span>
              <ChevronRight size={14} className="text-brand-muted" />
            </div>
            <div
              className="px-4 min-h-13 flex items-center justify-between cursor-pointer active:bg-brand-borderLight/50 transition-colors border-t border-brand-surface"
              onClick={() => navigate('/customers')}
            >
              <span className="text-sm font-medium text-brand-dark">Customers</span>
              <ChevronRight size={14} className="text-brand-muted" />
            </div>
            <div
              className="px-4 min-h-13 flex items-center justify-between cursor-pointer active:bg-brand-borderLight/50 transition-colors border-t border-brand-surface"
              onClick={() => can('google_reviews') ? setShowReviewsSheet(true) : undefined}
            >
              <span className="text-sm font-medium text-brand-dark">Google reviews</span>
              {can('google_reviews') ? (
                <ChevronRight size={14} className="text-brand-muted" />
              ) : (
                <ProBadge upgradeUrl={upgradeUrl} />
              )}
            </div>
            <div
              className="px-4 min-h-13 flex items-center justify-between cursor-pointer active:bg-brand-borderLight/50 transition-colors border-t border-brand-surface"
              onClick={() => setShowCardPaymentsSheet(true)}
            >
              <span className="text-sm font-medium text-brand-dark">Card payments</span>
              <div className="flex items-center gap-2">
                {profile?.stripe_connected ? (
                  <span className="text-xs font-semibold text-status-green">On</span>
                ) : (
                  <span className="text-xs text-brand-muted">Enable</span>
                )}
                <ChevronRight size={14} className="text-brand-muted" />
              </div>
            </div>

          </div>
        </div>

        {/* Quote defaults */}
        <div className="mb-6">
          <div className="text-micro font-bold tracking-[0.7px] text-brand-mid mb-2 px-0.5">
            Quote & job defaults
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
            About · v1.0.0
          </div>
          <div className="bg-white border border-brand-border rounded-xl overflow-hidden">
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
              className="min-h-13 flex items-center justify-between px-4 border-b border-brand-surface cursor-pointer"
              onClick={() => window.open('https://buildlogg.com/privacy', '_blank')}
            >
              <span className="text-sm text-brand-dark">Privacy policy</span>
              <ExternalLink size={14} className="text-brand-muted" />
            </div>
            <div
              className="min-h-13 flex items-center justify-between px-4 cursor-pointer"
              onClick={() => window.open('https://buildlogg.com/terms', '_blank')}
            >
              <span className="text-sm text-brand-dark">Terms of service</span>
              <ExternalLink size={14} className="text-brand-muted" />
            </div>
          </div>
        </div>

        {/* Log out — separate from About, it's a destructive action */}
        <div className="mb-6">
          <div className="bg-white border border-brand-border rounded-xl overflow-hidden">
            <div
              className="min-h-13 flex items-center justify-between px-4 cursor-pointer"
              onClick={handleLogout}
            >
              <span className="text-sm text-status-error">Log out</span>
            </div>
          </div>
        </div>
      </div>

      {/* Branding BottomSheet */}
      <BottomSheet
        isOpen={showBrandingSheet}
        onClose={() => setShowBrandingSheet(false)}
        title="PDF & invoice branding"
        subtitle="Your logo and bank details appear on quotes and invoices"
      >
        <div className="flex flex-col gap-4">
          {/* Logo upload */}
          <div>
            <p className="text-sm font-semibold text-brand-dark mb-2">Business logo</p>
            {profile?.logo_data_url ? (
              <div className="flex items-center gap-3">
                <img src={profile.logo_data_url} alt="Logo" className="w-12 h-12 object-contain rounded-lg border border-brand-border" />
                <button
                  onClick={() => updateProfile({ logo_data_url: undefined })}
                  className="text-sm text-status-error cursor-pointer"
                >
                  Remove
                </button>
              </div>
            ) : (
              <label className="flex flex-col items-center justify-center w-full h-20 border-2 border-dashed border-brand-border rounded-lg cursor-pointer hover:bg-brand-surface transition-colors">
                <Upload size={20} className="text-brand-muted mb-1" />
                <span className="text-xs font-medium text-brand-dark">Choose logo</span>
                <input
                  type="file"
                  accept="image/png,image/jpeg"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    const canvas = document.createElement('canvas');
                    canvas.width = 200;
                    canvas.height = 200;
                    const ctx = canvas.getContext('2d');
                    if (!ctx) return;
                    const img = new Image();
                    img.onload = () => {
                      ctx.drawImage(img, 0, 0, 200, 200);
                      updateProfile({ logo_data_url: canvas.toDataURL('image/png') });
                    };
                    img.src = URL.createObjectURL(file);
                  }}
                />
              </label>
            )}
            <button
              onClick={() => setShowLogoHelp(!showLogoHelp)}
              className="flex items-center gap-1 text-xs text-brand-muted mt-2 cursor-pointer"
            >
              <Info size={12} />
              Logo guidelines
            </button>
            {showLogoHelp && (
              <div className="mt-1 p-3 bg-brand-surface rounded-lg text-xs text-brand-dark leading-relaxed">
                <p className="font-semibold mb-1">Requirements:</p>
                <ul className="list-disc list-inside space-y-0.5">
                  <li>PNG or JPG format</li>
                  <li>Square shape recommended (1:1 ratio)</li>
                  <li>Resized to 200x200px on the PDF</li>
                  <li>Simple logos render best at small sizes</li>
                  <li>Transparent background looks professional</li>
                  <li>Avoid photos — use a logo or wordmark</li>
                </ul>
              </div>
            )}
          </div>

          {/* Bank details */}
          <div>
            <p className="text-sm font-semibold text-brand-dark mb-2">Bank details (on invoices)</p>
            <div className="flex flex-col gap-2">
              <input
                type="text"
                value={profile?.bank_name || ''}
                onChange={(e) => updateProfile({ bank_name: e.target.value || undefined })}
                placeholder="Bank name"
                className="w-full h-10 px-3 text-sm font-medium text-brand-black bg-brand-surface border border-brand-border rounded-lg outline-none focus:border-brand-black"
              />
              <input
                type="text"
                value={profile?.bank_account_name || ''}
                onChange={(e) => updateProfile({ bank_account_name: e.target.value || undefined })}
                placeholder="Account name"
                className="w-full h-10 px-3 text-sm font-medium text-brand-black bg-brand-surface border border-brand-border rounded-lg outline-none focus:border-brand-black"
              />
              <div className="flex gap-2">
                <input
                  type="text"
                  inputMode="numeric"
                  value={profile?.bank_sort_code || ''}
                  onChange={(e) => {
                    // Format: XX-XX-XX
                    let digits = e.target.value.replace(/\D/g, '').slice(0, 6);
                    let formatted = digits;
                    if (digits.length > 2) formatted = digits.slice(0, 2) + '-' + digits.slice(2);
                    if (digits.length > 4) formatted = digits.slice(0, 2) + '-' + digits.slice(2, 4) + '-' + digits.slice(4);
                    updateProfile({ bank_sort_code: formatted || undefined });
                  }}
                  placeholder="12-34-56"
                  className="flex-1 min-w-0 h-10 px-3 text-sm font-medium text-brand-black bg-brand-surface border border-brand-border rounded-lg outline-none focus:border-brand-black"
                />
                <input
                  type="text"
                  inputMode="numeric"
                  value={profile?.bank_account_number || ''}
                  onChange={(e) => {
                    // Format: XXXX XXXX (8 digits with space)
                    let digits = e.target.value.replace(/\D/g, '').slice(0, 8);
                    let formatted = digits;
                    if (digits.length > 4) formatted = digits.slice(0, 4) + ' ' + digits.slice(4);
                    updateProfile({ bank_account_number: formatted || undefined });
                  }}
                  placeholder="1234 5678"
                  className="flex-1 min-w-0 h-10 px-3 text-sm font-medium text-brand-black bg-brand-surface border border-brand-border rounded-lg outline-none focus:border-brand-black"
                />
              </div>
            </div>
          </div>

          {/* VAT */}
          <div>
            <label className="flex items-center gap-2 cursor-pointer mb-2">
              <input
                type="checkbox"
                checked={profile?.vat_registered || false}
                onChange={(e) => updateProfile({ vat_registered: e.target.checked })}
                className="w-4 h-4 accent-brand-black"
              />
              <span className="text-sm font-medium text-brand-dark">VAT registered</span>
            </label>
            {profile?.vat_registered && (
              <input
                type="text"
                value={profile?.vat_number || ''}
                onChange={(e) => updateProfile({ vat_number: e.target.value || undefined })}
                placeholder="VAT number"
                className="w-full h-10 px-3 text-sm font-medium text-brand-black bg-brand-surface border border-brand-border rounded-lg outline-none focus:border-brand-black"
              />
            )}
          </div>

          {/* PDF Preview */}
          <Button variant="secondary" onClick={handlePreviewPDF} fullWidth>
            <FileText size={16} className="mr-2" />
            Preview invoice PDF
          </Button>
        </div>
      </BottomSheet>

      {/* Reviews BottomSheet */}
      <BottomSheet
        isOpen={showReviewsSheet}
        onClose={() => setShowReviewsSheet(false)}
        title="Google reviews"
        subtitle="Automatically ask customers for a review after they pay"
      >
        <div className="flex flex-col gap-3">
          <div className="p-3 bg-brand-surface rounded-lg">
            <p className="text-xs text-brand-dark leading-relaxed">
              When you mark a job as paid, Buildlogg can send a WhatsApp message asking your customer to leave a Google review.
              Add your Google Business review link below and toggle reviews on or off.
            </p>
          </div>

          {/* URL input with validation */}
          <div>
            <p className="text-xs text-brand-muted mb-1">Find your link: Google Maps → your business → Share → Copy link</p>
            <input
              type="url"
              value={profile?.google_business_url || ''}
              onChange={(e) => {
                const val = e.target.value.trim();
                updateProfile({ google_business_url: val || undefined });
              }}
              placeholder="https://maps.google.com/..."
              className={`w-full h-10 px-3 text-sm font-medium text-brand-black bg-brand-surface border rounded-lg outline-none transition-colors ${
                profile?.google_business_url && !isValidGoogleReviewUrl(profile.google_business_url)
                  ? 'border-status-error'
                  : 'border-brand-border focus:border-brand-black'
              }`}
            />
            {profile?.google_business_url && !isValidGoogleReviewUrl(profile.google_business_url) && (
              <p className="text-xs text-status-error mt-1">
                This doesn't look like a Google review link. It should start with maps.google.com or search.google.com
              </p>
            )}
          </div>

          {/* Enable/disable toggle */}
          {profile?.google_business_url && isValidGoogleReviewUrl(profile.google_business_url) && (
            <div className="flex items-center justify-between p-3 bg-white border border-brand-border rounded-lg">
              <div>
                <p className="text-sm font-semibold text-brand-black">Ask for reviews</p>
                <p className="text-xs text-brand-muted mt-0.5">Send a review request after each payment</p>
              </div>
              <button
                onClick={() => updateProfile({ reviews_enabled: !profile?.reviews_enabled })}
                className={`w-11 h-6 rounded-full transition-colors cursor-pointer relative ${
                  profile?.reviews_enabled ? 'bg-brand-black' : 'bg-brand-border'
                }`}
              >
                <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full transition-transform ${
                  profile?.reviews_enabled ? 'left-[22px]' : 'left-0.5'
                }`} />
              </button>
            </div>
          )}

          {/* Status messages */}
          {profile?.google_business_url && isValidGoogleReviewUrl(profile.google_business_url) && profile?.reviews_enabled && (
            <p className="text-xs text-status-green font-medium">Reviews are ON — customers will be asked after payment.</p>
          )}
          {profile?.google_business_url && isValidGoogleReviewUrl(profile.google_business_url) && !profile?.reviews_enabled && (
            <p className="text-xs text-brand-muted font-medium">Reviews are OFF — link saved but customers won't be asked.</p>
          )}
        </div>
      </BottomSheet>

      {/* PDF Preview */}
      {pdfBlob && (
        <PDFPreview
          blob={pdfBlob}
          fileName="branding-preview.pdf"
          onBack={() => setPdfBlob(null)}
        />
      )}

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
            <div className="bg-status-blueBg rounded-lg p-3 border border-status-blueBorder">
              <p className="text-sm text-status-blue leading-relaxed">
                This is the default way you ask to be paid. It appears on every quote you send. You can change it for any individual job.
              </p>
            </div>
          )}

          {PAYMENT_OPTIONS.map((opt) => {
            const isSelected = paymentTerms === opt.value;
            return (
              <button
                key={opt.value}
                onClick={() => { saveField('payment_terms', opt.value); setPaymentSheetOpen(false); showSuccess('Payment terms updated'); }}
                className={`flex flex-col gap-0.5 min-h-13 rounded-xl border-2 px-4 py-2.5 transition-all cursor-pointer text-left ${
                  isSelected ? 'border-brand-black bg-brand-surface' : 'border-brand-border bg-white'
                }`}
              >
                <span className={`font-semibold text-sm ${isSelected ? 'text-brand-black' : 'text-brand-mid'}`}>{opt.label}</span>
                <span className={`text-sm leading-relaxed ${isSelected ? 'text-brand-black' : 'text-brand-muted'}`}>{opt.description}</span>
              </button>
            );
          })}

          {/* Deposit percentage — shown when payment_terms = deposit */}
          {paymentTerms === 'deposit' && (
            <div className="mt-4 pt-4 border-t border-brand-borderLight">
              <p className="text-sm font-semibold text-brand-dark mb-2">Deposit percentage</p>
              <p className="text-xs text-brand-muted mb-3">How much to charge upfront when a client books online. The rest is due on completion.</p>
              <div className="flex gap-2">
                {[10, 20, 30, 50].map((pct) => (
                  <button
                    key={pct}
                    onClick={() => { saveField('deposit_pct', pct); showSuccess(`Deposit set to ${pct}%`); }}
                    className={`flex-1 h-11 rounded-lg text-sm font-semibold cursor-pointer transition-colors ${
                      (profile?.deposit_pct || 20) === pct
                        ? 'bg-brand-black text-white'
                        : 'bg-white text-brand-dark border border-brand-border'
                    }`}
                  >
                    {pct}%
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </BottomSheet>

      {/* Card payments sheet */}
      <BottomSheet
        isOpen={showCardPaymentsSheet}
        onClose={() => setShowCardPaymentsSheet(false)}
        title="Card payments"
        subtitle={profile?.stripe_connected ? 'Card payments are on' : undefined}
      >
        {profile?.stripe_connected ? (
          <div className="flex flex-col gap-3">
            <div className="bg-status-greenBg border border-green-200 rounded-lg p-3 flex items-start gap-2">
              <Check size={16} className="text-status-green shrink-0 mt-0.5" />
              <div>
                <p className="text-sm text-status-green font-medium">Card payments are enabled</p>
                <p className="text-xs text-status-green mt-1">Clients can pay by card when you send them a payment link from a job.</p>
              </div>
            </div>
            <Button
              variant="secondary"
              fullWidth
              onClick={async () => {
                await updateProfile({ stripe_connected: false });
                setShowCardPaymentsSheet(false);
                showToast('Card payments turned off', 'success');
              }}
            >
              Turn off card payments
            </Button>

          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-brand-dark leading-relaxed">
              Accept card payments from clients — deposits at booking, full payments after a job, or balance chases. Money lands in your bank account automatically.
            </p>

            {/* Outcome-focused — what they get */}
            <div className="bg-brand-surface border border-brand-border rounded-lg p-3">
              <p className="text-xs font-semibold text-brand-mid mb-2">What you can do with card payments</p>
              <ul className="text-xs text-brand-dark space-y-1.5">
                <li className="flex items-start gap-2"><span className="text-status-green shrink-0">✓</span> Take deposits when clients book online</li>
                <li className="flex items-start gap-2"><span className="text-status-green shrink-0">✓</span> Send payment links via WhatsApp from any job</li>
                <li className="flex items-start gap-2"><span className="text-status-green shrink-0">✓</span> Automatically chase overdue payments by card</li>
                <li className="flex items-start gap-2"><span className="text-status-green shrink-0">✓</span> Money paid into your bank — no manual invoicing</li>
              </ul>
            </div>

            {/* Setup expectation — what they'll need */}
            <div className="bg-status-blueBg border border-status-blueBorder rounded-lg p-3">
              <p className="text-xs font-semibold text-status-blue mb-1.5">One-time setup with Stripe (2–3 minutes)</p>
              <p className="text-xs text-status-blue leading-relaxed mb-2">
                Stripe is our payment partner — they handle card processing and send money to your bank. You'll create a free Stripe account to receive payouts.
              </p>
              <div className="text-xs text-status-blue leading-relaxed">
                <p className="font-medium mb-1">Before you start, have ready:</p>
                <ul className="space-y-0.5 ml-3">
                  <li>• Bank account sort code & account number</li>
                  <li>• Your date of birth</li>
                  <li>• Home address</li>
                  <li>• Photo ID (driving licence or passport)</li>
                </ul>
              </div>
              <p className="text-xs text-status-blue/70 mt-2 border-t border-status-blueBorder/50 pt-2">
                Stripe handles all payment processing securely. Buildlogg never sees your bank or card details.
              </p>
            </div>

            <Button
              variant="primary"
              fullWidth
              disabled={stripeLoading}
              onClick={async () => {
                if (!userId) return;
                setStripeLoading(true);
                try {
                  const resp = await fetch('/api/stripe-connect-onboard', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ userId }),
                  });
                  const data = await resp.json();
                  if (resp.ok && data.url) {
                    window.location.href = data.url;
                  } else {
                    showToast(data.error || 'Could not start Stripe onboarding', 'error');
                  }
                } catch {
                  showToast('Could not start Stripe onboarding', 'error');
                } finally {
                  setStripeLoading(false);
                }
              }}
            >
              <CreditCard size={18} className="mr-2" />
              {stripeLoading ? 'Redirecting to Stripe...' : 'Set up card payments with Stripe'}
            </Button>

          </div>
        )}
      </BottomSheet>

      {/* Profile edit sheet */}
      <BottomSheet
        isOpen={showProfileSheet}
        onClose={handleProfileSheetClose}
        title="Edit profile"
        footer={
          <Button variant="primary" fullWidth onClick={handleSaveProfile}>
            Save
          </Button>
        }
      >
        <div className="flex flex-col gap-4">
          {/* Logo */}
          <div>
            <p className="text-sm font-semibold text-brand-dark mb-2">Business logo</p>
            {profile?.logo_data_url ? (
              <div className="flex items-center gap-3">
                <img src={profile.logo_data_url} alt="Logo" className="w-12 h-12 object-contain rounded-lg border border-brand-border" />
                <button
                  onClick={() => updateProfile({ logo_data_url: undefined })}
                  className="text-sm text-status-error cursor-pointer"
                >
                  Remove
                </button>
              </div>
            ) : (
              <label className="flex flex-col items-center justify-center w-full h-20 border-2 border-dashed border-brand-border rounded-lg cursor-pointer hover:bg-brand-surface transition-colors">
                <Upload size={20} className="text-brand-muted mb-1" />
                <span className="text-xs font-medium text-brand-dark">Choose logo</span>
                <input
                  type="file"
                  accept="image/png,image/jpeg"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    const canvas = document.createElement('canvas');
                    canvas.width = 200;
                    canvas.height = 200;
                    const ctx = canvas.getContext('2d');
                    if (!ctx) return;
                    const img = new Image();
                    img.onload = () => {
                      ctx.drawImage(img, 0, 0, 200, 200);
                      updateProfile({ logo_data_url: canvas.toDataURL('image/png') });
                    };
                    img.src = URL.createObjectURL(file);
                  }}
                />
              </label>
            )}
          </div>

          {/* Business name */}
          <div>
            <label className="block text-micro font-bold tracking-[0.4px] text-brand-mid mb-1">
              Business name
            </label>
            <input
              type="text"
              value={editBusinessName}
              onChange={(e) => setEditBusinessName(e.target.value)}
              placeholder="Enter business name"
              className="w-full h-12 px-3.5 border-2 border-brand-border rounded-lg text-base font-medium text-brand-black placeholder:text-brand-muted outline-none focus:border-brand-black"
            />
          </div>

          {/* Your name */}
          <div>
            <label className="block text-micro font-bold tracking-[0.4px] text-brand-mid mb-1">
              Your name
            </label>
            <input
              type="text"
              value={editFullName}
              onChange={(e) => setEditFullName(e.target.value)}
              placeholder="Your name"
              className="w-full h-12 px-3.5 border-2 border-brand-border rounded-lg text-base font-medium text-brand-black placeholder:text-brand-muted outline-none focus:border-brand-black"
            />
          </div>

          {/* Phone */}
          <div>
            <label className="block text-micro font-bold tracking-[0.4px] text-brand-mid mb-1">
              Phone
            </label>
            <input
              type="tel"
              inputMode="tel"
              value={editPhone}
              onChange={(e) => { setEditPhone(e.target.value); setPhoneError(null); }}
              onBlur={() => { const err = validatePhone(editPhone); setPhoneError(err); }}
              placeholder="e.g. 07700 900123 or +353 86 123 4567"
              className={`w-full h-12 px-3.5 border-2 rounded-lg text-base font-medium text-brand-black placeholder:text-brand-muted outline-none focus:border-brand-black ${phoneError ? 'border-status-red' : 'border-brand-border'}`}
            />
            {phoneError && <p className="text-label text-status-red mt-1">{phoneError}</p>}
            {editPhone && !phoneError && validatePhone(editPhone) === null && (
              <div className="mt-2 flex flex-col gap-1.5">
                <button
                  onClick={() => {
                    const normalized = normalizePhone(editPhone);
                    window.location.href = `https://wa.me/${phoneForWhatsApp(normalized)}?text=${encodeURIComponent('Test message from Buildlogg — your phone number is correct!')}`;
                  }}
                  className="flex items-center gap-1.5 text-sm font-medium text-status-green"
                >
                  <MessageCircle size={14} />
                  Send test WhatsApp
                </button>
                {/Mobile|Android|iPhone/i.test(navigator.userAgent) ? (
                  <button
                    onClick={() => {
                      const normalized = normalizePhone(editPhone);
                      window.location.href = `sms:${normalized}?body=${encodeURIComponent('Test message from Buildlogg — your phone number is correct!')}`;
                    }}
                    className="flex items-center gap-1.5 text-sm font-medium text-brand-mid"
                  >
                    <MessageSquare size={14} />
                    Send test text (SMS)
                  </button>
                ) : (
                  <p className="text-xs text-brand-muted">Open Buildlogg on your phone to send a test message</p>
                )}
              </div>
            )}
          </div>

          {/* Trade — horizontal chips with selected state */}
          <div>
            <label className="block text-micro font-bold tracking-[0.4px] text-brand-mid mb-2">
              Trade
            </label>
            <div className="flex flex-wrap gap-2">
              {TRADE_OPTIONS.map((opt) => {
                const isSelected = editTrade === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => {
                      setEditTrade(opt.value);
                      if (opt.value !== 'other') setEditTradeOther('');
                    }}
                    className={`flex items-center gap-1.5 px-4 h-11 rounded-full border-2 text-sm font-semibold transition-all cursor-pointer ${
                      isSelected
                        ? 'border-brand-black bg-brand-black text-brand-surface'
                        : 'border-brand-border bg-white text-brand-dark'
                    }`}
                  >
                    {isSelected && <Check size={14} />}
                    {opt.label}
                  </button>
                );
              })}
            </div>
            {/* "Other" text input — shown when Other is selected */}
            {editTrade === 'other' && (
              <input
                type="text"
                value={editTradeOther}
                onChange={(e) => setEditTradeOther(e.target.value)}
                placeholder="Your trade, e.g. Roofer"
                className="w-full h-12 mt-3 px-4 text-base font-medium text-brand-black border-2 border-brand-border rounded-lg outline-none focus:border-brand-black bg-white"
                autoFocus
              />
            )}
          </div>
        </div>
      </BottomSheet>

      {/* Feedback sheet */}
      <FeedbackSheet isOpen={feedbackSheetOpen} onClose={() => setFeedbackSheetOpen(false)} />
    </div>
  );
}
