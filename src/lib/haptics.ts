/**
 * Haptic feedback for mobile devices.
 * Tradespeople use the app with work gloves, on site, often one-handed.
 * Haptics confirm the action happened without them looking at the screen.
 *
 * Strategy:
 * 1. Android / Vibration API: use navigator.vibrate() — works immediately, no permission.
 * 2. iOS Safari / WebKit: use the native <input type="checkbox" switch> hack.
 *    iOS 17.4+ (Safari 17.4+) supports the switch control. When directly tapped,
 *    iOS plays a system haptic tick. As of iOS 26.5, only direct taps work —
 *    scripted toggles are patched out. So we overlay an invisible switch on
 *    tappable elements and let the user's finger directly toggle it.
 *    Source: https://github.com/m1ckc3s/project-fathom
 * 3. Unsupported browsers: silently no-op.
 *
 * The switch approach only provides a single "tick" haptic — not the rich
 * patterns Android supports. But for a tradesman's app, a tactile confirmation
 * on every tap is the difference between "did my tap register?" and "I know it did."
 */

export type HapticPattern = 'light' | 'medium' | 'heavy' | 'error' | 'success';

/* ─── Android / Vibration API patterns ─── */
const ANDROID_PATTERNS: Record<HapticPattern, number | number[]> = {
  light: 50,                // Quick tap
  medium: 100,               // Confirmation
  heavy: 200,                // Major action
  error: [50, 50, 50],      // Double-tap warning
  success: [100, 50, 100],   // Triple pulse
};

/* ─── Platform detection ─── */
function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) && !('MSStream' in window);
}

function isWebKit(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /AppleWebKit/.test(navigator.userAgent) && !/Chrome/.test(navigator.userAgent);
}

function supportsSwitchControl(): boolean {
  // Safari 17.4+ / iOS 18+ — supports <input type="checkbox" switch>
  // We test by creating a temporary switch element and checking if it renders
  if (typeof document === 'undefined') return false;
  try {
    const el = document.createElement('input');
    el.setAttribute('type', 'checkbox');
    el.setAttribute('switch', '');
    // If the browser supports it, the switch attribute won't be stripped
    return el.getAttribute('switch') === '';
  } catch {
    return false;
  }
}

const _isiOS = typeof window !== 'undefined' ? isIOS() : false;
const _isWebKit = typeof window !== 'undefined' ? isWebKit() : false;
const _supportsSwitch = typeof window !== 'undefined' ? supportsSwitchControl() : false;
const USE_IOS_SWITCH = _isiOS || (_isWebKit && _supportsSwitch);
const USE_VIBRATION = !USE_IOS_SWITCH && typeof navigator !== 'undefined' && !!navigator.vibrate;

if (import.meta.env.DEV) {
  console.log('[Haptics] Platform:', USE_IOS_SWITCH ? 'iOS/WebKit switch' : USE_VIBRATION ? 'Vibration API' : 'none');
}

/* ─── Android: Vibration API ─── */
function vibrateAndroid(pattern: number | number[]): void {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    // Silently fail
  }
}

/* ─── iOS: Switch-based haptic ─── */
let _switchPool: HTMLInputElement[] = [];
let _switchIndex = 0;
const POOL_SIZE = 5;

function getSwitch(): HTMLInputElement {
  if (_switchPool.length === 0) {
    for (let i = 0; i < POOL_SIZE; i++) {
      const sw = document.createElement('input');
      sw.type = 'checkbox';
      sw.setAttribute('switch', '');
      sw.style.cssText = [
        'position: fixed',
        'top: -9999px',
        'left: -9999px',
        'width: 1px',
        'height: 1px',
        'opacity: 0',
        'pointer-events: none',
        'z-index: -1',
      ].join(';');
      document.body.appendChild(sw);
      _switchPool.push(sw);
    }
  }
  const sw = _switchPool[_switchIndex % POOL_SIZE];
  _switchIndex++;
  return sw;
}

/**
 * Fire an iOS haptic by toggling a hidden switch.
 * This must be called synchronously inside a user gesture handler
 * (click/touchstart) — iOS 26.5+ blocks scripted toggles from firing haptics.
 */
function tickIOS(): void {
  const sw = getSwitch();
  // Toggle the switch: checked → unchecked or unchecked → checked
  // The state change itself triggers the system haptic tick
  sw.checked = !sw.checked;
  // Reset immediately so next tick is also a state change
  requestAnimationFrame(() => {
    sw.checked = !sw.checked;
  });
}

/* ─── Public API ─── */

export function haptic(pattern: HapticPattern = 'light'): void {
  if (USE_IOS_SWITCH) {
    // iOS switch only gives a single tick — all patterns map to one tick
    tickIOS();
  } else if (USE_VIBRATION) {
    vibrateAndroid(ANDROID_PATTERNS[pattern]);
  }
  // Else: unsupported platform — silently no-op
}

/** Convenience: tap a button */
export function hapticTap(): void { haptic('light'); }

/** Convenience: confirm an action */
export function hapticConfirm(): void { haptic('medium'); }

/** Convenience: major success */
export function hapticSuccess(): void { haptic('success'); }

/** Convenience: error/warning */
export function hapticError(): void { haptic('error'); }

/**
 * Create a haptic switch overlay element for direct-tap iOS haptics.
 * This is the "project-fathom" technique: an invisible native switch
 * overlaid on a button so the user's finger directly toggles it.
 *
 * Use this for elements that need guaranteed haptic feedback on iOS,
 * especially when the element is not a standard <button>.
 *
 * Returns a ref callback that should be attached to the wrapper element.
 * The switch is sized and clipped to match the wrapper's bounds.
 */
export function createHapticOverlay(): HTMLInputElement | null {
  if (!USE_IOS_SWITCH) return null;
  const sw = document.createElement('input');
  sw.type = 'checkbox';
  sw.setAttribute('switch', '');
  sw.style.cssText = [
    'position: absolute',
    'top: 0',
    'left: 0',
    'width: 100%',
    'height: 100%',
    'opacity: 0',
    'cursor: pointer',
    'z-index: 1',
    'clip-path: inset(0 round 12px)', /* match button radius */
  ].join(';');
  return sw;
}

/**
 * Attach a haptic switch overlay to a DOM element.
 * The element must be position: relative.
 */
export function attachHapticOverlay(element: HTMLElement): (() => void) | null {
  if (!USE_IOS_SWITCH) return null;
  const sw = createHapticOverlay();
  if (!sw) return null;

  element.style.position = 'relative';
  element.appendChild(sw);

  // Cleanup function
  return () => {
    if (sw.parentNode === element) {
      element.removeChild(sw);
    }
  };
}

/**
 * Higher-order component / hook approach: use this in useEffect
 * to attach a haptic overlay to a ref'd element.
 *
 * Example:
 *   const ref = useRef<HTMLDivElement>(null);
 *   useEffect(() => {
 *     return attachHapticOverlayRef(ref.current);
 *   }, []);
 */
export function attachHapticOverlayRef(element: HTMLElement | null): (() => void) | null {
  if (!element) return null;
  return attachHapticOverlay(element);
}
