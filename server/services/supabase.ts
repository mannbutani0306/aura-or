import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Ambulance, Emergency, RoadEdge, Zone } from '../../engine/types';

export interface ServerDispatch {
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

export interface FallbackEvent {
  id: string;
  kind: string;
  entityIds?: string[];
  details?: unknown;
  createdAt: number;
}

const SUPABASE_URL = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '').trim();
const SUPABASE_ANON_KEY = (process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '').trim();

export const supabase: SupabaseClient | null = SUPABASE_URL && SUPABASE_ANON_KEY
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

const baselineZones: Zone[] = [
  { id: 'A', name: 'Goripalayam', lat: 9.9325, lng: 78.1312, areaType: 'Urban', localMin: 2.0 },
  { id: 'B', name: 'Anna Nagar', lat: 9.9208, lng: 78.1489, areaType: 'Urban', localMin: 2.0 },
  { id: 'C', name: 'Periyar / Central', lat: 9.9174, lng: 78.1139, areaType: 'Urban', localMin: 2.5 },
  { id: 'D', name: 'K.K. Nagar', lat: 9.9381, lng: 78.1523, areaType: 'Urban', localMin: 2.0 },
  { id: 'E', name: 'Simmakkal', lat: 9.9282, lng: 78.1219, areaType: 'Urban', localMin: 1.5 },
  { id: 'F', name: 'Villapuram', lat: 9.8973, lng: 78.1294, areaType: 'Urban', localMin: 2.0 },
];

const baselineRoads: RoadEdge[] = [
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

const createBaselineAmbulances = (): Ambulance[] => [
  { id: 'A1', zoneId: 'A', type: 'BLS', status: 'Available', updatedAt: Date.now() },
  { id: 'A2', zoneId: 'B', type: 'BLS', status: 'Available', updatedAt: Date.now() },
  { id: 'A3', zoneId: 'C', type: 'ALS', status: 'Available', updatedAt: Date.now() },
  { id: 'A4', zoneId: 'D', type: 'ALS', status: 'Available', updatedAt: Date.now() },
  { id: 'A5', zoneId: 'E', type: 'BLS', status: 'Available', updatedAt: Date.now() },
];

const createBaselineEmergencies = (): Emergency[] => [
  { id: 'E1', zoneId: 'B', priority: 'Critical', weight: 5, requiresAls: true, status: 'Pending', requestedAt: Date.now() - 120000 },
  { id: 'E2', zoneId: 'F', priority: 'High', weight: 3, requiresAls: false, status: 'Pending', requestedAt: Date.now() - 90000 },
  { id: 'E3', zoneId: 'A', priority: 'Medium', weight: 2, requiresAls: false, status: 'Pending', requestedAt: Date.now() - 60000 },
  { id: 'E4', zoneId: 'D', priority: 'Critical', weight: 5, requiresAls: true, status: 'Pending', requestedAt: Date.now() - 40000 },
  { id: 'E5', zoneId: 'C', priority: 'High', weight: 3, requiresAls: false, status: 'Pending', requestedAt: Date.now() - 20000 },
];

export const fallbackState: {
  zones: Zone[];
  roads: RoadEdge[];
  ambulances: Ambulance[];
  emergencies: Emergency[];
  dispatches: ServerDispatch[];
  events: FallbackEvent[];
} = {
  zones: [...baselineZones],
  roads: [...baselineRoads],
  ambulances: createBaselineAmbulances(),
  emergencies: createBaselineEmergencies(),
  dispatches: [],
  events: [],
};

export function resetFallbackState(): void {
  fallbackState.ambulances = createBaselineAmbulances();
  fallbackState.emergencies = createBaselineEmergencies();
  fallbackState.dispatches = [];
  fallbackState.events.unshift({
    id: `evt-${Date.now()}`,
    kind: 'SCENARIO_RESET',
    details: 'Demo scenario reset to baseline allocation',
    createdAt: Date.now(),
  });
}