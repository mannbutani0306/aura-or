import { Router } from 'express';
import { solveFleetAllocation } from '../../engine/assignment';
import { Ambulance, AppConfig, DEFAULT_CONFIG, Emergency, RoadEdge, Zone } from '../../engine/types';
import { supabase, fallbackState } from '../services/supabase';
import { loadConfig } from '../services/configService';
import { asyncHandler } from '../services/http';

export const solveRouter = Router();

const recordOf = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;

const rowsOf = (value: unknown): Record<string, unknown>[] =>
  Array.isArray(value) ? value.flatMap((item) => recordOf(item) ? [recordOf(item)!] : []) : [];

const timestamp = (value: unknown): number => {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return new Date(value).getTime();
  return Date.now();
};

const normalizedMode = (value: unknown): 'Weighted' | 'Plain' =>
  typeof value === 'string' && value.toLowerCase() === 'plain' ? 'Plain' : 'Weighted';

solveRouter.post('/solve', asyncHandler(async (request, response) => {
  const body = request.body as { mode?: string; persist?: boolean };
  const mode = normalizedMode(body.mode ?? 'weighted');
  let zones: Zone[];
  let edges: RoadEdge[];
  let units: Ambulance[];
  let calls: Emergency[];
  const config = await loadConfig();

  if (supabase) {
    const [zonesResult, roadsResult, ambulancesResult, emergenciesResult] = await Promise.all([
      supabase.from('zones').select('*'),
      supabase.from('road_edges').select('*'),
      supabase.from('ambulances').select('*').eq('status', 'Available'),
      supabase.from('emergencies').select('*').eq('status', 'Pending'),
    ]);
    if (zonesResult.error) throw new Error(`zones: ${zonesResult.error.message}`);
    if (roadsResult.error) throw new Error(`road_edges: ${roadsResult.error.message}`);
    if (ambulancesResult.error) throw new Error(`ambulances: ${ambulancesResult.error.message}`);
    if (emergenciesResult.error) throw new Error(`emergencies: ${emergenciesResult.error.message}`);

    zones = rowsOf(zonesResult.data).map((row) => ({
      id: String(row.id),
      name: String(row.name || row.id),
      lat: Number(row.lat),
      lng: Number(row.lng),
      areaType: String(row.area_type || row.areatype || 'Urban') as Zone['areaType'],
      localMin: row.local_min != null ? Number(row.local_min) : row.localmin != null ? Number(row.localmin) : 2.0,
    }));
    edges = rowsOf(roadsResult.data).map((row) => ({
      a: String(row.a), b: String(row.b), minutes: Number(row.minutes), blocked: Boolean(row.blocked),
    }));
    units = rowsOf(ambulancesResult.data).map((row) => ({
      id: String(row.id),
      zoneId: String(row.zone_id || row.zoneId || 'A'),
      type: (row.type as Ambulance['type']) || 'BLS',
      status: (row.status as Ambulance['status']) || 'Available',
      updatedAt: timestamp(row.updated_at),
    }));
    calls = rowsOf(emergenciesResult.data).map((row) => {
      const priority = (row.priority || 'Critical') as Emergency['priority'];
      return {
        id: String(row.id),
        zoneId: String(row.zone_id || row.zoneId || 'A'),
        priority,
        weight: Number(row.weight ?? (priority === 'Critical' ? 5 : priority === 'High' ? 3 : priority === 'Medium' ? 2 : 1)),
        requiresAls: Boolean(row.requires_als ?? row.requiresAls ?? (priority === 'Critical')),
        status: (row.status || 'Pending') as Emergency['status'],
        requestedAt: timestamp(row.requested_at),
        updatedAt: timestamp(row.updated_at),
      };
    });
  } else {
    zones = [...fallbackState.zones];
    edges = [...fallbackState.roads];
    units = fallbackState.ambulances.filter((ambulance) => ambulance.status === 'Available');
    calls = fallbackState.emergencies.filter((emergency) => emergency.status === 'Pending');
  }

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

