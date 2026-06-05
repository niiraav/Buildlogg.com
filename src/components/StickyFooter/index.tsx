import React from 'react';

export interface StickyFooterProps {
  children: React.ReactNode;
}

export const StickyFooter: React.FC<StickyFooterProps> = ({ children }) => {
  return (
    <div className="sticky bottom-0 z-40">
      <div
        className="flex flex-col gap-2 bg-white border-t border-[#F3F4F6] shadow-sheet"
        style={{ padding: '12px 16px calc(32px + env(safe-area-inset-bottom))' }}
      >
        {children}
      </div>
    </div>
  );
};
