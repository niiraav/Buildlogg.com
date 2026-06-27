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
  children: React.ReactNode;
}

export const BottomSheet: React.FC<BottomSheetProps> = ({
  isOpen,
  onClose,
  title,
  titleIcon,
  subtitle,
  children,
}) => {
  const [shouldRender, setShouldRender] = useState(isOpen);
  const [isAnimatingOut, setIsAnimatingOut] = useState(false);
  const sheetRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const dragStartY = useRef(0);
  const isDragging = useRef(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Controlled mount/unmount with exit animation
  useEffect(() => {
    if (isOpen) {
      setShouldRender(true);
      setIsAnimatingOut(false);
    } else if (shouldRender) {
      setIsAnimatingOut(true);
      // Fallback timeout in case onTransitionEnd doesn't fire
      closeTimer.current = setTimeout(() => {
        setShouldRender(false);
        setIsAnimatingOut(false);
      }, 350);
    }
    return () => {
      if (closeTimer.current) {
        clearTimeout(closeTimer.current);
        closeTimer.current = null;
      }
    };
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  // Lock body scroll when sheet is open — iOS-safe position:fixed pattern
  useEffect(() => {
    if (!shouldRender) return;
    const scrollY = window.scrollY;
    document.body.style.position = 'fixed';
    document.body.style.top = `-${scrollY}px`;
    document.body.style.width = '100%';
    return () => {
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.width = '';
      window.scrollTo(0, scrollY);
    };
  }, [shouldRender]);

  const handleTransitionEnd = useCallback(() => {
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

  return createPortal(
    <div className="fixed inset-0 z-[55] flex flex-col justify-end md:items-end md:justify-end md:inset-y-0 md:right-0 md:left-[40%]">
      {/* Backdrop */}
      <div
        ref={backdropRef}
        onClick={() => { haptic('light'); onClose(); }}
        className="absolute inset-0 bg-black/25 dark:bg-black/60"
        style={{
          opacity: isAnimatingOut ? 0 : 1,
          transition: 'opacity 0.2s ease-out',
        }}
        onTransitionEnd={handleTransitionEnd}
      />
      {/* Sheet */}
      <div
        ref={sheetRef}
        className="relative z-[56] bg-white dark:bg-[var(--app-shell-bg)] rounded-t-2xl shadow-sheet max-h-[85dvh] md:max-w-md md:mx-auto md:w-full"
        style={{
          transform: isAnimatingOut ? 'translateY(100%)' : 'translateY(0)',
          transition: 'transform 0.3s cubic-bezier(0.2, 0, 0, 1)',
        }}
        onTransitionEnd={handleTransitionEnd}
      >
        {/* Drag handle — touch-to-dismiss */}
        <div
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          className="h-8 flex items-center justify-center cursor-grab active:cursor-grabbing touch-none"
        >
          <div className="w-9 h-1 bg-brand-border rounded-sm" />
        </div>

        {/* Title + X button */}
        <div className={`flex items-center px-4 ${title ? 'justify-between' : 'justify-end'}`}>
          {title && (
            <div className="flex items-center gap-2">
              {titleIcon && <span className="text-brand-dark">{titleIcon}</span>}
              <h2 className="text-lg font-bold text-brand-black tracking-tight">{title}</h2>
            </div>
          )}
          <button
            onClick={() => { haptic('light'); onClose(); }}
            className="w-7 h-7 flex items-center justify-center text-brand-muted cursor-pointer -mr-1 shrink-0"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Subtitle */}
        {subtitle && (
          <p className="text-sm text-brand-muted mt-1 px-4">{subtitle}</p>
        )}

        {/* Scrollable content */}
        <div className="overflow-y-auto overscroll-contain max-h-[calc(85dvh-140px)] px-4 pb-[max(2.5rem,env(safe-area-inset-bottom))] pt-2">
          {children}
        </div>
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
