import { Lock } from 'lucide-react';

interface ProBadgeProps {
  /** When true, renders as a full-width locked card instead of an inline pill */
  variant?: 'inline' | 'locked';
  /** Feature label for the locked card variant */
  label?: string;
  /** URL to open when tapped */
  upgradeUrl: string;
}

/**
 * ProBadge — small "Pro" pill with lock icon, or a full locked card.
 *
 * Inline: appears next to a feature label (e.g. PDF toggle, signature line).
 * Locked: replaces a feature section with "Pro feature — Tap to upgrade".
 *
 * During beta, this component never renders because can() always returns true.
 */
export function ProBadge({ variant = 'inline', label, upgradeUrl }: ProBadgeProps) {
  const handleClick = () => {
    window.open(upgradeUrl, '_blank');
  };

  if (variant === 'locked') {
    return (
      <div
        onClick={handleClick}
        className="flex flex-col items-center justify-center py-8 px-4 cursor-pointer active:scale-[0.98] transition-transform"
      >
        <div className="flex items-center gap-1.5 mb-1.5">
          <Lock size={14} className="text-brand-mid" />
          <span className="text-sm font-semibold text-brand-mid">Pro feature</span>
        </div>
        {label && <p className="text-xs text-brand-muted text-center mb-2">{label}</p>}
        <span className="text-xs font-semibold text-brand-black bg-brand-surface border border-brand-border px-3 py-1 rounded-full">
          Tap to upgrade
        </span>
      </div>
    );
  }

  return (
    <button
      onClick={handleClick}
      className="inline-flex items-center gap-1 text-xs font-semibold text-brand-black bg-brand-surface border border-brand-border px-2 py-0.5 rounded-full cursor-pointer active:opacity-70 transition-opacity shrink-0"
    >
      <Lock size={10} />
      Pro
    </button>
  );
}

export default ProBadge;
