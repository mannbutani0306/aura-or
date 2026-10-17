/**
 * AURA Optimization Engine Types
 * Pure TypeScript types with zero UI / DOM dependencies.
 */

export type AreaType = 'Urban' | 'Rural' | 'Tribal';

export interface Zone {
  id: string;
  name: string;
  lat: number;
  lng: number;
  areaType: AreaType;
  localMin?: number;
}

export interface RoadEdge {
  a: string;
  b: string;
  minutes: number;
  blocked?: boolean;
}

export type AmbulanceType = 'BLS' | 'ALS';
export type AmbulanceStatus = 'Available' | 'Busy' | 'Offline';

export interface Ambulance {
  id: string;
  zoneId: string;
  type: AmbulanceType;
  status: AmbulanceStatus;
  updatedAt?: number;
}

export type EmergencyPriority = 'Critical' | 'High' | 'Medium' | 'Low';
export type EmergencyStatus = 'Pending' | 'Dispatched' | 'Completed' | 'Cancelled';

export interface Emergency {
  id: string;
  zoneId: string;
  priority: EmergencyPriority;
  weight: number;
  requiresAls: boolean;
  status: EmergencyStatus;
  source?: string;
  requestedAt: number;
  updatedAt?: number;
}

export interface AppConfig {
  sla_min: number;
  als_policy: 'hard' | 'penalty' | 'off';
  als_penalty_min: number;
  unserved_min: number;
  max_response_min: number | null;
  service_min: number;
}

export const DEFAULT_CONFIG: Readonly<AppConfig> = Object.freeze({
  sla_min: 14.5,
  als_policy: 'penalty',
  als_penalty_min: 6,
  unserved_min: 60,
  max_response_min: null,
  service_min: 8,
});

export interface TravelMatrix {
  ambulanceIds: string[];
  emergencyIds: string[];
  travelTimes: Record<string, Record<string, number | null>>; // ambId -> emId -> minutes; null if unreachable
  costs: Record<string, Record<string, number | null>>;        // ambId -> emId -> weighted minutes: w_j * t_ij
  feasibility: Record<string, Record<string, boolean>>;       // ambId -> emId -> boolean
  paths: Record<string, Record<string, string[]>>;            // ambId -> emId -> zone path array
  rawTimes: Record<string, Record<string, number>>;           // ambId -> emId -> raw number (Infinity if infeasible)
}

export interface SolveAssignment {
  emergencyId: string;
  ambulanceId: string;
  etaMin: number;
  weightedMin: number;
  weight: number;
  path: string[];
}

export interface SolveUnserved {
  emergencyId: string;
  reason: 'Exhausted' | 'No ALS' | 'No Route';
}

export interface PerformanceSummary {
  served: number;
  queued: number;
  totalWeightedMin: number;
  avgResponseMin: number;
  criticalAvgMin: number;
  worstResponseMin: number;
  slaHitsCount: number;
  utilization: number;
}

export interface SolveResponse {
  status: 'Optimal' | 'Infeasible' | 'Suboptimal';
  objective: number;
  crossCheck: {
    value: number;
    ok: boolean;
    method: string;
  };
  engine: string;
  engineVersion: string;
  solveMs: number;
  mode: 'Weighted' | 'Plain';
  matrix: {
    ambulanceIds: string[];
    emergencyIds: string[];
    travelTimes: Record<string, Record<string, number | null>>;
    costs: Record<string, Record<string, number | null>>;
    feasibility: Record<string, Record<string, boolean>>;
    paths: Record<string, Record<string, string[]>>;
  };
  assignments: SolveAssignment[];
  unserved: SolveUnserved[];
  baselines: {
    fcfs: PerformanceSummary;
    greedy: PerformanceSummary;
  };
  metrics: PerformanceSummary;
  runId?: string;
}
