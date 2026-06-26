import { useState } from 'react';
import { Bell, X } from 'lucide-react';
import { Button } from '../Button';
import { haptic } from '../../lib/haptics';
import { requestPermission, incrementDismissalCount, clearContextualFlag, isContextualActive } from '../../lib/notificationManager';
import { capture } from '../../lib/analytics';

export function NotificationBanner() {
  const [visible, setVisible] = useState(true);
  const contextual = isContextualActive();

  if (!visible) return null;

  const handleAllow = async () => {
    haptic('light');
    capture('notification_permission_requested', {});
    const granted = await requestPermission();
    clearContextualFlag();
    setVisible(false);
    if (granted) {
      capture('notification_permission_granted', {});
    } else {
      incrementDismissalCount();
      capture('notification_permission_denied', { dismissal_count: 0 });
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
    <div className="bg-status-blueBg border border-blue-200 rounded-lg px-3.5 py-3 mb-4 flex items-start gap-3">
      <Bell size={18} className="text-status-blue shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-status-blue leading-relaxed">{copy}</p>
        <div className="flex gap-2 mt-2.5">
          <Button variant="primary" size="sm" onClick={handleAllow}>Allow</Button>
          <button
            onClick={handleDismiss}
            className="text-sm font-medium text-status-blue underline underline-offset-2 cursor-pointer px-3"
          >
            Maybe later
          </button>
        </div>
      </div>
      <button
        onClick={handleDismiss}
        className="shrink-0 text-status-blue/60 cursor-pointer"
        aria-label="Dismiss"
      >
        <X size={16} />
      </button>
    </div>
  );
}

export default NotificationBanner;
