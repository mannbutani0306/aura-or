import React from 'react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
  icon?: React.ReactNode;
}

export function Button({
  variant = 'secondary',
  size = 'md',
  isLoading = false,
  icon,
  children,
  className = '',
  disabled,
  ...props
}: ButtonProps) {
  const sizeStyles = {
    sm: 'h-7.5 px-3 text-[11px] gap-1.5',
    md: 'h-9 px-4 text-xs gap-2',
    lg: 'h-11 px-6 text-sm gap-2.5',
  };

  // Primary: ink pill with coloured hard shadow
  // Secondary: paper pill with ink shadow
  // Danger: signal pill with ink shadow
  // Ghost: transparent with hover ink border
  const variantStyles = {
    primary:
      'bg-[var(--ink)] text-[var(--bg-app)] border-2 border-[var(--line)] shadow-[3px_3px_0_var(--signal)] hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-[5px_5px_0_var(--signal)] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none',
    secondary:
      'bg-[var(--surface-raised)] text-[var(--ink)] border-2 border-[var(--line)] shadow-[3px_3px_0_var(--shadow-ink)] hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-[5px_5px_0_var(--shadow-ink)] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none',
    danger:
      'bg-[var(--signal)] text-white border-2 border-[var(--line)] shadow-[3px_3px_0_var(--shadow-ink)] hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-[5px_5px_0_var(--shadow-ink)] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none',
    ghost:
      'bg-transparent text-[var(--ink-muted)] hover:text-[var(--ink)] hover:bg-[var(--surface)] border-2 border-transparent hover:border-[var(--line)] active:translate-y-0.5',
  };

  return (
    <button
      disabled={disabled || isLoading}
      className={`inline-flex items-center justify-center font-ui font-semibold rounded-full select-none whitespace-nowrap transition-all duration-120 focus-ring cursor-pointer disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:translate-x-0 disabled:hover:translate-y-0 disabled:shadow-[3px_3px_0_var(--shadow-ink)] ${sizeStyles[size]} ${variantStyles[variant]} ${className}`}
      {...props}
    >
      {isLoading ? (
        <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
      ) : (
        icon && <span className="shrink-0">{icon}</span>
      )}
      <span>{children}</span>
    </button>
  );
}
