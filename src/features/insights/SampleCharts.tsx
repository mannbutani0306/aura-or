import React, { useMemo, useState } from 'react';
import { scaleLinear } from 'd3-scale';
import { arc, DefaultArcObject } from 'd3-shape';
import { Copy, Check } from 'lucide-react';
import { Panel, Stamp, Tooltip } from '../../design-system';
import { EmsCase, EMS_SAMPLE_LABEL } from '../../data';

interface ChartProps {
  cases: readonly EmsCase[];
  sql: string;
  sourceLabel?: string;
  canCopyQuery?: boolean;
}

function SamplePanel({ title, sql, cases, sourceLabel = EMS_SAMPLE_LABEL, canCopyQuery = true, children }: React.PropsWithChildren<{ title: string; sql: string; cases: readonly EmsCase[]; sourceLabel?: string; canCopyQuery?: boolean }>) {
  const [copyState, setCopyState] = useState<'ready' | 'copied' | 'failed'>('ready');
  const copySql = async () => {
    try {
      await navigator.clipboard.writeText(sql);
      setCopyState('copied');
    } catch {
      setCopyState('failed');
    }
  };

  return (
    <Panel
      title={title}
      action={
        <div className="flex items-center gap-2">
          <Stamp variant="STAT" color="available">{sourceLabel}</Stamp>
          <span className="font-mono-numbers text-[10px] tabular-nums text-[var(--ink-muted)]">n={cases.length}</span>
          {canCopyQuery && (
            <Tooltip content={copyState === 'failed' ? 'Clipboard unavailable' : copyState === 'copied' ? 'Copied' : 'Copy query'}>
              <button
                type="button"
                aria-label="Copy query"
                onClick={() => void copySql()}
                className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-[var(--line)] bg-[var(--surface)] text-[var(--ink)] shadow-[2px_2px_0_var(--shadow-ink)] transition-transform hover:-translate-y-0.5 active:translate-y-0.5 active:shadow-none focus-ring"
              >
                {copyState === 'copied' ? <Check size={14} /> : <Copy size={14} />}
              </button>
            </Tooltip>
          )}
        </div>
      }
    >
      {children}
    </Panel>
  );
}

export function ResponseDotStrip({ cases, sql, sourceLabel, canCopyQuery }: ChartProps) {
  const width = 760;
  const height = 150;
  const margin = { left: 28, right: 24, top: 18, bottom: 30 };
  const maxSec = Math.max(1, ...cases.map((item) => item.responseSec), ...cases.map((item) => item.benchmarkSec));
  const x = scaleLinear().domain([0, maxSec * 1.05]).range([margin.left, width - margin.right]);
  const benchmark = cases.length
    ? cases.reduce((sum, item) => sum + item.benchmarkSec, 0) / cases.length
    : 0;
  const y = scaleLinear().domain([0, Math.max(1, cases.length - 1)]).range([height - margin.bottom, margin.top]);

  return (
    <SamplePanel title="Response / benchmark" sql={sql} cases={cases} sourceLabel={sourceLabel} canCopyQuery={canCopyQuery}>
      {cases.length === 0 ? <ChartEmpty /> : (
        <div className="overflow-x-auto">
          <svg viewBox={`0 0 ${width} ${height}`} className="min-w-[540px] w-full" role="img" aria-label="Every case response time compared with the sample benchmark">
            <line x1={margin.left} x2={width - margin.right} y1={height - margin.bottom} y2={height - margin.bottom} stroke="var(--line)" strokeWidth="2" />
            <line x1={x(benchmark)} x2={x(benchmark)} y1={margin.top} y2={height - margin.bottom} stroke="var(--critical)" strokeWidth="2" strokeDasharray="6 5" />
            <text x={Math.min(width - 112, x(benchmark) + 7)} y={margin.top + 2} fill="var(--critical)" fontSize="10" fontFamily="var(--font-mono)">BENCH { (benchmark / 60).toFixed(1) }m</text>
            {cases.map((item, index) => (
              <circle
                key={item.id}
                cx={x(item.responseSec)}
                cy={y(index)}
                r="4.5"
                fill={item.responseSec > item.benchmarkSec ? 'var(--critical)' : 'var(--unit-available)'}
                stroke="var(--line)"
                strokeWidth="1.5"
              >
                <title>{`${item.id}: ${(item.responseSec / 60).toFixed(1)} minutes`}</title>
              </circle>
            ))}
            <text x={margin.left} y={height - 8} fill="var(--ink-muted)" fontSize="10" fontFamily="var(--font-mono)">0 min</text>
            <text x={width - margin.right} y={height - 8} textAnchor="end" fill="var(--ink-muted)" fontSize="10" fontFamily="var(--font-mono)">{(maxSec / 60).toFixed(0)} min</text>
          </svg>
        </div>
      )}
    </SamplePanel>
  );
}

interface HourDatum extends DefaultArcObject {
  hour: number;
  count: number;
  slaRate: number;
}

export function HourDemandClock({ cases, sql, sourceLabel, canCopyQuery }: ChartProps) {
  const values = useMemo<HourDatum[]>(() => Array.from({ length: 24 }, (_, hour) => {
    const hourly = cases.filter((item) => item.hour === hour);
    return {
      hour,
      count: hourly.length,
      slaRate: hourly.length ? hourly.filter((item) => item.responseSec <= item.benchmarkSec).length / hourly.length : 0,
      innerRadius: 0,
      outerRadius: 0,
      startAngle: (hour / 24) * Math.PI * 2,
      endAngle: ((hour + 1) / 24) * Math.PI * 2,
      padAngle: 0,
    };
  }), [cases]);
  const maxCount = Math.max(1, ...values.map((item) => item.count));
  const outerArc = arc<HourDatum>()
    .innerRadius(72)
    .outerRadius((datum) => 76 + (datum.count / maxCount) * 38)
    .padAngle(0.025);
  const innerArc = arc<HourDatum>()
    .innerRadius(54)
    .outerRadius(64)
    .endAngle((datum) => ((datum.hour + datum.slaRate) / 24) * Math.PI * 2)
    .padAngle(0.02);
  const baseArc = arc<HourDatum>().innerRadius(54).outerRadius(64).padAngle(0.02);
  const [hoveredHour, setHoveredHour] = useState<number | null>(null);

  return (
    <SamplePanel title="Hour-of-day demand" sql={sql} cases={cases} sourceLabel={sourceLabel} canCopyQuery={canCopyQuery}>
      {cases.length === 0 ? <ChartEmpty /> : (
        <div className="flex flex-col items-center gap-2 sm:flex-row sm:justify-around">
          <svg viewBox="0 0 260 260" className="w-full max-w-[260px]" role="img" aria-label="Calls per hour and hourly benchmark hit rate">
            <g transform="translate(130 130) rotate(-90)">
              {values.map((datum) => {
                return (
                  <g key={datum.hour} onMouseEnter={() => setHoveredHour(datum.hour)} onMouseLeave={() => setHoveredHour(null)}>
                    <path d={outerArc(datum) ?? ''} fill="var(--signal)" stroke="var(--line)" strokeWidth="1.5" tabIndex={0} aria-label={`${datum.hour}:00, ${datum.count} calls`}>
                      <title>{`${String(datum.hour).padStart(2, '0')}:00 · ${datum.count} calls · ${(datum.slaRate * 100).toFixed(0)}% within benchmark`}</title>
                    </path>
                    <path d={baseArc(datum) ?? ''} fill="var(--surface-raised)" stroke="var(--line)" strokeWidth="1" />
                    <path d={innerArc(datum) ?? ''} fill="var(--unit-available)" stroke="var(--line)" strokeWidth="0.8" />
                  </g>
                );
              })}
            </g>
            <text x="130" y="123" textAnchor="middle" fill="var(--ink)" fontFamily="var(--font-display)" fontSize="24">{hoveredHour === null ? '24h' : `${String(hoveredHour).padStart(2, '0')}:00`}</text>
            <text x="130" y="143" textAnchor="middle" fill="var(--ink-muted)" fontFamily="var(--font-mono)" fontSize="9">CALLS / SLA</text>
          </svg>
          <div className="flex gap-4 font-mono-numbers text-[9px] uppercase tracking-[0.12em] text-[var(--ink-muted)] sm:flex-col">
            <span className="flex items-center gap-2"><i className="h-3 w-3 border-2 border-[var(--line)] bg-[var(--signal)]" />calls</span>
            <span className="flex items-center gap-2"><i className="h-3 w-3 border-2 border-[var(--line)] bg-[var(--unit-available)]" />within benchmark</span>
          </div>
        </div>
      )}
    </SamplePanel>
  );
}

export function TriageTimingBars({ cases, sql, sourceLabel, canCopyQuery }: ChartProps) {
  const groups = useMemo(() => {
    const names = [...new Set(cases.map((item) => item.triage))];
    return names.map((name) => {
      const group = cases.filter((item) => item.triage === name);
      return {
        name,
        avg: group.reduce((sum, item) => sum + item.responseSec, 0) / group.length / 60,
        worst: Math.max(...group.map((item) => item.responseSec)) / 60,
      };
    });
  }, [cases]);
  const max = Math.max(15, ...groups.map((group) => group.worst));
  const x = scaleLinear().domain([0, max * 1.1]).range([132, 690]);
  const benchmark = cases.length ? cases.reduce((sum, item) => sum + item.benchmarkSec, 0) / cases.length / 60 : 0;

  return (
    <SamplePanel title="Triage timing" sql={sql} cases={cases} sourceLabel={sourceLabel} canCopyQuery={canCopyQuery}>
      {groups.length === 0 ? <ChartEmpty /> : (
        <div className="overflow-x-auto">
          <svg viewBox={`0 0 740 ${Math.max(160, groups.length * 48 + 38)}`} className="min-w-[540px] w-full" role="img" aria-label="Average and worst response times by triage">
            <line x1={x(benchmark)} x2={x(benchmark)} y1="10" y2={groups.length * 48 + 20} stroke="var(--critical)" strokeWidth="2" strokeDasharray="6 5" />
            <text x={Math.min(620, x(benchmark) + 5)} y="12" fill="var(--critical)" fontSize="9" fontFamily="var(--font-mono)">BENCH {benchmark.toFixed(1)}m</text>
            {groups.map((group, index) => {
              const y = index * 48 + 31;
              return (
                <g key={group.name}>
                  <text x="8" y={y + 4} fill="var(--ink)" fontSize="11" fontFamily="var(--font-mono)">{group.name}</text>
                  <line x1={x(0)} x2={x(group.avg)} y1={y - 5} y2={y - 5} stroke="var(--unit-available)" strokeWidth="8" strokeLinecap="square" />
                  <line x1={x(0)} x2={x(group.worst)} y1={y + 8} y2={y + 8} stroke="var(--critical)" strokeWidth="8" strokeLinecap="square" />
                  <line x1={x(group.avg)} x2={x(group.avg)} y1={y - 11} y2={y + 1} stroke="var(--line)" strokeWidth="2" />
                  <line x1={x(group.worst)} x2={x(group.worst)} y1={y + 2} y2={y + 14} stroke="var(--line)" strokeWidth="2" />
                  <text x="700" y={y + 3} textAnchor="end" fill="var(--ink-muted)" fontSize="9" fontFamily="var(--font-mono)">{group.avg.toFixed(1)} / {group.worst.toFixed(1)}m</text>
                </g>
              );
            })}
          </svg>
          <div className="flex gap-4 font-mono-numbers text-[9px] uppercase tracking-[0.12em] text-[var(--ink-muted)]">
            <span>Average</span><span className="text-[var(--critical)]">Worst</span>
          </div>
        </div>
      )}
    </SamplePanel>
  );
}

export function TypeRankList({ cases, sql, sourceLabel, canCopyQuery }: ChartProps) {
  const groups = useMemo(() => {
    const counts = new Map<string, number>();
    cases.forEach((item) => counts.set(item.callType, (counts.get(item.callType) ?? 0) + 1));
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [cases]);
  const max = Math.max(1, ...groups.map(([, count]) => count));

  return (
    <SamplePanel title="Emergency types" sql={sql} cases={cases} sourceLabel={sourceLabel} canCopyQuery={canCopyQuery}>
      {groups.length === 0 ? <ChartEmpty /> : (
        <ol className="flex flex-col gap-3">
          {groups.map(([name, count], index) => (
            <li key={name} className="grid grid-cols-[2rem_minmax(0,1fr)_3rem] items-center gap-2">
              <span className="font-mono-numbers text-[10px] text-[var(--ink-muted)]">{String(index + 1).padStart(2, '0')}</span>
              <div className="min-w-0">
                <div className="mb-1 truncate font-mono-numbers text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--ink)]">{name}</div>
                <div className="h-3 border-2 border-[var(--line)] bg-[var(--surface)]">
                  <div className="h-full border-r-2 border-[var(--line)] bg-[var(--signal)]" style={{ width: `${(count / max) * 100}%` }} />
                </div>
              </div>
              <span className="text-right font-mono-numbers text-xs tabular-nums text-[var(--ink)]">{count}</span>
            </li>
          ))}
        </ol>
      )}
    </SamplePanel>
  );
}

export function ChartEmpty() {
  return <div className="py-10 text-center font-mono-numbers text-[10px] uppercase tracking-[0.14em] text-[var(--ink-muted)]">No cases match these filters</div>;
}