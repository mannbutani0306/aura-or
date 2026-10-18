import { useEffect } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { IconButton } from '../../design-system';

const steps = [
  { title: 'Unit availability', detail: 'Live unit status and sector distribution.' },
  { title: 'Calls', detail: 'Open the real call form; register a call or continue with the current queue.' },
  { title: 'Solve', detail: 'Run the optimizer against the current fleet, calls, graph, and config.' },
  { title: 'Assignments', detail: 'Compare assignments, response times, and both baselines.' },
  { title: 'Route trace', detail: 'Play the Dijkstra trace for a current unit-to-call route.' },
  { title: 'Model export', detail: 'Open the model drawer and export the current Solver workbook.' },
  { title: 'Evaluate', detail: 'Run the seeded comparison and inspect its progress and summary.' },
  { title: 'Takeaway', detail: 'Close on the measured current-run comparison.' },
] as const;

interface PresentModeProps {
  step: number | null;
  takeaway: string | null;
  onPrevious: () => void;
  onNext: () => void;
  onSkip: () => void;
}

export function PresentMode({ step, takeaway, onPrevious, onNext, onSkip }: PresentModeProps) {
  useEffect(() => {
    if (step === null) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      if (target instanceof HTMLElement && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        onNext();
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        onPrevious();
      } else if (event.key === 'Escape') {
        event.preventDefault();
        onSkip();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [step, onNext, onPrevious, onSkip]);

  if (step === null) return null;
  const active = steps[step];
  if (!active) return null;

  return (
    <aside className="fixed bottom-[5.25rem] left-3 right-3 z-[60] mx-auto max-w-xl border-2 border-[var(--line)] bg-[var(--surface-raised)] p-4 shadow-[6px_6px_0_var(--shadow-ink)] md:bottom-5" aria-label="Guided presentation">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="mb-1 flex items-center gap-2 font-mono-numbers text-[10px] font-bold uppercase text-[var(--ink-muted)]">
            <span className="inline-flex h-6 min-w-12 items-center justify-center border-2 border-[var(--line)] bg-[var(--sun)] px-1">{step + 1}/8</span>
            <span>Present</span>
          </div>
          <h2 className="font-serif-display text-xl text-[var(--ink)]">{active.title}</h2>
          <p className="mt-1 font-ui text-xs text-[var(--ink-muted)]">{step === 7 && takeaway ? takeaway : active.detail}</p>
        </div>
        <IconButton icon={<X size={16} />} label="Skip presentation" onClick={onSkip} size="sm" />
      </div>
      <div className="mt-3 flex items-center justify-between border-t-2 border-[var(--line)] pt-3">
        <button type="button" onClick={onPrevious} disabled={step === 0} className="inline-flex items-center gap-1 font-mono-numbers text-[10px] font-bold uppercase text-[var(--ink)] disabled:opacity-40"><ChevronLeft size={14} />Back</button>
        <div className="flex items-center gap-2">
          <button type="button" onClick={onSkip} className="px-2 py-1 font-mono-numbers text-[10px] font-bold uppercase text-[var(--ink-muted)]">Skip</button>
          <button type="button" onClick={onNext} className="inline-flex items-center gap-1 border-2 border-[var(--line)] bg-[var(--ink)] px-3 py-1.5 font-mono-numbers text-[10px] font-bold uppercase text-[var(--bg-app)] shadow-[2px_2px_0_var(--signal)]">{step === 7 ? 'Finish' : 'Next'}<ChevronRight size={14} /></button>
        </div>
      </div>
    </aside>
  );
}