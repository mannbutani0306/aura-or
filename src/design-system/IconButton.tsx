import React from 'react';
import { Tooltip } from './Tooltip';

export interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  icon: React.ReactNode;
  label: string;
  tooltip?: string;
  shortcut?: string;
  size?: 'sm' | 'md' | 'lg';
  variant?: 'primary' | 'secondary' | 'ghost' | 'active';
  isActive?: boolean;
}

export function IconButton({
  icon,
  label,
  tooltip,
  shortcut,
  size = 'md',
  variant = 'ghost',
  isActive = false,
  className = '',
  disabled,
  ...props
}: IconButtonProps) {
  const sizeStyles = {
    sm: 'w-7.5 h-7.5 text-xs rounded-full',
    md: 'w-9 h-9 text-sm rounded-full',
    lg: 'w-11 h-11 text-base rounded-full',
  };

  const variantStyles = {
    primary:
      'bg-[var(--ink)] text-[var(--bg-app)] border-2 border-[var(--line)] shadow-[2px_2px_0_var(--signal)] hover:-translate-y-0.5 active:translate-y-0.5 active:shadow-none',
    secondary:
      'bg-[var(--surface-raised)] text-[var(--ink)] border-2 border-[var(--line)] shadow-[2px_2px_0_var(--shadow-ink)] hover:-translate-y-0.5 active:translate-y-0.5 active:shadow-none',
    ghost:
      'bg-transparent text-[var(--ink)] hover:bg-[var(--surface)] border-2 border-transparent hover:border-[var(--line)] active:translate-y-0.5',
    active:
      'bg-[var(--sun)] text-[var(--ink)] border-2 border-[var(--line)] shadow-[2px_2px_0_var(--shadow-ink)]',
  };

  const activeClass = isActive ? variantStyles.active : variantStyles[variant];

  const buttonElement = (
    <button
      aria-label={label}
      disabled={disabled}
      className={`inline-flex items-center justify-center transition-all duration-120 focus-ring cursor-pointer select-none disabled:cursor-not-allowed disabled:opacity-40 active:scale-95 ${sizeStyles[size]} ${activeClass} ${className}`}
      {...props}
    >
      {icon}
    </button>
  );

  if (tooltip || shortcut) {
    return (
      <Tooltip content={tooltip || label} shortcut={shortcut}>
        {buttonElement}
      </Tooltip>
    );
  }

  return buttonElement;
}
