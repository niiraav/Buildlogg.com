import { useState } from 'react';
import { Bell, X } from 'lucide-react';
import { Button } from '../Button';
import { haptic } from '../../lib/haptics';
import { requestPermission, incrementDismissalCount, clearContextualFlag, isContextualActive } from '../../lib/notificationManager';
import { subscribePush, isPushSupported } from '../../lib/pushSubscription';
import { updateProfileFields } from '../../lib/profile';
import { useAppStore } from '../../store/useAppStore';
import { capture, capturePushSubscribed } from '../../lib/analytics';
import { showSuccess, showToast } from '../Toast/store';

export function NotificationBanner() {
  const [visible, setVisible] = useState(true);
  const [loading, setLoading] = useState(false);
  const contextual = isContextualActive();
  const userId = useAppStore((s) => s.userId);

  if (!visible) return null;

  const handleAllow = async () => {
    haptic('light');
    capture('notification_permission_requested', {});
    setLoading(true);
    try {
      // Step 1: Request notification permission
      const granted = await requestPermission();
      clearContextualFlag();

      if (!granted) {
        incrementDismissalCount();
        capture('notification_permission_denied', { dismissal_count: 0 });
        setVisible(false);
        showToast('Notifications blocked. Enable in iPhone Settings → Buildlogg to get reminders.', 'error');
        return;
      }

      capture('notification_permission_granted', {});

      // Step 2: Subscribe to push (same flow as Settings → Smart reminders)
      if (!isPushSupported() || !userId) {
        setVisible(false);
        showSuccess('Notifications enabled — add to Home Screen for push alerts');
        return;
      }

      const vapidKey = import.meta.env.VITE_VAPID_PUBLIC_KEY;
      if (!vapidKey) {
        setVisible(false);
        showSuccess('Notifications enabled');
        return;
      }

      const sub = await subscribePush(vapidKey);
      if (sub) {
        const keys = (sub as PushSubscription & { keys?: { p256dh: string; auth: string } }).keys;
        await updateProfileFields(userId, {
          push_subscription_endpoint: sub.endpoint,
          push_subscription_keys: keys,
        });
        capturePushSubscribed(new URL(sub.endpoint).hostname);
        showSuccess('Push notifications enabled');
      }

      setVisible(false);
    } finally {
      setLoading(false);
    }
  };

  const handleDismiss = () => {
    haptic('light');
    incrementDismissalCount();
    clearContextualFlag();
    setVisible(false);
    capture('notification_banner_dismissed', { dismissal_count: 0 });
  };

  const copy = contextual
    ? 'Want a reminder to follow up on quotes and payments? Turn on notifications.'
    : 'Turn on notifications so Buildlogg can remind you when jobs are done, quotes go stale, and payments are due.';

  capture('notification_banner_shown', { variant: contextual ? 'contextual' : 'initial' });

  return (
    <div className="bg-status-blueBg border border-status-blueBorder rounded-lg px-3.5 py-3 mb-4 flex items-start gap-3">
      <Bell size={18} className="text-status-blue shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-status-blue leading-relaxed">{copy}</p>
        <div className="flex gap-2 mt-2.5">
          <Button variant="primary" size="sm" onClick={handleAllow} disabled={loading}>
            {loading ? 'Enabling…' : 'Allow'}
          </Button>
          <button
            onClick={handleDismiss}
            className="text-sm font-medium text-status-blue underline underline-offset-2 cursor-pointer px-3"
            disabled={loading}
          >
            Maybe later
          </button>
        </div>
      </div>
      <button
        onClick={handleDismiss}
        className="shrink-0 text-status-blue/60 cursor-pointer"
        aria-label="Dismiss"
        disabled={loading}
      >
        <X size={16} />
      </button>
    </div>
  );
}

export default NotificationBanner;
