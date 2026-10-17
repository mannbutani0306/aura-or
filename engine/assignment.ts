/**
 * AURA Optimization Engine - MILP Solver & Hungarian Cross-Check
 * Pure TypeScript module with zero I/O or UI imports.
 * 
 * MODEL FORMULATION:
 * Binary decision variables:
 *   x_ij ∈ {0, 1} : unit i allocated to call j
 *   u_j  ∈ {0, 1} : call j queued (unserved by available fleet)
 * 
 * Objective:
 *   minimize Σ_ij (w_j · t_ij · x_ij) + Σ_j (w_j · Q · u_j)
 * 
 * Subject To:
 *   Σ_i x_ij + u_j = 1    ∀ calls j ∈ J  (every call must be assigned or queued)
 *   Σ_j x_ij ≤ 1          ∀ units i ∈ I  (every unit serves at most one call)
 *   x_ij = 0              for infeasible pairs (ALS mismatch or unreachable graph component)
 * 
 * PARAMETERS:
 *   Q = app_config.unserved_min (penalty for queuing a call, default 60 min)
 *   In 'plain' mode: w_j = 1
 *   In 'weighted' mode: w_j = call.weight (5: Critical, 3: High, 2: Medium, 1: Low)
 */

import highsLoader from 'highs';
import {
  Zone,
  RoadEdge,
  Ambulance,
  Emergency,
  AppConfig,
  DEFAULT_CONFIG,
  TravelMatrix,
  SolveAssignment,
  SolveUnserved,
  PerformanceSummary,
  SolveResponse,
} from './types';
import { buildTravelMatrix } from './graph';

export const ENGINE_NAME = 'HiGHS WASM + Hungarian';
export const ENGINE_VERSION = '1.15.4';

let cachedHighs: any = null;

export async function getHighsInstance() {
  if (!cachedHighs) {
    cachedHighs = await highsLoader();
  }
  return cachedHighs;
}

/**
 * Independent Kuhn-Munkres (Hungarian) Algorithm Implementation
 * Solves minimum-weight bipartite matching on rectangular cost matrix
 * padded with queue columns of cost w_j · Q.
 */
export function solveHungarian(
  costMatrix: number[][]
): { cost: number; assignment: number[] } {
  const n = costMatrix.length;
  if (n === 0) return { cost: 0, assignment: [] };
  const m = costMatrix[0].length;
  if (m === 0) return { cost: 0, assignment: [] };

  // Standard Jonker-Volgenant potential-based Hungarian algorithm
  const u = new Array(n + 1).fill(0);
  const v = new Array(m + 1).fill(0);
  const p = new Array(m + 1).fill(0);
  const way = new Array(m + 1).fill(0);

  for (let i = 1; i <= n; i++) {
    p[0] = i;
    let j0 = 0;
    const minv = new Array(m + 1).fill(Infinity);
    const used = new Array(m + 1).fill(false);

    do {
      used[j0] = true;
      const i0 = p[j0];
      let delta = Infinity;
      let j1 = 0;

      for (let j = 1; j <= m; j++) {
        if (!used[j]) {
          const cur = costMatrix[i0 - 1][j - 1] - u[i0] - v[j];
          if (cur < minv[j]) {
            minv[j] = cur;
            way[j] = j0;
          }
          if (minv[j] < delta) {
            delta = minv[j];
            j1 = j;
          }
        }
      }

      for (let j = 0; j <= m; j++) {
        if (used[j]) {
          u[p[j]] += delta;
          v[j] -= delta;
        } else {
          minv[j] -= delta;
        }
      }
      j0 = j1;
    } while (p[j0] !== 0);

    do {
      const j1 = way[j0];
      p[j0] = p[j1];
      j0 = j1;
    } while (j0 !== 0);
  }

  const result = new Array(n).fill(-1);
  for (let j = 1; j <= m; j++) {
    if (p[j] !== 0) {
      result[p[j] - 1] = j - 1;
    }
  }

  return { cost: -v[0], assignment: result };
}

/**
 * Calculates standardized performance summary metrics across dispatch methods
 */
export function calculateMetrics(
  assignments: { ambulanceId: string; emergencyId: string; etaMin: number; weight: number }[],
  calls: Emergency[],
  availableUnitsCount: number,
  unservedPenaltyQ: number,
  slaMin: number = DEFAULT_CONFIG.sla_min
): PerformanceSummary {
  const servedCount = assignments.length;
  const queuedCount = calls.length - servedCount;

  const assignedWeighted = assignments.reduce((acc, a) => acc + a.etaMin * a.weight, 0);

  // Unserved calls contribute w_j * Q
  const assignedCallIds = new Set(assignments.map((a) => a.emergencyId));
  const queuedWeighted = calls
    .filter((c) => !assignedCallIds.has(c.id))
    .reduce((acc, c) => acc + (c.weight || 1) * unservedPenaltyQ, 0);

  const totalWeightedMin = Number((assignedWeighted + queuedWeighted).toFixed(1));

  const totalRawMin = assignments.reduce((acc, a) => acc + a.etaMin, 0);
  const avgResponseMin = servedCount > 0 ? Number((totalRawMin / servedCount).toFixed(1)) : 0;

  const criticalAssignments = assignments.filter((a) => {
    const call = calls.find((c) => c.id === a.emergencyId);
    return call?.priority === 'Critical';
  });
  const criticalRawSum = criticalAssignments.reduce((acc, a) => acc + a.etaMin, 0);
  const criticalAvgMin = criticalAssignments.length > 0
    ? Number((criticalRawSum / criticalAssignments.length).toFixed(1))
    : 0;

  const worstResponseMin = servedCount > 0
    ? Number(Math.max(...assignments.map((a) => a.etaMin)).toFixed(1))
    : 0;

  const slaHitsCount = assignments.filter((a) => a.etaMin <= slaMin).length;
  const utilization = availableUnitsCount > 0 ? Number((servedCount / availableUnitsCount).toFixed(2)) : 0;

  return {
    served: servedCount,
    queued: queuedCount,
    totalWeightedMin,
    avgResponseMin,
    criticalAvgMin,
    worstResponseMin,
    slaHitsCount,
    utilization,
  };
}

/**
 * Baseline 1: FCFS Manual Dispatcher
 * Calls taken in arrival order; each takes the nearest feasible free unit.
 */
export function runFcfsBaseline(
  units: Ambulance[],
  calls: Emergency[],
  matrix: TravelMatrix,
  mode: 'Weighted' | 'Plain',
  penaltyQ: number,
  slaMin: number
): PerformanceSummary {
  const sortedCalls = [...calls].sort((a, b) => a.requestedAt - b.requestedAt);
  const freeUnits = new Set(units.map((u) => u.id));
  const assignments: { ambulanceId: string; emergencyId: string; etaMin: number; weight: number }[] = [];

  for (const call of sortedCalls) {
    let bestUnitId: string | null = null;
    let minTime = Infinity;

    for (const ambId of freeUnits) {
      if (matrix.feasibility[ambId]?.[call.id]) {
        const t = matrix.rawTimes[ambId][call.id];
        if (t < minTime) {
          minTime = t;
          bestUnitId = ambId;
        }
      }
    }

    if (bestUnitId !== null && minTime !== Infinity) {
      const weight = mode === 'Plain' ? 1 : (call.weight || 1);
      assignments.push({
        ambulanceId: bestUnitId,
        emergencyId: call.id,
        etaMin: minTime,
        weight,
      });
      freeUnits.delete(bestUnitId);
    }
  }

  return calculateMetrics(assignments, calls, units.length, penaltyQ, slaMin);
}

/**
 * Baseline 2: Priority Greedy Dispatcher
 * Calls ordered by priority (Critical > High > Medium > Low), then arrival order.
 */
export function runPriorityGreedyBaseline(
  units: Ambulance[],
  calls: Emergency[],
  matrix: TravelMatrix,
  mode: 'Weighted' | 'Plain',
  penaltyQ: number,
  slaMin: number
): PerformanceSummary {
  const priorityRank: Record<string, number> = { Critical: 4, High: 3, Medium: 2, Low: 1 };
  const sortedCalls = [...calls].sort((a, b) => {
    const diff = (priorityRank[b.priority] || 0) - (priorityRank[a.priority] || 0);
    if (diff !== 0) return diff;
    return a.requestedAt - b.requestedAt;
  });

  const freeUnits = new Set(units.map((u) => u.id));
  const assignments: { ambulanceId: string; emergencyId: string; etaMin: number; weight: number }[] = [];

  for (const call of sortedCalls) {
    let bestUnitId: string | null = null;
    let minTime = Infinity;

    for (const ambId of freeUnits) {
      if (matrix.feasibility[ambId]?.[call.id]) {
        const t = matrix.rawTimes[ambId][call.id];
        if (t < minTime) {
          minTime = t;
          bestUnitId = ambId;
        }
      }
    }

    if (bestUnitId !== null && minTime !== Infinity) {
      const weight = mode === 'Plain' ? 1 : (call.weight || 1);
      assignments.push({
        ambulanceId: bestUnitId,
        emergencyId: call.id,
        etaMin: minTime,
        weight,
      });
      freeUnits.delete(bestUnitId);
    }
  }

  return calculateMetrics(assignments, calls, units.length, penaltyQ, slaMin);
}

/**
 * Master Fleet Allocation Solver: HiGHS WASM + Hungarian Cross-Check
 */
export async function solveFleetAllocation(
  units: Ambulance[],
  calls: Emergency[],
  zones: Zone[],
  edges: RoadEdge[],
  config: AppConfig = DEFAULT_CONFIG,
  mode: 'Weighted' | 'Plain' = 'Weighted'
): Promise<SolveResponse> {
  const t0 = performance.now();
  const highs = await getHighsInstance();

  const availableUnits = units.filter((u) => u.status === 'Available');
  const pendingCalls = calls.filter((c) => c.status === 'Pending');

  const unservedPenaltyQ = config.unserved_min;
  const slaMin = config.sla_min;

  // 1. Build authoritative Travel Time Matrix from the Road Graph
  const matrix = buildTravelMatrix(availableUnits, pendingCalls, zones, edges);

  if (availableUnits.length === 0 || pendingCalls.length === 0) {
    const emptySummary: PerformanceSummary = {
      served: 0,
      queued: pendingCalls.length,
      totalWeightedMin: pendingCalls.reduce((s, c) => s + (mode === 'Plain' ? 1 : c.weight) * unservedPenaltyQ, 0),
      avgResponseMin: 0,
      criticalAvgMin: 0,
      worstResponseMin: 0,
      slaHitsCount: 0,
      utilization: 0,
    };

    return {
      status: 'Optimal',
      objective: emptySummary.totalWeightedMin,
      crossCheck: { value: emptySummary.totalWeightedMin, ok: true, method: 'Hungarian' },
      engine: ENGINE_NAME,
      engineVersion: ENGINE_VERSION,
      solveMs: Math.round(performance.now() - t0),
      mode,
      matrix: {
        ambulanceIds: matrix.ambulanceIds,
        emergencyIds: matrix.emergencyIds,
        travelTimes: matrix.travelTimes,
        costs: matrix.costs,
        feasibility: matrix.feasibility,
        paths: matrix.paths,
      },
      assignments: [],
      unserved: pendingCalls.map((c) => ({ emergencyId: c.id, reason: 'Exhausted' })),
      baselines: { fcfs: emptySummary, greedy: emptySummary },
      metrics: emptySummary,
    };
  }

  // 2. Build HiGHS LP formulation
  // Variables: x_i_j for feasible pairs, u_j for each call
  const lpLines: string[] = ['Minimize', ' obj:'];
  const objTerms: string[] = [];

  const varNames: string[] = [];
  const feasiblePairs: Array<{
    ambId: string;
    emId: string;
    varName: string;
    cost: number;
    rawTime: number;
    weight: number;
  }> = [];

  const callVarMap = new Map<string, string[]>();
  const unitVarMap = new Map<string, string[]>();

  pendingCalls.forEach((c) => callVarMap.set(c.id, []));
  availableUnits.forEach((u) => unitVarMap.set(u.id, []));

  for (const unit of availableUnits) {
    for (const call of pendingCalls) {
      if (matrix.feasibility[unit.id]?.[call.id]) {
        const varName = `x_${unit.id}_${call.id}`;
        varNames.push(varName);

        const weight = mode === 'Plain' ? 1 : (call.weight || 1);
        const t = matrix.rawTimes[unit.id][call.id];
        const cost = weight * t;

        objTerms.push(` + ${cost.toFixed(4)} ${varName}`);
        feasiblePairs.push({
          ambId: unit.id,
          emId: call.id,
          varName,
          cost,
          rawTime: t,
          weight,
        });

        callVarMap.get(call.id)!.push(varName);
        unitVarMap.get(unit.id)!.push(varName);
      }
    }
  }

  // Add penalty terms for unserved calls u_j
  for (const call of pendingCalls) {
    const uVar = `u_${call.id}`;
    varNames.push(uVar);
    const weight = mode === 'Plain' ? 1 : (call.weight || 1);
    const cost = weight * unservedPenaltyQ;
    objTerms.push(` + ${cost.toFixed(4)} ${uVar}`);
  }

  lpLines.push(objTerms.join(''));
  lpLines.push('Subject To');

  // Constraint 1: Every call j must either be assigned or queued
  // Σ_i x_ij + u_j = 1
  for (const call of pendingCalls) {
    const incomingVars = callVarMap.get(call.id) || [];
    const lhs = [...incomingVars, `u_${call.id}`].join(' + ');
    lpLines.push(` c_call_${call.id}: ${lhs} = 1`);
  }

  // Constraint 2: Every unit i can serve at most 1 call
  // Σ_j x_ij ≤ 1
  for (const unit of availableUnits) {
    const outgoingVars = unitVarMap.get(unit.id) || [];
    if (outgoingVars.length > 0) {
      lpLines.push(` c_unit_${unit.id}: ${outgoingVars.join(' + ')} <= 1`);
    }
  }

  lpLines.push('Binary');
  varNames.forEach((v) => lpLines.push(` ${v}`));
  lpLines.push('End');

  const lpString = lpLines.join('\n');

  // 3. Solve with HiGHS WASM
  const sol = highs.solve(lpString);
  const status = sol.Status === 'Optimal' ? 'Optimal' : sol.Status === 'Infeasible' ? 'Infeasible' : 'Suboptimal';
  const highsObjective = sol.ObjectiveValue != null ? Number(sol.ObjectiveValue.toFixed(2)) : 0;

  // Extract assignments from solution
  const assignments: SolveAssignment[] = [];
  const assignedCallIds = new Set<string>();

  for (const pair of feasiblePairs) {
    const col = sol.Columns?.[pair.varName];
    if (col && col.Primal > 0.5) {
      assignments.push({
        ambulanceId: pair.ambId,
        emergencyId: pair.emId,
        etaMin: pair.rawTime,
        weightedMin: Number((pair.rawTime * pair.weight).toFixed(1)),
        weight: pair.weight,
        path: matrix.paths[pair.ambId]?.[pair.emId] || [],
      });
      assignedCallIds.add(pair.emId);
    }
  }

  // Determine unserved calls
  const unserved: SolveUnserved[] = [];
  for (const call of pendingCalls) {
    if (!assignedCallIds.has(call.id)) {
      const hasFeasible = availableUnits.some((u) => matrix.feasibility[u.id]?.[call.id]);
      if (call.requiresAls && !availableUnits.some((u) => u.type === 'ALS')) {
        unserved.push({ emergencyId: call.id, reason: 'No ALS' });
      } else if (!hasFeasible) {
        unserved.push({ emergencyId: call.id, reason: 'No Route' });
      } else {
        unserved.push({ emergencyId: call.id, reason: 'Exhausted' });
      }
    }
  }

  // 4. Independent Hungarian Cross-Check
  // Setup square cost matrix of size (m + n) x (n + m)
  const mUnits = availableUnits.length;
  const nCalls = pendingCalls.length;
  const dim = mUnits + nCalls;
  const BIG_M = 1000000;

  const costMatrix: number[][] = Array.from({ length: dim }, () => new Array(dim).fill(0));

  for (let i = 0; i < mUnits; i++) {
    const u = availableUnits[i];
    for (let j = 0; j < nCalls; j++) {
      const c = pendingCalls[j];
      const weight = mode === 'Plain' ? 1 : (c.weight || 1);
      if (matrix.feasibility[u.id]?.[c.id]) {
        costMatrix[i][j] = weight * matrix.rawTimes[u.id][c.id];
      } else {
        costMatrix[i][j] = BIG_M;
      }
    }
    // Unit i to idle slots (j >= nCalls): cost is 0
    for (let j = nCalls; j < dim; j++) {
      costMatrix[i][j] = 0;
    }
  }

  for (let i = 0; i < nCalls; i++) {
    const dummyRowIdx = mUnits + i;
    for (let j = 0; j < nCalls; j++) {
      const c = pendingCalls[j];
      const weight = mode === 'Plain' ? 1 : (c.weight || 1);
      costMatrix[dummyRowIdx][j] = weight * unservedPenaltyQ;
    }
    // Dummy queue unit to idle slots: cost is 0
    for (let j = nCalls; j < dim; j++) {
      costMatrix[dummyRowIdx][j] = 0;
    }
  }

  const hungarianResult = solveHungarian(costMatrix);
  const hungarianObjective = Number(hungarianResult.cost.toFixed(2));
  const crossCheckOk = Math.abs(highsObjective - hungarianObjective) <= 0.05;

  // 5. Run both Baselines for fair comparative benchmarks
  const fcfsMetrics = runFcfsBaseline(availableUnits, pendingCalls, matrix, mode, unservedPenaltyQ, slaMin);
  const greedyMetrics = runPriorityGreedyBaseline(availableUnits, pendingCalls, matrix, mode, unservedPenaltyQ, slaMin);

  // 6. Optimal Metrics
  const optimalMetrics = calculateMetrics(
    assignments,
    pendingCalls,
    availableUnits.length,
    unservedPenaltyQ,
    slaMin
  );

  const solveMs = Math.round(performance.now() - t0);

  return {
    status,
    objective: highsObjective,
    crossCheck: {
      value: hungarianObjective,
      ok: crossCheckOk,
      method: 'Hungarian',
    },
    engine: ENGINE_NAME,
    engineVersion: ENGINE_VERSION,
    solveMs,
    mode,
    matrix: {
      ambulanceIds: matrix.ambulanceIds,
      emergencyIds: matrix.emergencyIds,
      travelTimes: matrix.travelTimes,
      costs: matrix.costs,
      feasibility: matrix.feasibility,
      paths: matrix.paths,
    },
    assignments,
    unserved,
    baselines: {
      fcfs: fcfsMetrics,
      greedy: greedyMetrics,
    },
    metrics: optimalMetrics,
  };
}
