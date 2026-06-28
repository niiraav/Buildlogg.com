import React, { useEffect, useState, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { haptic } from '../../lib/haptics';

export interface BottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  titleIcon?: React.ReactNode;
  subtitle?: string;
  children?: React.ReactNode;
  /** Sticky footer rendered below the scrollable area — always visible. Use for CTA buttons (max 2). */
  footer?: React.ReactNode;
}

export const BottomSheet: React.FC<BottomSheetProps> = ({
  isOpen,
  onClose,
  title,
  titleIcon,
  subtitle,
  children,
  footer,
}) => {
  const [shouldRender, setShouldRender] = useState(isOpen);
  const [isVisible, setIsVisible] = useState(false);
  const [isAnimatingOut, setIsAnimatingOut] = useState(false);
  const sheetRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const dragStartY = useRef(0);
  const isDragging = useRef(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const enterRafRef = useRef<number[]>([]);
  const reducedMotion = useRef(
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );

  // Controlled mount/unmount with enter + exit animation
  useEffect(() => {
    if (isOpen) {
      setShouldRender(true);
      setIsAnimatingOut(false);
      setIsVisible(false);
      // Double rAF ensures the browser paints the initial "hidden" state
      // before flipping to visible, so the CSS transition fires.
      // Single rAF fails in Chrome's batched rendering.
      if (reducedMotion.current) {
        setIsVisible(true);
      } else {
        const outerRaf = requestAnimationFrame(() => {
          const innerRaf = requestAnimationFrame(() => {
            setIsVisible(true);
            enterRafRef.current = [];
          });
          enterRafRef.current = [outerRaf, innerRaf];
        });
        enterRafRef.current = [outerRaf];
      }
    } else if (shouldRender) {
      // Cancel any pending enter rAF (rapid toggle: opened then closed before enter fired)
      enterRafRef.current.forEach((id) => cancelAnimationFrame(id));
      enterRafRef.current = [];
      setIsAnimatingOut(true);
      setIsVisible(false);
      // Fallback timeout in case onTransitionEnd doesn't fire
      const timeout = reducedMotion.current ? 0 : 320;
      closeTimer.current = setTimeout(() => {
        setShouldRender(false);
        setIsAnimatingOut(false);
      }, timeout);
    }
    return () => {
      if (closeTimer.current) {
        clearTimeout(closeTimer.current);
        closeTimer.current = null;
      }
    };
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  // Lock body scroll when sheet is open — iOS-safe position:fixed pattern
  // Also lock #app-shell (the real scroll container in this PWA) so background
  // doesn't scroll when the user touches non-scrollable parts of the sheet.
  useEffect(() => {
    if (!shouldRender) return;
    const scrollY = window.scrollY;
    document.body.style.position = 'fixed';
    document.body.style.top = `-${scrollY}px`;
    document.body.style.width = '100%';

    const appShell = document.getElementById('app-shell');
    let shellScrollTop = 0;
    if (appShell) {
      shellScrollTop = appShell.scrollTop;
      appShell.style.overflowY = 'hidden';
    }

    return () => {
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.width = '';
      window.scrollTo(0, scrollY);
      if (appShell) {
        appShell.style.overflowY = '';
        appShell.scrollTop = shellScrollTop;
      }
    };
  }, [shouldRender]);

  // Only the sheet's own transition end triggers unmount — not the backdrop's
  // (backdrop finishes at 250ms, sheet at 300ms; backdrop would unmount too early)
  const handleTransitionEnd = useCallback((e: React.TransitionEvent) => {
    if (e.target !== sheetRef.current) return;
    if (isAnimatingOut) {
      setShouldRender(false);
      setIsAnimatingOut(false);
      if (closeTimer.current) {
        clearTimeout(closeTimer.current);
        closeTimer.current = null;
      }
    }
  }, [isAnimatingOut]);

  // Touch handlers for swipe-to-dismiss (replaces framer-motion drag)
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    dragStartY.current = e.touches[0].clientY;
    isDragging.current = true;
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isDragging.current || !sheetRef.current) return;
    const delta = e.touches[0].clientY - dragStartY.current;
    if (delta > 0) {
      sheetRef.current.style.transform = `translateY(${delta}px)`;
      sheetRef.current.style.transition = 'none';
    }
  }, []);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (!isDragging.current || !sheetRef.current) return;
    isDragging.current = false;
    const delta = e.changedTouches[0].clientY - dragStartY.current;
    sheetRef.current.style.transition = '';
    if (delta > 100) {
      sheetRef.current.style.transform = '';
      haptic('light');
      onClose();
    } else {
      sheetRef.current.style.transform = '';
    }
  }, [onClose]);

  if (!shouldRender) return null;

  // Hidden state: either animating out or not yet visible (enter hasn't triggered)
  const isHidden = isAnimatingOut || !isVisible;

  return createPortal(
    <div className="fixed inset-0 z-[55] flex flex-col justify-end overscroll-contain md:items-end md:justify-end md:inset-y-0 md:right-0 md:left-[40%]">
      {/* Backdrop */}
      <div
        ref={backdropRef}
        onClick={() => { haptic('light'); onClose(); }}
        className="absolute inset-0 bg-black/25 dark:bg-black/60"
        style={{
          opacity: isHidden ? 0 : 1,
          transition: 'opacity 300ms ease-in-out',
        }}
      />
      {/* Sheet — responsive: shrinks to fit content, caps at 85dvh */}
      <div
        ref={sheetRef}
        className="relative z-[56] bg-white dark:bg-[var(--app-shell-bg)] rounded-t-2xl shadow-sheet max-h-[85dvh] flex flex-col md:max-w-md md:mx-auto md:w-full"
        style={{
          transform: isHidden ? 'translateY(100%)' : 'translateY(0)',
          transition: 'transform 320ms cubic-bezier(0.22, 1, 0.36, 1)',
        }}
        onTransitionEnd={handleTransitionEnd}
      >
        {/* Drag handle — touch-to-dismiss */}
        <div
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          className="h-8 flex items-center justify-center cursor-grab active:cursor-grabbing touch-none shrink-0"
        >
          <div className="w-9 h-1 bg-brand-border rounded-sm" />
        </div>

        {/* Title + X button */}
        <div className={`flex items-center px-4 shrink-0 ${title ? 'justify-between' : 'justify-end'}`}>
          {title && (
            <div className="flex items-center gap-2">
              {titleIcon && <span className="text-brand-dark">{titleIcon}</span>}
              <h2 className="text-lg font-bold text-brand-black tracking-tight">{title}</h2>
            </div>
          )}
          <button
            onClick={() => { haptic('light'); onClose(); }}
            className="w-9 h-9 flex items-center justify-center text-brand-muted cursor-pointer -mr-2 shrink-0"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Subtitle */}
        {subtitle && (
          <p className="text-sm text-brand-muted mt-1 px-4 shrink-0">{subtitle}</p>
        )}

        {/* Scrollable content — flex-1 so it takes available space between header and footer */}
        <div className="overflow-y-auto overflow-x-hidden overscroll-contain flex-1 px-4 pt-2 pb-4">
          {children}
        </div>

        {/* Sticky footer — always visible, outside scroll area */}
        {footer && (
          <div className="px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] border-t border-brand-borderLight shrink-0">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
};

export interface SheetRowProps {
  icon?: React.ReactNode;
  label: string;
  sublabel?: string;
  onTap: () => void;
  variant?: 'default' | 'destructive';
  isLast?: boolean;
  disabled?: boolean;
}

export const SheetRow: React.FC<SheetRowProps> = ({
  icon,
  label,
  sublabel,
  onTap,
  variant = 'default',
  isLast = false,
  disabled = false,
}) => {
  const labelClass = variant === 'destructive' ? 'text-status-red' : disabled ? 'text-brand-muted' : 'text-brand-black';

  const handleTap = () => {
    if (disabled) return;
    haptic('light');
    onTap();
  };

  return (
    <div
      onClick={handleTap}
      className={`flex items-center gap-3.5 min-h-14 select-none transition-opacity duration-100 ${
        disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer active:opacity-70'
      } ${isLast ? '' : 'border-t border-brand-borderLight'}`}
    >
      {icon}
      <div className="flex flex-col">
        <span className={`text-sm font-medium ${labelClass}`}>{label}</span>
        {sublabel && <span className="text-sm text-brand-muted">{sublabel}</span>}
      </div>
    </div>
  );
};
