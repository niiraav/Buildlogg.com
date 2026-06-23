import React from 'react';
import { Share, Plus, MoreVertical, Smartphone, X, Zap, Wifi, Clock } from 'lucide-react';
import { useAddToHomeScreen } from '../../hooks/useAddToHomeScreen';
import { haptic } from '../../lib/haptics';

export interface AddToHomeScreenProps {
  /** Compact mode: smaller card with less padding (for inline use in settings) */
  compact?: boolean;
  /** Banner mode: single-line dismissible banner for top of settings */
  banner?: boolean;
  /** Variant: 'full' shows benefits + instructions, 'minimal' shows just the prompt */
  variant?: 'full' | 'minimal';
  /** Optional title override */
  title?: string;
}

/**
 * AddToHomeScreen — reusable component that shows platform-specific
 * "Add to Home Screen" instructions. Renders nothing if the app is
 * already installed (standalone mode) or the user has dismissed it
 * within the last 14 days.
 */
export const AddToHomeScreen: React.FC<AddToHomeScreenProps> = ({
  compact = false,
  banner = false,
  variant = 'full',
  title,
}) => {
  const { canPrompt, isInstalled, platform, hasNativePrompt, promptInstall, dismiss } = useAddToHomeScreen();

  if (isInstalled || !canPrompt) return null;

  const handleDismiss = () => {
    haptic('light');
    dismiss();
  };

  const handleInstall = async () => {
    haptic('light');
    await promptInstall();
  };

  const heading = title || 'Add Buildlogg to your Home Screen';
  const padding = compact ? 'p-3.5' : 'p-4';

  // Banner mode: compact single-line dismissible banner
  if (banner) {
    return (
      <div className="flex items-center gap-3 bg-brand-surface border border-brand-border rounded-lg p-3 mb-4">
        <div className="shrink-0 w-9 h-9 rounded-lg bg-brand-black flex items-center justify-center">
          <Smartphone size={18} className="text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-brand-black truncate">{heading}</p>
          <p className="text-xs text-brand-dark mt-0.5">Get the full app experience</p>
        </div>
        <button
          onClick={handleInstall}
          className="shrink-0 h-9 px-3 bg-brand-black text-white text-sm font-semibold rounded-lg active:opacity-80 transition-opacity cursor-pointer"
        >
          Add
        </button>
        <button
          onClick={handleDismiss}
          className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-brand-mid hover:text-brand-black transition-colors cursor-pointer"
          aria-label="Dismiss"
        >
          <X size={16} />
        </button>
      </div>
    );
  }

  const benefits = [
    { icon: <Zap size={14} />, text: 'One tap to open' },
    { icon: <Wifi size={14} />, text: 'Works offline' },
    { icon: <Clock size={14} />, text: 'No app store needed' },
  ];

  return (
    <div className={`bg-gradient-to-br from-brand-surface to-brand-borderLight border border-brand-border rounded-xl ${padding} relative`}>
      {/* Dismiss button */}
      <button
        onClick={handleDismiss}
        className="absolute top-2 right-2 w-7 h-7 rounded-full flex items-center justify-center text-brand-mid hover:text-brand-black transition-colors cursor-pointer z-10"
        aria-label="Dismiss"
      >
        <X size={16} />
      </button>

      <div className="flex items-start gap-3 pr-6">
        <div className={`shrink-0 ${compact ? 'w-9 h-9' : 'w-11 h-11'} rounded-xl bg-brand-black flex items-center justify-center`}>
          <Smartphone size={compact ? 18 : 22} className="text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className={`font-bold text-brand-black ${compact ? 'text-sm' : 'text-base'}`}>
            {heading}
          </h3>
          <p className={`text-brand-mid mt-0.5 ${compact ? 'text-xs' : 'text-sm'} leading-relaxed`}>
            Get the full app experience on your phone.
          </p>
        </div>
      </div>

      {/* Benefits row — only in full variant */}
      {variant === 'full' && !compact && (
        <div className="flex gap-4 mt-3 mb-3">
          {benefits.map((b, i) => (
            <div key={i} className="flex items-center gap-1.5 text-xs font-medium text-brand-mid">
              <span className="text-brand-black">{b.icon}</span>
              {b.text}
            </div>
          ))}
        </div>
      )}

      {/* Platform-specific instructions */}
      <div className="mt-3">
        {platform === 'ios' && (
          <div className="space-y-2">
            <div className="flex items-start gap-2.5">
              <span className="shrink-0 w-5 h-5 rounded-full bg-white border border-brand-border flex items-center justify-center text-xs font-bold text-brand-mid mt-0.5">1</span>
              <div className="flex items-center gap-1.5 text-sm text-brand-dark flex-wrap">
                Tap the
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white border border-brand-border font-semibold text-brand-black">
                  <Share size={14} />
                  Share
                </span>
                button at the bottom of Safari
              </div>
            </div>
            <div className="flex items-start gap-2.5">
              <span className="shrink-0 w-5 h-5 rounded-full bg-white border border-brand-border flex items-center justify-center text-xs font-bold text-brand-mid mt-0.5">2</span>
              <div className="flex items-center gap-1.5 text-sm text-brand-dark flex-wrap">
                Scroll down and tap
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white border border-brand-border font-semibold text-brand-black">
                  <Plus size={14} />
                  Add to Home Screen
                </span>
              </div>
            </div>
            <div className="flex items-start gap-2.5">
              <span className="shrink-0 w-5 h-5 rounded-full bg-white border border-brand-border flex items-center justify-center text-xs font-bold text-brand-mid mt-0.5">3</span>
              <span className="text-sm text-brand-dark">Tap <strong className="text-brand-black">Add</strong> — that's it!</span>
            </div>
          </div>
        )}

        {platform === 'android' && hasNativePrompt && (
          <button
            onClick={handleInstall}
            className="w-full h-12 bg-brand-black text-white rounded-lg text-sm font-semibold flex items-center justify-center gap-2 cursor-pointer active:opacity-80 transition-opacity"
          >
            <Plus size={18} />
            Add to Home Screen
          </button>
        )}

        {platform === 'android' && !hasNativePrompt && (
          <div className="space-y-2">
            <div className="flex items-start gap-2.5">
              <span className="shrink-0 w-5 h-5 rounded-full bg-white border border-brand-border flex items-center justify-center text-xs font-bold text-brand-mid mt-0.5">1</span>
              <div className="flex items-center gap-1.5 text-sm text-brand-dark flex-wrap">
                Tap the menu
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white border border-brand-border font-semibold text-brand-black">
                  <MoreVertical size={14} />
                </span>
                in your browser
              </div>
            </div>
            <div className="flex items-start gap-2.5">
              <span className="shrink-0 w-5 h-5 rounded-full bg-white border border-brand-border flex items-center justify-center text-xs font-bold text-brand-mid mt-0.5">2</span>
              <span className="text-sm text-brand-dark">Select <strong className="text-brand-black">Add to Home screen</strong> or <strong className="text-brand-black">Install app</strong></span>
            </div>
          </div>
        )}

        {platform === 'other' && (
          <div className="space-y-2">
            <div className="flex items-start gap-2.5">
              <span className="shrink-0 w-5 h-5 rounded-full bg-white border border-brand-border flex items-center justify-center text-xs font-bold text-brand-mid mt-0.5">1</span>
              <div className="flex items-center gap-1.5 text-sm text-brand-dark flex-wrap">
                Tap the menu
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white border border-brand-border font-semibold text-brand-black">
                  <MoreVertical size={14} />
                </span>
                in your browser
              </div>
            </div>
            <div className="flex items-start gap-2.5">
              <span className="shrink-0 w-5 h-5 rounded-full bg-white border border-brand-border flex items-center justify-center text-xs font-bold text-brand-mid mt-0.5">2</span>
              <span className="text-sm text-brand-dark">Select <strong className="text-brand-black">Install app</strong> or <strong className="text-brand-black">Add to Home screen</strong></span>
            </div>
          </div>
        )}
      </div>

      {/* "Maybe later" link */}
      <button
        onClick={handleDismiss}
        className="mt-3 text-xs font-medium text-brand-muted hover:text-brand-mid transition-colors cursor-pointer"
      >
        Maybe later
      </button>
    </div>
  );
};

export default AddToHomeScreen;
