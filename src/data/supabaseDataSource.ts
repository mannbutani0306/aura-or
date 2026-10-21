import {
  Zone,
  RoadEdge,
  Ambulance,
  Emergency,
  Dispatch,
} from '../types';
import { DataSource, ConnectionStatus, EventLogRow } from './DataSource';
import { supabase, hasSupabaseConfig } from './supabaseClient';
import type { SolveRequest, SolveResponse } from '../utils/solver';
import { RealtimeChannel } from '@supabase/supabase-js';

function timestampValue(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function stateRows(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];
  return value.map((row) => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) throw new Error('State response contains an invalid row');
    return row as Record<string, unknown>;
  });
}

async function apiErrorMessage(response: Response, fallback: string): Promise<string> {
  const payload: unknown = await response.json().catch(() => null);
  if (!payload || typeof payload !== 'object') return fallback;
  const error = (payload as Record<string, unknown>).error;
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object' && typeof (error as Record<string, unknown>).message === 'string') {
    return String((error as Record<string, unknown>).message);
  }
  return fallback;
}

export class SupabaseDataSource implements DataSource {
  private zones: Zone[] = [];
  private roads: RoadEdge[] = [];
  private ambulances: Ambulance[] = [];
  private emergencies: Emergency[] = [];
  private dispatches: Dispatch[] = [];
  private eventLogs: EventLogRow[] = [];

  private connectionStatus: ConnectionStatus = 'connecting';
  private roundTripMs: number = 0;
  private lastSyncedAt: number | null = null;
  private lastError: string | null = null;
  private isDemoMode = false;
  private stateReady = false;

  private listeners: Set<() => void> = new Set();
  private connectionListeners: Set<
    (status: ConnectionStatus, rtt: number, lastSync: number | null, err: string | null) => void
  > = new Set();
  private eventLogListeners: Set<(logs: EventLogRow[]) => void> = new Set();

  private channel: RealtimeChannel | null = null;
  private readonly channelTopic = `aura_postgres_changes_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  private pingInterval: ReturnType<typeof setInterval> | null = null;
  private stateSyncInterval: ReturnType<typeof setInterval> | null = null;
  private isInitializing: boolean = false;

  constructor() {
    this.init();
  }

  isDemo(): boolean {
    return this.isDemoMode;
  }

  isReady(): boolean {
    return this.stateReady;
  }

  getConnectionStatus(): ConnectionStatus {
    return this.connectionStatus;
  }

  getRoundTripMs(): number {
    return this.roundTripMs;
  }

  getLastSyncedAt(): number | null {
    return this.lastSyncedAt;
  }

  getLastError(): string | null {
    return this.lastError;
  }

  getEventLogs(): EventLogRow[] {
    return [...this.eventLogs];
  }

  private setConnection(
    status: ConnectionStatus,
    rtt?: number,
    err?: string | null
  ) {
    this.connectionStatus = status;
    if (typeof rtt === 'number') this.roundTripMs = rtt;
    if (err !== undefined) this.lastError = err;
    if (status === 'live') {
      this.lastSyncedAt = Date.now();
      this.lastError = null;
    }
    this.notifyConnection();
  }

  private notify() {
    this.listeners.forEach((l) => l());
  }

  private notifyConnection() {
    this.connectionListeners.forEach((l) =>
      l(this.connectionStatus, this.roundTripMs, this.lastSyncedAt, this.lastError)
    );
  }

  private notifyEventLogs() {
    this.eventLogListeners.forEach((l) => l([...this.eventLogs]));
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  subscribeConnection(
    listener: (
      status: ConnectionStatus,
      roundTripMs: number,
      lastSyncedAt: number | null,
      lastError: string | null
    ) => void
  ): () => void {
    this.connectionListeners.add(listener);
    listener(this.connectionStatus, this.roundTripMs, this.lastSyncedAt, this.lastError);
    return () => this.connectionListeners.delete(listener);
  }

  subscribeEventLogs(listener: (logs: EventLogRow[]) => void): () => void {
    this.eventLogListeners.add(listener);
    listener([...this.eventLogs]);
    return () => this.eventLogListeners.delete(listener);
  }

  async init(): Promise<void> {
    if (this.isInitializing) return;
    if (!hasSupabaseConfig || !supabase) {
      this.enableDemoMode();
      return;
    }

    await this.initialLoad();
    if (!this.isDemoMode) {
      this.setupRealtime();
      this.startHeartbeat();
    }
  }

  enableDemoMode(): void {
    this.isDemoMode = true;
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('aura_demo_mode', 'true');
    }
    this.zones = [
      { id: 'A', name: 'Goripalayam', lat: 9.9325, lng: 78.1312, areaType: 'Urban', localMin: 2.0 },
      { id: 'B', name: 'Anna Nagar', lat: 9.9208, lng: 78.1489, areaType: 'Urban', localMin: 2.0 },
      { id: 'C', name: 'Periyar / Central', lat: 9.9174, lng: 78.1139, areaType: 'Urban', localMin: 2.5 },
      { id: 'D', name: 'K.K. Nagar', lat: 9.9381, lng: 78.1523, areaType: 'Urban', localMin: 2.0 },
      { id: 'E', name: 'Simmakkal', lat: 9.9282, lng: 78.1219, areaType: 'Urban', localMin: 1.5 },
      { id: 'F', name: 'Villapuram', lat: 9.8973, lng: 78.1294, areaType: 'Urban', localMin: 2.0 },
    ];
    this.roads = [
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
    this.setConnection('degraded', 0, 'SIMULATION MODE · No live database connection');
    this.notify();

    // Poll /api/state periodically to stay in sync with simulation server
    const syncState = async () => {
      try {
        const resp = await fetch('/api/state');
        if (!resp.ok) throw new Error(await apiErrorMessage(resp, 'Unable to synchronize application state'));
        const data: unknown = await resp.json();
        if (!data || typeof data !== 'object' || (data as Record<string, unknown>).ok !== true) {
          throw new Error('State synchronization response is invalid');
        }
        const state = data as Record<string, unknown>;
        if (
          !Array.isArray(state.zones)
          || !Array.isArray(state.roads)
          || !Array.isArray(state.ambulances)
          || !Array.isArray(state.emergencies)
          || !Array.isArray(state.dispatches)
        ) {
          throw new Error('State synchronization response is missing operational data');
        }
        const warnings = Array.isArray(state.warnings)
          ? state.warnings.filter((warning): warning is string => typeof warning === 'string')
          : [];
        if (Array.isArray(state.ambulances)) {
          this.ambulances = stateRows(state.ambulances).map((row) => ({
            id: String(row.id),
            zoneId: String(row.zone_id ?? row.zoneId ?? 'A'),
            type: row.type === 'ALS' ? 'ALS' : 'BLS',
            status: row.status === 'Busy' || row.status === 'Offline' ? row.status : 'Available',
            updatedAt: timestampValue(row.updated_at) ?? Date.now(),
          }));
        }
        if (Array.isArray(state.emergencies)) {
          this.emergencies = stateRows(state.emergencies).map((row) => {
            const priority = row.priority === 'High' || row.priority === 'Medium' || row.priority === 'Low' ? row.priority : 'Critical';
            return {
              id: String(row.id),
              zoneId: String(row.zone_id ?? row.zoneId ?? 'A'),
              priority,
              weight: Number(row.weight ?? (priority === 'Critical' ? 5 : priority === 'High' ? 3 : priority === 'Medium' ? 2 : 1)),
              requiresAls: Boolean(row.requires_als ?? row.requiresAls ?? (priority === 'Critical')),
              status: row.status === 'Dispatched' || row.status === 'Completed' || row.status === 'Cancelled' ? row.status : 'Pending',
              source: typeof row.source === 'string' ? row.source : undefined,
              requestedAt: timestampValue(row.requested_at) ?? Date.now(),
              updatedAt: timestampValue(row.updated_at) ?? Date.now(),
            };
          });
        }
        if (Array.isArray(state.dispatches)) {
          this.dispatches = stateRows(state.dispatches).map((row) => {
            const rawPath: unknown = typeof row.path === 'string' ? JSON.parse(row.path) as unknown : row.path;
            if (!Array.isArray(rawPath) || rawPath.some((zone) => typeof zone !== 'string')) {
              throw new Error(`Dispatch ${String(row.id)} has an invalid path value`);
            }
            return {
              id: String(row.id),
              emergencyId: String(row.emergency_id ?? row.emergencyId),
              ambulanceId: String(row.ambulance_id ?? row.ambulanceId),
              fromZone: String(row.from_zone ?? row.fromZone),
              toZone: String(row.to_zone ?? row.toZone),
              etaMin: Number(row.eta_min ?? row.etaMin ?? 0),
              benchmarkMin: Number(row.benchmark_min ?? row.benchmarkMin ?? 10),
              path: rawPath,
              status: row.status === 'OnScene' || row.status === 'Completed' || row.status === 'Cancelled' ? row.status : 'EnRoute',
              dispatchedAt: timestampValue(row.dispatched_at) ?? Date.now(),
              arrivedAt: timestampValue(row.arrived_at),
              completedAt: timestampValue(row.completed_at),
            };
          });
        }
        if (Array.isArray(state.events)) {
          this.eventLogs = stateRows(state.events).map((row) => ({
            id: typeof row.id === 'number' ? row.id : String(row.id),
            kind: typeof row.kind === 'string' ? row.kind : 'EVENT',
            entityIds: Array.isArray(row.entity_ids ?? row.entityIds) ? (row.entity_ids ?? row.entityIds) as string[] : null,
            details: row.details && typeof row.details === 'object' ? row.details as Record<string, unknown> : typeof row.details === 'string' ? row.details : null,
            createdAt: timestampValue(row.created_at ?? row.timestamp) ?? Date.now(),
          }));
          this.notifyEventLogs();
        }
        this.stateReady = true;
        this.notify();
        if (warnings.length) {
          this.setConnection('degraded', this.roundTripMs, warnings.join(' · '));
        } else if (!this.isDemoMode && this.lastError?.startsWith('event_log:')) {
          this.setConnection('live', this.roundTripMs, null);
        }
      } catch (reason: unknown) {
        const message = reason instanceof Error ? reason.message : 'State synchronization failed';
        if (!this.isDemoMode) this.enableDemoMode();
        if (hasSupabaseConfig && this.stateSyncInterval) {
          clearInterval(this.stateSyncInterval);
          this.stateSyncInterval = null;
        }
        this.setConnection('degraded', 0, `SIMULATION MODE · ${message}`);
      }
    };

    syncState();
    if (this.stateSyncInterval) clearInterval(this.stateSyncInterval);
    this.stateSyncInterval = setInterval(syncState, 1000);
  }

  async retryConnection(): Promise<void> {
    this.setConnection('connecting', this.roundTripMs, null);
    await this.init();
  }

  private async initialLoad(): Promise<void> {
    if (!supabase) {
      this.setConnection('offline', 0, 'Supabase client not initialized');
      return;
    }

    if (this.isInitializing) return;
    this.isInitializing = true;

    const start = performance.now();
    let eventLogError: string | null = null;
    try {
      const [
        zonesRes,
        roadsRes,
        ambsRes,
        emsRes,
        dispatchesRes,
        eventsRes,
      ] = await Promise.all([
        supabase.from('zones').select('*'),
        supabase.from('road_edges').select('*'),
        supabase.from('ambulances').select('*').order('id'),
        supabase.from('emergencies').select('*').order('requested_at', { ascending: false }),
        supabase.from('dispatches').select('*').order('dispatched_at', { ascending: false }),
        supabase.from('event_log').select('*').limit(60),
      ]);

      if (zonesRes.error) throw new Error(`zones: ${zonesRes.error.message}`);
      if (roadsRes.error) throw new Error(`road_edges: ${roadsRes.error.message}`);
      if (ambsRes.error) throw new Error(`ambulances: ${ambsRes.error.message}`);
      if (emsRes.error) throw new Error(`emergencies: ${emsRes.error.message}`);
      if (dispatchesRes.error) throw new Error(`dispatches: ${dispatchesRes.error.message}`);

      // Map Zones
      this.zones = (zonesRes.data || []).map((row: Record<string, unknown>) => {
        const areaType = typeof row.area_type === 'string' && (row.area_type === 'Urban' || row.area_type === 'Rural' || row.area_type === 'Tribal')
          ? row.area_type
          : 'Urban';
        return {
          id: String(row.id),
          name: String(row.name ?? row.id),
          lat: Number(row.lat),
          lng: Number(row.lng),
          areaType,
          localMin: typeof row.local_min === 'number' ? Number(row.local_min) : 2.0,
        };
      });

      // Map Road Edges
      this.roads = (roadsRes.data || []).map((row: Record<string, unknown>) => ({
        a: String(row.a),
        b: String(row.b),
        minutes: Number(row.minutes),
        blocked: Boolean(row.blocked),
      }));

      // Map Ambulances
      this.ambulances = (ambsRes.data || []).map((row: Record<string, unknown>) => ({
        id: String(row.id),
        zoneId: String(row.zone_id ?? row.zoneId ?? 'A'),
        type: row.type === 'ALS' ? 'ALS' : 'BLS',
        status: row.status === 'Busy' || row.status === 'Offline' ? row.status : 'Available',
        updatedAt: timestampValue(row.updated_at) ?? Date.now(),
      }));

      // Map Emergencies (weight & requires_als are generated columns in Supabase)
      this.emergencies = (emsRes.data || []).map((row: Record<string, unknown>) => {
        const priority = row.priority === 'High' || row.priority === 'Medium' || row.priority === 'Low' ? row.priority : 'Critical';
        return {
          id: String(row.id),
          zoneId: String(row.zone_id ?? row.zoneId ?? 'A'),
          priority,
          weight: Number(row.weight ?? (priority === 'Critical' ? 5 : priority === 'High' ? 3 : priority === 'Medium' ? 2 : 1)),
          requiresAls: Boolean(row.requires_als ?? row.requiresAls ?? (priority === 'Critical')),
          status: row.status === 'Dispatched' || row.status === 'Completed' || row.status === 'Cancelled' ? row.status : 'Pending',
          source: typeof row.source === 'string' ? row.source : undefined,
          requestedAt: timestampValue(row.requested_at) ?? Date.now(),
          updatedAt: timestampValue(row.updated_at) ?? Date.now(),
        };
      });

      // Map Dispatches
      this.dispatches = (dispatchesRes.data || []).map((row: Record<string, unknown>) => {
        const rawPath: unknown = row.path;
        const path = Array.isArray(rawPath)
          ? rawPath.filter((zone): zone is string => typeof zone === 'string')
          : typeof rawPath === 'string'
            ? (() => {
                const parsed: unknown = JSON.parse(rawPath);
                if (!Array.isArray(parsed) || parsed.some((zone) => typeof zone !== 'string')) {
                  throw new Error(`Dispatch ${String(row.id)} has an invalid path value`);
                }
                return parsed as string[];
              })()
            : [];
        return {
          id: String(row.id),
          emergencyId: String(row.emergency_id ?? row.emergencyId),
          ambulanceId: String(row.ambulance_id ?? row.ambulanceId),
          fromZone: String(row.from_zone ?? row.fromZone),
          toZone: String(row.to_zone ?? row.toZone),
          etaMin: Number(row.eta_min ?? row.etaMin ?? 0),
          benchmarkMin: Number(row.benchmark_min ?? row.benchmarkMin ?? 0),
          path,
          status: row.status === 'OnScene' || row.status === 'Completed' || row.status === 'Cancelled' ? row.status : 'EnRoute',
          dispatchedAt: timestampValue(row.dispatched_at) ?? Date.now(),
          arrivedAt: timestampValue(row.arrived_at),
          completedAt: timestampValue(row.completed_at),
        };
      });

      // Map Event Logs (if table exists)
      if (eventsRes.error) {
        eventLogError = `event_log: ${eventsRes.error.message}`;
      } else if (eventsRes.data) {
        this.eventLogs = stateRows(eventsRes.data).map((row) => ({
          id: row.id !== undefined ? String(row.id) : '',
          kind: typeof row.kind === 'string' ? row.kind : 'EVENT',
          entityIds: Array.isArray(row.entity_ids ?? row.entityIds) ? (row.entity_ids ?? row.entityIds) as string[] : null,
          details: typeof row.details === 'string' ? row.details : typeof row.payload === 'string' ? row.payload : null,
          createdAt: timestampValue(row.created_at ?? row.timestamp) ?? Date.now(),
        }));
        this.notifyEventLogs();
      }

      this.isDemoMode = false;
      this.stateReady = true;
      const elapsed = Math.round(performance.now() - start);
      this.setConnection(eventLogError ? 'degraded' : 'live', elapsed, eventLogError);
      this.notify();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to connect to Supabase';
      this.enableDemoMode();
      this.setConnection('degraded', 0, `SIMULATION MODE · ${message}`);
    } finally {
      this.isInitializing = false;
    }
  }

  private setupRealtime() {
    if (!supabase || this.channel) return;

    this.channel = supabase
      .channel(this.channelTopic)
      // 1. Ambulances Realtime
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'ambulances' },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            const row = payload.new as Record<string, unknown>;
            const item: Ambulance = {
              id: String(row.id),
              zoneId: String(row.zone_id ?? row.zoneId ?? 'A'),
              type: row.type === 'ALS' ? 'ALS' : 'BLS',
              status: row.status === 'Busy' || row.status === 'Offline' ? row.status : 'Available',
              updatedAt: Date.now(),
            };
            this.ambulances = [
              ...this.ambulances.filter((a) => a.id !== item.id),
              item,
            ].sort((a, b) => a.id.localeCompare(b.id));
          } else if (payload.eventType === 'UPDATE') {
            const row = payload.new as Record<string, unknown>;
            this.ambulances = this.ambulances.map((a) =>
              a.id === String(row.id)
                ? {
                    ...a,
                    zoneId: String(row.zone_id ?? row.zoneId ?? a.zoneId),
                    type: row.type === 'ALS' ? 'ALS' : a.type,
                    status: row.status === 'Busy' || row.status === 'Offline' ? row.status : a.status,
                    updatedAt: Date.now(),
                  }
                : a
            );
          } else if (payload.eventType === 'DELETE') {
            const oldId = String((payload.old as Record<string, unknown>).id);
            this.ambulances = this.ambulances.filter((a) => a.id !== oldId);
          }
          this.notify();
        }
      )
      // 2. Emergencies Realtime
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'emergencies' },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            const row: any = payload.new;
            const item: Emergency = {
              id: String(row.id),
              zoneId: String(row.zone_id || row.zoneId),
              priority: row.priority || 'Critical',
              weight: Number(row.weight ?? (row.priority === 'Critical' ? 5 : 3)),
              requiresAls: Boolean(row.requires_als ?? (row.priority === 'Critical')),
              status: row.status || 'Pending',
              source: typeof row.source === 'string' ? row.source : undefined,
              requestedAt: row.requested_at ? new Date(row.requested_at).getTime() : Date.now(),
              updatedAt: Date.now(),
            };
            this.emergencies = [
              item,
              ...this.emergencies.filter((e) => e.id !== item.id),
            ];
          } else if (payload.eventType === 'UPDATE') {
            const row: any = payload.new;
            this.emergencies = this.emergencies.map((e) =>
              e.id === String(row.id)
                ? {
                    ...e,
                    zoneId: String(row.zone_id || row.zoneId || e.zoneId),
                    priority: row.priority || e.priority,
                    weight: Number(row.weight ?? e.weight),
                    requiresAls: Boolean(row.requires_als ?? e.requiresAls),
                    status: row.status || e.status,
                    source: typeof row.source === 'string' ? row.source : e.source,
                    updatedAt: Date.now(),
                  }
                : e
            );
          } else if (payload.eventType === 'DELETE') {
            const oldId = String((payload.old as any).id);
            this.emergencies = this.emergencies.filter((e) => e.id !== oldId);
          }
          this.notify();
        }
      )
      // 3. Dispatches Realtime
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'dispatches' },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            const row: any = payload.new;
            const item: Dispatch = {
              id: String(row.id),
              emergencyId: String(row.emergency_id || row.emergencyId),
              ambulanceId: String(row.ambulance_id || row.ambulanceId),
              fromZone: String(row.from_zone || row.fromZone),
              toZone: String(row.to_zone || row.toZone),
              etaMin: Number(row.eta_min ?? 0),
              benchmarkMin: Number(row.benchmark_min ?? 0),
              path: Array.isArray(row.path) ? row.path : [],
              status: row.status || 'EnRoute',
              dispatchedAt: row.dispatched_at ? new Date(row.dispatched_at).getTime() : Date.now(),
            };
            this.dispatches = [
              item,
              ...this.dispatches.filter((d) => d.id !== item.id),
            ];
          } else if (payload.eventType === 'UPDATE') {
            const row: any = payload.new;
            this.dispatches = this.dispatches.map((d) =>
              d.id === String(row.id)
                ? {
                    ...d,
                    status: row.status || d.status,
                    arrivedAt: row.arrived_at ? new Date(row.arrived_at).getTime() : d.arrivedAt,
                    completedAt: row.completed_at ? new Date(row.completed_at).getTime() : d.completedAt,
                  }
                : d
            );
          } else if (payload.eventType === 'DELETE') {
            const oldId = String((payload.old as any).id);
            this.dispatches = this.dispatches.filter((d) => d.id !== oldId);
          }
          this.notify();
        }
      )
      // 4. Road Edges Realtime (for blockage toggles)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'road_edges' },
        (payload) => {
          if (payload.eventType === 'UPDATE' || payload.eventType === 'INSERT') {
            const row: any = payload.new;
            this.roads = this.roads.map((r) =>
              (r.a === row.a && r.b === row.b) || (r.a === row.b && r.b === row.a)
                ? { ...r, blocked: Boolean(row.blocked), minutes: Number(row.minutes ?? r.minutes) }
                : r
            );
            this.notify();
          }
        }
      )
      // 5. App Config Realtime
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'app_config' },
        () => {
          this.notify();
        }
      )
      // 6. Event Log Realtime
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'event_log' },
        (payload) => {
          const row: any = payload.new;
          const entry: EventLogRow = {
            id: row.id,
            kind: row.kind || 'EVENT',
            entityIds: row.entity_ids || row.entityIds || null,
            details: row.details || row.payload || null,
            createdAt: row.created_at ? new Date(row.created_at).getTime() : Date.now(),
          };
          this.eventLogs = [entry, ...this.eventLogs].slice(0, 100);
          this.notifyEventLogs();
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          this.setConnection('live');
        } else if (status === 'TIMED_OUT' || status === 'CHANNEL_ERROR') {
          this.setConnection('degraded', undefined, `Realtime status: ${status}`);
        } else if (status === 'CLOSED') {
          this.setConnection('offline', undefined, 'Realtime connection closed');
        }
      });
  }

  private startHeartbeat() {
    if (this.pingInterval) clearInterval(this.pingInterval);
    this.pingInterval = setInterval(async () => {
      if (!supabase) return;
      const start = performance.now();
      try {
        const { error } = await supabase.from('zones').select('id').limit(1);
        if (error) {
          this.setConnection('degraded', undefined, error.message);
        } else {
          const rtt = Math.round(performance.now() - start);
          this.setConnection('live', rtt);
        }
      } catch (err: any) {
        this.setConnection('offline', 0, err.message || 'Heartbeat ping failed');
      }
    }, 12000);
  }

  // --- Read Operations ---
  async getZones(): Promise<Zone[]> {
    return [...this.zones];
  }

  async getRoads(): Promise<RoadEdge[]> {
    return [...this.roads];
  }

  async getAmbulances(): Promise<Ambulance[]> {
    return [...this.ambulances];
  }

  async getEmergencies(): Promise<Emergency[]> {
    return [...this.emergencies];
  }

  async getDispatches(): Promise<Dispatch[]> {
    return [...this.dispatches];
  }

  // --- Fleet Writes ---
  async createAmbulance(input: {
    id?: string;
    zoneId: string;
    type: Ambulance['type'];
    status: Ambulance['status'];
  }): Promise<Ambulance> {
    if (!supabase) throw new Error('Supabase not connected');
    if (input.status === 'Busy') throw new Error('A unit can become Busy only through dispatch');

    const id = input.id || `A${Date.now().toString().slice(-4)}`;
    const payload = {
      id,
      zone_id: input.zoneId,
      type: input.type,
      status: input.status,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase.from('ambulances').insert(payload).select().single();
    if (error) {
      throw new Error(error.message);
    }

    const created: Ambulance = {
      id: String(data.id),
      zoneId: String(data.zone_id),
      type: data.type,
      status: data.status,
      updatedAt: Date.now(),
    };

    // Optimistic cache update
    this.ambulances = [...this.ambulances.filter((a) => a.id !== created.id), created].sort((a, b) =>
      a.id.localeCompare(b.id)
    );
    this.notify();
    return created;
  }

  async updateAmbulance(id: string, updates: Partial<Ambulance>): Promise<Ambulance> {
    if (!supabase) throw new Error('Supabase not connected');
    if (updates.status !== undefined) throw new Error('Unit status changes must use the dispatch lifecycle');
    const current = this.ambulances.find((ambulance) => ambulance.id === id);
    if (updates.zoneId && current?.status === 'Busy') throw new Error('A Busy unit cannot change base station');

    const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (updates.zoneId) payload.zone_id = updates.zoneId;
    if (updates.type) payload.type = updates.type;
    if (updates.status) payload.status = updates.status;

    const { data, error } = await supabase
      .from('ambulances')
      .update(payload)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      throw new Error(error.message);
    }

    const updated: Ambulance = {
      id: String(data.id),
      zoneId: String(data.zone_id),
      type: data.type,
      status: data.status,
      updatedAt: Date.now(),
    };

    this.ambulances = this.ambulances.map((a) => (a.id === id ? updated : a));
    this.notify();
    return updated;
  }

  async deleteAmbulance(id: string): Promise<void> {
    if (!supabase) throw new Error('Supabase not connected');

    const { error } = await supabase.from('ambulances').delete().eq('id', id);
    if (error) {
      throw new Error(error.message);
    }

    this.ambulances = this.ambulances.filter((a) => a.id !== id);
    this.notify();
  }

  async restoreAmbulance(ambulance: Ambulance): Promise<Ambulance> {
    return this.createAmbulance(ambulance);
  }

  // --- Emergency Writes ---
  // CRITICAL RULE: weight and requires_als are GENERATED columns in PostgreSQL; never insert them.
  // id has default 'E'||seq; omit id on insert to let database sequence generate it.
  async createEmergency(input: {
    zoneId: string;
    priority: Emergency['priority'];
    source?: Emergency['source'];
    weight?: number;
    requiresAls?: boolean;
  }): Promise<Emergency> {
    if (!supabase) {
      const resp = await fetch('/api/emergencies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      if (!resp.ok) throw new Error(await apiErrorMessage(resp, 'Failed to create emergency'));
      const data = await resp.json();
      const created: Emergency = {
        id: String(data.id),
        zoneId: String(data.zoneId || data.zone_id),
        priority: data.priority,
        weight: Number(data.weight ?? (data.priority === 'Critical' ? 5 : 3)),
        requiresAls: Boolean(data.requiresAls ?? data.requires_als ?? (data.priority === 'Critical')),
        status: data.status || 'Pending',
        source: typeof data.source === 'string' ? data.source : undefined,
        requestedAt: data.requestedAt || (data.requested_at ? new Date(data.requested_at).getTime() : Date.now()),
        updatedAt: Date.now(),
      };
      this.emergencies = [created, ...this.emergencies.filter((e) => e.id !== created.id)];
      this.notify();
      return created;
    }

    const payload: Record<string, unknown> = {
      zone_id: input.zoneId,
      priority: input.priority,
      status: 'Pending',
      requested_at: new Date().toISOString(),
    };
    if (input.source) payload.source = input.source;

    const { data, error } = await supabase.from('emergencies').insert(payload).select().single();
    if (error) {
      throw new Error(error.message);
    }

    const created: Emergency = {
      id: String(data.id),
      zoneId: String(data.zone_id),
      priority: data.priority,
      weight: Number(data.weight ?? (data.priority === 'Critical' ? 5 : 3)),
      requiresAls: Boolean(data.requires_als ?? (data.priority === 'Critical')),
      status: data.status,
      source: typeof data.source === 'string' ? data.source : undefined,
      requestedAt: new Date(data.requested_at).getTime(),
      updatedAt: Date.now(),
    };

    this.emergencies = [created, ...this.emergencies.filter((e) => e.id !== created.id)];
    this.notify();
    return created;
  }

  async updateEmergencyStatus(id: string, status: Emergency['status']): Promise<Emergency> {
    if (!supabase) throw new Error('Supabase not connected');

    const { data, error } = await supabase
      .from('emergencies')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      throw new Error(error.message);
    }

    const updated: Emergency = {
      id: String(data.id),
      zoneId: String(data.zone_id),
      priority: data.priority,
      weight: Number(data.weight),
      requiresAls: Boolean(data.requires_als),
      status: data.status,
      requestedAt: new Date(data.requested_at).getTime(),
      updatedAt: Date.now(),
    };

    this.emergencies = this.emergencies.map((e) => (e.id === id ? updated : e));
    this.notify();
    return updated;
  }

  async updateEmergency(id: string, updates: Partial<Emergency>): Promise<Emergency> {
    if (!supabase) throw new Error('Supabase not connected');

    const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (updates.zoneId) payload.zone_id = updates.zoneId;
    if (updates.priority) payload.priority = updates.priority;
    if (updates.status) payload.status = updates.status;
    // Note: NEVER update weight or requires_als as they are generated columns

    const { data, error } = await supabase
      .from('emergencies')
      .update(payload)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      throw new Error(error.message);
    }

    const updated: Emergency = {
      id: String(data.id),
      zoneId: String(data.zone_id),
      priority: data.priority,
      weight: Number(data.weight),
      requiresAls: Boolean(data.requires_als),
      status: data.status,
      requestedAt: new Date(data.requested_at).getTime(),
      updatedAt: Date.now(),
    };

    this.emergencies = this.emergencies.map((e) => (e.id === id ? updated : e));
    this.notify();
    return updated;
  }

  async deleteEmergency(id: string): Promise<void> {
    if (!supabase) throw new Error('Supabase not connected');

    const { error } = await supabase.from('emergencies').delete().eq('id', id);
    if (error) {
      throw new Error(error.message);
    }

    this.emergencies = this.emergencies.filter((e) => e.id !== id);
    this.notify();
  }

  async restoreEmergency(emergency: Emergency): Promise<Emergency> {
    return this.createEmergency({
      zoneId: emergency.zoneId,
      priority: emergency.priority,
    });
  }

  // --- Dispatch Operations ---
  async createDispatch(input: {
    emergencyId: string;
    ambulanceId: string;
    fromZone: string;
    toZone: string;
    etaMin: number;
    benchmarkMin: number;
    path: string[];
  }): Promise<Dispatch> {
    if (!supabase) throw new Error('Supabase not connected');

    // First attempt RPC dispatch_batch if available, or direct insert
    const payload = {
      emergency_id: input.emergencyId,
      ambulance_id: input.ambulanceId,
      from_zone: input.fromZone,
      to_zone: input.toZone,
      eta_min: input.etaMin,
      benchmark_min: input.benchmarkMin,
      path: input.path,
      status: 'EnRoute',
      dispatched_at: new Date().toISOString(),
    };

    const { data, error } = await supabase.from('dispatches').insert(payload).select().single();
    if (error) {
      // Surface database trigger error verbatim
      throw new Error(error.message);
    }

    const created: Dispatch = {
      id: String(data.id),
      emergencyId: String(data.emergency_id),
      ambulanceId: String(data.ambulance_id),
      fromZone: String(data.from_zone),
      toZone: String(data.to_zone),
      etaMin: Number(data.eta_min),
      benchmarkMin: Number(data.benchmark_min),
      path: Array.isArray(data.path) ? data.path : input.path,
      status: data.status,
      dispatchedAt: new Date(data.dispatched_at).getTime(),
    };

    this.dispatches = [created, ...this.dispatches.filter((d) => d.id !== created.id)];
    this.notify();
    return created;
  }

  async updateDispatchStatus(id: string, status: Dispatch['status']): Promise<Dispatch> {
    if (!supabase) throw new Error('Supabase not connected');

    // 1. Check if RPC advance_dispatch is available
    try {
      const rpcRes = await supabase.rpc('advance_dispatch', {
        p_id: id,
        p_status: status,
      });
      if (!rpcRes.error) {
        await this.initialLoad();
        const found = this.dispatches.find((d) => d.id === id);
        if (found) return found;
      }
    } catch {
      // Fallback to table update
    }

    const updatePayload: Record<string, unknown> = {
      status,
    };
    if (status === 'OnScene') updatePayload.arrived_at = new Date().toISOString();
    if (status === 'Completed' || status === 'Cancelled') updatePayload.completed_at = new Date().toISOString();

    const { data, error } = await supabase
      .from('dispatches')
      .update(updatePayload)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      throw new Error(error.message);
    }

    const updated: Dispatch = {
      id: String(data.id),
      emergencyId: String(data.emergency_id),
      ambulanceId: String(data.ambulance_id),
      fromZone: String(data.from_zone),
      toZone: String(data.to_zone),
      etaMin: Number(data.eta_min),
      benchmarkMin: Number(data.benchmark_min),
      path: Array.isArray(data.path) ? data.path : [],
      status: data.status,
      dispatchedAt: new Date(data.dispatched_at).getTime(),
      arrivedAt: data.arrived_at ? new Date(data.arrived_at).getTime() : undefined,
      completedAt: data.completed_at ? new Date(data.completed_at).getTime() : undefined,
    };

    this.dispatches = this.dispatches.map((d) => (d.id === id ? updated : d));
    this.notify();
    return updated;
  }

  async dispatchBatch(
    items: Array<{
      emergencyId: string;
      ambulanceId: string;
      fromZone?: string;
      toZone?: string;
      etaMin: number;
      path: string[];
    }>,
    runId?: string
  ): Promise<{ ok: boolean; count: number }> {
    const resp = await fetch('/api/dispatch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: items.map((i) => ({
          emergency_id: i.emergencyId,
          ambulance_id: i.ambulanceId,
          from_zone: i.fromZone,
          to_zone: i.toZone,
          eta_min: i.etaMin,
          path: i.path,
        })),
        runId,
      }),
    });

    if (!resp.ok) {
      throw new Error(await apiErrorMessage(resp, `HTTP ${resp.status}: Batch dispatch failed`));
    }

    await this.initialLoad();
    this.notify();
    return { ok: true, count: items.length };
  }

  async advanceDispatch(id: string, status: 'OnScene' | 'Completed'): Promise<void> {
    const resp = await fetch(`/api/dispatch/${id}/advance`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });

    if (!resp.ok) {
      throw new Error(await apiErrorMessage(resp, `Failed to advance dispatch ${id}`));
    }

    await this.initialLoad();
    this.notify();
  }

  async cancelDispatch(id: string): Promise<void> {
    const resp = await fetch(`/api/dispatch/${id}/cancel`, {
      method: 'POST',
    });

    if (!resp.ok) {
      throw new Error(await apiErrorMessage(resp, `Failed to cancel dispatch ${id}`));
    }

    await this.initialLoad();
    this.notify();
  }

  async getSimSpeed(): Promise<number> {
    const response = await fetch('/api/sim');
    if (!response.ok) throw new Error(await apiErrorMessage(response, 'Simulation speed is unavailable'));
    const payload: unknown = await response.json();
    if (!payload || typeof payload !== 'object' || typeof (payload as Record<string, unknown>).speed !== 'number') {
      throw new Error('Simulation speed response is invalid');
    }
    return (payload as { speed: number }).speed;
  }

  async setSimSpeed(speed: number): Promise<number> {
    const response = await fetch('/api/sim', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ speed }),
    });
    if (!response.ok) throw new Error(await apiErrorMessage(response, 'Unable to set simulation speed'));
    const payload: unknown = await response.json();
    if (!payload || typeof payload !== 'object' || typeof (payload as Record<string, unknown>).speed !== 'number') {
      throw new Error('Simulation speed response is invalid');
    }
    return (payload as { speed: number }).speed;
  }

  // --- Optimization Solver ---
  async solve(request: SolveRequest): Promise<SolveResponse> {
    const normalizedMode = request.mode === 'Plain' ? 'Plain' : 'Weighted';

    // 1. Authoritative Server Endpoint POST /api/solve
    try {
      const resp = await fetch('/api/solve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: normalizedMode.toLowerCase(),
          persist: request.persist ?? true,
        }),
      });

      if (resp.ok) {
        const data = (await resp.json()) as SolveResponse;
        if (data && data.matrix && data.assignments) {
          return data;
        }
      }
    } catch {
      // Continue to fallback
    }

    // 2. Fallback: Ad-hoc solver endpoint /api/solve-adhoc
    try {
      const resp = await fetch('/api/solve-adhoc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          units: this.ambulances.filter((u) => u.status === 'Available'),
          calls: this.emergencies.filter((c) => c.status === 'Pending'),
          zones: this.zones,
          edges: this.roads,
          mode: normalizedMode.toLowerCase(),
        }),
      });

      if (resp.ok) {
        const data = (await resp.json()) as SolveResponse;
        if (data && data.matrix && data.assignments) {
          return data;
        }
      }
    } catch {
      // Continue to in-memory engine fallback
    }

    // 3. Fallback: Direct in-memory HiGHS WASM + Hungarian solver
    const { executeDualSolver } = await import('../utils/solver');
    return await executeDualSolver(
      this.ambulances,
      this.emergencies,
      this.roads,
      this.zones,
      request
    );
  }

  // --- Road corridor writes ---
  async toggleRoadBlock(a: string, b: string): Promise<RoadEdge> {
    if (!supabase) throw new Error('Supabase not connected');

    const edge = this.roads.find(
      (r) => (r.a === a && r.b === b) || (r.a === b && r.b === a)
    );
    if (!edge) throw new Error(`Road corridor ${a}-${b} not found`);

    const nextBlocked = !edge.blocked;

    const { data, error } = await supabase
      .from('road_edges')
      .update({ blocked: nextBlocked })
      .or(`and(a.eq.${a},b.eq.${b}),and(a.eq.${b},b.eq.${a})`)
      .select()
      .single();

    if (error) {
      throw new Error(error.message);
    }

    const updated: RoadEdge = {
      a: data.a,
      b: data.b,
      minutes: Number(data.minutes),
      blocked: Boolean(data.blocked),
    };

    this.roads = this.roads.map((r) =>
      (r.a === a && r.b === b) || (r.a === b && r.b === a) ? updated : r
    );
    this.notify();
    return updated;
  }

  // --- Reset Demo RPC ---
  async resetDemo(): Promise<void> {
    if (supabase) {
      const { error } = await supabase.rpc('reset_demo');
      if (error) {
        throw new Error(error.message);
      }
      await this.initialLoad();
    } else {
      const response = await fetch('/api/reset-demo', { method: 'POST' });
      if (!response.ok) {
        throw new Error(await apiErrorMessage(response, 'Failed to reset scenario'));
      }
      const payload: unknown = await response.json();
      if (!payload || typeof payload !== 'object' || (payload as Record<string, unknown>).ok !== true) {
        throw new Error('Scenario reset response is invalid');
      }
      this.enableDemoMode();
    }
  }

  async reset(): Promise<void> {
    await this.resetDemo();
  }
}

export const supabaseDataSource = new SupabaseDataSource();
