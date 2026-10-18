import { useEffect, useState } from 'react';
import { AppConfig } from '../../../engine/types';
import { SolveResponse } from '../../utils/solver';
import { dataSource } from '../../data';
import { Button, Modal, ProvenanceChip, Stamp } from '../../design-system';

interface RunReportProps {
  isOpen: boolean;
  onClose: () => void;
  result: SolveResponse;
}

function isAppConfig(value: unknown): value is AppConfig {
  if (!value || typeof value !== 'object') return false;
  const config = value as Record<string, unknown>;
  return typeof config.sla_min === 'number'
    && (config.als_policy === 'hard' || config.als_policy === 'penalty' || config.als_policy === 'off')
    && typeof config.als_penalty_min === 'number'
    && typeof config.unserved_min === 'number'
    && (config.max_response_min === null || typeof config.max_response_min === 'number')
    && typeof config.service_min === 'number';
}

export function RunReport({ isOpen, onClose, result }: RunReportProps) {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [configError, setConfigError] = useState<string | null>(null);
  const [generatedAt, setGeneratedAt] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setGeneratedAt(new Date().toISOString());
    setConfig(null);
    setConfigError(null);
    void fetch('/api/config').then(async (response) => {
      if (!response.ok) throw new Error(`Configuration unavailable (${response.status})`);
      const payload: unknown = await response.json();
      if (!payload || typeof payload !== 'object' || !isAppConfig((payload as Record<string, unknown>).config)) {
        throw new Error('Configuration response is invalid');
      }
      setConfig((payload as { config: AppConfig }).config);
    }).catch((reason: unknown) => {
      setConfigError(reason instanceof Error ? reason.message : 'Configuration unavailable');
    });
  }, [isOpen]);

  const matrixCalls = result.matrix.emergencyIds;
  const metrics = [
    ['Objective', result.objective],
    ['Average response (min)', result.metrics.avgResponseMin],
    ['Worst response (min)', result.metrics.worstResponseMin],
    ['Critical average (min)', result.metrics.criticalAvgMin],
    ['Served', result.metrics.served],
    ['Queued', result.metrics.queued],
    ['SLA hits', result.metrics.slaHitsCount],
    ['SLA breaches', result.metrics.breachesCount],
    ['Utilization', result.metrics.utilization],
  ] as const;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Run report" maxWidth="max-w-6xl">
      <section data-run-report className="max-h-[70vh] overflow-auto bg-[var(--surface-raised)] text-[var(--ink)]">
        <header className="flex flex-wrap items-start justify-between gap-3 border-b-2 border-[var(--line)] pb-3">
          <div>
            <p className="font-mono-numbers text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--ink-muted)]">AURA · dispatch result</p>
            <h1 className="font-serif-display text-3xl">Run report</h1>
          </div>
          <div className="flex flex-wrap gap-2">
            <Stamp variant="STAT" color={dataSource.isDemo() ? 'high' : 'available'}>{dataSource.isDemo() ? 'SIM' : 'SAMPLE'}</Stamp>
            <ProvenanceChip kind="DERIVED" />
          </div>
        </header>

        <div className="my-3 grid grid-cols-2 gap-x-5 gap-y-1 font-mono-numbers text-[10px] sm:grid-cols-4">
          <p>Mode: {result.mode}</p>
          <p>Engine: {result.engine} {result.engineVersion}</p>
          <p>Run ID: {result.runId ?? 'not persisted'}</p>
          <p>Seed: N/A (operational solve)</p>
          <p>Created: {generatedAt || 'Preparing…'}</p>
          <p>Cross-check: {result.crossCheck.ok ? 'PASS' : 'FAIL'} ({result.crossCheck.method})</p>
        </div>

        <section className="my-3 border-y border-[var(--line)] py-2">
          <h2 className="font-mono-numbers text-[10px] font-bold uppercase">Parameters</h2>
          {config ? (
            <p className="mt-1 font-mono-numbers text-[10px]">
              SLA {config.sla_min} min · ALS {config.als_policy} (+{config.als_penalty_min} min) · unserved {config.unserved_min} min · cap {config.max_response_min ?? 'none'} · service {config.service_min} min
            </p>
          ) : <p role={configError ? 'alert' : 'status'} className="mt-1 font-mono-numbers text-[10px]">{configError ?? 'Loading parameters…'}</p>}
        </section>

        <section className="my-3">
          <h2 className="mb-1 font-mono-numbers text-[10px] font-bold uppercase">Metrics</h2>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
            {metrics.map(([label, value]) => (
              <div key={label} className="border border-[var(--line)] px-2 py-1">
                <p className="font-mono-numbers text-[8px] uppercase text-[var(--ink-muted)]">{label}</p>
                <p className="font-mono-numbers text-sm font-bold">{value}</p>
              </div>
            ))}
          </div>
        </section>

        <div className="grid gap-4 lg:grid-cols-2">
          <section>
            <h2 className="mb-1 font-mono-numbers text-[10px] font-bold uppercase">Travel matrix (min)</h2>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse font-mono-numbers text-[9px]">
                <thead><tr><th className="border border-[var(--line)] p-1">Unit</th>{matrixCalls.map((callId) => <th key={callId} className="border border-[var(--line)] p-1">{callId}</th>)}</tr></thead>
                <tbody>{result.matrix.ambulanceIds.map((unitId) => (
                  <tr key={unitId}><th className="border border-[var(--line)] p-1">{unitId}</th>{matrixCalls.map((callId) => <td key={callId} className="border border-[var(--line)] p-1 text-center">{result.matrix.travelTimes[unitId]?.[callId] ?? '—'}</td>)}</tr>
                ))}</tbody>
              </table>
            </div>
          </section>
          <section>
            <h2 className="mb-1 font-mono-numbers text-[10px] font-bold uppercase">Assignments</h2>
            <table className="w-full border-collapse font-mono-numbers text-[9px]">
              <thead><tr>{['Unit', 'Call', 'ETA', 'Objective cost'].map((item) => <th key={item} className="border border-[var(--line)] p-1 text-left">{item}</th>)}</tr></thead>
              <tbody>
                {result.assignments.map((assignment) => <tr key={assignment.emergencyId}><td className="border border-[var(--line)] p-1">{assignment.ambulanceId}</td><td className="border border-[var(--line)] p-1">{assignment.emergencyId}</td><td className="border border-[var(--line)] p-1">{assignment.etaMin}</td><td className="border border-[var(--line)] p-1">{assignment.weightedMin}</td></tr>)}
                {result.unserved.map((item) => <tr key={item.emergencyId}><td className="border border-[var(--line)] p-1">—</td><td className="border border-[var(--line)] p-1">{item.emergencyId}</td><td className="border border-[var(--line)] p-1">Queued</td><td className="border border-[var(--line)] p-1">{item.reason}</td></tr>)}
              </tbody>
            </table>
          </section>
        </div>
      </section>
      <div className="no-print mt-4 flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onClose}>Close</Button>
        <Button variant="primary" size="sm" onClick={() => window.print()} disabled={!config}>
          Print / Save PDF
        </Button>
      </div>
    </Modal>
  );
}