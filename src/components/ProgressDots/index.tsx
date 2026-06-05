import React from 'react';

export interface ProgressDotsProps {
  total: number;
  current: number;
}

export const ProgressDots: React.FC<ProgressDotsProps> = ({ total, current }) => {
  return (
    <div className="flex gap-1.5 px-6 pt-5">
      {Array.from({ length: total }).map((_, i) => {
        const step = i + 1;
        const isActive = step <= current;
        return (
          <div
            key={i}
            className={`h-1 rounded-sm flex-1 ${isActive ? 'bg-[#111827]' : 'bg-[#E5E7EB]'}`}
          />
        );
      })}
    </div>
  );
};
