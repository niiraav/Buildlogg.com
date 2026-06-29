import { useState, useEffect, useRef, useCallback } from 'react';
import { ExternalLink, Copy, Download, Share2, Clock, AlertTriangle } from 'lucide-react';
import { createPrettyQR } from '../../lib/prettyQr';
import type QRCodeStyling from 'qr-code-styling';
import { db, type Profile } from '../../lib/db';
import { useAppStore } from '../../store/useAppStore';
import { supabase } from '../../lib/supabase';
import { updateProfileFields, updateProfileSlug } from '../../lib/profile';
import { bookingPageUrl } from '../../lib/referral';
import { showSuccess, showToast } from '../../components/Toast/store';
import { haptic } from '../../lib/haptics';
import {
  captureBookingPageEnabled,
  captureBookingPageDisabled,
  captureBookingSlugChanged,
} from '../../lib/analytics';
import { SkeletonBookingScreen } from '../../components/Skeleton';
import { useUnsavedChanges } from '../../hooks/useUnsavedChanges';

/* ─── helpers ─── */

const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/;

function sanitizeSlug(raw: string): string {
  return raw.toLowerCase().replace(/[^a-z0-9-]/g, '').replace(/-{2,}/g, '-').replace(/^-+|-+$/g, '');
}

function isValidSlug(slug: string): boolean {
  if (slug.length < 3 || slug.length > 40) return false;
  return SLUG_RE.test(slug);
}

const BUFFER_OPTIONS = [
  { label: 'Same day', value: 0 },
  { label: '2 hours', value: 2 },
  { label: '4 hours', value: 4 },
  { label: '12 hours', value: 12 },
  { label: '1 day', value: 24 },
  { label: '2 days', value: 48 },
  { label: '3 days', value: 72 },
  { label: '1 week', value: 168 },
];

const DAYS = [
  { day: 1, label: 'M' },
  { day: 2, label: 'T' },
  { day: 3, label: 'W' },
  { day: 4, label: 'T' },
  { day: 5, label: 'F' },
  { day: 6, label: 'S' },
  { day: 0, label: 'S' },
];

const DAY_LABELS = [
  { day: 1, label: 'Monday' },
  { day: 2, label: 'Tuesday' },
  { day: 3, label: 'Wednesday' },
  { day: 4, label: 'Thursday' },
  { day: 5, label: 'Friday' },
  { day: 6, label: 'Saturday' },
  { day: 0, label: 'Sunday' },
];

/* ─── small toggle component ─── */

function MiniToggle({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`w-11 h-6 rounded-full transition-colors cursor-pointer relative shrink-0 ${
        on ? 'bg-brand-black' : 'bg-brand-border'
      }`}
    >
      <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full transition-transform ${
        on ? 'left-[22px]' : 'left-0.5'
      }`} />
    </button>
  );
}

/* ─── collapsible section ─── */

function CollapsibleSection({
  title,
  description,
  enabled,
  onToggle,
  children,
}: {
  title: string;
  description: string;
  enabled: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="border-t border-brand-surface">
      {/* Toggle row */}
      <div className="px-4 py-3 flex items-center justify-between">
        <div className="flex-1 min-w-0 pr-3">
          <p className="text-sm font-medium text-brand-dark">{title}</p>
          <p className="text-xs text-brand-muted mt-0.5">{description}</p>
        </div>
        <MiniToggle on={enabled} onClick={onToggle} />
      </div>
      {/* Content — only when enabled */}
      {enabled && (
        <div className="px-4 pb-4">
          {children}
        </div>
      )}
    </div>
  );
}

/* ─── component ─── */

export default function Booking() {
  const userId = useAppStore((s) => s.userId);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [slugInput, setSlugInput] = useState('');
  const [slugStatus, setSlugStatus] = useState<'idle' | 'checking' | 'available' | 'taken' | 'invalid'>('idle');
  const [slugSaved, setSlugSaved] = useState(true);
  const [savingSlug, setSavingSlug] = useState(false);
  const [publicItemCount, setPublicItemCount] = useState(0);
  const [showSlugChangeConfirm, setShowSlugChangeConfirm] = useState(false);
  const qrContainerRef = useRef<HTMLDivElement>(null);
  const qrCodeRef = useRef<QRCodeStyling | null>(null);

  /* Unsaved changes guard — warn when slug input has unsaved changes */
  const slugIsDirty = !loading && !slugSaved && slugStatus !== 'checking';
  useUnsavedChanges(slugIsDirty, 'You have unsaved link changes. Leave without saving?');

  /* Load profile + public item count */
  useEffect(() => {
    if (!userId) return;
    db.profiles.get(userId).then((p) => {
      setProfile(p || null);
      setSlugInput(p?.booking_slug || '');
      setLoading(false);
    });
    db.custom_items
      .where('user_id')
      .equals(userId)
      .filter((i) => i.is_public === true)
      .count()
      .then(setPublicItemCount)
      .catch(() => setPublicItemCount(0));
  }, [userId]);

  /* Debounced slug availability check */
  useEffect(() => {
    const savedSlug = profile?.booking_slug || '';
    const trimmed = slugInput.trim();

    if (trimmed === savedSlug) {
      setSlugStatus('idle');
      setSlugSaved(true);
      return;
    }

    setSlugSaved(false);

    if (trimmed === '') {
      setSlugStatus('idle');
      return;
    }

    if (!isValidSlug(trimmed)) {
      setSlugStatus('invalid');
      return;
    }

    setSlugStatus('checking');
    const timer = setTimeout(async () => {
      try {
        const { data, error } = await supabase.rpc('is_booking_slug_taken', { p_slug: trimmed });
        if (error) {
          setSlugStatus('idle');
          return;
        }
        setSlugStatus(data ? 'taken' : 'available');
      } catch {
        setSlugStatus('idle');
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [slugInput, profile?.booking_slug]);

  /* Render QR code when enabled + slug */
  useEffect(() => {
    if (!profile?.booking_slug || !profile?.booking_enabled) return;
    const url = bookingPageUrl(profile.booking_slug);
    const logo = profile?.logo_data_url;

    if (qrCodeRef.current) {
      qrCodeRef.current.update({ data: url, image: logo || '/brand/icon-transparent-square-v2.png' });
    } else if (qrContainerRef.current) {
      qrContainerRef.current.innerHTML = '';
      const qr = createPrettyQR(url, logo);
      qr.append(qrContainerRef.current);
      qrCodeRef.current = qr;
    }
  }, [profile?.booking_slug, profile?.booking_enabled, profile?.logo_data_url]);

  useEffect(() => {
    return () => { qrCodeRef.current = null; };
  }, []);

  /* ─── actions ─── */

  const handleSaveSlug = useCallback(async () => {
    if (!userId || savingSlug) return;
    const trimmed = slugInput.trim();
    setSavingSlug(true);
    try {
      const result = await updateProfileSlug(userId, trimmed || null);
      if (result.ok) {
        setProfile(result.profile || null);
        setSlugSaved(true);
        setSlugStatus('idle');
        captureBookingSlugChanged({ hadSlug: !!profile?.booking_slug, hasSlug: !!trimmed });
        showSuccess(trimmed ? 'Link saved' : 'Link removed');
      } else if (result.error === 'taken') {
        setSlugStatus('taken');
        showToast('That link is taken', 'error', 3000);
      } else {
        showToast('Could not save — check connection', 'error', 3000);
      }
    } catch {
      showToast('Something went wrong', 'error', 3000);
    } finally {
      setSavingSlug(false);
    }
  }, [userId, savingSlug, slugInput, profile?.booking_slug]);

  const handleSaveSlugClick = useCallback(() => {
    if (profile?.booking_enabled && profile?.booking_slug && slugInput.trim() !== profile.booking_slug && slugInput.trim() !== '') {
      setShowSlugChangeConfirm(true);
    } else {
      handleSaveSlug();
    }
  }, [profile?.booking_enabled, profile?.booking_slug, slugInput, handleSaveSlug]);

  const handleToggleEnabled = useCallback(async () => {
    if (!userId || !profile) return;
    const current = profile.booking_enabled ?? false;
    if (!current && !(profile.booking_slug && profile.booking_slug.trim())) {
      showToast('Pick a link before going live', 'error', 3000);
      return;
    }
    haptic('light');
    const updated = await updateProfileFields(userId, { booking_enabled: !current });
    setProfile(updated);
    if (!current) captureBookingPageEnabled();
    else captureBookingPageDisabled();
  }, [userId, profile]);

  const handleBufferChange = useCallback(async (value: number) => {
    if (!userId) return;
    const updated = await updateProfileFields(userId, { booking_buffer_hours: value });
    setProfile(updated);
  }, [userId]);

  const handleTogglePhone = useCallback(async () => {
    if (!userId || !profile) return;
    const current = profile.booking_show_phone ?? true;
    const updated = await updateProfileFields(userId, { booking_show_phone: !current });
    setProfile(updated);
  }, [userId, profile]);

  const handleCopyLink = useCallback(() => {
    if (!profile?.booking_slug) return;
    navigator.clipboard.writeText(bookingPageUrl(profile.booking_slug)).then(() => {
      showSuccess('Link copied');
    }).catch(() => {
      showToast('Could not copy', 'error', 2000);
    });
  }, [profile?.booking_slug]);

  const handleDownloadQR = useCallback(async () => {
    if (!qrCodeRef.current || !profile?.booking_slug) return;
    try {
      await qrCodeRef.current.download({ name: `booking-qr-${profile.booking_slug}`, extension: 'png' });
      showSuccess('QR downloaded');
    } catch {
      showToast('Could not download QR', 'error', 3000);
    }
  }, [profile?.booking_slug]);

  const handleShareLink = useCallback(async () => {
    if (!profile?.booking_slug) return;
    const url = bookingPageUrl(profile.booking_slug);
    if (navigator.share) {
      try { await navigator.share({ title: 'Book me online', url }); } catch { /* user cancelled */ }
    } else {
      navigator.clipboard.writeText(url).then(() => showSuccess('Link copied'));
    }
  }, [profile?.booking_slug]);

  /* ─── enable-first toggles for optional settings ─── */

  const hasBreak = !!(profile?.booking_break_start && profile?.booking_break_end);
  const hasPerDayHours = !!(profile?.booking_hours_per_day && Object.keys(profile.booking_hours_per_day).length > 0);
  const hasBlockedDates = !!(profile?.booking_blocked_dates && profile.booking_blocked_dates.length > 0);

  const handleToggleBreak = useCallback(async () => {
    if (!userId) return;
    if (hasBreak) {
      // Turn off — clear break times
      const updated = await updateProfileFields(userId, { booking_break_start: undefined, booking_break_end: undefined });
      setProfile(updated);
    } else {
      // Turn on — set default 12:00-13:00
      const updated = await updateProfileFields(userId, { booking_break_start: '12:00', booking_break_end: '13:00' });
      setProfile(updated);
    }
  }, [userId, hasBreak]);

  const handleTogglePerDayHours = useCallback(async () => {
    if (!userId) return;
    if (hasPerDayHours) {
      const updated = await updateProfileFields(userId, { booking_hours_per_day: undefined });
      setProfile(updated);
    } else {
      // Turn on — empty object, user will fill in
      const updated = await updateProfileFields(userId, { booking_hours_per_day: {} });
      setProfile(updated);
    }
  }, [userId, hasPerDayHours]);

  const handleToggleBlockedDates = useCallback(async () => {
    if (!userId) return;
    if (hasBlockedDates) {
      const updated = await updateProfileFields(userId, { booking_blocked_dates: undefined });
      setProfile(updated);
    } else {
      const updated = await updateProfileFields(userId, { booking_blocked_dates: [] });
      setProfile(updated);
    }
  }, [userId, hasBlockedDates]);

  /* ─── render ─── */

  if (loading) {
    return <SkeletonBookingScreen />;
  }

  const isEnabled = profile?.booking_enabled ?? false;
  const bufferHours = profile?.booking_buffer_hours ?? 24;
  const showPhone = profile?.booking_show_phone ?? true;
  const hasSlug = !!(profile?.booking_slug && profile.booking_slug.trim());
  const slugInputTrimmed = slugInput.trim();
  const canSaveSlug = !slugSaved && slugStatus !== 'taken' && slugStatus !== 'invalid' && slugStatus !== 'checking' && !savingSlug;
  const deadEndWarning = !showPhone && publicItemCount === 0 && (isEnabled || hasSlug);

  return (
    <div className="flex flex-col min-h-[100dvh] bg-[var(--app-shell-bg)]">
      {/* Header */}
      <div className="sticky top-0 z-40 px-4 pt-2 pb-2 bg-[var(--app-shell-bg)] flex items-center gap-3 flex-shrink-0">
        <button onClick={() => window.history.back()} className="p-1 -ml-1 text-brand-dark">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        <h1 className="text-lg font-extrabold text-brand-black">Online booking</h1>
      </div>

      {/* Body */}
      <div className="flex-1 px-4 md:px-6 pb-8 space-y-6">

        {/* Status section — toggle */}
        <div>
          <div className="text-micro font-bold tracking-[0.7px] text-brand-mid mb-2 px-0.5">Status</div>
          <div className="bg-white border border-brand-border rounded-xl p-4">
            <div className="flex items-center justify-between">
              <div className="flex-1 min-w-0 pr-3">
                <p className="text-sm font-semibold text-brand-black">Online booking</p>
                <p className="text-xs text-brand-muted mt-0.5">Let clients book you online</p>
              </div>
              <MiniToggle on={isEnabled} onClick={handleToggleEnabled} />
            </div>
            {isEnabled && !hasSlug && (
              <p className="mt-3 text-sm text-status-amber">Pick a link below to go live</p>
            )}
          </div>
        </div>

        {/* Your link section — always visible (needed to set slug before enabling) */}
        <div>
          <div className="text-micro font-bold tracking-[0.7px] text-brand-mid mb-2 px-0.5">Your link</div>
          <div className="bg-white border border-brand-border rounded-xl p-4 space-y-4">

            {/* Live URL display + copy/share buttons */}
            {hasSlug ? (
              <>
                <div className="flex items-center gap-2 bg-brand-surface rounded-lg p-3">
                  <ExternalLink size={16} className="text-status-green shrink-0" />
                  <a
                    href={bookingPageUrl(profile!.booking_slug!)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 min-w-0 text-sm font-medium text-status-green truncate block"
                  >
                    {bookingPageUrl(profile!.booking_slug!).replace(/^https?:\/\//, '')}
                  </a>
                  <button
                    onClick={handleCopyLink}
                    className="shrink-0 p-1.5 -mr-1 text-brand-muted hover:text-brand-black active:opacity-70 cursor-pointer"
                    aria-label="Copy link"
                  >
                    <Copy size={16} />
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={handleCopyLink}
                    className="flex items-center justify-center gap-1.5 px-2 py-2 bg-brand-surface border border-brand-border rounded-lg text-xs font-medium text-brand-dark cursor-pointer active:opacity-70 transition-opacity"
                  >
                    <Copy size={14} />
                    Copy
                  </button>
                  <button
                    onClick={handleShareLink}
                    className="flex items-center justify-center gap-1.5 px-2 py-2 bg-brand-surface border border-brand-border rounded-lg text-xs font-medium text-brand-dark cursor-pointer active:opacity-70 transition-opacity"
                  >
                    <Share2 size={14} />
                    Share
                  </button>
                </div>
              </>
            ) : (
              <p className="text-sm text-brand-muted text-center py-2">No link set yet — create one below</p>
            )}

            {/* Divider */}
            <div className="border-t border-brand-border" />

            {/* Edit section */}
            <div>
              <label className="block text-label font-semibold text-brand-dark tracking-[0.3px] mb-2">Customise your link</label>
              <div className="flex items-stretch border-2 border-brand-border rounded-lg overflow-hidden focus-within:border-brand-black transition-colors">
                <input
                  type="text"
                  value={slugInput}
                  onChange={(e) => setSlugInput(sanitizeSlug(e.target.value))}
                  placeholder="your-name"
                  className="flex-1 min-w-0 px-3 py-3 text-base font-medium text-brand-black placeholder:text-brand-muted placeholder:italic outline-none"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                />
              </div>
              <p className="mt-1.5 text-xs text-brand-muted">
                Your page will be at <span className="font-medium text-brand-dark">buildlogg.com/book/{slugInputTrimmed || 'your-name'}</span>
              </p>

              {/* Slug status feedback */}
              <div className="mt-2 min-h-[20px]">
                {slugStatus === 'checking' && (
                  <p className="text-xs text-brand-muted">Checking availability&hellip;</p>
                )}
                {slugStatus === 'available' && (
                  <p className="text-xs text-status-green font-medium">Available</p>
                )}
                {slugStatus === 'taken' && (
                  <p className="text-xs text-status-error font-medium">That link is taken — try another</p>
                )}
                {slugStatus === 'invalid' && (
                  <p className="text-xs text-status-error font-medium">3-40 chars, letters/numbers/hyphens only</p>
                )}
                {slugStatus === 'idle' && !slugSaved && slugInputTrimmed === '' && (
                  <p className="text-xs text-status-amber">Link will be cleared</p>
                )}
              </div>

              <button
                onClick={handleSaveSlugClick}
                disabled={!canSaveSlug}
                className={`mt-3 px-5 py-2.5 rounded-lg text-sm font-semibold transition-colors ${
                  canSaveSlug
                    ? 'bg-brand-black text-white cursor-pointer active:opacity-70'
                    : 'bg-brand-border text-brand-muted cursor-not-allowed'
                }`}
              >
                {savingSlug ? 'Saving&hellip;' : slugInputTrimmed === '' && !slugSaved ? 'Remove link' : 'Save link'}
              </button>
            </div>
          </div>
        </div>

        {/* ─── Everything below only shows when booking is enabled ─── */}
        {isEnabled && (
          <>
            {/* Availability section */}
            <div>
              <div className="text-micro font-bold tracking-[0.7px] text-brand-mid mb-2 px-0.5">Availability</div>
              <div className="bg-white border border-brand-border rounded-xl p-4">
                <label className="flex items-center gap-1.5 text-label font-semibold text-brand-dark tracking-[0.3px] mb-2">
                  <Clock size={14} className="text-brand-mid" />
                  Minimum notice before bookings
                </label>
                <p className="text-xs text-brand-muted mb-3">Clients can&rsquo;t book a slot sooner than this</p>
                <select
                  value={bufferHours}
                  onChange={(e) => handleBufferChange(parseInt(e.target.value))}
                  className="w-full h-12 px-3.5 border border-brand-border rounded-lg text-base font-medium text-brand-black outline-none focus:border-brand-black bg-white"
                >
                  {BUFFER_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Working days & hours */}
            <div>
              <div className="text-micro font-bold tracking-[0.7px] text-brand-mid mb-2 px-0.5">Working days & hours</div>
              <div className="bg-white border border-brand-border rounded-xl overflow-hidden">
                {/* Working days pills — always visible */}
                <div className="p-4">
                  <span className="block text-label font-semibold text-brand-dark tracking-[0.3px] mb-2">Days you work</span>
                  <div className="flex gap-1.5 mb-4">
                    {DAYS.map(({ day, label }) => {
                      const days = profile?.booking_working_days || [1,2,3,4,5];
                      const isActive = days.includes(day);
                      return (
                        <button
                          key={day}
                          onClick={async () => {
                            const current = profile?.booking_working_days || [1,2,3,4,5];
                            const next = isActive
                              ? current.filter(d => d !== day)
                              : [...current, day].sort();
                            if (userId) { const updated = await updateProfileFields(userId, { booking_working_days: next }); setProfile(updated); }
                            haptic('light');
                          }}
                          className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold cursor-pointer transition-colors ${
                            isActive
                              ? 'bg-brand-black text-brand-surface'
                              : 'bg-brand-surface text-brand-mid border border-brand-border'
                          }`}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>

                  {/* Working hours — always visible (these are the defaults) */}
                  <span className="block text-label font-semibold text-brand-dark tracking-[0.3px] mb-2">Working hours</span>
                  <div className="flex items-center gap-2">
                    <input
                      type="time"
                      value={profile?.booking_hours_start || '09:00'}
                      onClick={(e) => { try { (e.currentTarget as HTMLInputElement).showPicker(); } catch {} }}
                      onChange={async (e) => { if (userId) { const updated = await updateProfileFields(userId, { booking_hours_start: e.target.value }); setProfile(updated); } }}
                      className="flex-1 h-12 px-3 border border-brand-border rounded-lg text-base font-medium text-brand-black outline-none focus:border-brand-black bg-white"
                    />
                    <span className="text-sm text-brand-muted">to</span>
                    <input
                      type="time"
                      value={profile?.booking_hours_end || '17:00'}
                      onClick={(e) => { try { (e.currentTarget as HTMLInputElement).showPicker(); } catch {} }}
                      onChange={async (e) => { if (userId) { const updated = await updateProfileFields(userId, { booking_hours_end: e.target.value }); setProfile(updated); } }}
                      className="flex-1 h-12 px-3 border border-brand-border rounded-lg text-base font-medium text-brand-black outline-none focus:border-brand-black bg-white"
                    />
                  </div>
                </div>

                {/* Lunch break — enable-first */}
                <CollapsibleSection
                  title="Lunch break"
                  description="Block a time range so clients can't book during lunch"
                  enabled={hasBreak}
                  onToggle={handleToggleBreak}
                >
                  <div className="flex items-center gap-2 mt-3">
                    <input
                      type="time"
                      value={profile?.booking_break_start || '12:00'}
                      onClick={(e) => { try { (e.currentTarget as HTMLInputElement).showPicker(); } catch {} }}
                      onChange={async (e) => { if (userId) { const updated = await updateProfileFields(userId, { booking_break_start: e.target.value || undefined }); setProfile(updated); } }}
                      className="flex-1 h-12 px-3 border border-brand-border rounded-lg text-base font-medium text-brand-black outline-none focus:border-brand-black bg-white"
                    />
                    <span className="text-sm text-brand-muted">to</span>
                    <input
                      type="time"
                      value={profile?.booking_break_end || '13:00'}
                      onClick={(e) => { try { (e.currentTarget as HTMLInputElement).showPicker(); } catch {} }}
                      onChange={async (e) => { if (userId) { const updated = await updateProfileFields(userId, { booking_break_end: e.target.value || undefined }); setProfile(updated); } }}
                      className="flex-1 h-12 px-3 border border-brand-border rounded-lg text-base font-medium text-brand-black outline-none focus:border-brand-black bg-white"
                    />
                  </div>
                </CollapsibleSection>

                {/* Custom hours per day — enable-first */}
                <CollapsibleSection
                  title="Custom hours per day"
                  description="Override working hours for specific days"
                  enabled={hasPerDayHours}
                  onToggle={handleTogglePerDayHours}
                >
                  <p className="text-xs text-brand-muted mb-3 mt-3">Set different hours for specific days. Leave a field empty to use your default working hours.</p>
                  <div className="flex flex-col gap-3">
                    {DAY_LABELS.filter(({ day }) => (profile?.booking_working_days || [1,2,3,4,5]).includes(day)).map(({ day, label }) => {
                      const dayKey = String(day);
                      const perDay = profile?.booking_hours_per_day?.[dayKey];
                      const hasPartialFill = perDay && (!perDay.start || !perDay.end);
                      return (
                        <div key={day}>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-brand-dark w-24 shrink-0">{label}</span>
                            <input
                              type="time"
                              value={perDay?.start || ''}
                              onClick={(e) => { try { (e.currentTarget as HTMLInputElement).showPicker(); } catch {} }}
                              onChange={async (e) => {
                                if (!userId) return;
                                const current = profile?.booking_hours_per_day || {};
                                const end = perDay?.end || '';
                                if (!e.target.value && !end) {
                                  const { [dayKey]: _, ...rest } = current;
                                  const updated = await updateProfileFields(userId, { booking_hours_per_day: Object.keys(rest).length > 0 ? rest : undefined });
                                  setProfile(updated);
                                } else {
                                  const updated = await updateProfileFields(userId, { booking_hours_per_day: { ...current, [dayKey]: { start: e.target.value, end } } });
                                  setProfile(updated);
                                }
                              }}
                              className="flex-1 h-10 px-2 border border-brand-border rounded-lg text-sm font-medium text-brand-black outline-none focus:border-brand-black bg-white"
                            />
                            <span className="text-xs text-brand-muted">to</span>
                            <input
                              type="time"
                              value={perDay?.end || ''}
                              onClick={(e) => { try { (e.currentTarget as HTMLInputElement).showPicker(); } catch {} }}
                              onChange={async (e) => {
                                if (!userId) return;
                                const current = profile?.booking_hours_per_day || {};
                                const start = perDay?.start || '';
                                if (!start && !e.target.value) {
                                  const { [dayKey]: _, ...rest } = current;
                                  const updated = await updateProfileFields(userId, { booking_hours_per_day: Object.keys(rest).length > 0 ? rest : undefined });
                                  setProfile(updated);
                                } else {
                                  const updated = await updateProfileFields(userId, { booking_hours_per_day: { ...current, [dayKey]: { start, end: e.target.value } } });
                                  setProfile(updated);
                                }
                              }}
                              className="flex-1 h-10 px-2 border border-brand-border rounded-lg text-sm font-medium text-brand-black outline-none focus:border-brand-black bg-white"
                            />
                            {perDay && (
                              <button
                                onClick={async () => {
                                  if (!userId) return;
                                  const current = profile?.booking_hours_per_day || {};
                                  const { [dayKey]: _, ...rest } = current;
                                  const updated = await updateProfileFields(userId, { booking_hours_per_day: Object.keys(rest).length > 0 ? rest : undefined });
                                  setProfile(updated);
                                }}
                                className="text-brand-muted cursor-pointer text-xs underline shrink-0"
                              >Reset</button>
                            )}
                          </div>
                          {hasPartialFill && (
                            <p className="text-xs text-brand-muted mt-1 ml-[112px]">Empty fields use default hours</p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </CollapsibleSection>

                {/* Blocked dates — enable-first */}
                <CollapsibleSection
                  title="Blocked dates"
                  description="Block holidays and days you're not available"
                  enabled={hasBlockedDates}
                  onToggle={handleToggleBlockedDates}
                >
                  <div className="flex flex-col gap-2 mb-3 mt-3">
                    {(profile?.booking_blocked_dates || []).map((date) => (
                      <div key={date} className="flex items-center justify-between bg-brand-surface border border-brand-border rounded-lg px-3 py-2">
                        <span className="text-sm font-medium text-brand-dark">
                          {new Date(date + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
                        </span>
                        <button
                          onClick={async () => {
                            const current = profile?.booking_blocked_dates || [];
                            if (userId) { const updated = await updateProfileFields(userId, { booking_blocked_dates: current.filter(d => d !== date) }); setProfile(updated); }
                          }}
                          className="text-brand-muted cursor-pointer"
                          aria-label="Remove"
                        >
                          <span className="text-lg">&times;</span>
                        </button>
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="date"
                      id="blocked-date-input"
                      onClick={(e) => { try { (e.currentTarget as HTMLInputElement).showPicker(); } catch {} }}
                      min={new Date().toISOString().split('T')[0]}
                      className="flex-1 h-12 px-3 border border-brand-border rounded-lg text-base font-medium text-brand-black outline-none focus:border-brand-black bg-white"
                    />
                    <button
                      onClick={async () => {
                        const input = document.getElementById('blocked-date-input') as HTMLInputElement;
                        if (!input || !input.value) return;
                        const current = profile?.booking_blocked_dates || [];
                        if (current.includes(input.value)) { showToast('Date already blocked', 'info'); return; }
                        if (userId) { const updated = await updateProfileFields(userId, { booking_blocked_dates: [...current, input.value].sort() }); setProfile(updated); }
                        input.value = '';
                        haptic('light');
                      }}
                      className="px-4 h-12 bg-brand-black text-brand-surface rounded-lg text-sm font-semibold cursor-pointer"
                    >
                      Block
                    </button>
                  </div>
                </CollapsibleSection>
              </div>
            </div>

            {/* Privacy section */}
            <div>
              <div className="text-micro font-bold tracking-[0.7px] text-brand-mid mb-2 px-0.5">Privacy</div>
              <div className="bg-white border border-brand-border rounded-xl p-4">
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0 pr-3">
                    <p className="text-sm font-semibold text-brand-black">Show my phone number on the page</p>
                    <p className="text-xs text-brand-muted mt-0.5">Lets clients call you directly. Turn off to keep bookings online only</p>
                  </div>
                  <MiniToggle on={showPhone} onClick={handleTogglePhone} />
                </div>
              </div>
            </div>

            {/* Dead-end warning */}
            {deadEndWarning && (
              <div className="flex items-start gap-2 p-3 bg-status-amberBg border border-amber-200 rounded-lg">
                <AlertTriangle size={16} className="text-status-amber shrink-0 mt-0.5" />
                <p className="text-xs text-status-amber">
                  Your page has no way for clients to reach you &mdash; add public items in My Items or show your number.
                </p>
              </div>
            )}

            {/* QR code section */}
            {hasSlug && (
              <div>
                <div className="text-micro font-bold tracking-[0.7px] text-brand-mid mb-2 px-0.5">QR code</div>
                <div className="bg-white border border-brand-border rounded-2xl p-4">
                  <div className="flex flex-col items-center mb-4">
                    <div ref={qrContainerRef} style={{ width: '240px', height: '240px' }} className="qr-container flex items-center justify-center" />
                    <button
                      onClick={handleDownloadQR}
                      className="mt-3 flex items-center gap-1.5 px-4 py-2 bg-brand-surface border border-brand-border rounded-lg text-sm font-medium text-brand-dark cursor-pointer active:opacity-70 transition-opacity"
                    >
                      <Download size={14} />
                      Download QR
                    </button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Slug change confirm sheet */}
      {showSlugChangeConfirm && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40" onClick={() => setShowSlugChangeConfirm(false)}>
          <div className="bg-white rounded-t-2xl sm:rounded-2xl p-6 max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-bold text-brand-black mb-2">Change your link?</h3>
            <p className="text-sm text-brand-muted mb-4">
              Anyone with the old link or QR code will see &ldquo;not found&rdquo;. This can&rsquo;t be undone.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setShowSlugChangeConfirm(false)}
                className="flex-1 py-2.5 bg-brand-surface border border-brand-border rounded-lg text-sm font-semibold text-brand-dark cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={() => { setShowSlugChangeConfirm(false); handleSaveSlug(); }}
                className="flex-1 py-2.5 bg-brand-black text-white rounded-lg text-sm font-semibold cursor-pointer"
              >
                Change link
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
