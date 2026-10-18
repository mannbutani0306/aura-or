import React, { useEffect, useState } from 'react';
import { Tooltip } from './Tooltip';
import { EMS_SAMPLE_LABEL } from '../data/provenance';
import { dataSource } from '../data';

export function ProvenancePopover() {
  const [isOpen, setIsOpen] = useState(false);
  const operationalSource = dataSource.isDemo()
    ? { kind: 'SIM', detail: 'In-memory fallback state' }
    : { kind: 'SAMPLE', detail: 'Current Supabase operational rows' };
  const entries = [
    { name: 'EMS statistics', kind: EMS_SAMPLE_LABEL, detail: 'Workbook sheet: dummy_ambulance_data' },
    { name: 'Road minutes', kind: 'DERIVED', detail: 'Dijkstra over the configured road-edge graph' },
    { name: 'Fleet and live calls', ...operationalSource },
  ];

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === '?' && !event.metaKey && !event.ctrlKey && !event.altKey) {
        const target = event.target as HTMLElement;
        if (target.tagName !== 'INPUT' && target.tagName !== 'TEXTAREA' && !target.isContentEditable) {
          event.preventDefault();
          setIsOpen((open) => !open);
        }
      } else if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div className="relative">
      <Tooltip content="Data provenance" shortcut="?">
        <button
          type="button"
          aria-label="Data provenance"
          aria-expanded={isOpen}
          onClick={() => setIsOpen((open) => !open)}
          className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-[var(--line)] bg-[var(--surface-raised)] font-mono-numbers text-sm font-bold text-[var(--ink)] shadow-[2px_2px_0_var(--shadow-ink)] transition-transform hover:-translate-y-0.5 active:translate-y-0.5 active:shadow-none focus-ring"
        >?</button>
      </Tooltip>
      {isOpen && (
        <section aria-label="Data provenance" className="absolute right-0 top-12 z-50 w-72 rounded-[20px] border-2 border-[var(--line)] bg-[var(--surface-raised)] p-4 shadow-[6px_6px_0_var(--shadow-ink)]">
          <h2 className="mb-3 font-serif-display text-xl text-[var(--ink)]">Provenance</h2>
          <ul className="flex flex-col gap-3">
            {entries.map((entry) => (
              <li key={entry.name} className="border-t border-[var(--line)] pt-2">
                <div className="flex items-baseline justify-between gap-2 font-mono-numbers text-[10px] font-bold uppercase text-[var(--ink)]">
                  <span>{entry.name}</span><span className="text-[var(--unit-available)]">{entry.kind}</span>
                </div>
                <p className="mt-1 font-mono-numbers text-[10px] leading-relaxed text-[var(--ink-muted)]">{entry.detail}</p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}