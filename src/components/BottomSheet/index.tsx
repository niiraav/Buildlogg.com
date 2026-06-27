import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence, useDragControls } from 'framer-motion';
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
  const dragControls = useDragControls();

  // Lock body scroll when sheet is open — iOS-safe position:fixed pattern
  useEffect(() => {
    if (!isOpen) return;
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
  }, [isOpen]);

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[55] flex flex-col justify-end md:items-end md:justify-end md:inset-y-0 md:right-0 md:left-[40%]">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute inset-0 bg-black/25 dark:bg-black/60"
            onClick={() => { haptic('light'); onClose(); }}
          />
          {/* Sheet — draggable outer, no overflow */}
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            drag="y"
            dragControls={dragControls}
            dragListener={false}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={0.2}
            onDragEnd={(_, info) => {
              if (info.offset.y > 100 || info.velocity.y > 500) {
                haptic('light');
                onClose();
              }
            }}
            className="relative z-[56] bg-white dark:bg-[var(--app-shell-bg)] rounded-t-2xl shadow-sheet max-h-[85dvh] md:max-w-md md:mx-auto md:w-full"
          >
            {/* Drag handle — 32px touch target, starts drag */}
            <div
              onPointerDown={(e) => dragControls.start(e)}
              className="h-8 flex items-center justify-center cursor-grab active:cursor-grabbing"
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

            {/* Scrollable content — separated from draggable outer */}
            <div className="overflow-y-auto overscroll-contain max-h-[calc(85dvh-140px)] px-4 pb-[max(2.5rem,env(safe-area-inset-bottom))] pt-2">
              {children}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
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
