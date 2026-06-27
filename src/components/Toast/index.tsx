import { useEffect, useCallback, useState, useRef } from 'react';
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
  const [shouldRender, setShouldRender] = useState(false);
  const [isAnimatingOut, setIsAnimatingOut] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Controlled mount/unmount with exit animation
  useEffect(() => {
    if (toast) {
      setShouldRender(true);
      setIsAnimatingOut(false);
    } else if (shouldRender) {
      setIsAnimatingOut(true);
      closeTimer.current = setTimeout(() => {
        setShouldRender(false);
        setIsAnimatingOut(false);
      }, 300);
    }
    return () => {
      if (closeTimer.current) {
        clearTimeout(closeTimer.current);
        closeTimer.current = null;
      }
    };
  }, [toast]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-dismiss timer
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => hideToast(), toast.duration ?? 3500);
    return () => clearTimeout(timer);
  }, [toast, hideToast]);

  const handleTap = useCallback(() => hideToast(), [hideToast]);

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

  if (!shouldRender || !toast) return null;

  return (
    <div
      className="fixed top-0 left-0 right-0 z-[100] px-4 pt-4 pointer-events-none"
      style={{
        transform: isAnimatingOut ? 'translateY(-80px)' : 'translateY(0)',
        opacity: isAnimatingOut ? 0 : 1,
        transition: 'transform 0.3s cubic-bezier(0.2, 0, 0, 1), opacity 0.2s ease-out',
      }}
      onTransitionEnd={handleTransitionEnd}
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
    </div>
  );
}
