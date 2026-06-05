import React from 'react';
import * as Dialog from '@radix-ui/react-dialog';

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
  if (!isOpen) return null;

  return (
    <Dialog.Root open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <Dialog.Content asChild>
        <div className="absolute inset-0 z-50 flex flex-col justify-end">
          <Dialog.Overlay asChild>
            <div
              className="absolute inset-0 bg-black/25"
              onClick={onClose}
            />
          </Dialog.Overlay>
          <div className="relative z-[51] bg-white rounded-t-2xl shadow-sheet transition-transform duration-300 ease-in-out translate-y-0">
            <div className="w-9 h-1 bg-[#E5E7EB] rounded-sm mx-auto mt-3 mb-5" />
            {title && (
              <Dialog.Title asChild>
                <h2 className="text-lg font-bold text-[#111827] px-6">{title}</h2>
              </Dialog.Title>
            )}
            {subtitle && (
              <p className="text-sm text-[#6B7280] mt-1 px-6">{subtitle}</p>
            )}
            <div className="px-6 pb-10 pt-2">
              {children}
            </div>
          </div>
        </div>
      </Dialog.Content>
    </Dialog.Root>
  );
};

export interface SheetRowProps {
  icon?: React.ReactNode;
  label: string;
  sublabel?: string;
  onTap: () => void;
  variant?: 'default' | 'destructive';
  isLast?: boolean;
}

export const SheetRow: React.FC<SheetRowProps> = ({
  icon,
  label,
  sublabel,
  onTap,
  variant = 'default',
  isLast = false,
}) => {
  const iconColor = variant === 'destructive' ? '#DC2626' : '#374151';
  const labelColor = variant === 'destructive' ? '#DC2626' : '#111827';

  return (
    <div
      onClick={onTap}
      className={`flex items-center gap-3.5 min-h-[56px] cursor-pointer ${
        isLast ? '' : 'border-b border-[#F3F4F6]'
      }`}
    >
      {icon && <span style={{ color: iconColor }}>{icon}</span>}
      <div className="flex flex-col">
        <span className="text-[15px] font-medium" style={{ color: labelColor }}>{label}</span>
        {sublabel && <span className="text-xs text-[#9CA3AF]">{sublabel}</span>}
      </div>
    </div>
  );
};
