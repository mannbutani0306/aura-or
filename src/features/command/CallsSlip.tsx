import React from 'react';
import { Emergency } from '../../types';
import { TriageTag, EcgSquiggle, Stamp } from '../../design-system';

interface CallsSlipProps {
  calls: Emergency[];
  selectedCallId?: string;
  onSelectCall: (call: Emergency) => void;
  onAddCall: () => void;
  formatWaitTime: (requestedAt: number) => string;
  zoneName: (zoneId: string) => string;
}

export function CallsSlip({
  calls,
  selectedCallId,
  onSelectCall,
  onAddCall,
  formatWaitTime,
  zoneName,
}: CallsSlipProps) {
  return (
    <div className="flex h-full flex-col overflow-hidden rounded-[28px] border-2 border-[var(--line)] bg-[var(--surface-raised)] shadow-[8px_8px_0_var(--shadow-ink)]">
      <div className="flex items-center justify-between gap-3 border-b-2 border-[var(--line)] bg-[var(--surface)] px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="font-mono-numbers text-[10px] font-black uppercase tracking-[0.2em] text-[var(--ink-muted)]">
            Calls
          </span>
          <span className="font-mono-numbers text-[10px] font-bold text-[var(--ink)]">{calls.length}</span>
        </div>
        <button
          onClick={onAddCall}
          aria-label="Add call"
          className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-[var(--line)] bg-[var(--sun)] text-xl leading-none text-[#3a2802] shadow-[2px_2px_0_var(--shadow-ink)] transition-transform active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
        >
          +
        </button>
      </div>

      <div className="flex-1 overflow-y-auto bg-[var(--surface)]/60 p-2">
        {calls.length === 0 ? (
          <div className="flex h-full items-center justify-center text-center font-mono-numbers text-[10px] uppercase tracking-[0.2em] text-[var(--ink-muted)]">
            all clear
          </div>
        ) : (
          <div className="space-y-2">
            {calls.map((call) => {
              const isSelected = selectedCallId === call.id;
              return (
                <button
                  key={call.id}
                  type="button"
                  onClick={() => onSelectCall(call)}
                  className={`group flex w-full items-center justify-between gap-3 rounded-[14px] border-2 px-2.5 py-2 text-left transition-all ${
                    isSelected
                      ? 'border-[var(--line)] bg-[var(--surface-raised)] shadow-[2px_2px_0_var(--shadow-ink)]'
                      : 'border-[var(--line)]/80 bg-[var(--surface-raised)]/80 hover:-translate-y-0.5 hover:shadow-[4px_4px_0_var(--shadow-ink)]'
                  }`}
                >
                  <div className="flex min-w-0 items-center gap-2.5">
                    <TriageTag priority={call.priority} size="sm" />
                    <div className="min-w-0">
                      <div className="flex min-w-0 items-center gap-1.5">
                        <span className="truncate font-mono-numbers text-[11px] font-bold tracking-[0.12em] text-[var(--ink)]">{call.id}</span>
                        {call.source === 'simulated' && <Stamp variant="SIM" color="high" rotation={0} />}
                      </div>
                      <div className="truncate font-mono-numbers text-[9px] uppercase tracking-[0.12em] text-[var(--ink-muted)]">
                        {zoneName(call.zoneId)}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col items-end">
                    <span className="font-mono-numbers text-[10px] font-semibold tabular-nums text-[var(--ink)]">
                      {formatWaitTime(call.requestedAt)}
                    </span>
                    <span className="font-mono-numbers text-[8px] uppercase tracking-[0.18em] text-[var(--ink-subtle)]">
                      wait
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="border-t-2 border-[var(--line)] bg-[var(--surface)] px-2 pb-2 pt-3">
        <EcgSquiggle color="var(--line)" className="opacity-80" />
      </div>
    </div>
  );
}
