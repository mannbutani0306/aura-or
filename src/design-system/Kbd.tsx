import React from 'react';

interface KbdProps {
  children: React.ReactNode;
  className?: string;
}

export function Kbd({ children, className = '' }: KbdProps) {
  return (
    <kbd
      className={`inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 text-[10px] font-mono-numbers font-bold text-[var(--ink)] bg-[var(--surface-raised)] border-2 border-[var(--line)] shadow-[1px_1px_0_var(--shadow-ink)] rounded-[4px] select-none leading-none ${className}`}
    >
      {children}
    </kbd>
  );
}
