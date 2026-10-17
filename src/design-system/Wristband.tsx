import React from 'react';

export interface WristbandProps {
  id: string;
  type?: 'ALS' | 'BLS';
  status?: 'Available' | 'Busy' | 'Offline';
  className?: string;
  onClick?: () => void;
}

export function Wristband({
  id,
  type = 'ALS',
  status = 'Available',
  className = '',
  onClick,
}: WristbandProps) {
  const isAvailable = status === 'Available';
  const isBusy = status === 'Busy';

  const toneBg = isAvailable
    ? 'bg-[var(--mint)] text-[#0F3825] dark:text-[#E2F7EB]'
    : isBusy
    ? 'bg-[var(--sun)] text-[#4D3803] dark:text-[#FDF2D0]'
    : 'bg-[var(--surface)] text-[var(--ink-muted)]';

  return (
    <div
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      className={`relative inline-flex items-center gap-2 px-3 py-1 rounded-full border-2 border-[var(--line)] shadow-[3px_3px_0_var(--shadow-ink)] select-none font-mono-numbers text-xs font-bold ${toneBg} ${
        onClick ? 'cursor-pointer hover:-translate-y-0.5 active:translate-y-0.5 active:shadow-none' : ''
      } ${className}`}
    >
      {/* Tear notch on left edge */}
      <span
        aria-hidden="true"
        className="absolute -left-1 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-[var(--bg-app)] border-r-2 border-[var(--line)]"
      />

      <span className="text-[13px] leading-none">🚑</span>
      <span className="tracking-wide">{id}</span>

      {/* ALS / BLS mark */}
      <span className="px-1.5 py-0.2 rounded-full border border-current text-[9px] uppercase tracking-wider font-extrabold bg-black/10 leading-tight">
        {type}
      </span>

      {/* Tear notch on right edge */}
      <span
        aria-hidden="true"
        className="absolute -right-1 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-[var(--bg-app)] border-l-2 border-[var(--line)]"
      />
    </div>
  );
}
