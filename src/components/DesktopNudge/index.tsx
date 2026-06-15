import { useState } from 'react';
import { X } from 'lucide-react';

export default function DesktopNudge() {
  const [dismissed, setDismissed] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('tp_desktop_nudge_dismissed') === '1';
    }
    return false;
  });

  if (typeof window !== 'undefined' && window.innerWidth <= 768) return null;
  if (dismissed) return null;

  return (
    <div className="bg-brand-black text-brand-surface px-4 py-3 text-sm flex items-center justify-between gap-3">
      <span>Buildlogg is designed for your phone — for the best experience, open it on mobile.</span>
      <button
        onClick={() => {
          localStorage.setItem('tp_desktop_nudge_dismissed', '1');
          setDismissed(true);
        }}
        className="bg-transparent border-none text-brand-muted cursor-pointer text-lg leading-none min-w-7 min-h-7 flex items-center justify-center p-0"
        aria-label="Dismiss desktop nudge"
      >
        <X size={18} />
      </button>
    </div>
  );
}
