import { useEffect, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle, AlertCircle, Info, X } from 'lucide-react';
import { useToastStore } from './store';

const ICONS = {
  success: CheckCircle,
  error: AlertCircle,
  info: Info,
};

const BORDERS = {
  success: 'border-l-4 border-l-[var(--color-green)]',
  error: 'border-l-4 border-l-[var(--color-red)]',
  info: 'border-l-4 border-l-[var(--color-blue)]',
};

export function ToastContainer() {
  const { toast, hideToast } = useToastStore();

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => hideToast(), toast.duration ?? 3500);
    return () => clearTimeout(timer);
  }, [toast, hideToast]);

  const handleTap = useCallback(() => hideToast(), [hideToast]);

  return (
    <AnimatePresence>
      {toast && (
        <motion.div
          initial={{ y: -80, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -80, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 400, damping: 30 }}
          className="fixed top-0 left-0 right-0 z-[100] px-4 pt-4 pointer-events-none"
        >
          <div
            onClick={handleTap}
            className={`pointer-events-auto mx-auto max-w-[430px] bg-white dark:bg-[var(--brand-surface)] rounded-xl shadow-lg border border-brand-border ${BORDERS[toast.type]} flex items-start gap-3 p-3.5 cursor-pointer`}
          >
            {(() => {
              const Icon = ICONS[toast.type];
              const colors = {
                success: 'text-[var(--color-green)]',
                error: 'text-[var(--color-red)]',
                info: 'text-[var(--color-blue)]',
              };
              return <Icon size={20} className={colors[toast.type] + ' shrink-0 mt-0.5'} />;
            })()}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-brand-black dark:text-white leading-snug">
                {toast.message}
              </p>
            </div>
            <X size={16} className="text-brand-muted shrink-0 mt-0.5" />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
