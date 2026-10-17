import React from 'react';

interface WordmarkProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  onClick?: () => void;
}

export function Wordmark({ size = 'md', className = '', onClick }: WordmarkProps) {
  const sizeClasses = {
    sm: 'text-xl',
    md: 'text-2xl',
    lg: 'text-3xl',
  };

  return (
    <div
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      className={`inline-flex items-baseline gap-1 select-none ${onClick ? 'cursor-pointer hover:opacity-85' : ''} ${className}`}
    >
      <span className={`font-serif-display italic font-bold tracking-tight lowercase text-[var(--ink)] ${sizeClasses[size]}`}>
        aura
      </span>
      <span
        aria-hidden="true"
        className="inline-block text-[12px] leading-none text-[var(--critical)] translate-y-[-2px]"
      >
        🫀
      </span>
    </div>
  );
}
