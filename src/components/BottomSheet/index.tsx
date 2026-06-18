import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { haptic } from '../../lib/haptics';

export interface BottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
}

export const BottomSheet: React.FC<BottomSheetProps> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
}) => {
  return (
    <AnimatePresence>
      {isOpen && (
        <div className="absolute inset-0 z-50 flex flex-col justify-end">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute inset-0 bg-black/25 dark:bg-black/60"
            onClick={() => { haptic('light'); onClose(); }}
          />
          {/* Sheet */}
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className="relative z-[51] bg-white dark:bg-[var(--app-shell-bg)] rounded-t-2xl shadow-sheet"
          >
            <div className="w-9 h-1 bg-brand-border rounded-sm mx-auto mt-3 mb-5" />
            {title && (
              <h2 className="text-md font-bold text-brand-black px-6">{title}</h2>
            )}
            {subtitle && (
              <p className="text-sm text-brand-mid mt-1 px-6">{subtitle}</p>
            )}
            <div className="px-6 pb-10 pt-2">
              {children}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
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
        <span className={`text-md font-medium ${labelClass}`}>{label}</span>
        {sublabel && <span className="text-sm text-brand-muted">{sublabel}</span>}
      </div>
    </div>
  );
};
