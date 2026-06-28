import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, Mail, MessageSquare, Zap, ChevronLeft } from 'lucide-react';
import { db, type Profile, type ReminderMode } from '../../lib/db';
import { useAppStore } from '../../store/useAppStore';
import { updateProfileFields } from '../../lib/profile';
import { isPushSupported, subscribePush, unsubscribePush, getPushSubscription } from '../../lib/pushSubscription';
import { captureReminderModeChanged, capturePushSubscribed, capturePushUnsubscribed } from '../../lib/analytics';
import { showSuccess, showToast } from '../../components/Toast/store';

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
  const [pushLoading, setPushLoading] = useState(false);

  const load = useCallback(async () => {
    if (!userId) { setLoading(false); return; }
    const p = await db.profiles.get(userId);
    setProfile(p || null);
    const sub = await getPushSubscription();
    setPushEnabled(!!sub);
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
        const vapidKey = import.meta.env.VITE_VAPID_PUBLIC_KEY;
        if (!vapidKey) { showToast('Push not configured', 'error'); return; }
        const sub = await subscribePush(vapidKey);
        if (!sub) { showToast('Could not enable push notifications', 'error'); return; }
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
                <div className="w-5 h-5 rounded-full border-2 mt-0.5 shrink-0 flex items-center justify-center ${currentMode === opt.value ? 'border-status-blue' : 'border-brand-border'}">
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
              <span className="text-sm font-medium text-brand-dark flex-1">Email</span>
              {currentChannel === 'email' && <div className="w-2.5 h-2.5 rounded-full bg-status-blue" />}
            </button>
            <button
              onClick={() => updateChannel('sms')}
              className="w-full px-4 min-h-13 flex items-center gap-3 cursor-pointer transition-colors border-t border-brand-surface active:bg-brand-surface"
            >
              <MessageSquare size={18} className="text-brand-mid shrink-0" />
              <span className="text-sm font-medium text-brand-muted flex-1">SMS <span className="text-xs">(coming soon)</span></span>
            </button>
          </div>
        </div>

        {/* Push notifications */}
        <div className="mb-6">
          <div className="text-micro font-bold tracking-[0.7px] text-brand-mid mb-2 px-0.5">Push notifications</div>
          <div className="bg-white border border-brand-border rounded-xl overflow-hidden">
            <div className="px-4 min-h-13 flex items-center gap-3">
              <Bell size={18} className="text-brand-mid shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-medium text-brand-dark">Get notified on this device</p>
                {!pushSupported && <p className="text-xs text-status-amber mt-0.5">Requires adding Buildlogg to your Home Screen</p>}
              </div>
              <button
                onClick={togglePush}
                disabled={!pushSupported || pushLoading}
                className={`w-11 h-6.5 rounded-full transition-colors cursor-pointer ${pushEnabled ? 'bg-status-blue' : 'bg-brand-border'} ${!pushSupported || pushLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <div className={`w-5 h-5 rounded-full bg-white shadow-sm transition-transform ${pushEnabled ? 'translate-x-[22px]' : 'translate-x-0.5'}`} />
              </button>
            </div>
          </div>
          {pushSupported && pushEnabled && (
            <p className="text-xs text-brand-muted mt-2 px-0.5">You'll receive push notifications when recurring jobs are due, even if the app is closed.</p>
          )}
        </div>

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
