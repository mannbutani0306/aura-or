import {
  Zone,
  RoadEdge,
  Ambulance,
  Emergency,
  Dispatch,
} from '../types';
import { SolveRequest, SolveResponse } from '../utils/solver';

export type ConnectionStatus = 'connecting' | 'live' | 'degraded' | 'offline';

export interface EventLogRow {
  id: string | number;
  kind: string;
  entityIds?: string[] | Record<string, unknown> | null;
  details?: Record<string, unknown> | string | null;
  createdAt: number;
}

export interface DataSource {
  isDemo(): boolean;
  isReady(): boolean;

  // Read operations
  getZones(): Promise<Zone[]>;
  getRoads(): Promise<RoadEdge[]>;
  getAmbulances(): Promise<Ambulance[]>;
  getEmergencies(): Promise<Emergency[]>;
  getDispatches(): Promise<Dispatch[]>;
  getEventLogs(): EventLogRow[];

  // Connection State & Telemetry
  getConnectionStatus(): ConnectionStatus;
  getRoundTripMs(): number;
  getLastSyncedAt(): number | null;
  getLastError(): string | null;
  retryConnection(): Promise<void>;
  subscribeConnection(
    listener: (
      status: ConnectionStatus,
      roundTripMs: number,
      lastSyncedAt: number | null,
      lastError: string | null
    ) => void
  ): () => void;
  subscribeEventLogs(listener: (logs: EventLogRow[]) => void): () => void;

  // Fleet writes
  createAmbulance(input: {
    id?: string;
    zoneId: string;
    type: Ambulance['type'];
    status: Ambulance['status'];
  }): Promise<Ambulance>;

  updateAmbulance(id: string, updates: Partial<Ambulance>): Promise<Ambulance>;
  deleteAmbulance(id: string): Promise<void>;
  restoreAmbulance(ambulance: Ambulance): Promise<Ambulance>;

  // Emergency writes (weight and requires_als are DB GENERATED columns)
  createEmergency(input: {
    zoneId: string;
    priority: Emergency['priority'];
    source?: Emergency['source'];
    weight?: number;
    requiresAls?: boolean;
  }): Promise<Emergency>;

  updateEmergencyStatus(id: string, status: Emergency['status']): Promise<Emergency>;
  updateEmergency(id: string, updates: Partial<Emergency>): Promise<Emergency>;
  deleteEmergency(id: string): Promise<void>;
  restoreEmergency(emergency: Emergency): Promise<Emergency>;

  // Dispatch operations
  createDispatch(input: {
    emergencyId: string;
    ambulanceId: string;
    fromZone: string;
    toZone: string;
    etaMin: number;
    benchmarkMin: number;
    path: string[];
  }): Promise<Dispatch>;

  dispatchBatch(
    items: Array<{
      emergencyId: string;
      ambulanceId: string;
      fromZone?: string;
      toZone?: string;
      etaMin: number;
      path: string[];
    }>,
    runId?: string
  ): Promise<{ ok: boolean; count: number }>;

  updateDispatchStatus(id: string, status: Dispatch['status']): Promise<Dispatch>;
  advanceDispatch(id: string, status: 'OnScene' | 'Completed'): Promise<void>;
  cancelDispatch(id: string): Promise<void>;

  // Simulation Clock Telemetry
  getSimSpeed(): Promise<number>;
  setSimSpeed(speed: number): Promise<number>;

  // Optimization Solver
  solve(request: SolveRequest): Promise<SolveResponse>;

  // Road corridor writes
  toggleRoadBlock(a: string, b: string): Promise<RoadEdge>;

  // Lifecycle & Sync
  subscribe(listener: () => void): () => void;
  resetDemo(): Promise<void>;
  reset(): Promise<void>;
  isDemo(): boolean;
  enableDemoMode?(): void;
}
