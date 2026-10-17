/**
 * AURA Optimization Solver Bridge
 * Delegates directly to the pure TypeScript engine in /engine:
 * - HiGHS WASM LP-file string solver
 * - Kuhn-Munkres Hungarian cross-check
 * - Authoritative Dijkstra shortest path travel time model
 */

export * from '../../engine/types';
import {
  Zone,
  RoadEdge,
  Ambulance,
  Emergency,
  AppConfig,
  SolveAssignment,
  SolveUnserved,
  PerformanceSummary,
  SolveResponse,
} from '../../engine/types';
import {
  solveFleetAllocation,
  ENGINE_NAME,
  ENGINE_VERSION,
} from '../../engine/assignment';
import { dijkstra, buildTravelMatrix } from '../../engine/graph';

export { dijkstra as computeDijkstra, buildTravelMatrix };

export interface SolveRequest {
  mode: 'Weighted' | 'Plain';
  emergencyIds?: string[];
  ambulanceIds?: string[];
  persist?: boolean;
}

/**
 * Execute real HiGHS WASM solver and Hungarian cross-check
 */
export async function executeDualSolver(
  ambulances: Ambulance[],
  emergencies: Emergency[],
  roads: RoadEdge[],
  zones: Zone[],
  request: SolveRequest,
  config: AppConfig = {}
): Promise<SolveResponse> {
  return solveFleetAllocation(
    ambulances,
    emergencies,
    zones,
    roads,
    config,
    request.mode
  );
}
