import { Router } from 'express';
import { solveFleetAllocation } from '../../engine/assignment';
import { Ambulance, AppConfig, DEFAULT_CONFIG, Emergency, RoadEdge, Zone } from '../../engine/types';
import { loadOperationalState } from '../services/operationalState';
import { supabase } from '../services/supabase';
import { asyncHandler } from '../services/http';

export const solveRouter = Router();

const normalizedMode = (value: unknown): 'Weighted' | 'Plain' =>
  typeof value === 'string' && value.toLowerCase() === 'plain' ? 'Plain' : 'Weighted';

solveRouter.post('/solve', asyncHandler(async (request, response) => {
  const body = request.body as { mode?: string; persist?: boolean };
  const mode = normalizedMode(body.mode ?? 'weighted');
  const { zones, edges, units, calls, config } = await loadOperationalState();

  const solution = await solveFleetAllocation(units, calls, zones, edges, config, mode);
  if (body.persist !== false) {
    if (supabase) {
      try {
        const { data, error } = await supabase.from('optimization_runs').insert({
          mode: mode.toLowerCase(),
          objective: solution.objective,
          objective_value: solution.objective,
          cross_check: solution.crossCheck,
          hungarian_objective: solution.crossCheck.value,
          cross_check_passed: solution.crossCheck.ok,
          assignments: solution.assignments,
          matrix: solution.matrix,
          solve_ms: solution.solveMs,
          created_at: new Date().toISOString(),
        }).select('id').single();
        if (!error && data?.id) solution.runId = data.id;
      } catch (reason: unknown) {
        console.warn('Failed to insert optimization_run row:', reason);
      }
    } else {
      solution.runId = `run-${Date.now()}`;
    }
  }
  return response.json(solution);
}));

solveRouter.post('/solve-adhoc', asyncHandler(async (request, response) => {
  const body = request.body as {
    units?: unknown[];
    calls?: unknown[];
    zones?: unknown[];
    edges?: unknown[];
    config?: Partial<AppConfig>;
    mode?: string;
  };
  const solution = await solveFleetAllocation(
    (body.units ?? []) as Ambulance[],
    (body.calls ?? []) as Emergency[],
    (body.zones ?? []) as Zone[],
    (body.edges ?? []) as RoadEdge[],
    { ...DEFAULT_CONFIG, ...body.config },
    normalizedMode(body.mode ?? 'weighted')
  );
  return response.json(solution);
}));

