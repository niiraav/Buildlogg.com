import React from 'react';

export interface SegmentedControlProps {
  options: Array<{ value: string; label: string }>;
  value: string;
  onChange: (value: string) => void;
  size?: 'sm' | 'md';
}

export const SegmentedControl: React.FC<SegmentedControlProps> = ({
  options,
  value,
  onChange,
  size = 'md',
}) => {
  const height = 'min-h-11';
  const fontSize = size === 'sm' ? 'text-sm' : 'text-sm';

  return (
    <div className="flex bg-brand-borderLight rounded-lg p-[3px]">
      {options.map((opt) => {
        const isActive = opt.value === value;
        return (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            className={`flex-1 ${height} ${fontSize} flex items-center justify-center rounded-md transition-all font-medium cursor-pointer ${
              isActive
                ? 'bg-[var(--app-shell-bg)] text-brand-black font-bold shadow-seg ring-1 ring-brand-border/60'
                : 'text-brand-mid'
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
};
