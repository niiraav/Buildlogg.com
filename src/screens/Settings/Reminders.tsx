import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, Mail, MessageSquare, Zap, ChevronLeft, AlertCircle, BellOff } from 'lucide-react';
import { db, type Profile, type ReminderMode } from '../../lib/db';
import { useAppStore } from '../../store/useAppStore';
import { updateProfileFields } from '../../lib/profile';
import { isPushSupported, subscribePush, unsubscribePush, getPushSubscription } from '../../lib/pushSubscription';
import { requestPermission, getNotificationState } from '../../lib/notificationManager';
import { captureReminderModeChanged, capturePushSubscribed, capturePushUnsubscribed } from '../../lib/analytics';
import { showSuccess, showToast } from '../../components/Toast/store';
import { Button } from '../../components/Button';

const MODE_OPTIONS: Array<{ value: ReminderMode; label: string; description: string }> = [
  { value: 'remind_me', label: 'Remind me', description: 'Get a push notification when a client is due' },
  { value: 'remind_client', label: 'Auto-message client', description: 'Automatically email the client when they\'re due' },
  { value: 'both', label: 'Both', description: 'Notify you AND auto-message the client' },
];

export default function Reminders() {
  const navigate = useNavigate();
  const userId = useAppStore((s) => s.userId);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [notifPermission, setNotifPermission] = useState<NotificationPermission | 'unsupported' | 'unknown'>('unknown');
  const [emailStats, setEmailStats] = useState({ total: 0, withEmail: 0 });
  const [pushLoading, setPushLoading] = useState(false);

  const load = useCallback(async () => {
    if (!userId) { setLoading(false); return; }
    const p = await db.profiles.get(userId);
    setProfile(p || null);
    const sub = await getPushSubscription();
    setPushEnabled(!!sub);
    setNotifPermission(getNotificationState());
    // Email coverage stat
    const all = await db.customers.where('user_id').equals(userId).filter(c => !c.is_archived).toArray();
    setEmailStats({ total: all.length, withEmail: all.filter(c => c.email).length });
    setLoading(false);
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  const updateMode = async (mode: ReminderMode) => {
    if (!userId) return;
    const updated = await updateProfileFields(userId, { default_reminder_mode: mode });
    setProfile(updated);
    captureReminderModeChanged(mode, 'settings');
    showSuccess('Default reminder mode updated');
  };

  const updateChannel = async (channel: 'email' | 'sms') => {
    if (!userId) return;
    if (channel === 'sms') { showToast('SMS coming soon', 'info'); return; }
    const updated = await updateProfileFields(userId, { default_reminder_channel: channel });
    setProfile(updated);
    showSuccess('Reminder channel updated');
  };

  // Enable flow: request permission first, then subscribe to push
  const handleEnableNotifications = async () => {
    if (!userId) return;
    setPushLoading(true);
    try {
      // Step 1: Request notification permission
      const granted = await requestPermission();
      setNotifPermission(granted ? 'granted' : 'denied');

      if (!granted) {
        showToast('Notification permission denied. Enable in Settings to receive push alerts.', 'error');
        return;
      }

      // Step 2: Subscribe to push
      const vapidKey = import.meta.env.VITE_VAPID_PUBLIC_KEY;
      if (!vapidKey) {
        showToast('Push notifications aren\'t set up yet. We\'re rolling this out gradually.', 'error');
        return;
      }
      const sub = await subscribePush(vapidKey);
      if (!sub) {
        showToast('Could not enable push notifications. Try again later.', 'error');
        return;
      }
      const keys = (sub as PushSubscription & { keys?: { p256dh: string; auth: string } }).keys;
      await updateProfileFields(userId, {
        push_subscription_endpoint: sub.endpoint,
        push_subscription_keys: keys,
      });
      setPushEnabled(true);
      capturePushSubscribed(new URL(sub.endpoint).hostname);
      showSuccess('Push notifications enabled');
    } finally {
      setPushLoading(false);
    }
  };

  const togglePush = async () => {
    if (!userId) return;
    setPushLoading(true);
    try {
      if (pushEnabled) {
        await unsubscribePush();
        await updateProfileFields(userId, { push_subscription_endpoint: undefined, push_subscription_keys: undefined });
        setPushEnabled(false);
        capturePushUnsubscribed('manual');
        showSuccess('Push notifications disabled');
      } else {
        // Re-enable: permission should already be granted, just re-subscribe
        const vapidKey = import.meta.env.VITE_VAPID_PUBLIC_KEY;
        if (!vapidKey) {
          showToast('Push notifications aren\'t set up yet. We\'re rolling this out gradually.', 'error');
          return;
        }
        const sub = await subscribePush(vapidKey);
        if (!sub) {
          showToast('Could not enable push notifications. Try again later.', 'error');
          return;
        }
        const keys = (sub as PushSubscription & { keys?: { p256dh: string; auth: string } }).keys;
        await updateProfileFields(userId, {
          push_subscription_endpoint: sub.endpoint,
          push_subscription_keys: keys,
        });
        setPushEnabled(true);
        capturePushSubscribed(new URL(sub.endpoint).hostname);
        showSuccess('Push notifications enabled');
      }
    } finally {
      setPushLoading(false);
    }
  };

  if (loading) {
    return <div className="min-h-[100dvh] flex items-center justify-center"><p className="text-sm text-brand-muted">Loading…</p></div>;
  }

  const pushSupported = isPushSupported();
  const currentMode = profile?.default_reminder_mode || 'remind_me';
  const currentChannel = profile?.default_reminder_channel || 'email';

  // Determine the push UI state
  // State A: Push not supported → show "add to Home Screen" help
  // State B: Permission not yet asked ('default') → show "Enable notifications" button
  // State C: Permission denied → show "blocked" state with iOS Settings instructions
  // State D: Permission granted + not subscribed → show toggle (off)
  // State E: Permission granted + subscribed → show toggle (on)
  const showEnableButton = pushSupported && notifPermission === 'default';
  const showBlockedState = pushSupported && notifPermission === 'denied';
  const showToggle = pushSupported && notifPermission === 'granted';

  return (
    <div className="bg-[var(--app-shell-bg)] flex flex-col min-h-[100dvh]">
      {/* Header */}
      <div className="sticky top-0 z-40 px-4 pt-5 pb-3 bg-[var(--app-shell-bg)] border-b border-brand-borderLight">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/settings')} className="w-8 h-8 flex items-center justify-center rounded-lg cursor-pointer text-brand-muted hover:text-brand-dark hover:bg-brand-surface transition-colors">
            <ChevronLeft size={20} />
          </button>
          <h1 className="screen-title text-brand-black">Smart reminders</h1>
        </div>
      </div>

      <div className="px-4 pt-4 pb-[calc(44px + env(safe-area-inset-bottom))]">
        {/* Default mode */}
        <div className="mb-6">
          <div className="text-micro font-bold tracking-[0.7px] text-brand-mid mb-2 px-0.5">Default mode</div>
          <div className="bg-white border border-brand-border rounded-xl overflow-hidden">
            {MODE_OPTIONS.map((opt, i) => (
              <button
                key={opt.value}
                onClick={() => updateMode(opt.value)}
                className={`w-full px-4 min-h-13 flex items-start gap-3 text-left cursor-pointer transition-colors ${i > 0 ? 'border-t border-brand-surface' : ''} ${currentMode === opt.value ? 'bg-status-blueBg/50' : 'active:bg-brand-surface'}`}
              >
                <div className={`w-5 h-5 rounded-full border-2 mt-0.5 shrink-0 flex items-center justify-center ${currentMode === opt.value ? 'border-status-blue' : 'border-brand-border'}`}>
                  {currentMode === opt.value && <div className="w-2.5 h-2.5 rounded-full bg-status-blue" />}
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-brand-dark">{opt.label}</p>
                  <p className="text-xs text-brand-muted mt-0.5">{opt.description}</p>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Channel */}
        <div className="mb-6">
          <div className="text-micro font-bold tracking-[0.7px] text-brand-mid mb-2 px-0.5">Message channel</div>
          <div className="bg-white border border-brand-border rounded-xl overflow-hidden">
            <button
              onClick={() => updateChannel('email')}
              className={`w-full px-4 min-h-13 flex items-center gap-3 cursor-pointer transition-colors ${currentChannel === 'email' ? 'bg-status-blueBg/50' : 'active:bg-brand-surface'}`}
            >
              <Mail size={18} className="text-brand-mid shrink-0" />
              <span className="text-sm font-medium text-brand-dark flex-1 text-left">Email</span>
              <span className="text-xs font-medium text-status-blue">Default</span>
            </button>
            <div className="w-full px-4 min-h-13 flex items-center gap-3 border-t border-brand-surface">
              <MessageSquare size={18} className="text-brand-mid shrink-0 opacity-50" />
              <span className="text-sm font-medium text-brand-muted flex-1">SMS <span className="text-xs">(coming soon)</span></span>
            </div>
          </div>
        </div>

        {/* Push notifications */}
        <div className="mb-6">
          <div className="text-micro font-bold tracking-[0.7px] text-brand-mid mb-2 px-0.5">Push notifications</div>
          <div className="bg-white border border-brand-border rounded-xl overflow-hidden">
            {/* State A: Not supported (not installed as PWA) */}
            {!pushSupported && (
              <div className="px-4 min-h-13 flex items-center gap-3">
                <Bell size={18} className="text-brand-mid shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-brand-dark">Get notified on this device</p>
                  <button onClick={() => navigate("/settings")} className="text-xs text-status-amber mt-0.5 py-1 underline underline-offset-2 cursor-pointer">Requires adding to Home Screen — tap for help</button>
                </div>
              </div>
            )}

            {/* State B: Supported + permission not asked → Enable button */}
            {showEnableButton && (
              <div className="px-4 py-4 flex flex-col gap-3">
                <div className="flex items-center gap-3">
                  <Bell size={18} className="text-brand-mid shrink-0" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-brand-dark">Get notified on this device</p>
                    <p className="text-xs text-brand-muted mt-0.5">Allow notifications for push alerts when clients are due</p>
                  </div>
                </div>
                <Button variant="primary" size="sm" fullWidth={false} onClick={handleEnableNotifications} disabled={pushLoading}>
                  {pushLoading ? 'Enabling…' : 'Enable notifications'}
                </Button>
              </div>
            )}

            {/* State C: Permission denied → Blocked state */}
            {showBlockedState && (
              <div className="px-4 py-4 flex flex-col gap-3">
                <div className="flex items-center gap-3">
                  <BellOff size={18} className="text-status-red shrink-0" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-brand-dark">Notifications blocked</p>
                    <p className="text-xs text-brand-muted mt-0.5">You previously denied notification permission</p>
                  </div>
                </div>
                <div className="flex items-start gap-2 bg-status-redBg border border-red-200 rounded-lg p-3">
                  <AlertCircle size={14} className="text-status-red shrink-0 mt-0.5" />
                  <p className="text-xs text-status-red leading-relaxed">
                    To re-enable: open iPhone Settings → Buildlogg → Notifications → Allow Notifications. Then reopen the app.
                  </p>
                </div>
              </div>
            )}

            {/* State D & E: Permission granted → Toggle */}
            {showToggle && (
              <div className="px-4 min-h-13 flex items-center gap-3">
                <Bell size={18} className="text-brand-mid shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-brand-dark">Get notified on this device</p>
                </div>
                <button
                  onClick={togglePush}
                  disabled={pushLoading}
                  className={`w-11 h-6.5 rounded-full transition-colors cursor-pointer ${pushEnabled ? 'bg-status-blue' : 'bg-brand-border'} ${pushLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  <div className={`w-5 h-5 rounded-full bg-white shadow-sm transition-transform ${pushEnabled ? 'translate-x-[22px]' : 'translate-x-0.5'}`} />
                </button>
              </div>
            )}
          </div>
          {showToggle && pushEnabled && (
            <div className="flex items-start gap-2 bg-status-amberBg border border-amber-200 rounded-lg p-3 mt-2">
              <AlertCircle size={16} className="text-status-amber shrink-0 mt-0.5" />
              <p className="text-xs text-status-amber leading-relaxed">Push is subscribed, but automated sending isn't active yet. You'll still get in-app task cards for all reminders.</p>
            </div>
          )}
        </div>

        {/* Email coverage stat */}
        {emailStats.total > 0 && (
          <div className="mb-6">
            <div className="bg-brand-surface border border-brand-border rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-brand-dark">Client email coverage</span>
                <span className="text-sm font-bold text-brand-black">{emailStats.withEmail}/{emailStats.total}</span>
              </div>
              <div className="h-2 bg-brand-border rounded-full overflow-hidden">
                <div
                  className="h-full bg-status-blue rounded-full transition-all"
                  style={{ width: `${Math.round((emailStats.withEmail / emailStats.total) * 100)}%` }}
                />
              </div>
              {emailStats.withEmail === 0 ? (
                <p className="text-xs text-brand-muted mt-2">No clients have email yet — add emails when creating quotes to enable auto-messaging.</p>
              ) : emailStats.withEmail < emailStats.total / 2 ? (
                <p className="text-xs text-brand-muted mt-2">Only {emailStats.withEmail} of {emailStats.total} clients have email — add more to get the most from auto-messaging.</p>
              ) : (
                <p className="text-xs text-brand-muted mt-2">{emailStats.withEmail} of {emailStats.total} clients can receive auto-reminders.</p>
              )}
            </div>
          </div>
        )}

        {/* How it works */}
        <div className="bg-brand-surface border border-brand-border rounded-xl p-4">
          <div className="flex items-start gap-2.5">
            <Zap size={16} className="text-status-blue shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-brand-dark mb-1">How smart reminders work</p>
              <p className="text-xs text-brand-muted leading-relaxed">
                Buildlogg checks your recurring jobs every day at 9am. When a client's service is due soon,
                it automatically sends them a reminder (email) or notifies you (push), depending on your mode.
                Each recurring job can also have its own mode — override it from the task card.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
