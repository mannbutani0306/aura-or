import React, { useEffect, useMemo, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { Button, SectionTitle, Stamp } from '../../design-system';
import {
  EmsCase,
  EMS_SAMPLE_LABEL,
  getEmsCases,
  getEmsByHour,
  getEmsByType,
  getEmsSlaByTriage,
} from '../../data';
import {
  HourDemandClock,
  ResponseDotStrip,
  TriageTimingBars,
  TypeRankList,
} from './SampleCharts';

interface InsightsViewProps {
  onNavigate: (route: string) => void;
}

type FilterValue = 'All' | string;

const sqlValue = (value: string) => `'${value.replaceAll("'", "''")}'`;

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

export function InsightsView({ onNavigate }: InsightsViewProps) {
  const [cases, setCases] = useState<readonly EmsCase[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewWarning, setViewWarning] = useState<string | null>(null);
  const [district, setDistrict] = useState<FilterValue>('All');
  const [callType, setCallType] = useState<FilterValue>('All');

  useEffect(() => {
    let isCurrent = true;
    const load = async () => {
      try {
        const rows = await getEmsCases();
        if (isCurrent) setCases(rows);
      } catch (reason: unknown) {
        if (isCurrent) setError(reason instanceof Error ? reason.message : 'Unable to load EMS sample');
      }

      const views = await Promise.allSettled([getEmsByHour(), getEmsByType(), getEmsSlaByTriage()]);
      if (isCurrent) {
        const failures = views.flatMap((result) => result.status === 'rejected'
          ? [result.reason instanceof Error ? result.reason.message : 'An EMS summary view is unavailable']
          : []);
        setViewWarning(failures.length ? failures.join(' · ') : null);
        setIsLoading(false);
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
    const predicates: string[] = [];
    if (district !== 'All') predicates.push(`district = ${sqlValue(district)}`);
    if (callType !== 'All') predicates.push(`call_type = ${sqlValue(callType)}`);
    return predicates.length ? ` WHERE ${predicates.join(' AND ')}` : '';
  }, [district, callType]);
  const responseSql = `SELECT id, response_sec, benchmark_sec FROM ems_cases${whereSql} ORDER BY response_sec;`;
  const hourSql = `SELECT EXTRACT(HOUR FROM call_timestamp) AS hour, COUNT(*) AS calls, COUNT(*) FILTER (WHERE response_sec <= benchmark_sec) AS within_benchmark FROM ems_cases${whereSql} GROUP BY hour ORDER BY hour;`;
  const triageSql = `SELECT triage, AVG(response_sec) AS avg_response_sec, MAX(response_sec) AS worst_response_sec, COUNT(*) FILTER (WHERE response_sec > benchmark_sec) AS breaches FROM ems_cases${whereSql} GROUP BY triage ORDER BY triage;`;
  const typeSql = `SELECT call_type, COUNT(*) AS calls FROM ems_cases${whereSql} GROUP BY call_type ORDER BY calls DESC;`;

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
          {viewWarning && <div role="status" className="border-l-4 border-[var(--high)] bg-[var(--surface-raised)] px-3 py-2 font-mono-numbers text-[10px] text-[var(--ink-muted)]">Summary views unavailable; displayed metrics are calculated from the case rows. {viewWarning}</div>}

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
            <Stamp variant="STAT" color="available">{EMS_SAMPLE_LABEL} · n={filteredCases.length}</Stamp>
          </section>

          <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
            <ResponseDotStrip cases={filteredCases} sql={responseSql} />
            <HourDemandClock cases={filteredCases} sql={hourSql} />
            <TriageTimingBars cases={filteredCases} sql={triageSql} />
            <TypeRankList cases={filteredCases} sql={typeSql} />
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