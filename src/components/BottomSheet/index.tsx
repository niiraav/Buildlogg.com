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
            <div className="w-9 h-1 bg-brand-border rounded-sm mx-auto mt-3 mb-5" />
            {title && (
              <Dialog.Title asChild>
                <h2 className="text-md font-bold text-brand-black px-6">{title}</h2>
              </Dialog.Title>
            )}
            {subtitle && (
              <p className="text-sm text-brand-mid mt-1 px-6">{subtitle}</p>
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
  const labelClass = variant === 'destructive' ? 'text-status-red' : 'text-brand-black';

  return (
    <div
      onClick={onTap}
      className={`flex items-center gap-3.5 min-h-14 cursor-pointer ${
        isLast ? '' : 'border-t border-brand-borderLight'
      }`}
    >
      {icon}
      <div className="flex flex-col">
        <span className={`text-md font-medium ${labelClass}`}>{label}</span>
        {sublabel && <span className="text-xs text-brand-muted">{sublabel}</span>}
      </div>
    </div>
  );
};
