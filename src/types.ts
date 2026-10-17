/**
 * AURA Core Domain Types
 * Single source of truth for all domain entities.
 */

export type AreaType = 'Hospital' | 'Commercial' | 'Suburban' | 'Transit' | 'Industrial' | 'Residential';

export interface Zone {
  id: string;        // e.g. 'A', 'B', 'C', 'D', 'E', 'F'
  name: string;      // e.g. 'Goripalayam', 'Anna Nagar'
  lat: number;
  lng: number;
  areaType: AreaType;
  localMin?: number; // intra-zone transit baseline
}

export interface RoadEdge {
  a: string;         // zoneId
  b: string;         // zoneId
  minutes: number;
  blocked?: boolean;
}

export type AmbulanceType = 'BLS' | 'ALS';
export type AmbulanceStatus = 'Available' | 'Busy' | 'Offline';

export interface Ambulance {
  id: string;        // e.g. 'A1', 'A2'
  zoneId: string;    // e.g. 'A'
  type: AmbulanceType;
  status: AmbulanceStatus;
  updatedAt?: number; // Unix timestamp in ms
}

export type EmergencyPriority = 'Critical' | 'High' | 'Medium' | 'Low';
export type EmergencyStatus = 'Pending' | 'Dispatched' | 'Completed' | 'Cancelled';

export interface Emergency {
  id: string;        // e.g. 'E1', 'E2'
  zoneId: string;    // e.g. 'B'
  priority: EmergencyPriority;
  weight: number;    // 5=Critical, 3=High, 2=Medium, 1=Low
  requiresAls: boolean;
  status: EmergencyStatus;
  requestedAt: number; // Unix timestamp in ms
  updatedAt?: number;   // Unix timestamp in ms
}

export type DispatchStatus = 'EnRoute' | 'OnScene' | 'Completed' | 'Cancelled';

export interface Dispatch {
  id: string;
  emergencyId: string;
  ambulanceId: string;
  fromZone: string;
  toZone: string;
  etaMin: number;
  benchmarkMin: number;
  path: string[];
  status: DispatchStatus;
  dispatchedAt: number;
  arrivedAt?: number;
  completedAt?: number;
}

// Backward compatibility types for legacy solver/analytics services
export interface Assignment {
  em_id: string;
  amb_id: string;
  amb_zone: string;
  em_zone: string;
  travel_time: number;
  weight: number;
  weighted_time: number;
}

export interface UnservedEmergency {
  em_id: string;
  zone: string;
  priority: EmergencyPriority;
  weight: number;
  reason?: string;
}

export interface OptimizationResponse {
  status: 'Optimal' | 'Infeasible' | 'Suboptimal' | 'Error';
  objective_value: number;
  hungarian_objective: number;
  cross_check_passed: boolean;
  assignments: Assignment[];
  unserved_emergencies: UnservedEmergency[];
}

export interface RouteResponse {
  path: string[];
  total_time: number;
  status: 'Connected' | 'Disconnected' | 'Error';
  alternative_paths?: {
    path: string[];
    total_time: number;
    difference: number;
  }[];
}

export interface PerformanceMetrics {
  total_time: number;
  avg_time: number;
  critical_avg: number;
  max_time: number;
  utilization: number;
}

export interface AnalyticsResponse {
  baseline: PerformanceMetrics;
  optimized: PerformanceMetrics;
  improvement_pct: number;
}
