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
    primary: 'h-13 bg-brand-black text-brand-surface font-semibold text-sm',
    secondary: 'h-13 bg-brand-surface text-brand-black font-semibold text-sm border border-brand-border',
    destructive: 'h-13 bg-status-redBg text-status-red font-semibold text-sm border border-red-200',
    ghost: 'min-h-11 bg-transparent text-brand-mid font-medium text-sm underline underline-offset-2',
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
