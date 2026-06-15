import React from 'react';

export interface StickyFooterProps {
  children: React.ReactNode;
  className?: string;
}

export const StickyFooter: React.FC<StickyFooterProps> = ({ children, className = '' }) => {
  return (
    <div className="sticky bottom-0 z-40 w-full">
      <div className={`flex flex-col gap-2 w-full bg-[var(--app-shell-bg)] border-t border-brand-borderLight shadow-sheet px-6 py-3 pb-[max(56px, calc(12px + env(safe-area-inset-bottom)))] ${className}`}>
        {children}
      </div>
    </div>
  );
};
