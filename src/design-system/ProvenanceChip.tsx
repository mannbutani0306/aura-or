import React from 'react';
import { ProvenanceKind } from './tokens';
import { Tooltip } from './Tooltip';

interface ProvenanceChipProps {
  kind: ProvenanceKind;
  className?: string;
}

export function ProvenanceChip({ kind, className = '' }: ProvenanceChipProps) {
  // Normalize label
  const labelMap: Record<ProvenanceKind, string> = {
    'REAL SAMPLE': 'SAMPLE',
    SIMULATED: 'SIM',
    DERIVED: 'DERIVED',
    DEMO: 'DEMO',
  };

  const tooltipMap: Record<ProvenanceKind, string> = {
    'REAL SAMPLE': 'Madurai municipal sample records',
    SIMULATED: 'Simulated stochastic dispatch queue',
    DERIVED: 'Computed via network shortest-path matrix',
    DEMO: 'Baseline demonstration scenario',
  };

  const shortLabel = labelMap[kind] || kind;
  const explanation = tooltipMap[kind] || kind;

  const colorStyles: Record<ProvenanceKind, string> = {
    'REAL SAMPLE': 'text-[var(--unit-available)] border-[var(--unit-available)]',
    SIMULATED: 'text-[var(--high)] border-[var(--high)]',
    DERIVED: 'text-[var(--ink-muted)] border-[var(--line)]',
    DEMO: 'text-[var(--sun)] border-[var(--line)]',
  };

  return (
    <Tooltip content={explanation}>
      <span
        className={`inline-flex items-center px-1.5 py-0.2 text-[9px] font-mono-numbers font-bold uppercase tracking-wider rounded-[3px] border border-current shadow-[1px_1px_0_var(--shadow-ink)] select-none bg-[var(--surface-raised)] cursor-help ${
          colorStyles[kind] || 'text-[var(--ink)] border-[var(--line)]'
        } ${className}`}
      >
        {shortLabel}
      </span>
    </Tooltip>
  );
}
