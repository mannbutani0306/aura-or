import { Download } from 'lucide-react';
import { Button, Drawer, Stamp } from '../../design-system';

interface ModelDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  mode: 'Weighted' | 'Plain';
  isExporting: boolean;
  error: string | null;
  onExport: () => void;
}

export function ModelDrawer({ isOpen, onClose, mode, isExporting, error, onExport }: ModelDrawerProps) {
  return (
    <Drawer isOpen={isOpen} onClose={onClose} title="Model" width="max-w-xl">
      <div className="flex flex-col gap-5">
        <div className="flex items-center justify-between gap-3 border-b-2 border-[var(--line)] pb-4">
          <div>
            <p className="font-mono-numbers text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--ink-muted)]">Current objective</p>
            <h3 className="mt-1 font-serif-display text-2xl text-[var(--ink)]">{mode}</h3>
          </div>
          <Stamp variant="STAT" color="available">ENGINE MODEL</Stamp>
        </div>
        <div className="flex flex-col gap-3 font-mono-numbers text-xs text-[var(--ink)]">
          <p className="border-l-4 border-[var(--unit-available)] pl-3">Minimise assignment travel and policy penalties, plus the configured cost of each queued call.</p>
          <p className="border-l-4 border-[var(--high)] pl-3">Travel values come from Dijkstra over the current road graph. ALS policy penalties are included in feasible assignment costs.</p>
          <p className="border-l-4 border-[var(--critical)] pl-3">Excel Solver receives binary assignment and queue variables, unit capacity constraints, and one service-or-queue constraint per call.</p>
        </div>
        {error && <p role="alert" className="border-2 border-[var(--critical)] bg-[var(--surface)] p-3 font-mono-numbers text-xs text-[var(--critical)]">{error}</p>}
        <div className="border-t-2 border-[var(--line)] pt-4">
          <Button variant="primary" size="md" isLoading={isExporting} onClick={onExport} icon={<Download size={15} />}>
            Export for Solver
          </Button>
        </div>
      </div>
    </Drawer>
  );
}