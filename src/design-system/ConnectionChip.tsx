import React from 'react';
import { ConnectionStatus } from '../data/DataSource';

interface ConnectionChipProps {
  status: ConnectionStatus;
  roundTripMs?: number;
  lastSyncedAt?: number | null;
  className?: string;
  onClick?: () => void;
}

export function ConnectionChip({
  status,
  roundTripMs = 0,
  lastSyncedAt,
  className = '',
  onClick,
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

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      aria-label={`Connection status: ${status}`}
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border-2 border-[var(--line)] shadow-[2px_2px_0_var(--shadow-ink)] text-[10px] font-mono-numbers font-bold tracking-wider uppercase select-none transition-all ${
        config.bgClass
      } ${config.textClass} ${onClick ? 'cursor-pointer hover:-translate-y-0.5 active:translate-y-0.5' : 'cursor-default'} ${className}`}
    >
      <span className={`w-2 h-2 rounded-full border border-[var(--line)] ${config.dotClass}`} />
      <span>{config.label}</span>
    </button>
  );
}
