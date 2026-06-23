import { useState, useEffect, useCallback } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

interface AddToHomeScreenState {
  /** Can we show an install prompt? True whenever the app is NOT already installed (standalone). */
  canPrompt: boolean;
  /** Is the app already running as a standalone PWA? */
  isInstalled: boolean;
  /** Detected platform */
  platform: 'ios' | 'android' | 'other';
  /** Has the native beforeinstallprompt event been captured (Android/Chrome)? */
  hasNativePrompt: boolean;
  /** Has the user previously dismissed the A2HS suggestion? */
  isDismissed: boolean;
  /** Trigger the native install prompt (Android/Chrome only). No-op on iOS. */
  promptInstall: () => Promise<void>;
  /** Mark the A2HS suggestion as dismissed (persists in localStorage). */
  dismiss: () => void;
}

function detectPlatform(): 'ios' | 'android' | 'other' {
  const ua = navigator.userAgent || '';
  // iOS detection: iPad, iPhone, iPod — also iPadOS 13+ reports as MacIntel with touch
  if (/iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) {
    return 'ios';
  }
  if (/Android/.test(ua)) {
    return 'android';
  }
  return 'other';
}

function detectStandalone(): boolean {
  // iOS Safari standalone
  if ((navigator as unknown as { standalone?: boolean }).standalone === true) {
    return true;
  }
  // Android/Chrome standalone
  if (window.matchMedia('(display-mode: standalone)').matches) {
    return true;
  }
  return false;
}

const DISMISS_KEY = 'buildlogg_a2hs_dismissed';
const DISMISS_TTL = 14 * 24 * 60 * 60 * 1000; // 14 days — re-show after 2 weeks

function loadDismissed(): boolean {
  try {
    const raw = localStorage.getItem(DISMISS_KEY);
    if (!raw) return false;
    const ts = parseInt(raw, 10);
    if (isNaN(ts)) return false;
    if (Date.now() - ts > DISMISS_TTL) {
      localStorage.removeItem(DISMISS_KEY);
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export function useAddToHomeScreen(): AddToHomeScreenState {
  const [platform, setPlatform] = useState<'ios' | 'android' | 'other'>('other');
  const [isInstalled, setIsInstalled] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isDismissed, setIsDismissed] = useState(false);

  useEffect(() => {
    setPlatform(detectPlatform());
    setIsInstalled(detectStandalone());
    setIsDismissed(loadDismissed());

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
      try { localStorage.removeItem(DISMISS_KEY); } catch {}
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  // Show on ALL platforms when not installed and not dismissed.
  // Previously this only showed on iOS or when beforeinstallprompt fired —
  // which meant it was invisible on desktop and some Android browsers.
  const canPrompt = !isInstalled && !isDismissed;

  const promptInstall = useCallback(async () => {
    if (deferredPrompt) {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice.outcome === 'accepted') {
        setIsInstalled(true);
        try { localStorage.removeItem(DISMISS_KEY); } catch {}
      }
      setDeferredPrompt(null);
    }
    // iOS / other: no programmatic prompt — manual instructions are shown
  }, [deferredPrompt]);

  const dismiss = useCallback(() => {
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch {}
    setIsDismissed(true);
  }, []);

  return {
    canPrompt,
    isInstalled,
    platform,
    hasNativePrompt: deferredPrompt !== null,
    isDismissed,
    promptInstall,
    dismiss,
  };
}
