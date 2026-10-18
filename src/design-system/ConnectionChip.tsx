import React from 'react';
import { ConnectionStatus } from '../data/DataSource';

interface ConnectionChipProps {
  status: ConnectionStatus;
  roundTripMs?: number;
  lastSyncedAt?: number | null;
  isDemo?: boolean;
  error?: string | null;
  className?: string;
  onClick?: () => void;
  compact?: boolean;
}

export function ConnectionChip({
  status,
  roundTripMs = 0,
  lastSyncedAt,
  isDemo = false,
  error = null,
  className = '',
  onClick,
  compact = false,
}: ConnectionChipProps) {
  const statusConfig: Record<
    ConnectionStatus,
    { label: string; dotClass: string; bgClass: string; textClass: string }
  > = {
    live: {
      label: roundTripMs > 0 ? `LIVE · ${roundTripMs}ms` : 'LIVE',
      dotClass: 'bg-[var(--unit-available)] animate-pulse',
      bgClass: 'bg-[var(--mint)]',
      textClass: 'text-[var(--ink)]',
    },
    connecting: {
      label: 'CONNECTING...',
      dotClass: 'bg-[var(--high)] animate-ping',
      bgClass: 'bg-[var(--sun)]',
      textClass: 'text-[var(--ink)]',
    },
    degraded: {
      label: roundTripMs > 0 ? `DEGRADED · ${roundTripMs}ms` : 'DEGRADED',
      dotClass: 'bg-[var(--high)]',
      bgClass: 'bg-[var(--sun)]',
      textClass: 'text-[var(--ink)]',
    },
    offline: {
      label: 'OFFLINE',
      dotClass: 'bg-[var(--critical)]',
      bgClass: 'bg-[var(--blush)]',
      textClass: 'text-[var(--ink)]',
    },
  };

  const config = statusConfig[status];
  const label = isDemo ? 'SIM MODE' : config.label;
  const accessibleLabel = isDemo ? 'Connection status: simulation mode' : `Connection status: ${status}`;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      aria-label={accessibleLabel}
      title={error ?? (isDemo ? 'Showing local simulation data; no live database connection' : undefined)}
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border-2 border-[var(--line)] shadow-[2px_2px_0_var(--shadow-ink)] text-[10px] font-mono-numbers font-bold tracking-wider uppercase select-none transition-all ${
        config.bgClass
      } ${config.textClass} ${onClick ? 'cursor-pointer hover:-translate-y-0.5 active:translate-y-0.5' : 'cursor-default'} ${className}`}
    >
      <span className={`w-2 h-2 rounded-full border border-[var(--line)] ${config.dotClass}`} />
      <span className={compact ? 'hidden sm:inline' : ''}>{label}</span>
    </button>
  );
}
