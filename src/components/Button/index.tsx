import React from 'react';

export interface ButtonProps {
  variant: 'primary' | 'secondary' | 'destructive' | 'ghost';
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  fullWidth?: boolean;
  type?: 'button' | 'submit';
}

export const Button: React.FC<ButtonProps> = ({
  variant,
  children,
  onClick,
  disabled = false,
  fullWidth = true,
  type = 'button',
}) => {
  const baseClasses = 'flex items-center justify-center rounded-xl cursor-pointer transition-opacity';
  const widthClass = fullWidth ? 'w-full' : '';
  const disabledClasses = disabled ? 'opacity-50 pointer-events-none' : '';

  const variantClasses: Record<string, string> = {
    primary: 'h-[52px] bg-[#111827] text-white font-bold text-base',
    secondary: 'h-[46px] bg-[#F9FAFB] text-[#111827] font-semibold text-sm border border-[#D1D5DB]',
    destructive: 'h-[46px] bg-[#FEF2F2] text-[#DC2626] font-semibold text-sm border border-[#FECACA]',
    ghost: 'min-h-[44px] bg-transparent text-[#6B7280] font-medium text-sm underline underline-offset-2',
  };

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`${baseClasses} ${variantClasses[variant]} ${widthClass} ${disabledClasses}`}
    >
      {children}
    </button>
  );
};
