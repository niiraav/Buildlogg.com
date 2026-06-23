import React from 'react';
import { haptic, type HapticPattern } from '../../lib/haptics';

export interface ButtonProps {
  variant: 'primary' | 'secondary' | 'destructive' | 'ghost';
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  fullWidth?: boolean;
  type?: 'button' | 'submit';
  hapticPattern?: HapticPattern;
  size?: 'sm' | 'lg';
}

export const Button: React.FC<ButtonProps> = ({
  variant,
  children,
  onClick,
  disabled = false,
  fullWidth = true,
  type = 'button',
  hapticPattern = 'light',
  size = 'lg',
}) => {
  const baseClasses = 'flex items-center justify-center cursor-pointer whitespace-nowrap select-none';
  const widthClass = fullWidth ? 'w-full' : '';
  const disabledClasses = disabled ? 'opacity-50 pointer-events-none' : '';

  const sizeClasses = {
    lg: 'h-13 rounded-xl',
    sm: 'h-11 rounded-md',
  };

  const variantClasses: Record<string, string> = {
    primary: 'bg-brand-black text-brand-surface font-semibold text-sm border border-transparent active:brightness-90 active:scale-[0.98] transition-all duration-150 ease-out',
    secondary: 'bg-brand-surface text-brand-black font-semibold text-sm border border-brand-border active:bg-brand-border/50 active:scale-[0.98] transition-all duration-150 ease-out',
    destructive: 'bg-status-redBg text-status-redText font-semibold text-sm border border-red-200 active:scale-[0.98] transition-all duration-150 ease-out',
    ghost: 'min-h-11 bg-transparent text-brand-dark font-medium text-sm underline underline-offset-2 active:opacity-70 transition-opacity duration-150',
  };

  const handleClick = () => {
    if (disabled) return;
    haptic(hapticPattern);
    onClick?.();
  };

  return (
    <button
      type={type}
      onClick={handleClick}
      disabled={disabled}
      className={`${baseClasses} ${sizeClasses[size]} ${variantClasses[variant]} ${widthClass} ${disabledClasses}`}
    >
      {children}
    </button>
  );
};
