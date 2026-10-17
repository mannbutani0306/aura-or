import React from 'react';
import { UnitStatus } from './tokens';

interface UnitMarkerProps {
  status: UnitStatus;
  id?: string;
  type?: 'ALS' | 'BLS';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  onClick?: () => void;
}

export function UnitMarker({
  status,
  id,
  type,
  size = 'md',
  className = '',
  onClick,
}: UnitMarkerProps) {
  const isAvailable = status === 'Available';
  const isOffline = status === 'Offline';

  const toneBg = isAvailable
    ? 'bg-[var(--mint)] border-[var(--line)] shadow-[3px_3px_0_var(--shadow-ink)]'
    : isOffline
    ? 'bg-[var(--surface)] border-[var(--line)] opacity-60'
    : 'bg-[var(--sun)] border-[var(--line)] shadow-[3px_3px_0_var(--shadow-ink)]';

  const sizeConfig = {
    sm: { box: 'w-7.5 h-7.5', emoji: 'text-sm' },
    md: { box: 'w-9.5 h-9.5', emoji: 'text-lg' },
    lg: { box: 'w-12 h-12', emoji: 'text-2xl' },
  };

  const currentSize = sizeConfig[size];

  return (
    <div
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      className={`inline-flex items-center gap-2 select-none ${
        onClick ? 'cursor-pointer hover:-translate-y-0.5 active:translate-y-0.5' : ''
      } ${className}`}
    >
      <div
        className={`relative ${currentSize.box} rounded-full border-2 flex items-center justify-center transition-transform ${toneBg}`}
      >
        <span className={`${currentSize.emoji} leading-none pointer-events-none drop-shadow-xs`}>
          🚑
        </span>

        {/* Pulse dot for available */}
        {isAvailable && (
          <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-[var(--unit-available)] border border-[var(--line)]" />
        )}
      </div>

      {(id || type) && (
        <div className="flex flex-col font-mono-numbers leading-tight">
          {id && <span className="text-xs font-bold text-[var(--ink)]">{id}</span>}
          {type && (
            <span className="text-[10px] font-semibold text-[var(--ink-muted)]">
              {type} · {status}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
