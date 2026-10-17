import React from 'react';
import { ProvenanceKind } from './tokens';
import { ProvenanceChip } from './ProvenanceChip';

interface PanelProps {
  title?: string;
  badge?: ProvenanceKind;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  raised?: boolean;
}

export function Panel({
  title,
  badge,
  action,
  children,
  className = '',
  raised = false,
}: PanelProps) {
  return (
    <div
      className={`rounded-[20px] border-2 border-[var(--line)] shadow-[6px_6px_0_var(--shadow-ink)] transition-all duration-120 overflow-hidden ${
        raised ? 'bg-[var(--surface-raised)]' : 'bg-[var(--surface)]'
      } ${className}`}
    >
      {(title || badge || action) && (
        <div className="flex items-center justify-between px-5 py-3.5 border-b-2 border-[var(--line)] bg-[var(--surface)]/60">
          <div className="flex items-center gap-2.5">
            {title && (
              <h3 className="text-xs font-mono-numbers font-bold uppercase tracking-widest text-[var(--ink)]">
                {title}
              </h3>
            )}
            {badge && <ProvenanceChip kind={badge} />}
          </div>
          {action && <div className="flex items-center gap-2">{action}</div>}
        </div>
      )}
      <div className="p-5">{children}</div>
    </div>
  );
}
