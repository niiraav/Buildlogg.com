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
  const height = size === 'sm' ? 'h-[34px]' : 'h-[36px]';
  const fontSize = size === 'sm' ? 'text-xs' : 'text-[13px]';

  return (
    <div className="flex bg-[#F3F4F6] rounded-lg p-[3px]">
      {options.map((opt) => {
        const isActive = opt.value === value;
        return (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            className={`flex-1 ${height} ${fontSize} flex items-center justify-center rounded-md transition-all font-medium cursor-pointer ${
              isActive
                ? 'bg-white text-[#111827] font-bold shadow-seg'
                : 'text-[#6B7280]'
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
};
