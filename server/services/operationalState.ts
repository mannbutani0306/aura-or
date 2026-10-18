import { Ambulance, AppConfig, DEFAULT_CONFIG, Emergency, RoadEdge, Zone } from '../../engine/types';
import { loadConfig } from './configService';
import { fallbackState, supabase } from './supabase';

export interface OperationalState {
  zones: Zone[];
  edges: RoadEdge[];
  units: Ambulance[];
  calls: Emergency[];
  config: AppConfig;
}

type Row = Record<string, unknown>;

function rowsOf(value: unknown): Row[] {
  return Array.isArray(value)
    ? value.filter((row): row is Row => row !== null && typeof row === 'object' && !Array.isArray(row))
    : [];
}

function valueOf(row: Row, ...keys: string[]): unknown {
  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== null) return row[key];
  }
  return undefined;
}

function textOf(row: Row, fallback: string, ...keys: string[]): string {
  const value = valueOf(row, ...keys);
  return value === undefined ? fallback : String(value);
}

function timeOf(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

export async function loadOperationalState(): Promise<OperationalState> {
  const config = supabase ? await loadConfig() : { ...DEFAULT_CONFIG };
  if (!supabase) {
    return {
      zones: [...fallbackState.zones],
      edges: [...fallbackState.roads],
      units: [...fallbackState.ambulances],
      calls: [...fallbackState.emergencies],
      config,
    };
  }

  const [zonesResult, edgesResult, unitsResult, callsResult] = await Promise.all([
    supabase.from('zones').select('*'),
    supabase.from('road_edges').select('*'),
    supabase.from('ambulances').select('*'),
    supabase.from('emergencies').select('*'),
  ]);
  if (zonesResult.error) throw new Error(`zones: ${zonesResult.error.message}`);
  if (edgesResult.error) throw new Error(`road_edges: ${edgesResult.error.message}`);
  if (unitsResult.error) throw new Error(`ambulances: ${unitsResult.error.message}`);
  if (callsResult.error) throw new Error(`emergencies: ${callsResult.error.message}`);

  const zones = rowsOf(zonesResult.data).map((row): Zone => ({
    id: textOf(row, '', 'id'),
    name: textOf(row, textOf(row, '', 'id'), 'name'),
    lat: Number(valueOf(row, 'lat')),
    lng: Number(valueOf(row, 'lng')),
    areaType: textOf(row, 'Urban', 'area_type', 'areatype') as Zone['areaType'],
    localMin: Number(valueOf(row, 'local_min', 'localmin') ?? 2),
  }));
  const edges = rowsOf(edgesResult.data).map((row): RoadEdge => ({
    a: textOf(row, '', 'a'),
    b: textOf(row, '', 'b'),
    minutes: Number(valueOf(row, 'minutes')),
    blocked: Boolean(valueOf(row, 'blocked')),
  }));
  const units = rowsOf(unitsResult.data).map((row): Ambulance => ({
    id: textOf(row, '', 'id'),
    zoneId: textOf(row, 'A', 'zone_id', 'zoneId'),
    type: textOf(row, 'BLS', 'type') as Ambulance['type'],
    status: textOf(row, 'Available', 'status') as Ambulance['status'],
    updatedAt: timeOf(valueOf(row, 'updated_at', 'updatedAt')),
  }));
  const calls = rowsOf(callsResult.data).map((row): Emergency => {
    const priority = textOf(row, 'Critical', 'priority') as Emergency['priority'];
    const weightFallback = priority === 'Critical' ? 5 : priority === 'High' ? 3 : priority === 'Medium' ? 2 : 1;
    return {
      id: textOf(row, '', 'id'),
      zoneId: textOf(row, 'A', 'zone_id', 'zoneId'),
      priority,
      weight: Number(valueOf(row, 'weight') ?? weightFallback),
      requiresAls: Boolean(valueOf(row, 'requires_als', 'requiresAls') ?? priority === 'Critical'),
      status: textOf(row, 'Pending', 'status') as Emergency['status'],
      source: typeof valueOf(row, 'source') === 'string' ? String(valueOf(row, 'source')) : undefined,
      requestedAt: timeOf(valueOf(row, 'requested_at', 'requestedAt')),
      updatedAt: timeOf(valueOf(row, 'updated_at', 'updatedAt')),
    };
  });

  return { zones, edges, units, calls, config };
}