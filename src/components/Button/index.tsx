import React, { useRef, useEffect } from 'react';
import { haptic, type HapticPattern } from '../../lib/haptics';

export interface ButtonProps {
  variant: 'primary' | 'secondary' | 'destructive' | 'ghost';
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  fullWidth?: boolean;
  type?: 'button' | 'submit';
  hapticPattern?: HapticPattern;
  size?: 'sm' | 'lg';
}

export const Button: React.FC<ButtonProps> = ({
  variant,
  children,
  onClick,
  disabled = false,
  fullWidth = true,
  type = 'button',
  hapticPattern = 'light',
  size = 'lg',
}) => {
  const ref = useRef<HTMLButtonElement>(null);

  // Overlay hidden iOS switch for native haptic on direct tap (iOS 17.4+)
  // Technique: https://github.com/m1ckc3s/project-fathom
  useEffect(() => {
    if (!ref.current) return;
    const btn = ref.current;

    // Only needed on iOS/WebKit where navigator.vibrate doesn't exist
    const isWebKit = /AppleWebKit/.test(navigator.userAgent) && !/Chrome/.test(navigator.userAgent);
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !('MSStream' in window);
    if (!isWebKit && !isIOS) return;

    // Check if switch control is supported (Safari 17.4+)
    const testEl = document.createElement('input');
    testEl.setAttribute('type', 'checkbox');
    testEl.setAttribute('switch', '');
    if (testEl.getAttribute('switch') !== '') return; // Browser doesn't support switch

    // Create the hidden switch overlay
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
      'clip-path: inset(0 round 12px)',
    ].join(';');

    btn.style.position = 'relative';
    btn.appendChild(sw);

    // Toggle the switch on each tap to trigger the haptic tick
    const toggle = () => {
      sw.checked = !sw.checked;
      requestAnimationFrame(() => {
        sw.checked = !sw.checked;
      });
    };

    sw.addEventListener('click', toggle);

    return () => {
      sw.removeEventListener('click', toggle);
      if (sw.parentNode === btn) {
        btn.removeChild(sw);
      }
    };
  }, []);

  const baseClasses = 'flex items-center justify-center cursor-pointer whitespace-nowrap select-none';
  const widthClass = fullWidth ? 'w-full' : '';
  const disabledClasses = disabled ? 'opacity-50 pointer-events-none' : '';

  const sizeClasses = {
    lg: 'h-13 rounded-xl',
    sm: 'h-11 rounded-md',
  };

  const variantClasses: Record<string, string> = {
    primary: 'bg-brand-black text-brand-surface font-semibold text-sm border border-transparent active:brightness-90 active:scale-[0.98] transition-all duration-150 ease-out',
    secondary: 'bg-brand-surface text-brand-black font-semibold text-sm border border-brand-border active:bg-brand-border/50 active:scale-[0.98] transition-all duration-150 ease-out',
    destructive: 'bg-status-redBg text-status-red font-semibold text-sm border border-red-200 active:scale-[0.98] transition-all duration-150 ease-out',
    ghost: 'min-h-11 bg-transparent text-brand-mid font-medium text-sm underline underline-offset-2 active:opacity-70 transition-opacity duration-150',
  };

  const handleClick = () => {
    if (disabled) return;
    haptic(hapticPattern);
    onClick?.();
  };

  return (
    <button
      ref={ref}
      type={type}
      onClick={handleClick}
      disabled={disabled}
      className={`${baseClasses} ${sizeClasses[size]} ${variantClasses[variant]} ${widthClass} ${disabledClasses}`}
    >
      {children}
    </button>
  );
};
