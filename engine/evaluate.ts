import { buildCostMatrix, calculateMetrics, runFcfsBaseline, runPriorityGreedyBaseline, solveFleetAllocation } from './assignment';
import { buildTravelMatrix } from './graph';
import { Ambulance, AppConfig, DEFAULT_CONFIG, Emergency, RoadEdge, Zone } from './types';

export type TriagePriority = 'Critical' | 'High' | 'Medium' | 'Low';

export interface TriageMix {
  Critical: number;
  High: number;
  Medium: number;
  Low: number;
}

export interface EvaluationScenario {
  id: string;
  zones: Zone[];
  edges: RoadEdge[];
  units: Ambulance[];
  calls: Emergency[];
  config: AppConfig;
}

export interface ScenarioResult {
  scenarioId: string;
  seed: number;
  fcfs: {
    served: number;
    weightedTotal: number;
    criticalAvgMin: number;
    worstResponseMin: number;
    slaHitRate: number;
  };
  greedy: {
    served: number;
    weightedTotal: number;
    criticalAvgMin: number;
    worstResponseMin: number;
    slaHitRate: number;
  };
  optimal: {
    served: number;
    weightedTotal: number;
    criticalAvgMin: number;
    worstResponseMin: number;
    slaHitRate: number;
  };
  improvementPct: number;
  criticalImprovementPct: number;
  worstResponseImprovementPct: number;
  extraCallsServed: number;
  win: 'win' | 'tie' | 'loss';
  integrityViolation: boolean;
}

export interface EvaluationSummary {
  n: number;
  seed: number;
  meanImprovementPct: number;
  ci95ImprovementPct: [number, number];
  meanCriticalImprovementPct: number;
  ci95CriticalImprovementPct: [number, number];
  meanWorstResponseImprovementPct: number;
  meanExtraCallsServed: number;
  winCount: number;
  tieCount: number;
  lossCount: number;
  pairedT: number;
  pValue: number;
  slaHitRate: Record<'fcfs' | 'greedy' | 'optimal', number>;
  integrityViolations: number;
  scenarios: ScenarioResult[];
}

const PRIORITY_WT: Record<TriagePriority, number> = {
  Critical: 5,
  High: 3,
  Medium: 2,
  Low: 1,
};

export function mulberry32(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value += 0x6D2B79F5;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function ensureTriageMix(input?: Partial<TriageMix>): TriageMix {
  const fallback: TriageMix = { Critical: 40, High: 30, Medium: 20, Low: 10 };
  if (!input) return fallback;
  const total = Math.max(1, (input.Critical ?? fallback.Critical) + (input.High ?? fallback.High) + (input.Medium ?? fallback.Medium) + (input.Low ?? fallback.Low));
  return {
    Critical: ((input.Critical ?? fallback.Critical) / total) * 100,
    High: ((input.High ?? fallback.High) / total) * 100,
    Medium: ((input.Medium ?? fallback.Medium) / total) * 100,
    Low: ((input.Low ?? fallback.Low) / total) * 100,
  };
}

export function selectPriorityFromMix(rng: () => number, mix: TriageMix): TriagePriority {
  const roll = rng();
  const buckets: Array<{ total: number; priority: TriagePriority }> = [
    { total: mix.Critical, priority: 'Critical' },
    { total: mix.High + mix.Critical, priority: 'High' },
    { total: mix.Medium + mix.High + mix.Critical, priority: 'Medium' },
    { total: 100, priority: 'Low' },
  ];
  const value = roll * 100;
  for (const bucket of buckets) {
    if (value <= bucket.total) return bucket.priority;
  }
  return 'Low';
}

export function generateSeededScenario(seed: number, index: number, triageMix: TriageMix = { Critical: 40, High: 30, Medium: 20, Low: 10 }): EvaluationScenario {
  const rng = mulberry32(seed + index * 9973);
  const scenarioTime = Date.UTC(2025, 0, 1) + (seed >>> 0) * 1000 + index * 60_000;
  const zones: Zone[] = [
    { id: 'A', name: 'Goripalayam', lat: 9.9325, lng: 78.1312, areaType: 'Urban', localMin: 2.0 },
    { id: 'B', name: 'Anna Nagar', lat: 9.9208, lng: 78.1489, areaType: 'Urban', localMin: 2.0 },
    { id: 'C', name: 'Periyar', lat: 9.9174, lng: 78.1139, areaType: 'Urban', localMin: 2.5 },
    { id: 'D', name: 'K.K. Nagar', lat: 9.9381, lng: 78.1523, areaType: 'Urban', localMin: 2.0 },
    { id: 'E', name: 'Simmakkal', lat: 9.9282, lng: 78.1219, areaType: 'Urban', localMin: 1.5 },
    { id: 'F', name: 'Villapuram', lat: 9.8973, lng: 78.1294, areaType: 'Urban', localMin: 2.0 },
    { id: 'G', name: 'Mankulam', lat: 9.9512, lng: 78.1624, areaType: 'Rural', localMin: 3.0 },
    { id: 'H', name: 'Thirunagar', lat: 9.8835, lng: 78.1038, areaType: 'Rural', localMin: 3.2 },
  ];
  const edges: RoadEdge[] = [
    { a: 'A', b: 'B', minutes: 7 },
    { a: 'A', b: 'C', minutes: 6 },
    { a: 'A', b: 'E', minutes: 4 },
    { a: 'B', b: 'D', minutes: 5 },
    { a: 'B', b: 'F', minutes: 9 },
    { a: 'C', b: 'E', minutes: 4 },
    { a: 'C', b: 'F', minutes: 8 },
    { a: 'D', b: 'E', minutes: 8 },
    { a: 'E', b: 'F', minutes: 10 },
    { a: 'B', b: 'G', minutes: 11 },
    { a: 'D', b: 'G', minutes: 9 },
    { a: 'F', b: 'H', minutes: 12 },
    { a: 'E', b: 'H', minutes: 10 },
    { a: 'C', b: 'H', minutes: 9 },
  ];

  if (rng() < 0.1) {
    const blocked = edges[Math.floor(rng() * edges.length)];
    if (blocked) blocked.blocked = true;
  }

  const nUnits = 4 + Math.floor(rng() * 9);
  const units: Ambulance[] = Array.from({ length: nUnits }, (_, unitIndex) => ({
    id: `U${unitIndex + 1}`,
    zoneId: zones[Math.floor(rng() * zones.length)].id,
    type: unitIndex < Math.max(1, Math.round(nUnits * 0.35)) ? 'ALS' : 'BLS',
    status: 'Available',
    updatedAt: scenarioTime + unitIndex,
  }));

  const nCalls = 3 + Math.floor(rng() * 12);
  const calls: Emergency[] = Array.from({ length: nCalls }, (_, callIndex) => {
    const priority = selectPriorityFromMix(rng, triageMix);
    const weight = PRIORITY_WT[priority];
    return {
      id: `C${callIndex + 1}`,
      zoneId: zones[Math.floor(rng() * zones.length)].id,
      priority,
      weight,
      requiresAls: priority === 'Critical' && rng() > 0.3,
      status: 'Pending',
      requestedAt: scenarioTime + callIndex * 5000,
      updatedAt: scenarioTime + callIndex * 6000,
    };
  });

  return {
    id: `scenario-${index}`,
    zones,
    edges: edges.map((edge) => ({ ...edge })),
    units,
    calls,
    config: { ...DEFAULT_CONFIG },
  };
}

export function computeMethodMetrics(results: { served: number; queued: number; totalWeightedMin: number; criticalAvgMin: number; worstResponseMin: number; slaHitsCount: number; }, totalCalls: number): {
  served: number;
  weightedTotal: number;
  criticalAvgMin: number;
  worstResponseMin: number;
  slaHitRate: number;
} {
  return {
    served: results.served,
    weightedTotal: results.totalWeightedMin,
    criticalAvgMin: results.criticalAvgMin,
    worstResponseMin: results.worstResponseMin,
    slaHitRate: totalCalls > 0 ? results.slaHitsCount / totalCalls : 0,
  };
}

function studentTCdf(value: number, degreesOfFreedom: number): number {
  if (!Number.isFinite(value) || degreesOfFreedom <= 0) return 0.5;
  const absT = Math.abs(value);
  if (absT === 0) return 0.5;
  const x = degreesOfFreedom / (degreesOfFreedom + absT * absT);
  const a = degreesOfFreedom / 2;
  const b = 0.5;
  const beta = regularizedIncompleteBeta(x, a, b);
  const cdf = 1 - 0.5 * beta;
  return cdf;
}

function regularizedIncompleteBeta(x: number, a: number, b: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const bt = Math.exp(logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log(1 - x));
  if (x < (a + 1) / (a + b + 2)) {
    return bt * betacf(x, a, b) / a;
  }
  return 1 - bt * betacf(1 - x, b, a) / b;
}

function logGamma(value: number): number {
  const coefficients = [
    76.18009172947146, -86.50532032941677, 24.01409824083091,
    -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5,
  ];
  let y = value;
  let tmp = value + 5.5;
  tmp -= (value + 0.5) * Math.log(tmp);
  let sum = 1.000000000190015;
  for (const coeff of coefficients) {
    y += 1;
    sum += coeff / y;
  }
  return -tmp + Math.log(2.5066282746310005 * sum / value);
}

function betacf(x: number, a: number, b: number): number {
  const maxIter = 200;
  const epsilon = 1e-14;
  let qab = a + b;
  let qap = a + 1;
  let qam = a - 1;
  let c = 1;
  let d = 1 - qab * x / qap;
  if (Math.abs(d) < Number.EPSILON) d = Number.EPSILON;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= maxIter; m += 1) {
    const m2 = 2 * m;
    d = 1 + (m * (b - m) * x) / ((qam + m2) * (a + m2));
    if (Math.abs(d) < Number.EPSILON) d = Number.EPSILON;
    d = 1 / d;
    c = 1 + (m * (a + b + m) * (a + m) * x) / ((a + m2) * (qab + m2));
    if (Math.abs(c) < Number.EPSILON) c = Number.EPSILON;
    c = 1 / c;
    const delta = d * c;
    h *= delta;
    if (Math.abs(delta - 1) < epsilon) break;
    qam += 2;
    qap += 2;
    qab += 2;
  }
  return h;
}

export function runMonteCarloEvaluation(
  options: {
    n?: number;
    seed?: number;
    triageMix?: Partial<TriageMix>;
    progress?: (current: number, total: number) => void;
  } = {}
): Promise<EvaluationSummary> {
  return (async () => {
  const n = Math.max(1, Math.min(2000, Number(options.n ?? 500)));
  const seed = Number(options.seed ?? 1337);
  const triageMix = ensureTriageMix(options.triageMix);
  const improvements: number[] = [];
  const criticalImprovements: number[] = [];
  const worstImprovements: number[] = [];
  const diffSeries: number[] = [];
  const scenarioResults: ScenarioResult[] = [];
  let winCount = 0;
  let tieCount = 0;
  let lossCount = 0;
  let integrityViolations = 0;

  const methodSla: Record<'fcfs' | 'greedy' | 'optimal', number[]> = {
    fcfs: [],
    greedy: [],
    optimal: [],
  };

  for (let idx = 0; idx < n; idx += 1) {
    const scenario = generateSeededScenario(seed, idx, triageMix);
    const result = await solveFleetAllocation(scenario.units, scenario.calls, scenario.zones, scenario.edges, scenario.config, 'Weighted');
    const fcfs = runFcfsBaseline(scenario.units, scenario.calls, buildCostMatrix(scenario.units, scenario.calls, buildTravelMatrix(scenario.units, scenario.calls, scenario.zones, scenario.edges), scenario.config, 'Weighted'));
    const greedy = runPriorityGreedyBaseline(scenario.units, scenario.calls, buildCostMatrix(scenario.units, scenario.calls, buildTravelMatrix(scenario.units, scenario.calls, scenario.zones, scenario.edges), scenario.config, 'Weighted'));

    const optimal = {
      served: result.metrics.served,
      weightedTotal: result.metrics.totalWeightedMin,
      criticalAvgMin: result.metrics.criticalAvgMin,
      worstResponseMin: result.metrics.worstResponseMin,
      slaHitRate: result.metrics.slaHitsCount / Math.max(1, result.metrics.served + result.metrics.queued),
    };

    const fcfsSummary = computeMethodMetrics(fcfs, scenario.calls.length);
    const greedySummary = computeMethodMetrics(greedy, scenario.calls.length);
    const optimalSummary = computeMethodMetrics({ ...result.metrics, slaHitsCount: result.metrics.slaHitsCount }, scenario.calls.length);

    const rawImprovement = ((fcfs.totalWeightedMin - optimalSummary.weightedTotal) / Math.max(fcfs.totalWeightedMin, 1)) * 100;
    const criticalImprovement = ((fcfs.criticalAvgMin - optimalSummary.criticalAvgMin) / Math.max(fcfs.criticalAvgMin, 1)) * 100;
    const worstImprovement = ((fcfs.worstResponseMin - optimalSummary.worstResponseMin) / Math.max(fcfs.worstResponseMin, 1)) * 100;

    const improvementValue = Number.isFinite(rawImprovement) ? rawImprovement : 0;
    const criticalValue = Number.isFinite(criticalImprovement) ? criticalImprovement : 0;
    const worstValue = Number.isFinite(worstImprovement) ? worstImprovement : 0;
    improvements.push(improvementValue);
    criticalImprovements.push(criticalValue);
    worstImprovements.push(worstValue);

    const greedyDiff = greedySummary.weightedTotal - optimalSummary.weightedTotal;
    const fcfsDiff = fcfsSummary.weightedTotal - optimalSummary.weightedTotal;
    const baselineWin = fcfsDiff > 0 ? 'win' : fcfsDiff === 0 ? 'tie' : 'loss';
    const greedyWin = greedyDiff > 0 ? 'win' : greedyDiff === 0 ? 'tie' : 'loss';
    const resultLabel = baselineWin === 'win' || greedyWin === 'win' ? 'win' : baselineWin === 'tie' || greedyWin === 'tie' ? 'tie' : 'loss';
    if (resultLabel === 'win') winCount += 1;
    if (resultLabel === 'tie') tieCount += 1;
    if (resultLabel === 'loss') lossCount += 1;
    diffSeries.push(Math.max(0, fcfsSummary.weightedTotal - optimalSummary.weightedTotal));

    const servedSame = fcfs.served === optimalSummary.served && greedy.served === optimalSummary.served;
    if (servedSame && optimalSummary.weightedTotal > fcfs.totalWeightedMin) integrityViolations += 1;
    if (servedSame && optimalSummary.weightedTotal > greedySummary.weightedTotal) integrityViolations += 1;

    methodSla.fcfs.push(fcfsSummary.slaHitRate);
    methodSla.greedy.push(greedySummary.slaHitRate);
    methodSla.optimal.push(optimalSummary.slaHitRate);

    scenarioResults.push({
      scenarioId: scenario.id,
      seed,
      fcfs: fcfsSummary,
      greedy: greedySummary,
      optimal: optimalSummary,
      improvementPct: improvementValue,
      criticalImprovementPct: criticalValue,
      worstResponseImprovementPct: worstValue,
      extraCallsServed: Math.max(0, optimalSummary.served - Math.max(fcfsSummary.served, greedySummary.served)),
      win: resultLabel,
      integrityViolation: servedSame && (optimalSummary.weightedTotal > fcfsSummary.weightedTotal || optimalSummary.weightedTotal > greedySummary.weightedTotal),
    });

    if (options.progress) options.progress(idx + 1, n);
  }

  const meanImprovement = mean(improvements);
  const meanCritical = mean(criticalImprovements);
  const meanWorst = mean(worstImprovements);
  const sdImprovement = stdDev(improvements);
  const tStat = sdImprovement === 0 ? 0 : (meanImprovement / (sdImprovement / Math.sqrt(improvements.length)));
  const degrees = Math.max(1, improvements.length - 1);
  const pValue = 2 * (1 - studentTCdf(Math.abs(tStat), degrees));

  return {
    n,
    seed,
    meanImprovementPct: meanImprovement,
    ci95ImprovementPct: [meanImprovement - 1.96 * (sdImprovement / Math.sqrt(improvements.length)), meanImprovement + 1.96 * (sdImprovement / Math.sqrt(improvements.length))],
    meanCriticalImprovementPct: meanCritical,
    ci95CriticalImprovementPct: [meanCritical - 1.96 * (stdDev(criticalImprovements) / Math.sqrt(criticalImprovements.length)), meanCritical + 1.96 * (stdDev(criticalImprovements) / Math.sqrt(criticalImprovements.length))],
    meanWorstResponseImprovementPct: meanWorst,
    meanExtraCallsServed: mean(scenarioResults.map((item) => item.extraCallsServed)),
    winCount,
    tieCount,
    lossCount,
    pairedT: tStat,
    pValue,
    slaHitRate: {
      fcfs: mean(methodSla.fcfs),
      greedy: mean(methodSla.greedy),
      optimal: mean(methodSla.optimal),
    },
    integrityViolations,
    scenarios: scenarioResults,
  };
  })();
}

function mean(values: number[]): number {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function stdDev(values: number[]): number {
  if (!values.length) return 0;
  const avg = mean(values);
  return Math.sqrt(values.reduce((sum, value) => sum + (value - avg) ** 2, 0) / values.length);
}

export const DEFAULT_TRIAGE_MIX: TriageMix = { Critical: 40, High: 30, Medium: 20, Low: 10 };
