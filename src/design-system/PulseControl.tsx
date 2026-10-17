import React, { useEffect, useState } from 'react';
import { Stamp } from './Stamp';
import { Tooltip } from './Tooltip';

interface PulseState {
  running: boolean;
  ratePerHour: number;
  zoneWeights: Record<string, number> | null;
  error: string | null;
}

const initialState: PulseState = {
  running: false,
  ratePerHour: 6,
  zoneWeights: null,
  error: null,
};

export function PulseControl() {
  const [state, setState] = useState<PulseState>(initialState);
  const [rate, setRate] = useState(6);
  const [isOpen, setIsOpen] = useState(false);
  const [isBusy, setIsBusy] = useState(false);

  useEffect(() => {
    let isCurrent = true;
    fetch('/api/pulse').then(async (response) => {
      const payload = await response.json() as PulseState;
      if (!response.ok) throw new Error(payload.error || 'Pulse state unavailable');
      if (isCurrent) {
        setState(payload);
        setRate(payload.ratePerHour);
      }
    }).catch((reason: unknown) => {
      if (isCurrent) setState((previous) => ({ ...previous, error: reason instanceof Error ? reason.message : 'Pulse state unavailable' }));
    });
    return () => { isCurrent = false; };
  }, []);

  const togglePulse = async () => {
    setIsBusy(true);
    try {
      const response = await fetch('/api/pulse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ running: !state.running, ratePerHour: rate, zoneWeights: state.zoneWeights }),
      });
      const payload = await response.json() as PulseState;
      if (!response.ok) throw new Error(payload.error || 'Pulse update failed');
      setState(payload);
    } catch (reason: unknown) {
      setState((previous) => ({ ...previous, error: reason instanceof Error ? reason.message : 'Pulse update failed' }));
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <div className="relative">
      <Tooltip content="Pulse controls">
        <button
          type="button"
          aria-label="Pulse controls"
          aria-expanded={isOpen}
          onClick={() => setIsOpen((open) => !open)}
          className="flex h-9 items-center gap-1.5 rounded-full border-2 border-[var(--line)] bg-[var(--surface-raised)] px-2.5 font-mono-numbers text-[10px] font-bold uppercase text-[var(--ink)] shadow-[2px_2px_0_var(--shadow-ink)] transition-transform hover:-translate-y-0.5 active:translate-y-0.5 active:shadow-none focus-ring"
        >
          <span aria-hidden="true">🚨</span>
          <span className="hidden xl:inline">Pulse</span>
          <span className={`h-2 w-2 rounded-full border border-[var(--line)] ${state.running ? 'bg-[var(--critical)]' : 'bg-[var(--ink-subtle)]'}`} />
        </button>
      </Tooltip>
      {isOpen && (
        <section aria-label="Pulse settings" className="absolute right-0 top-12 z-50 w-64 rounded-[20px] border-2 border-[var(--line)] bg-[var(--surface-raised)] p-4 shadow-[6px_6px_0_var(--shadow-ink)]">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-serif-display text-xl text-[var(--ink)]">Pulse</h2>
            <Stamp variant={state.running ? 'SIM' : 'STAT'} color={state.running ? 'high' : 'ink'} rotation={-4}>{state.running ? 'ON' : 'OFF'}</Stamp>
          </div>
          <label htmlFor="pulse-rate" className="mb-2 flex items-center justify-between font-mono-numbers text-[10px] font-bold uppercase text-[var(--ink-muted)]">
            <span>Calls per hour</span><span className="tabular-nums text-[var(--ink)]">{rate}</span>
          </label>
          <input
            id="pulse-rate"
            type="range"
            min="1"
            max="60"
            step="1"
            value={rate}
            onChange={(event) => setRate(Number(event.target.value))}
            className="w-full accent-[var(--signal)]"
          />
          <button
            type="button"
            disabled={isBusy}
            onClick={() => void togglePulse()}
            className="mt-4 w-full rounded-full border-2 border-[var(--line)] bg-[var(--ink)] px-4 py-2 font-mono-numbers text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--bg-app)] shadow-[3px_3px_0_var(--signal)] transition-transform hover:-translate-y-0.5 active:translate-y-0.5 active:shadow-none disabled:opacity-60 focus-ring"
          >
            {isBusy ? 'Updating…' : state.running ? 'Stop' : 'Start'}
          </button>
          {state.error && <p role="alert" className="mt-3 break-words font-mono-numbers text-[10px] text-[var(--critical)]">{state.error}</p>}
        </section>
      )}
    </div>
  );
}