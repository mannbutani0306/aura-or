import React from 'react';
import { Ambulance } from '../../types';
import { UnitMarker } from '../../design-system';

interface UnitsSlipProps {
  units: Ambulance[];
  selectedUnitId?: string;
  onSelectUnit: (unit: Ambulance) => void;
  zoneName: (zoneId: string) => string;
}

export function UnitsSlip({ units, selectedUnitId, onSelectUnit, zoneName }: UnitsSlipProps) {
  return (
    <div className="flex h-full flex-col overflow-hidden rounded-[28px] border-2 border-[var(--line)] bg-[var(--surface-raised)] shadow-[8px_8px_0_var(--shadow-ink)]">
      <div className="border-b-2 border-[var(--line)] bg-[var(--surface)] px-4 py-3">
        <div className="flex items-center justify-between">
          <span className="font-mono-numbers text-[10px] font-black uppercase tracking-[0.2em] text-[var(--ink-muted)]">
            Units
          </span>
          <span className="font-mono-numbers text-[10px] font-bold text-[var(--ink)]">{units.length}</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto bg-[var(--surface)]/60 p-2">
        <div className="space-y-2">
          {units.map((unit) => {
            const isSelected = selectedUnitId === unit.id;
            return (
              <button
                key={unit.id}
                type="button"
                onClick={() => onSelectUnit(unit)}
                className={`flex w-full items-center justify-between gap-3 rounded-[14px] border-2 px-2.5 py-2 text-left transition-all ${
                  isSelected
                    ? 'border-[var(--line)] bg-[var(--surface-raised)] shadow-[2px_2px_0_var(--shadow-ink)]'
                    : 'border-[var(--line)]/80 bg-[var(--surface-raised)]/80 hover:-translate-y-0.5 hover:shadow-[4px_4px_0_var(--shadow-ink)]'
                }`}
              >
                <div className="flex min-w-0 items-center gap-2.5">
                  <UnitMarker status={unit.status} id={unit.id} type={unit.type} size="sm" />
                  <div className="min-w-0">
                    <div className="truncate font-mono-numbers text-[11px] font-bold tracking-[0.12em] text-[var(--ink)]">
                      {unit.id}
                    </div>
                    <div className="truncate font-mono-numbers text-[9px] uppercase tracking-[0.1em] text-[var(--ink-muted)]">
                      {zoneName(unit.zoneId)}
                    </div>
                  </div>
                </div>

                <span
                  className="font-mono-numbers text-[9px] font-bold uppercase tracking-[0.16em]"
                  style={{ color: unit.status === 'Available' ? 'var(--unit-available)' : 'var(--unit-busy)' }}
                >
                  {unit.status}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
