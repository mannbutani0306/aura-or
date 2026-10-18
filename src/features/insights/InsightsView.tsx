import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, Download } from 'lucide-react';
import { Button, SectionTitle, Stamp } from '../../design-system';
import { EvaluationSummary } from '../../../engine/evaluate';
import { downloadCsv } from '../../utils/fileExports';
import {
  EmsCase,
  EMS_SAMPLE_LABEL,
  getEmsSample,
} from '../../data';
import {
  HourDemandClock,
  ResponseDotStrip,
  TriageTimingBars,
  TypeRankList,
} from './SampleCharts';

interface InsightsViewProps {
  onNavigate: (route: string) => void;
  presentStep?: number | null;
}

type FilterValue = 'All' | string;

const sqlValue = (value: string) => `'${value.replaceAll("'", "''")}'`;
const sqlIdentifier = (value: string) => `"${value.replaceAll('"', '""')}"`;

function FilterChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`rounded-full border-2 px-3 py-1.5 font-mono-numbers text-[10px] font-bold uppercase tracking-[0.1em] transition-all focus-ring ${active
        ? 'border-[var(--line)] bg-[var(--ink)] text-[var(--bg-app)] shadow-[2px_2px_0_var(--signal)]'
        : 'border-[var(--line)] bg-[var(--surface)] text-[var(--ink-muted)] hover:-translate-y-0.5 hover:text-[var(--ink)]'
      }`}
    >
      {label}
    </button>
  );
}

export function InsightsView({ onNavigate, presentStep = null }: InsightsViewProps) {
  const [cases, setCases] = useState<readonly EmsCase[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sampleSource, setSampleSource] = useState<'database' | 'workbook'>('workbook');
  const [sourceWarning, setSourceWarning] = useState<string | null>(null);
  const [district, setDistrict] = useState<FilterValue>('All');
  const [callType, setCallType] = useState<FilterValue>('All');

  useEffect(() => {
    let isCurrent = true;
    const load = async () => {
      try {
        const sample = await getEmsSample();
        if (isCurrent) {
          setCases(sample.cases);
          setSampleSource(sample.source);
          setSourceWarning(sample.warning);
        }
      } catch (reason: unknown) {
        if (isCurrent) setError(reason instanceof Error ? reason.message : 'Unable to load EMS sample');
      } finally {
        if (isCurrent) setIsLoading(false);
      }
    };
    void load();
    return () => { isCurrent = false; };
  }, []);

  const districts = useMemo(() => [...new Set(cases.map((item) => item.district))].sort(), [cases]);
  const callTypes = useMemo(() => [...new Set(cases.map((item) => item.callType))].sort(), [cases]);
  const filteredCases = useMemo(() => cases.filter((item) =>
    (district === 'All' || item.district === district) &&
    (callType === 'All' || item.callType === callType)
  ), [cases, district, callType]);

  const metrics = useMemo(() => {
    const within = filteredCases.filter((item) => item.responseSec <= item.benchmarkSec).length;
    const percentWithin = filteredCases.length ? (within / filteredCases.length) * 100 : 0;
    const hourly = Array.from({ length: 24 }, (_, hour) => ({
      hour,
      count: filteredCases.filter((item) => item.hour === hour).length,
    }));
    const worstHour = [...hourly].sort((a, b) => b.count - a.count)[0];
    const triageBreaches = [...new Set(filteredCases.map((item) => item.triage))].map((priority) => ({
      priority,
      count: filteredCases.filter((item) => item.triage === priority && item.responseSec > item.benchmarkSec).length,
    })).sort((a, b) => b.count - a.count);
    return { percentWithin, worstHour, worstPriority: triageBreaches[0] };
  }, [filteredCases]);

  const whereSql = useMemo(() => {
    const columns = cases[0]?.sourceColumns;
    const districtColumn = sqlIdentifier(columns?.district ?? 'district');
    const typeColumn = sqlIdentifier(columns?.callType ?? 'call_type');
    const predicates: string[] = [];
    if (district !== 'All') predicates.push(`${districtColumn} = ${sqlValue(district)}`);
    if (callType !== 'All') predicates.push(`${typeColumn} = ${sqlValue(callType)}`);
    return predicates.length ? ` WHERE ${predicates.join(' AND ')}` : '';
  }, [cases, district, callType]);
  const sourceColumns = cases[0]?.sourceColumns;
  const idColumn = sqlIdentifier(sourceColumns?.id ?? 'id');
  const responseColumn = sqlIdentifier(sourceColumns?.responseSec ?? 'response_sec');
  const benchmarkColumn = sqlIdentifier(sourceColumns?.benchmarkSec ?? 'benchmark_sec');
  const triageColumn = sqlIdentifier(sourceColumns?.triage ?? 'triage');
  const callTypeColumn = sqlIdentifier(sourceColumns?.callType ?? 'call_type');
  const hourColumn = sqlIdentifier(sourceColumns?.hour ?? 'hour');
  const hourExpression = sourceColumns?.hourUsesTimestamp === false
    ? `${hourColumn}::integer`
    : `EXTRACT(HOUR FROM ${hourColumn})`;
  const responseSql = `SELECT ${idColumn}, ${responseColumn}, ${benchmarkColumn} FROM ems_cases${whereSql} ORDER BY ${responseColumn};`;
  const hourSql = `SELECT ${hourExpression} AS hour, COUNT(*) AS calls, COUNT(*) FILTER (WHERE ${responseColumn} <= ${benchmarkColumn}) AS within_benchmark FROM ems_cases${whereSql} GROUP BY hour ORDER BY hour;`;
  const triageSql = `SELECT ${triageColumn}, AVG(${responseColumn}) AS avg_response_sec, MAX(${responseColumn}) AS worst_response_sec, COUNT(*) FILTER (WHERE ${responseColumn} > ${benchmarkColumn}) AS breaches FROM ems_cases${whereSql} GROUP BY ${triageColumn} ORDER BY ${triageColumn};`;
  const typeSql = `SELECT ${callTypeColumn}, COUNT(*) AS calls FROM ems_cases${whereSql} GROUP BY ${callTypeColumn} ORDER BY calls DESC;`;

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 pb-16">
      <SectionTitle
        eyebrow="MADURAI EMS SAMPLE"
        title="Response patterns & demand"
        accentWord="demand"
        action={<Button variant="secondary" size="sm" onClick={() => onNavigate('command')} icon={<ArrowRight size={14} />}>Command</Button>}
      />

      {isLoading ? (
        <div role="status" className="rounded-[20px] border-2 border-[var(--line)] bg-[var(--surface-raised)] p-8 text-center font-mono-numbers text-xs uppercase tracking-[0.15em] text-[var(--ink-muted)]">Loading sample rows…</div>
      ) : error ? (
        <div role="alert" className="rounded-[20px] border-2 border-[var(--critical)] bg-[var(--surface-raised)] p-5 shadow-[4px_4px_0_var(--shadow-ink)]">
          <div className="mb-2 flex items-center gap-3"><Stamp variant="STAT" color="high">SAMPLE UNAVAILABLE</Stamp><span className="font-mono-numbers text-xs font-bold text-[var(--critical)]">EMS DATA NOT LOADED</span></div>
          <p className="font-mono-numbers text-xs text-[var(--ink)]">{error}</p>
          <p className="mt-2 font-mono-numbers text-[10px] text-[var(--ink-muted)]">No sample values are shown until the table is available.</p>
        </div>
      ) : (
        <>
          {sourceWarning && <div role="status" className="border-l-4 border-[var(--high)] bg-[var(--surface-raised)] px-3 py-2 font-mono-numbers text-[10px] text-[var(--ink-muted)]">{sourceWarning}</div>}

          <div className="flex flex-wrap items-center justify-between gap-3 border-y-2 border-[var(--line)] py-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="mr-1 font-mono-numbers text-[9px] font-bold uppercase tracking-[0.16em] text-[var(--ink-muted)]">District</span>
              <FilterChip label="All" active={district === 'All'} onClick={() => setDistrict('All')} />
              {districts.map((value) => <FilterChip key={value} label={value} active={district === value} onClick={() => setDistrict(value)} />)}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="mr-1 font-mono-numbers text-[9px] font-bold uppercase tracking-[0.16em] text-[var(--ink-muted)]">Call type</span>
              <FilterChip label="All" active={callType === 'All'} onClick={() => setCallType('All')} />
              {callTypes.map((value) => <FilterChip key={value} label={value} active={callType === value} onClick={() => setCallType(value)} />)}
            </div>
          </div>

          <section className="flex flex-wrap items-end justify-between gap-4 border-b-2 border-[var(--line)] pb-4" aria-label="Benchmark summary">
            <div>
              <span className="font-mono-numbers text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--ink-muted)]">Within response benchmark</span>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="font-serif-display text-6xl leading-none tabular-nums text-[var(--ink)]">{metrics.percentWithin.toFixed(1)}%</span>
                <span className="font-mono-numbers text-xs text-[var(--ink-muted)]">{filteredCases.filter((item) => item.responseSec <= item.benchmarkSec).length}/{filteredCases.length} cases</span>
              </div>
            </div>
            <Stamp variant="STAT" color="available">{sampleSource === 'workbook' ? 'WORKBOOK SAMPLE' : EMS_SAMPLE_LABEL} · n={filteredCases.length}</Stamp>
          </section>

          <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
            <ResponseDotStrip cases={filteredCases} sql={responseSql} sourceLabel={sampleSource === 'workbook' ? 'WORKBOOK SAMPLE' : EMS_SAMPLE_LABEL} canCopyQuery={sampleSource === 'database'} />
            <HourDemandClock cases={filteredCases} sql={hourSql} sourceLabel={sampleSource === 'workbook' ? 'WORKBOOK SAMPLE' : EMS_SAMPLE_LABEL} canCopyQuery={sampleSource === 'database'} />
            <TriageTimingBars cases={filteredCases} sql={triageSql} sourceLabel={sampleSource === 'workbook' ? 'WORKBOOK SAMPLE' : EMS_SAMPLE_LABEL} canCopyQuery={sampleSource === 'database'} />
            <TypeRankList cases={filteredCases} sql={typeSql} sourceLabel={sampleSource === 'workbook' ? 'WORKBOOK SAMPLE' : EMS_SAMPLE_LABEL} canCopyQuery={sampleSource === 'database'} />
          </div>

          <section aria-labelledby="findings-title" className="border-t-2 border-[var(--line)] pt-4">
            <h2 id="findings-title" className="mb-3 font-serif-display text-2xl text-[var(--ink)]">Findings</h2>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <Finding emoji="🕒" text={metrics.worstHour?.count ? `Demand peaks at ${String(metrics.worstHour.hour).padStart(2, '0')}:00 with ${metrics.worstHour.count} calls.` : 'No hourly peak in the selected sample.'} />
              <Finding emoji="🚑" text={metrics.worstPriority?.count ? `${metrics.worstPriority.priority} has the most benchmark breaches (${metrics.worstPriority.count}).` : 'No benchmark breaches in the selected sample.'} />
              <Finding emoji="📍" text={`${metrics.percentWithin.toFixed(1)}% of selected cases meet their response benchmark.`} />
            </div>
          </section>

        </>
      )}
      <EvaluationPanel presentStep={presentStep} />
    </div>
  );
}

function isEvaluationSummary(value: unknown): value is EvaluationSummary {
  if (!value || typeof value !== 'object') return false;
  const summary = value as Record<string, unknown>;
  return typeof summary.n === 'number'
    && typeof summary.seed === 'number'
    && typeof summary.meanImprovementPct === 'number'
    && Array.isArray(summary.scenarios);
}

function EvaluationPanel({ presentStep }: { presentStep: number | null }) {
  const [seed, setSeed] = useState('1337');
  const [scenarioCount, setScenarioCount] = useState('500');
  const [summary, setSummary] = useState<EvaluationSummary | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const exportCsv = () => {
    if (!summary?.scenarios.length) return;
    const header = ['scenarioId', 'improvementPct', 'criticalImprovementPct', 'worstResponseImprovementPct', 'extraCallsServed'];
    const rows = summary.scenarios.map((item) => [item.scenarioId, item.improvementPct, item.criticalImprovementPct, item.worstResponseImprovementPct, item.extraCallsServed]);
    downloadCsv(`aura-eval-${Date.now()}.csv`, [header, ...rows]);
  };

  const runEvaluation = async () => {
    setIsLoading(true);
    setError(null);
    setProgress(0);
    try {
      const response = await fetch('/api/evaluate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ n: Number(scenarioCount), seed: Number(seed) }),
      });
      if (!response.ok) {
        throw new Error('Evaluation request failed');
      }
      const reader = response.body?.getReader();
      if (!reader) throw new Error('Streaming not supported');
      const decoder = new TextDecoder();
      let buffer = '';
      let fullPayload: EvaluationSummary | null = null;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const chunks = buffer.split('\n\n');
        buffer = chunks.pop() ?? '';
        for (const chunk of chunks) {
          const eventLine = chunk.match(/event: (.*)/)?.[1];
          const dataLine = chunk.match(/data: (.*)/)?.[1];
          if (!dataLine) continue;
          const payload: unknown = JSON.parse(dataLine);
          if (eventLine === 'progress') {
            if (payload && typeof payload === 'object') {
              const progressEvent = payload as Record<string, unknown>;
              const current = typeof progressEvent.current === 'number' ? progressEvent.current : 0;
              const total = typeof progressEvent.total === 'number' ? progressEvent.total : 1;
              setProgress(Math.round((current / Math.max(1, total)) * 100));
            }
          }
          if (eventLine === 'complete') {
            if (!isEvaluationSummary(payload)) throw new Error('Evaluation summary response is invalid');
            fullPayload = payload;
          }
          if (eventLine === 'error' && payload && typeof payload === 'object') {
            const errorBody = (payload as Record<string, unknown>).error;
            if (errorBody && typeof errorBody === 'object' && typeof (errorBody as Record<string, unknown>).message === 'string') {
              throw new Error(String((errorBody as Record<string, unknown>).message));
            }
            throw new Error('Evaluation request failed');
          }
        }
      }
      if (!fullPayload) throw new Error('No evaluation summary received');
      setSummary(fullPayload);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to run evaluation');
    } finally {
      setIsLoading(false);
    }
  };

  const lastPresentRun = useRef(false);
  useEffect(() => {
    if (presentStep === 6 && !lastPresentRun.current) {
      lastPresentRun.current = true;
      void runEvaluation();
    } else if (presentStep !== 6) {
      lastPresentRun.current = false;
    }
  }, [presentStep]);

  const chartHeight = 120;
  const scenarioRows = summary?.scenarios ?? [];
  const chartPoints = scenarioRows.map((row, index) => {
    const x = ((index + 1) / Math.max(1, scenarioRows.length || 1)) * 220;
    const y = chartHeight - ((Number(row.improvementPct ?? 0) + 30) / 60) * chartHeight;
    return `${x},${y}`;
  }).join(' ');

  return (
    <section className="rounded-[24px] border-2 border-[var(--line)] bg-[var(--surface)] p-4 shadow-[6px_6px_0_var(--shadow-ink)]">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-mono-numbers text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--ink-muted)]">Monte Carlo evaluate</p>
          <h2 className="font-serif-display text-3xl text-[var(--ink)]">Scenario lift</h2>
        </div>
        <Stamp variant="STAT" color="available">SIM · n={scenarioCount}</Stamp>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 font-mono-numbers text-[10px] uppercase tracking-[0.12em] text-[var(--ink-muted)]">
          scenarios
          <input value={scenarioCount} onChange={(event) => setScenarioCount(event.target.value)} className="w-20 border-2 border-[var(--line)] bg-[var(--surface-raised)] px-2 py-1 font-mono-numbers text-[11px] text-[var(--ink)] outline-none" />
        </label>
        <label className="flex items-center gap-2 font-mono-numbers text-[10px] uppercase tracking-[0.12em] text-[var(--ink-muted)]">
          seed
          <input value={seed} onChange={(event) => setSeed(event.target.value)} className="w-24 border-2 border-[var(--line)] bg-[var(--surface-raised)] px-2 py-1 font-mono-numbers text-[11px] text-[var(--ink)] outline-none" />
        </label>
        <button type="button" onClick={runEvaluation} disabled={isLoading} className="rounded-full border-2 border-[var(--line)] bg-[var(--ink)] px-3 py-2 font-mono-numbers text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--bg-app)] disabled:opacity-60">
          {isLoading ? 'Running…' : 'Run with SSE'}
        </button>
        <button type="button" onClick={exportCsv} disabled={!summary?.scenarios.length} className="inline-flex items-center gap-2 rounded-full border-2 border-[var(--line)] bg-[var(--surface-raised)] px-3 py-2 font-mono-numbers text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--ink)] disabled:opacity-40">
          <Download size={12} /> Export CSV
        </button>
      </div>

      {isLoading && (
        <div className="mb-4 h-2.5 w-full overflow-hidden rounded-full border-2 border-[var(--line)] bg-[var(--surface-raised)]">
          <div className="h-full bg-[var(--unit-available)] transition-all duration-200" style={{ width: `${progress}%` }} />
        </div>
      )}

      {error && <p className="mb-4 font-mono-numbers text-[10px] text-[var(--critical)]">{error}</p>}

      {summary && (
        <>
          <div className="mb-4 grid gap-3 md:grid-cols-5">
            <Metric label="mean improvement" value={`${(summary.meanImprovementPct ?? 0).toFixed(1)}%`} />
            <Metric label="win rate" value={`${(((summary.winCount ?? 0) / Math.max(1, (summary.winCount ?? 0) + (summary.tieCount ?? 0) + (summary.lossCount ?? 0))) * 100).toFixed(1)}%`} />
            <Metric label="p-value" value={(summary.pValue ?? 0).toFixed(3)} />
            <Metric label="extra calls" value={(summary.meanExtraCallsServed ?? 0).toFixed(2)} />
            <Metric label="SLA hit" value={`${((summary.slaHitRate?.optimal ?? 0) * 100).toFixed(1)}%`} />
          </div>

          <div className="rounded-[18px] border-2 border-[var(--line)] bg-[var(--surface-raised)] p-3">
            <p className="mb-2 font-mono-numbers text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--ink-muted)]">per-scenario improvement</p>
            <svg viewBox="0 0 240 120" className="h-32 w-full" role="img" aria-label="Scenario improvement chart">
              <line x1="0" y1="110" x2="230" y2="110" stroke="var(--line)" strokeWidth="1" />
              <line x1="10" y1="0" x2="10" y2="110" stroke="var(--line)" strokeWidth="1" />
              <line x1="10" y1="55" x2="230" y2="55" stroke="var(--critical)" strokeOpacity="0.28" />
              <polyline fill="none" stroke="var(--unit-available)" strokeWidth="2" points={chartPoints} />
            </svg>
          </div>

          <p className="mt-3 font-serif-display text-lg text-[var(--ink)]">
            Reading: {((summary.meanImprovementPct ?? 0) > 6 ? 'The optimiser is materially ahead of the priority-greedy baseline.' : 'The gain over priority-greedy is small enough that dispatcher judgement may outweigh the model delta.')}
          </p>
        </>
      )}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[18px] border-2 border-[var(--line)] bg-[var(--surface-raised)] px-3 py-2">
      <p className="font-mono-numbers text-[9px] font-bold uppercase tracking-[0.14em] text-[var(--ink-muted)]">{label}</p>
      <p className="mt-2 font-serif-display text-3xl text-[var(--ink)] tabular-nums">{value}</p>
    </div>
  );
}

function Finding({ emoji, text }: { emoji: string; text: string }) {
  return (
    <div className="relative min-h-24 border-2 border-[var(--line)] bg-[var(--sun)] px-4 py-3 shadow-[4px_4px_0_var(--shadow-ink)]">
      <span className="absolute -top-3 left-3 text-xl" aria-hidden="true">{emoji}</span>
      <p className="pt-2 font-ui text-sm font-semibold leading-snug text-[#302508]">{text}</p>
    </div>
  );
}