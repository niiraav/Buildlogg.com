import React from 'react';

export interface StickyFooterProps {
  children: React.ReactNode;
}

export const StickyFooter: React.FC<StickyFooterProps> = ({ children }) => {
  return (
    <div className="sticky bottom-0 z-40">
      <div className="flex flex-col gap-2 bg-white border-t border-[#F3F4F6] shadow-sheet px-4 py-3 pb-[calc(32px_+_env(safe-area-inset-bottom))]">
        {children}
      </div>
    </div>
  );
};
