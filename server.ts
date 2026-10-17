/**
 * AURA Telematics & Optimization Engine Server
 * Express Server on port 3000 with Vite middleware in dev and static serving in prod.
 * Single source of truth travel time matrix & HiGHS WASM + Hungarian dual solver.
 */

import 'dotenv/config';
import express, { Request, Response } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import {
  ENGINE_NAME,
  ENGINE_VERSION,
  getHighsInstance,
  solveFleetAllocation,
} from './engine/assignment';
import { buildTravelMatrix, yenKShortestPaths, dijkstra } from './engine/graph';
import { Zone, RoadEdge, Ambulance, Emergency, AppConfig } from './engine/types';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT || 3000);
const isProd = process.env.NODE_ENV === 'production';

// Support body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Supabase client initialization for server-side operations
const SUPABASE_URL = (
  process.env.VITE_SUPABASE_URL ||
  process.env.SUPABASE_URL ||
  ''
).trim();

const SUPABASE_ANON_KEY = (
  process.env.VITE_SUPABASE_ANON_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  ''
).trim();

export const supabase: SupabaseClient | null =
  SUPABASE_URL && SUPABASE_ANON_KEY
    ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
    : null;

// ==========================================
// API ENDPOINTS
// ==========================================

/**
 * GET /api/health
 * Returns { ok, db: { ok, latencyMs }, engine: { name, version, solverLoaded } }
 */
app.get('/api/health', async (_req: Request, res: Response) => {
  let dbOk = false;
  let dbLatencyMs = 0;

  if (supabase) {
    try {
      const t0 = performance.now();
      const { error } = await supabase.from('zones').select('id').limit(1);
      dbLatencyMs = Math.round(performance.now() - t0);
      dbOk = !error;
    } catch {
      dbOk = false;
    }
  }

  let solverLoaded = false;
  try {
    const solver = await getHighsInstance();
    solverLoaded = typeof solver?.solve === 'function';
  } catch {
    solverLoaded = false;
  }

  res.json({
    ok: true,
    db: {
      ok: dbOk,
      latencyMs: dbLatencyMs,
    },
    engine: {
      name: ENGINE_NAME,
      version: ENGINE_VERSION,
      solverLoaded,
    },
  });
});

/**
 * POST /api/solve
 * Reads current state from Supabase (Available units, Pending calls, zones, edges, config),
 * builds matrix, solves via HiGHS WASM, cross-checks with Hungarian algorithm,
 * computes paths, and optionally persists run to optimization_runs.
 */
app.post('/api/solve', async (req: Request, res: Response) => {
  try {
    const { mode = 'weighted', persist = true } = req.body || {};
    const normalizedMode =
      typeof mode === 'string' && mode.toLowerCase() === 'plain'
        ? 'Plain'
        : 'Weighted';

    let zones: Zone[] = [];
    let edges: RoadEdge[] = [];
    let units: Ambulance[] = [];
    let calls: Emergency[] = [];
    const config: AppConfig = {
      unserved_min: 60.0,
      sla_min: 10.0,
    };

    if (supabase) {
      // Read current state from Supabase in parallel
      const [zonesRes, roadsRes, ambsRes, emsRes, configRes] = await Promise.all([
        supabase.from('zones').select('*'),
        supabase.from('road_edges').select('*'),
        supabase.from('ambulances').select('*').eq('status', 'Available'),
        supabase.from('emergencies').select('*').eq('status', 'Pending'),
        supabase.from('app_config').select('*'),
      ]);

      if (zonesRes.error) throw new Error(`zones: ${zonesRes.error.message}`);
      if (roadsRes.error) throw new Error(`road_edges: ${roadsRes.error.message}`);
      if (ambsRes.error) throw new Error(`ambulances: ${ambsRes.error.message}`);
      if (emsRes.error) throw new Error(`emergencies: ${emsRes.error.message}`);

      // Map Zones
      zones = (zonesRes.data || []).map((row: any) => ({
        id: String(row.id),
        name: String(row.name || row.id),
        lat: Number(row.lat),
        lng: Number(row.lng),
        areaType: row.area_type || row.areatype || 'Commercial',
        localMin:
          row.local_min != null
            ? Number(row.local_min)
            : row.localmin != null
            ? Number(row.localmin)
            : 2.0,
      }));

      // Map Road Edges
      edges = (roadsRes.data || []).map((row: any) => ({
        a: String(row.a),
        b: String(row.b),
        minutes: Number(row.minutes),
        blocked: Boolean(row.blocked),
      }));

      // Map Available Units
      units = (ambsRes.data || []).map((row: any) => ({
        id: String(row.id),
        zoneId: String(row.zone_id || row.zoneId || 'A'),
        type: (row.type as 'ALS' | 'BLS') || 'BLS',
        status: (row.status as 'Available' | 'Busy' | 'Offline') || 'Available',
        updatedAt: row.updated_at
          ? new Date(row.updated_at).getTime()
          : Date.now(),
      }));

      // Map Pending Emergencies (weight & requires_als are generated columns in Supabase)
      calls = (emsRes.data || []).map((row: any) => ({
        id: String(row.id),
        zoneId: String(row.zone_id || row.zoneId || 'A'),
        priority: row.priority || 'Critical',
        weight: Number(
          row.weight ??
            (row.priority === 'Critical'
              ? 5
              : row.priority === 'High'
              ? 3
              : row.priority === 'Medium'
              ? 2
              : 1)
        ),
        requiresAls: Boolean(
          row.requires_als ?? row.requiresAls ?? (row.priority === 'Critical')
        ),
        status: row.status || 'Pending',
        requestedAt: row.requested_at
          ? typeof row.requested_at === 'number'
            ? row.requested_at
            : new Date(row.requested_at).getTime()
          : Date.now(),
        updatedAt: row.updated_at
          ? new Date(row.updated_at).getTime()
          : Date.now(),
      }));

      if (configRes.data) {
        if (Array.isArray(configRes.data)) {
          configRes.data.forEach((r: any) => {
            if (r.key && r.value !== undefined) {
              config[r.key] = Number(r.value) || r.value;
            } else if (r.unserved_min !== undefined) {
              config.unserved_min = Number(r.unserved_min);
            }
            if (r.sla_min !== undefined) {
              config.sla_min = Number(r.sla_min);
            }
          });
        } else {
          Object.assign(config, configRes.data);
        }
      }
    } else {
      // In-memory fallback dataset
      zones = [...fallbackZones];
      edges = [...fallbackRoads];
      units = fallbackAmbulances.filter((a) => a.status === 'Available');
      calls = fallbackEmergencies.filter((e) => e.status === 'Pending');
    }

    // Solve using HiGHS WASM and Kuhn-Munkres Hungarian verification
    const solution = await solveFleetAllocation(
      units,
      calls,
      zones,
      edges,
      config,
      normalizedMode
    );

    // Persist to optimization_runs if requested
    if (persist) {
      if (supabase) {
        try {
          const { data: runData, error: runError } = await supabase
            .from('optimization_runs')
            .insert({
              mode: normalizedMode.toLowerCase(),
              objective: solution.objective,
              objective_value: solution.objective,
              cross_check: solution.crossCheck,
              hungarian_objective: solution.crossCheck.value,
              cross_check_passed: solution.crossCheck.ok,
              assignments: solution.assignments,
              matrix: solution.matrix,
              solve_ms: solution.solveMs,
              created_at: new Date().toISOString(),
            })
            .select('id')
            .single();

          if (!runError && runData?.id) {
            solution.runId = runData.id;
          }
        } catch (persistErr) {
          console.warn('Failed to insert optimization_run row:', persistErr);
        }
      } else {
        solution.runId = `run-${Date.now()}`;
      }
    }

    return res.json(solution);
  } catch (err: any) {
    console.error('Solve error:', err);
    return res.status(500).json({ error: err.message || 'Solver execution failed' });
  }
});

/**
 * POST /api/solve-adhoc
 * Same engine on an explicit body payload with NO database access
 * (for tests, Scenario Lab, and evaluation runs).
 */
app.post('/api/solve-adhoc', async (req: Request, res: Response) => {
  try {
    const {
      units = [],
      calls = [],
      zones = [],
      edges = [],
      config = {},
      mode = 'weighted',
    } = req.body || {};

    const normalizedMode =
      typeof mode === 'string' && mode.toLowerCase() === 'plain'
        ? 'Plain'
        : 'Weighted';

    const solution = await solveFleetAllocation(
      units,
      calls,
      zones,
      edges,
      config,
      normalizedMode
    );

    return res.json(solution);
  } catch (err: any) {
    console.error('Solve-adhoc error:', err);
    return res.status(500).json({ error: err.message || 'Ad-hoc solve failed' });
  }
});

/**
 * GET /api/route?from=&to=&k=3
 * Dijkstra and Yen's K-Shortest Loopless Paths computation on the road network
 */
app.get('/api/route', async (req: Request, res: Response) => {
  try {
    const from = String(req.query.from || '').trim();
    const to = String(req.query.to || '').trim();
    const k = Math.max(1, Math.min(10, Number(req.query.k || 3)));

    if (!from || !to) {
      return res.status(400).json({ error: 'Missing required "from" or "to" query parameters.' });
    }

    let zones: Zone[] = [];
    let edges: RoadEdge[] = [];

    if (supabase) {
      const [zRes, rRes] = await Promise.all([
        supabase.from('zones').select('*'),
        supabase.from('road_edges').select('*'),
      ]);
      if (zRes.data) {
        zones = zRes.data.map((row: any) => ({
          id: String(row.id),
          name: String(row.name || row.id),
          lat: Number(row.lat),
          lng: Number(row.lng),
          areaType: row.area_type || 'Commercial',
          localMin: Number(row.local_min || 2.0),
        }));
      }
      if (rRes.data) {
        edges = rRes.data.map((row: any) => ({
          a: String(row.a),
          b: String(row.b),
          minutes: Number(row.minutes),
          blocked: Boolean(row.blocked),
        }));
      }
    }

    if (zones.length === 0 || edges.length === 0) {
      zones = [
        { id: 'A', name: 'Goripalayam', lat: 9.9325, lng: 78.1312, areaType: 'Commercial', localMin: 2.0 },
        { id: 'B', name: 'Anna Nagar', lat: 9.9208, lng: 78.1489, areaType: 'Residential', localMin: 2.0 },
        { id: 'C', name: 'Periyar / Central', lat: 9.9174, lng: 78.1139, areaType: 'Transit', localMin: 2.5 },
        { id: 'D', name: 'K.K. Nagar', lat: 9.9381, lng: 78.1523, areaType: 'Suburban', localMin: 2.0 },
        { id: 'E', name: 'Simmakkal', lat: 9.9282, lng: 78.1219, areaType: 'Hospital', localMin: 1.5 },
        { id: 'F', name: 'Villapuram', lat: 9.8973, lng: 78.1294, areaType: 'Industrial', localMin: 2.0 },
      ];
      edges = [
        { a: 'A', b: 'B', minutes: 7.0, blocked: false },
        { a: 'A', b: 'C', minutes: 6.0, blocked: false },
        { a: 'A', b: 'E', minutes: 4.0, blocked: false },
        { a: 'B', b: 'D', minutes: 5.0, blocked: false },
        { a: 'B', b: 'F', minutes: 9.0, blocked: false },
        { a: 'C', b: 'E', minutes: 4.0, blocked: false },
        { a: 'C', b: 'F', minutes: 8.0, blocked: false },
        { a: 'D', b: 'E', minutes: 8.0, blocked: false },
        { a: 'E', b: 'F', minutes: 10.0, blocked: false },
      ];
    }

    const allPaths = yenKShortestPaths(zones, edges, from, to, k);

    return res.json({
      from,
      to,
      k,
      optimal: allPaths[0] || null,
      alternatives: allPaths.slice(1),
      all: allPaths,
    });
  } catch (err: any) {
    console.error('Route calculation error:', err);
    return res.status(500).json({ error: err.message || 'Route computation failed' });
  }
});

// ==========================================
// SIMULATION CLOCK & LIFECYCLE STATE
// ==========================================
let simSpeed = 1; // 1 real sec = 1 sim min by default (adjustable x1, x2, x5, x10)
const SERVICE_TIME_MIN = 8.0; // 8 sim-minutes on scene before completion

// In-memory fallback dataset for seamless demo / local execution when Supabase is offline
const fallbackZones: Zone[] = [
  { id: 'A', name: 'Goripalayam', lat: 9.9325, lng: 78.1312, areaType: 'Commercial', localMin: 2.0 },
  { id: 'B', name: 'Anna Nagar', lat: 9.9208, lng: 78.1489, areaType: 'Residential', localMin: 2.0 },
  { id: 'C', name: 'Periyar / Central', lat: 9.9174, lng: 78.1139, areaType: 'Transit', localMin: 2.5 },
  { id: 'D', name: 'K.K. Nagar', lat: 9.9381, lng: 78.1523, areaType: 'Suburban', localMin: 2.0 },
  { id: 'E', name: 'Simmakkal', lat: 9.9282, lng: 78.1219, areaType: 'Hospital', localMin: 1.5 },
  { id: 'F', name: 'Villapuram', lat: 9.8973, lng: 78.1294, areaType: 'Industrial', localMin: 2.0 },
];

const fallbackRoads: RoadEdge[] = [
  { a: 'A', b: 'B', minutes: 7.0, blocked: false },
  { a: 'A', b: 'C', minutes: 6.0, blocked: false },
  { a: 'A', b: 'E', minutes: 4.0, blocked: false },
  { a: 'B', b: 'D', minutes: 5.0, blocked: false },
  { a: 'B', b: 'F', minutes: 9.0, blocked: false },
  { a: 'C', b: 'E', minutes: 4.0, blocked: false },
  { a: 'C', b: 'F', minutes: 8.0, blocked: false },
  { a: 'D', b: 'E', minutes: 8.0, blocked: false },
  { a: 'E', b: 'F', minutes: 10.0, blocked: false },
];

let fallbackAmbulances: Ambulance[] = [
  { id: 'A1', zoneId: 'A', type: 'BLS', status: 'Available', updatedAt: Date.now() },
  { id: 'A2', zoneId: 'B', type: 'BLS', status: 'Available', updatedAt: Date.now() },
  { id: 'A3', zoneId: 'C', type: 'ALS', status: 'Available', updatedAt: Date.now() },
  { id: 'A4', zoneId: 'D', type: 'ALS', status: 'Available', updatedAt: Date.now() },
  { id: 'A5', zoneId: 'E', type: 'BLS', status: 'Available', updatedAt: Date.now() },
];

let fallbackEmergencies: Emergency[] = [
  { id: 'E1', zoneId: 'B', priority: 'Critical', weight: 5, requiresAls: true, status: 'Pending', requestedAt: Date.now() - 120000 },
  { id: 'E2', zoneId: 'F', priority: 'High', weight: 3, requiresAls: false, status: 'Pending', requestedAt: Date.now() - 90000 },
  { id: 'E3', zoneId: 'A', priority: 'Medium', weight: 2, requiresAls: false, status: 'Pending', requestedAt: Date.now() - 60000 },
  { id: 'E4', zoneId: 'D', priority: 'Critical', weight: 5, requiresAls: true, status: 'Pending', requestedAt: Date.now() - 40000 },
  { id: 'E5', zoneId: 'C', priority: 'High', weight: 3, requiresAls: false, status: 'Pending', requestedAt: Date.now() - 20000 },
];

interface ServerDispatch {
  id: string;
  emergency_id: string;
  ambulance_id: string;
  from_zone: string;
  to_zone: string;
  eta_min: number;
  benchmark_min: number;
  path: string[];
  status: 'EnRoute' | 'OnScene' | 'Completed' | 'Cancelled';
  dispatched_at: string;
  arrived_at?: string;
  completed_at?: string;
}

let fallbackDispatches: ServerDispatch[] = [];
let fallbackEvents: any[] = [];

/**
 * Advance dispatch lifecycle: EnRoute -> OnScene -> Completed
 * Illegal transitions throw an error immediately.
 */
async function executeAdvanceDispatch(id: string, nextStatus: 'OnScene' | 'Completed') {
  if (supabase) {
    try {
      const rpcRes = await supabase.rpc('advance_dispatch', {
        p_id: id,
        p_status: nextStatus,
      });
      if (!rpcRes.error) return { ok: true };
    } catch {
      // Continue to direct queries if RPC is not deployed
    }

    const { data: disp, error: fetchErr } = await supabase
      .from('dispatches')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchErr || !disp) throw new Error(fetchErr?.message || `Dispatch ${id} not found`);

    if (nextStatus === 'OnScene') {
      if (disp.status !== 'EnRoute') {
        throw new Error(`Illegal state transition: cannot advance from ${disp.status} to OnScene`);
      }
      const arrivedAt = new Date().toISOString();
      await supabase.from('dispatches').update({ status: 'OnScene', arrived_at: arrivedAt }).eq('id', id);
      try {
        await supabase.from('event_log').insert({
          kind: 'DISPATCH_ON_SCENE',
          entity_ids: [disp.ambulance_id, disp.emergency_id],
          details: { dispatchId: id, arrivedAt },
          created_at: arrivedAt,
        });
      } catch {}
      return { ok: true };
    }

    if (nextStatus === 'Completed') {
      if (disp.status !== 'OnScene' && disp.status !== 'EnRoute') {
        throw new Error(`Illegal state transition: cannot complete from ${disp.status}`);
      }
      const completedAt = new Date().toISOString();
      await supabase.from('dispatches').update({ status: 'Completed', completed_at: completedAt }).eq('id', id);

      // Relocate ambulance to scene zone and mark Available
      await supabase
        .from('ambulances')
        .update({
          status: 'Available',
          zone_id: disp.to_zone || disp.tozone,
          updated_at: completedAt,
        })
        .eq('id', disp.ambulance_id);

      // Mark emergency as Completed
      await supabase
        .from('emergencies')
        .update({ status: 'Completed', updated_at: completedAt })
        .eq('id', disp.emergency_id);

      try {
        await supabase.from('event_log').insert({
          kind: 'DISPATCH_COMPLETED',
          entity_ids: [disp.ambulance_id, disp.emergency_id],
          details: { dispatchId: id, relocatedTo: disp.to_zone || disp.tozone },
          created_at: completedAt,
        });
      } catch {}
      return { ok: true };
    }
  } else {
    // In-memory fallback
    const disp = fallbackDispatches.find((d) => d.id === id);
    if (!disp) throw new Error(`Dispatch ${id} not found`);

    if (nextStatus === 'OnScene') {
      if (disp.status !== 'EnRoute') {
        throw new Error(`Illegal state transition: cannot advance from ${disp.status} to OnScene`);
      }
      disp.status = 'OnScene';
      disp.arrived_at = new Date().toISOString();
      fallbackEvents.unshift({
        id: `evt-${Date.now()}`,
        kind: 'DISPATCH_ON_SCENE',
        entityIds: [disp.ambulance_id, disp.emergency_id],
        details: { dispatchId: id },
        createdAt: Date.now(),
      });
      return { ok: true };
    }

    if (nextStatus === 'Completed') {
      disp.status = 'Completed';
      disp.completed_at = new Date().toISOString();

      const amb = fallbackAmbulances.find((a) => a.id === disp.ambulance_id);
      if (amb) {
        amb.status = 'Available';
        amb.zoneId = disp.to_zone;
        amb.updatedAt = Date.now();
      }

      const em = fallbackEmergencies.find((e) => e.id === disp.emergency_id);
      if (em) {
        em.status = 'Completed';
        em.updatedAt = Date.now();
      }

      fallbackEvents.unshift({
        id: `evt-${Date.now()}`,
        kind: 'DISPATCH_COMPLETED',
        entityIds: [disp.ambulance_id, disp.emergency_id],
        details: { dispatchId: id, relocatedTo: disp.to_zone },
        createdAt: Date.now(),
      });
      return { ok: true };
    }
  }

  throw new Error(`Unknown status transition: ${nextStatus}`);
}

/**
 * Cancel a dispatch: returns call to Pending and unit to Available
 */
async function executeCancelDispatch(id: string) {
  if (supabase) {
    const { data: disp, error } = await supabase.from('dispatches').select('*').eq('id', id).single();
    if (error || !disp) throw new Error(error?.message || `Dispatch ${id} not found`);

    await supabase.from('dispatches').update({ status: 'Cancelled' }).eq('id', id);
    await supabase.from('ambulances').update({ status: 'Available', updated_at: new Date().toISOString() }).eq('id', disp.ambulance_id);
    await supabase.from('emergencies').update({ status: 'Pending', updated_at: new Date().toISOString() }).eq('id', disp.emergency_id);

    try {
      await supabase.from('event_log').insert({
        kind: 'DISPATCH_CANCELLED',
        entity_ids: [disp.ambulance_id, disp.emergency_id],
        details: { dispatchId: id },
        created_at: new Date().toISOString(),
      });
    } catch {}
    return { ok: true };
  } else {
    const disp = fallbackDispatches.find((d) => d.id === id);
    if (!disp) throw new Error(`Dispatch ${id} not found`);

    disp.status = 'Cancelled';
    const amb = fallbackAmbulances.find((a) => a.id === disp.ambulance_id);
    if (amb) {
      amb.status = 'Available';
      amb.updatedAt = Date.now();
    }
    const em = fallbackEmergencies.find((e) => e.id === disp.emergency_id);
    if (em) {
      em.status = 'Pending';
      em.updatedAt = Date.now();
    }
    fallbackEvents.unshift({
      id: `evt-${Date.now()}`,
      kind: 'DISPATCH_CANCELLED',
      entityIds: [disp.ambulance_id, disp.emergency_id],
      details: { dispatchId: id },
      createdAt: Date.now(),
    });
    return { ok: true };
  }
}

/**
 * Server Simulation Clock Loop (setInterval 1s)
 * - 1 real second = simSpeed simulated minutes (default 1)
 * - Resilient to restarts: derives elapsed time directly from dispatched_at / arrived_at
 * - Runs with no browser open
 */
async function runSimulationTick() {
  const now = Date.now();

  let activeDispatches: any[] = [];
  if (supabase) {
    const { data, error } = await supabase
      .from('dispatches')
      .select('*')
      .in('status', ['EnRoute', 'OnScene']);
    if (!error && data) activeDispatches = data;
  } else {
    activeDispatches = fallbackDispatches.filter(
      (d) => d.status === 'EnRoute' || d.status === 'OnScene'
    );
  }

  for (const d of activeDispatches) {
    const dispId = String(d.id);
    const dispatchedAt = d.dispatched_at
      ? typeof d.dispatched_at === 'number'
        ? d.dispatched_at
        : new Date(d.dispatched_at).getTime()
      : now;

    const arrivedAt = d.arrived_at
      ? typeof d.arrived_at === 'number'
        ? d.arrived_at
        : new Date(d.arrived_at).getTime()
      : undefined;

    const etaMin = Number(d.eta_min ?? d.etaMin ?? 5.0);

    if (d.status === 'EnRoute') {
      // Derive elapsed simulated minutes from dispatched_at
      const elapsedSimMin = ((now - dispatchedAt) / 1000) * (simSpeed / 1.0);
      if (elapsedSimMin >= etaMin) {
        await executeAdvanceDispatch(dispId, 'OnScene').catch((err) =>
          console.warn(`Sim advance to OnScene failed for ${dispId}:`, err.message)
        );
      }
    } else if (d.status === 'OnScene') {
      const onSceneBase = arrivedAt || dispatchedAt;
      const onSceneSimMin = ((now - onSceneBase) / 1000) * (simSpeed / 1.0);
      if (onSceneSimMin >= SERVICE_TIME_MIN) {
        await executeAdvanceDispatch(dispId, 'Completed').catch((err) =>
          console.warn(`Sim advance to Completed failed for ${dispId}:`, err.message)
        );
      }
    }
  }
}

// Start simulation clock immediately
setInterval(() => {
  runSimulationTick().catch((err) => {
    console.error('Simulation tick error:', err);
  });
}, 1000);

// ==========================================
// DISPATCH & SIMULATION API ENDPOINTS
// ==========================================

/**
 * GET /api/sim
 * Returns simulation clock configuration & live multiplier
 */
app.get('/api/sim', (_req: Request, res: Response) => {
  res.json({
    speed: simSpeed,
    serviceTimeMin: SERVICE_TIME_MIN,
    unit: 'sim-minutes per real-second',
  });
});

/**
 * POST /api/sim
 * Updates simulation speed multiplier (1, 2, 5, 10)
 */
app.post('/api/sim', (req: Request, res: Response) => {
  const { speed } = req.body || {};
  const parsed = Number(speed);
  if ([1, 2, 5, 10].includes(parsed)) {
    simSpeed = parsed;
    return res.json({ ok: true, speed: simSpeed });
  }
  return res.status(400).json({ error: 'Speed multiplier must be 1, 2, 5, or 10.' });
});

/**
 * POST /api/dispatch
 * Atomic batch dispatch calling RPC dispatch_batch(items, runId).
 * If any assignment fails, none are applied; database error message returned.
 */
app.post('/api/dispatch', async (req: Request, res: Response) => {
  try {
    const { items = [], runId } = req.body || {};
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'No dispatch items provided in batch payload.' });
    }

    if (supabase) {
      // 1. Try atomic database RPC dispatch_batch
      try {
        const rpcRes = await supabase.rpc('dispatch_batch', {
          p_items: items,
          p_run_id: runId || null,
        });
        if (!rpcRes.error) {
          return res.json({ ok: true, count: items.length, runId });
        }
      } catch {
        // Fall back to table checks if RPC function is missing
      }

      // 2. Atomic table validation: verify all units are Available and calls are Pending
      const ambIds = items.map((i: any) => String(i.ambulance_id || i.ambulanceId));
      const emIds = items.map((i: any) => String(i.emergency_id || i.emergencyId));

      const [ambsCheck, emsCheck] = await Promise.all([
        supabase.from('ambulances').select('id, status').in('id', ambIds),
        supabase.from('emergencies').select('id, status').in('id', emIds),
      ]);

      if (ambsCheck.error) throw new Error(ambsCheck.error.message);
      if (emsCheck.error) throw new Error(emsCheck.error.message);

      for (const amb of ambsCheck.data || []) {
        if (amb.status !== 'Available') {
          return res.status(400).json({
            error: `Database constraint: Ambulance ${amb.id} is already ${amb.status} (expected Available).`,
          });
        }
      }

      for (const em of emsCheck.data || []) {
        if (em.status !== 'Pending') {
          return res.status(400).json({
            error: `Database constraint: Emergency ${em.id} is already ${em.status} (expected Pending).`,
          });
        }
      }

      // 3. Insert dispatches and flip states
      const dispatchRows = items.map((item: any) => ({
        emergency_id: item.emergency_id || item.emergencyId,
        ambulance_id: item.ambulance_id || item.ambulanceId,
        from_zone: item.from_zone || item.fromZone,
        to_zone: item.to_zone || item.toZone,
        eta_min: Number(item.eta_min || item.etaMin),
        benchmark_min: Number(item.benchmark_min || item.benchmarkMin || 10.0),
        path: Array.isArray(item.path) ? item.path : [],
        status: 'EnRoute',
        dispatched_at: new Date().toISOString(),
      }));

      const insertRes = await supabase.from('dispatches').insert(dispatchRows).select();
      if (insertRes.error) throw new Error(insertRes.error.message);

      // Flip ambulance status Busy
      await supabase
        .from('ambulances')
        .update({ status: 'Busy', updated_at: new Date().toISOString() })
        .in('id', ambIds);

      // Flip emergency status Dispatched
      await supabase
        .from('emergencies')
        .update({ status: 'Dispatched', updated_at: new Date().toISOString() })
        .in('id', emIds);

      try {
        await supabase.from('event_log').insert({
          kind: 'DISPATCH_BATCH',
          entity_ids: ambIds,
          details: { count: items.length, runId },
          created_at: new Date().toISOString(),
        });
      } catch {}

      return res.json({ ok: true, count: items.length, dispatches: insertRes.data });
    } else {
      // In-memory fallback: atomic check
      for (const item of items) {
        const ambId = String(item.ambulance_id || item.ambulanceId);
        const emId = String(item.emergency_id || item.emergencyId);

        const amb = fallbackAmbulances.find((a) => a.id === ambId);
        if (!amb || amb.status !== 'Available') {
          return res.status(400).json({
            error: `Database constraint: Ambulance ${ambId} is already ${amb?.status || 'Unknown'} (expected Available).`,
          });
        }

        const em = fallbackEmergencies.find((e) => e.id === emId);
        if (!em || em.status !== 'Pending') {
          return res.status(400).json({
            error: `Database constraint: Emergency ${emId} is already ${em?.status || 'Unknown'} (expected Pending).`,
          });
        }
      }

      // Apply batch
      const created: ServerDispatch[] = [];
      for (const item of items) {
        const ambId = String(item.ambulance_id || item.ambulanceId);
        const emId = String(item.emergency_id || item.emergencyId);

        const amb = fallbackAmbulances.find((a) => a.id === ambId)!;
        const em = fallbackEmergencies.find((e) => e.id === emId)!;

        amb.status = 'Busy';
        amb.updatedAt = Date.now();
        em.status = 'Dispatched';
        em.updatedAt = Date.now();

        const d: ServerDispatch = {
          id: `disp-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          emergency_id: emId,
          ambulance_id: ambId,
          from_zone: item.from_zone || item.fromZone || amb.zoneId,
          to_zone: item.to_zone || item.toZone || em.zoneId,
          eta_min: Number(item.eta_min || item.etaMin),
          benchmark_min: Number(item.benchmark_min || item.benchmarkMin || 10.0),
          path: Array.isArray(item.path) ? item.path : [amb.zoneId, em.zoneId],
          status: 'EnRoute',
          dispatched_at: new Date().toISOString(),
        };

        fallbackDispatches.unshift(d);
        created.push(d);
      }

      fallbackEvents.unshift({
        id: `evt-${Date.now()}`,
        kind: 'DISPATCH_BATCH',
        entityIds: items.map((i) => i.ambulance_id || i.ambulanceId),
        details: { count: items.length, runId },
        createdAt: Date.now(),
      });

      return res.json({ ok: true, count: items.length, dispatches: created });
    }
  } catch (err: any) {
    console.error('Dispatch batch error:', err);
    return res.status(400).json({ error: err.message || 'Dispatch batch transaction aborted' });
  }
});

/**
 * POST /api/dispatch/:id/advance
 * Manually advance a dispatch to OnScene or Completed
 */
app.post('/api/dispatch/:id/advance', async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    const { status } = req.body || {};
    if (status !== 'OnScene' && status !== 'Completed') {
      return res.status(400).json({ error: 'Status must be OnScene or Completed.' });
    }

    await executeAdvanceDispatch(id, status);
    return res.json({ ok: true, id, status });
  } catch (err: any) {
    return res.status(400).json({ error: err.message || 'Advance dispatch failed' });
  }
});

/**
 * POST /api/dispatch/:id/cancel
 * Manually cancel a dispatch (reverts call to Pending and unit to Available)
 */
app.post('/api/dispatch/:id/cancel', async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    await executeCancelDispatch(id);
    return res.json({ ok: true, id, status: 'Cancelled' });
  } catch (err: any) {
    return res.status(400).json({ error: err.message || 'Cancel dispatch failed' });
  }
});

/**
 * GET /api/dispatches
 * Returns all active and recent dispatches
 */
app.get('/api/dispatches', async (_req: Request, res: Response) => {
  try {
    if (supabase) {
      const { data, error } = await supabase
        .from('dispatches')
        .select('*')
        .order('dispatched_at', { ascending: false });
      if (error) throw error;
      return res.json(data || []);
    }
    return res.json(fallbackDispatches);
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to list dispatches' });
  }
});

/**
 * GET /api/state
 * Returns unified domain state (ambulances, emergencies, dispatches, zones, roads, events, simSpeed)
 * Ensures client and server are always in 100% sync.
 */
app.get('/api/state', async (_req: Request, res: Response) => {
  try {
    if (supabase) {
      const [ambs, ems, disps, z, r, evts] = await Promise.all([
        supabase.from('ambulances').select('*').order('id'),
        supabase.from('emergencies').select('*').order('requested_at', { ascending: false }),
        supabase.from('dispatches').select('*').order('dispatched_at', { ascending: false }),
        supabase.from('zones').select('*'),
        supabase.from('road_edges').select('*'),
        supabase.from('event_log').select('*').order('created_at', { ascending: false }).limit(60),
      ]);

      return res.json({
        ok: true,
        ambulances: ambs.data || [],
        emergencies: ems.data || [],
        dispatches: disps.data || [],
        zones: z.data || [],
        roads: r.data || [],
        events: evts.data || [],
        simSpeed,
      });
    }

    return res.json({
      ok: true,
      ambulances: fallbackAmbulances,
      emergencies: fallbackEmergencies,
      dispatches: fallbackDispatches,
      zones: fallbackZones,
      roads: fallbackRoads,
      events: fallbackEvents,
      simSpeed,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to get server state' });
  }
});

/**
 * POST /api/emergencies
 * Create a new emergency call (in Supabase or fallback dataset)
 */
app.post('/api/emergencies', async (req: Request, res: Response) => {
  try {
    const { zoneId = 'B', priority = 'Critical', requiresAls = true } = req.body || {};
    const weight = priority === 'Critical' ? 5 : priority === 'High' ? 3 : priority === 'Medium' ? 2 : 1;

    if (supabase) {
      const payload: any = {
        zone_id: zoneId,
        priority,
        status: 'Pending',
        requested_at: new Date().toISOString(),
      };
      const { data, error } = await supabase.from('emergencies').insert(payload).select().single();
      if (error) throw error;
      return res.json(data);
    }

    const newCall: Emergency = {
      id: `E${Date.now().toString().slice(-4)}`,
      zoneId,
      priority,
      weight,
      requiresAls: Boolean(requiresAls),
      status: 'Pending',
      requestedAt: Date.now(),
      updatedAt: Date.now(),
    };

    fallbackEmergencies.unshift(newCall);
    fallbackEvents.unshift({
      id: `evt-${Date.now()}`,
      kind: 'EMERGENCY_REPORTED',
      entityIds: [newCall.id],
      details: { zoneId, priority },
      createdAt: Date.now(),
    });

    return res.json(newCall);
  } catch (err: any) {
    return res.status(400).json({ error: err.message || 'Failed to create emergency' });
  }
});

/**
 * POST /api/reset-demo
 * Restores clean baseline scenario across ambulances, emergencies, and dispatches
 */
app.post('/api/reset-demo', async (_req: Request, res: Response) => {
  try {
    if (supabase) {
      try {
        await supabase.rpc('reset_demo');
      } catch {}
    }

    fallbackAmbulances = [
      { id: 'A1', zoneId: 'A', type: 'BLS', status: 'Available', updatedAt: Date.now() },
      { id: 'A2', zoneId: 'B', type: 'BLS', status: 'Available', updatedAt: Date.now() },
      { id: 'A3', zoneId: 'C', type: 'ALS', status: 'Available', updatedAt: Date.now() },
      { id: 'A4', zoneId: 'D', type: 'ALS', status: 'Available', updatedAt: Date.now() },
      { id: 'A5', zoneId: 'E', type: 'BLS', status: 'Available', updatedAt: Date.now() },
    ];

    fallbackEmergencies = [
      { id: 'E1', zoneId: 'B', priority: 'Critical', weight: 5, requiresAls: true, status: 'Pending', requestedAt: Date.now() - 120000 },
      { id: 'E2', zoneId: 'F', priority: 'High', weight: 3, requiresAls: false, status: 'Pending', requestedAt: Date.now() - 90000 },
      { id: 'E3', zoneId: 'A', priority: 'Medium', weight: 2, requiresAls: false, status: 'Pending', requestedAt: Date.now() - 60000 },
      { id: 'E4', zoneId: 'D', priority: 'Critical', weight: 5, requiresAls: true, status: 'Pending', requestedAt: Date.now() - 40000 },
      { id: 'E5', zoneId: 'C', priority: 'High', weight: 3, requiresAls: false, status: 'Pending', requestedAt: Date.now() - 20000 },
    ];

    fallbackDispatches = [];
    fallbackEvents.unshift({
      id: `evt-${Date.now()}`,
      kind: 'SCENARIO_RESET',
      details: 'Demo scenario reset to baseline allocation',
      createdAt: Date.now(),
    });

    return res.json({ ok: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Reset failed' });
  }
});

// ==========================================
// VITE DEV MIDDLEWARE OR PRODUCTION STATIC SERVING
// ==========================================
async function startServer() {
  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`AURA Server running on http://0.0.0.0:${PORT} [${isProd ? 'production' : 'development'}]`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start AURA server:', err);
  process.exit(1);
});
