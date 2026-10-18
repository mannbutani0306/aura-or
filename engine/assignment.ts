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

export interface CostMatrixEntry {
  readonly etaMin: number;
  readonly weight: number;
  readonly penaltyMin: number;
  readonly cost: number;
  readonly slaBreach: boolean;
  readonly alsMismatch: boolean;
}

export interface AssignmentCostMatrix {
  readonly costs: Record<string, Record<string, number | null>>;
  readonly feasibility: Record<string, Record<string, boolean>>;
  readonly entries: Record<string, Record<string, CostMatrixEntry | null>>;
  readonly queueCosts: Record<string, number>;
  readonly queueReasons: Record<string, SolveUnserved['reason']>;
  readonly callWeights: Record<string, number>;
  readonly paths: Record<string, Record<string, string[]>>;
}

export function buildCostMatrix(
  units: Ambulance[],
  calls: Emergency[],
  matrix: TravelMatrix,
  config: AppConfig,
  mode: 'Weighted' | 'Plain'
): AssignmentCostMatrix {
  const availableUnits = units.filter((unit) => unit.status === 'Available').sort((left, right) => left.id.localeCompare(right.id));
  const pendingCalls = calls.filter((call) => call.status === 'Pending').sort((left, right) => left.id.localeCompare(right.id));
  const costs: AssignmentCostMatrix['costs'] = {};
  const feasibility: AssignmentCostMatrix['feasibility'] = {};
  const entries: AssignmentCostMatrix['entries'] = {};
  const queueCosts: Record<string, number> = {};
  const queueReasons: Record<string, SolveUnserved['reason']> = {};
  const callWeights: Record<string, number> = {};

  for (const unit of availableUnits) {
    costs[unit.id] = {};
    feasibility[unit.id] = {};
    entries[unit.id] = {};
  }

  for (const call of pendingCalls) {
    const weight = mode === 'Plain' ? 1 : (call.weight || 1);
    const requiresAls = call.priority === 'Critical' && call.requiresAls;
    const hasAvailableAls = availableUnits.some((unit) => unit.type === 'ALS');
    let reachableEligiblePair = false;
    let overCapPair = false;
    let hasFeasiblePair = false;
    callWeights[call.id] = weight;
    queueCosts[call.id] = weight * config.unserved_min;

    for (const unit of availableUnits) {
      const travelTime = matrix.rawTimes[unit.id]?.[call.id] ?? Infinity;
      const reachable = Number.isFinite(travelTime);
      const alsMismatch = requiresAls && unit.type !== 'ALS';
      const policyBlocked = config.als_policy === 'hard' && alsMismatch;
      const withinCap = config.max_response_min === null || travelTime <= config.max_response_min;
      const isFeasible = reachable && !policyBlocked && withinCap;

      if (reachable && !policyBlocked) reachableEligiblePair = true;
      if (reachable && !policyBlocked && !withinCap) overCapPair = true;

      if (!isFeasible) {
        costs[unit.id][call.id] = null;
        feasibility[unit.id][call.id] = false;
        entries[unit.id][call.id] = null;
        continue;
      }

      const penaltyMin = config.als_policy === 'penalty' && alsMismatch ? config.als_penalty_min : 0;
      const cost = weight * (travelTime + penaltyMin);
      costs[unit.id][call.id] = cost;
      feasibility[unit.id][call.id] = true;
      entries[unit.id][call.id] = {
        etaMin: travelTime,
        weight,
        penaltyMin,
        cost,
        slaBreach: travelTime > config.sla_min,
        alsMismatch: config.als_policy === 'penalty' && alsMismatch,
      };
      hasFeasiblePair = true;
    }

    if (hasFeasiblePair) queueReasons[call.id] = 'Exhausted';
    else if (config.als_policy === 'hard' && requiresAls && !hasAvailableAls) queueReasons[call.id] = 'No ALS unit';
    else if (overCapPair) queueReasons[call.id] = 'Over cap';
    else if (!reachableEligiblePair) queueReasons[call.id] = 'No Route';
    else queueReasons[call.id] = 'Exhausted';
  }

  return { costs, feasibility, entries, queueCosts, queueReasons, callWeights, paths: matrix.paths };
}

/**
 * Calculates standardized performance summary metrics across dispatch methods
 */
export function calculateMetrics(
  assignments: Pick<SolveAssignment, 'ambulanceId' | 'emergencyId' | 'etaMin' | 'weight' | 'weightedMin' | 'slaBreach'>[],
  calls: Emergency[],
  availableUnitsCount: number,
  costMatrix: AssignmentCostMatrix
): PerformanceSummary {
  const servedCount = assignments.length;
  const queuedCount = calls.length - servedCount;

  const assignedWeighted = assignments.reduce((total, assignment) => total + assignment.weightedMin, 0);

  const assignedCallIds = new Set(assignments.map((a) => a.emergencyId));
  const queuedWeighted = calls
    .filter((c) => !assignedCallIds.has(c.id))
    .reduce((total, call) => total + (costMatrix.queueCosts[call.id] ?? 0), 0);

  const totalWeightedMin = Number((assignedWeighted + queuedWeighted).toFixed(6));

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

  const breachesCount = assignments.filter((assignment) => assignment.slaBreach).length;
  const slaHitsCount = servedCount - breachesCount;
  const utilization = availableUnitsCount > 0 ? Number((servedCount / availableUnitsCount).toFixed(2)) : 0;

  return {
    served: servedCount,
    queued: queuedCount,
    totalWeightedMin,
    avgResponseMin,
    criticalAvgMin,
    worstResponseMin,
    slaHitsCount,
    breachesCount,
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
  costMatrix: AssignmentCostMatrix
): PerformanceSummary {
  const sortedCalls = [...calls].sort((a, b) => a.requestedAt - b.requestedAt || a.id.localeCompare(b.id));
  const freeUnits = new Set(units.filter((unit) => unit.status === 'Available').map((unit) => unit.id).sort());
  const assignments: Pick<SolveAssignment, 'ambulanceId' | 'emergencyId' | 'etaMin' | 'weight' | 'weightedMin' | 'slaBreach'>[] = [];

  for (const call of sortedCalls) {
    let bestUnitId: string | null = null;
    let bestEntry: CostMatrixEntry | null = null;

    for (const ambId of freeUnits) {
      const entry = costMatrix.entries[ambId]?.[call.id] ?? null;
      if (entry && (!bestEntry || entry.cost < bestEntry.cost || (entry.cost === bestEntry.cost && ambId < (bestUnitId ?? ambId)))) {
          bestEntry = entry;
          bestUnitId = ambId;
      }
    }

    if (bestUnitId !== null && bestEntry) {
      assignments.push({
        ambulanceId: bestUnitId,
        emergencyId: call.id,
        etaMin: bestEntry.etaMin,
        weight: bestEntry.weight,
        weightedMin: bestEntry.cost,
        slaBreach: bestEntry.slaBreach,
      });
      freeUnits.delete(bestUnitId);
    }
  }

  return calculateMetrics(assignments, calls, units.length, costMatrix);
}

/**
 * Baseline 2: Priority Greedy Dispatcher
 * Calls ordered by priority (Critical > High > Medium > Low), then arrival order.
 */
export function runPriorityGreedyBaseline(
  units: Ambulance[],
  calls: Emergency[],
  costMatrix: AssignmentCostMatrix
): PerformanceSummary {
  const priorityRank: Record<string, number> = { Critical: 4, High: 3, Medium: 2, Low: 1 };
  const sortedCalls = [...calls].sort((a, b) => {
    const diff = (priorityRank[b.priority] || 0) - (priorityRank[a.priority] || 0);
    if (diff !== 0) return diff;
    return a.requestedAt - b.requestedAt || a.id.localeCompare(b.id);
  });

  const freeUnits = new Set(units.filter((unit) => unit.status === 'Available').map((unit) => unit.id).sort());
  const assignments: Pick<SolveAssignment, 'ambulanceId' | 'emergencyId' | 'etaMin' | 'weight' | 'weightedMin' | 'slaBreach'>[] = [];

  for (const call of sortedCalls) {
    let bestUnitId: string | null = null;
    let bestEntry: CostMatrixEntry | null = null;

    for (const ambId of freeUnits) {
      const entry = costMatrix.entries[ambId]?.[call.id] ?? null;
      if (entry && (!bestEntry || entry.cost < bestEntry.cost || (entry.cost === bestEntry.cost && ambId < (bestUnitId ?? ambId)))) {
        bestEntry = entry;
        bestUnitId = ambId;
      }
    }

    if (bestUnitId !== null && bestEntry) {
      assignments.push({
        ambulanceId: bestUnitId,
        emergencyId: call.id,
        etaMin: bestEntry.etaMin,
        weight: bestEntry.weight,
        weightedMin: bestEntry.cost,
        slaBreach: bestEntry.slaBreach,
      });
      freeUnits.delete(bestUnitId);
    }
  }

  return calculateMetrics(assignments, calls, units.length, costMatrix);
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
  const availableUnits = units.filter((unit) => unit.status === 'Available').sort((left, right) => left.id.localeCompare(right.id));
  const pendingCalls = calls.filter((call) => call.status === 'Pending').sort((left, right) => left.id.localeCompare(right.id));
  const travelMatrix = buildTravelMatrix(availableUnits, pendingCalls, zones, edges);
  const costMatrix = buildCostMatrix(availableUnits, pendingCalls, travelMatrix, config, mode);
  const responseMatrix = {
    ambulanceIds: travelMatrix.ambulanceIds,
    emergencyIds: travelMatrix.emergencyIds,
    travelTimes: travelMatrix.travelTimes,
    costs: costMatrix.costs,
    feasibility: costMatrix.feasibility,
    paths: travelMatrix.paths,
  };
  const fcfsMetrics = runFcfsBaseline(availableUnits, pendingCalls, costMatrix);
  const greedyMetrics = runPriorityGreedyBaseline(availableUnits, pendingCalls, costMatrix);

  if (availableUnits.length === 0 || pendingCalls.length === 0) {
    const emptyMetrics = calculateMetrics([], pendingCalls, availableUnits.length, costMatrix);
    return {
      status: 'Optimal',
      objective: emptyMetrics.totalWeightedMin,
      crossCheck: { value: emptyMetrics.totalWeightedMin, ok: true, method: 'Hungarian' },
      engine: ENGINE_NAME,
      engineVersion: ENGINE_VERSION,
      solveMs: Math.round(performance.now() - t0),
      mode,
      matrix: responseMatrix,
      assignments: [],
      unserved: pendingCalls.map((call) => ({ emergencyId: call.id, reason: costMatrix.queueReasons[call.id] })),
      baselines: { fcfs: fcfsMetrics, greedy: greedyMetrics },
      metrics: emptyMetrics,
    };
  }

  const lpLines: string[] = ['Minimize', ' obj:'];
  const objectiveTerms: string[] = [];
  const variableNames: string[] = [];
  const feasiblePairs: Array<{ ambulanceId: string; emergencyId: string; variableName: string }> = [];
  const callVariables = new Map<string, string[]>();
  const unitVariables = new Map<string, string[]>();
  pendingCalls.forEach((call) => callVariables.set(call.id, []));
  availableUnits.forEach((unit) => unitVariables.set(unit.id, []));

  for (const unit of availableUnits) {
    for (const call of pendingCalls) {
      if (!costMatrix.feasibility[unit.id]?.[call.id]) continue;
      const variableName = `x_${unit.id}_${call.id}`;
      variableNames.push(variableName);
      objectiveTerms.push(` + ${String(costMatrix.costs[unit.id][call.id])} ${variableName}`);
      feasiblePairs.push({ ambulanceId: unit.id, emergencyId: call.id, variableName });
      callVariables.get(call.id)!.push(variableName);
      unitVariables.get(unit.id)!.push(variableName);
    }
  }
  for (const call of pendingCalls) {
    const variableName = `u_${call.id}`;
    variableNames.push(variableName);
    objectiveTerms.push(` + ${String(costMatrix.queueCosts[call.id])} ${variableName}`);
  }
  lpLines.push(objectiveTerms.join(''));
  lpLines.push('Subject To');
  for (const call of pendingCalls) {
    lpLines.push(` c_call_${call.id}: ${[...(callVariables.get(call.id) || []), `u_${call.id}`].join(' + ')} = 1`);
  }
  for (const unit of availableUnits) {
    const variables = unitVariables.get(unit.id) || [];
    if (variables.length > 0) lpLines.push(` c_unit_${unit.id}: ${variables.join(' + ')} <= 1`);
  }
  lpLines.push('Binary', ...variableNames.map((name) => ` ${name}`), 'End');

  const solution = highs.solve(lpLines.join('\n'));
  const status = solution.Status === 'Optimal' ? 'Optimal' : solution.Status === 'Infeasible' ? 'Infeasible' : 'Suboptimal';
  const highsObjective = Number(solution.ObjectiveValue ?? 0);
  const assignments: SolveAssignment[] = [];
  const assignedCallIds = new Set<string>();

  for (const pair of feasiblePairs) {
    const column = solution.Columns?.[pair.variableName];
    if (!column || column.Primal <= 0.5) continue;
    const entry = costMatrix.entries[pair.ambulanceId][pair.emergencyId]!;
    assignments.push({
      ambulanceId: pair.ambulanceId,
      emergencyId: pair.emergencyId,
      etaMin: entry.etaMin,
      weightedMin: entry.cost,
      weight: entry.weight,
      slaBreach: entry.slaBreach,
      alsMismatch: entry.alsMismatch,
      path: travelMatrix.paths[pair.ambulanceId]?.[pair.emergencyId] || [],
    });
    assignedCallIds.add(pair.emergencyId);
  }
  const unserved: SolveUnserved[] = pendingCalls
    .filter((call) => !assignedCallIds.has(call.id))
    .map((call) => ({ emergencyId: call.id, reason: costMatrix.queueReasons[call.id] }));

  const unitCount = availableUnits.length;
  const callCount = pendingCalls.length;
  const dimension = unitCount + callCount;
  const forbiddenCost = Number.MAX_SAFE_INTEGER / 4;
  const hungarianCosts = Array.from({ length: dimension }, () => new Array<number>(dimension).fill(0));
  for (let unitIndex = 0; unitIndex < unitCount; unitIndex += 1) {
    const unit = availableUnits[unitIndex];
    for (let callIndex = 0; callIndex < callCount; callIndex += 1) {
      const call = pendingCalls[callIndex];
      hungarianCosts[unitIndex][callIndex] = costMatrix.feasibility[unit.id][call.id]
        ? costMatrix.costs[unit.id][call.id]!
        : forbiddenCost;
    }
  }
  for (let callIndex = 0; callIndex < callCount; callIndex += 1) {
    const queueRow = unitCount + callIndex;
    for (let queuedCallIndex = 0; queuedCallIndex < callCount; queuedCallIndex += 1) {
      hungarianCosts[queueRow][queuedCallIndex] = queuedCallIndex === callIndex
        ? costMatrix.queueCosts[pendingCalls[queuedCallIndex].id]
        : forbiddenCost;
    }
  }

  const hungarianResult = solveHungarian(hungarianCosts);
  const hungarianObjective = hungarianResult.cost;
  const crossCheckOk = Math.abs(highsObjective - hungarianObjective) <= 1e-6;
  if (!crossCheckOk) {
    throw new Error(`HiGHS/Hungarian objective mismatch: ${highsObjective} vs ${hungarianObjective}`);
  }
  const metrics = calculateMetrics(assignments, pendingCalls, availableUnits.length, costMatrix);

  return {
    status,
    objective: highsObjective,
    crossCheck: { value: hungarianObjective, ok: crossCheckOk, method: 'Hungarian' },
    engine: ENGINE_NAME,
    engineVersion: ENGINE_VERSION,
    solveMs: Math.round(performance.now() - t0),
    mode,
    matrix: responseMatrix,
    assignments,
    unserved,
    baselines: { fcfs: fcfsMetrics, greedy: greedyMetrics },
    metrics,
  };
}
