import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Share, Plus, MoreVertical, Smartphone, X, Zap, Wifi, Clock, Check } from 'lucide-react';
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

/* ─── Install instructions modal (replicates landing page design) ─── */

const InstallModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  platform: 'ios' | 'android' | 'other';
  hasNativePrompt: boolean;
  onNativeInstall: () => void;
}> = ({ isOpen, onClose, platform, hasNativePrompt, onNativeInstall }) => {
  if (!isOpen) return null;

  return createPortal(
    <AnimatePresence>
      <div className="fixed inset-0 z-[60] flex items-center justify-center p-6">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="absolute inset-0 bg-black/55"
          style={{ backdropFilter: 'blur(2px)' }}
          onClick={() => { haptic('light'); onClose(); }}
        />
        {/* Card */}
        <motion.div
          initial={{ opacity: 0, scale: 0.92, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.92, y: 12 }}
          transition={{ type: 'spring', stiffness: 320, damping: 28 }}
          className="relative z-[61] w-full max-w-[380px] bg-[var(--app-shell-bg)] rounded-2xl p-6 text-center"
          style={{ boxShadow: '0 8px 40px rgba(0,0,0,.18)' }}
        >
          {/* Close */}
          <button
            onClick={() => { haptic('light'); onClose(); }}
            className="absolute top-3.5 right-3.5 w-8 h-8 rounded-full flex items-center justify-center text-brand-mid hover:bg-brand-surface hover:text-brand-black transition-colors cursor-pointer"
            aria-label="Close"
          >
            <X size={18} />
          </button>

          {/* Icon */}
          <div className="w-13 h-13 rounded-2xl bg-brand-surface flex items-center justify-center mx-auto mb-3.5">
            <Smartphone size={26} className="text-brand-black" />
          </div>

          {/* Title + subtitle */}
          <h3 className="text-xl font-bold text-brand-black tracking-tight mb-1.5">
            Add Buildlogg to your home screen
          </h3>
          <p className="text-sm text-brand-dark leading-relaxed mb-5">
            Open the app in one tap, like a native app.
          </p>

          {/* Platform-specific content */}
          {hasNativePrompt ? (
            <div>
              <p className="text-sm text-brand-dark mb-4">
                Tap below to install Buildlogg directly from your browser.
              </p>
              <button
                onClick={() => { haptic('light'); onNativeInstall(); onClose(); }}
                className="w-full h-12 bg-brand-primary text-brand-primaryText rounded-xl text-sm font-semibold flex items-center justify-center gap-2 cursor-pointer active:opacity-80 transition-opacity"
              >
                <Plus size={18} />
                Install Buildlogg
              </button>
            </div>
          ) : platform === 'ios' ? (
            <div>
              <ol className="text-left space-y-0 mb-5">
                {[
                  { icon: <Share size={14} />, text: 'Tap the Share button in Safari (the square with an arrow icon).' },
                  { icon: <Plus size={14} />, text: 'Scroll down and tap Add to Home Screen.' },
                  { icon: <Check size={14} />, text: 'Tap Add in the top-right corner.' },
                ].map((step, i) => (
                  <li key={i} className="flex items-start gap-3 py-2.5 border-b border-brand-borderLight last:border-b-0">
                    <span className="shrink-0 w-6 h-6 rounded-full bg-brand-primary text-brand-primaryText text-xs font-bold flex items-center justify-center mt-0.5">
                      {i + 1}
                    </span>
                    <span className="text-sm text-brand-dark leading-relaxed flex-1">
                      {step.text}
                      {i === 0 && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white border border-brand-border font-semibold text-brand-black ml-1.5">
                          {step.icon}
                          Share
                        </span>
                      )}
                      {i === 1 && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white border border-brand-border font-semibold text-brand-black ml-1.5">
                          {step.icon}
                          Add to Home Screen
                        </span>
                      )}
                    </span>
                  </li>
                ))}
              </ol>
              <p className="text-xs text-brand-dark leading-relaxed">
                This works in Safari on iPhone and iPad. Other browsers on iOS may not support home-screen shortcuts.
              </p>
            </div>
          ) : platform === 'android' ? (
            <div>
              <ol className="text-left space-y-0 mb-5">
                {[
                  { icon: <MoreVertical size={14} />, text: 'Tap the menu in Chrome.' },
                  { text: 'Tap Add to Home Screen or Install app.' },
                  { text: 'Tap Add or Install when prompted.' },
                ].map((step, i) => (
                  <li key={i} className="flex items-start gap-3 py-2.5 border-b border-brand-borderLight last:border-b-0">
                    <span className="shrink-0 w-6 h-6 rounded-full bg-brand-primary text-brand-primaryText text-xs font-bold flex items-center justify-center mt-0.5">
                      {i + 1}
                    </span>
                    <span className="text-sm text-brand-dark leading-relaxed flex-1">
                      {step.text}
                      {step.icon && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white border border-brand-border font-semibold text-brand-black ml-1.5">
                          {step.icon}
                        </span>
                      )}
                    </span>
                  </li>
                ))}
              </ol>
              <p className="text-xs text-brand-dark leading-relaxed">
                On some Android phones the browser may show an "Install app" banner at the bottom instead.
              </p>
            </div>
          ) : (
            <div>
              <ol className="text-left space-y-0 mb-5">
                {[
                  'Look for the install icon in the address bar (Chrome or Edge).',
                  'Click it and choose Install Buildlogg.',
                  'The app will open in its own window from your desktop or taskbar.',
                ].map((step, i) => (
                  <li key={i} className="flex items-start gap-3 py-2.5 border-b border-brand-borderLight last:border-b-0">
                    <span className="shrink-0 w-6 h-6 rounded-full bg-brand-primary text-brand-primaryText text-xs font-bold flex items-center justify-center mt-0.5">
                      {i + 1}
                    </span>
                    <span className="text-sm text-brand-dark leading-relaxed">{step}</span>
                  </li>
                ))}
              </ol>
              <p className="text-xs text-brand-dark leading-relaxed">
                On desktop, install is supported in Chrome, Edge, and Brave. Safari on Mac does not support installing PWAs.
              </p>
            </div>
          )}
        </motion.div>
      </div>
    </AnimatePresence>,
    document.body,
  );
};

/* ─── Main component ─── */

export const AddToHomeScreen: React.FC<AddToHomeScreenProps> = ({
  compact = false,
  banner = false,
  variant = 'full',
  title,
}) => {
  const { canPrompt, isInstalled, platform, hasNativePrompt, promptInstall, dismiss } = useAddToHomeScreen();
  const [modalOpen, setModalOpen] = useState(false);

  if (isInstalled || !canPrompt) return null;

  const handleDismiss = () => {
    haptic('light');
    dismiss();
  };

  const handleInstallClick = async () => {
    haptic('light');
    if (hasNativePrompt) {
      // Android/Chrome with native prompt — trigger it directly
      await promptInstall();
    } else {
      // iOS / other — open the instructions modal
      setModalOpen(true);
    }
  };

  const heading = title || 'Add Buildlogg to your Home Screen';
  const padding = compact ? 'p-3.5' : 'p-4';

  // Banner mode: compact single-line dismissible banner
  if (banner) {
    return (
      <>
        <div className="flex items-center gap-3 bg-brand-surface border border-brand-border rounded-lg p-3 mb-4">
          <div className="shrink-0 w-9 h-9 rounded-lg bg-brand-black flex items-center justify-center">
            <Smartphone size={18} className="text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-brand-black truncate">{heading}</p>
            <p className="text-xs text-brand-dark mt-0.5">Get the full app experience</p>
          </div>
          <button
            onClick={handleInstallClick}
            className="shrink-0 h-9 px-3 bg-brand-primary text-brand-primaryText text-sm font-semibold rounded-lg active:opacity-80 transition-opacity cursor-pointer"
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
        <InstallModal
          isOpen={modalOpen}
          onClose={() => setModalOpen(false)}
          platform={platform}
          hasNativePrompt={hasNativePrompt}
          onNativeInstall={promptInstall}
        />
      </>
    );
  }

  const benefits = [
    { icon: <Zap size={14} />, text: 'One tap to open' },
    { icon: <Wifi size={14} />, text: 'Works offline' },
    { icon: <Clock size={14} />, text: 'No app store needed' },
  ];

  return (
    <>
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

        {/* CTA button — opens modal on all platforms */}
        <button
          onClick={handleInstallClick}
          className={`w-full ${compact ? 'h-11' : 'h-12'} bg-brand-primary text-brand-primaryText rounded-lg text-sm font-semibold flex items-center justify-center gap-2 cursor-pointer active:opacity-80 transition-opacity mt-3`}
        >
          <Plus size={18} />
          Show instructions
        </button>
      </div>

      <InstallModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        platform={platform}
        hasNativePrompt={hasNativePrompt}
        onNativeInstall={promptInstall}
      />
    </>
  );
};

export default AddToHomeScreen;
