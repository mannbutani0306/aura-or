import { supabase, fallbackState, ServerDispatch } from './supabase';

const SERVICE_TIME_MIN = 8.0;
let simSpeed = 1;
let simulationTimer: ReturnType<typeof setInterval> | null = null;

export function getSimSpeed(): number {
  return simSpeed;
}

export function setSimSpeed(speed: number): void {
  simSpeed = speed;
}

export function getServiceTimeMin(): number {
  return SERVICE_TIME_MIN;
}

export async function advanceDispatch(id: string, nextStatus: 'OnScene' | 'Completed'): Promise<{ ok: true }> {
  if (supabase) {
    try {
      const rpcResult = await supabase.rpc('advance_dispatch', { p_id: id, p_status: nextStatus });
      if (!rpcResult.error) return { ok: true };
    } catch {
      // The direct transition path supports installations without the RPC.
    }

    const { data: dispatch, error: fetchError } = await supabase
      .from('dispatches')
      .select('*')
      .eq('id', id)
      .single();
    if (fetchError || !dispatch) throw new Error(fetchError?.message || `Dispatch ${id} not found`);

    if (nextStatus === 'OnScene') {
      if (dispatch.status !== 'EnRoute') {
        throw new Error(`Illegal state transition: cannot advance from ${dispatch.status} to OnScene`);
      }
      const arrivedAt = new Date().toISOString();
      const { error } = await supabase.from('dispatches').update({ status: 'OnScene', arrived_at: arrivedAt }).eq('id', id);
      if (error) throw new Error(error.message);
      try {
        await supabase.from('event_log').insert({
          kind: 'DISPATCH_ON_SCENE',
          entity_ids: [dispatch.ambulance_id, dispatch.emergency_id],
          details: { dispatchId: id, arrivedAt },
          created_at: arrivedAt,
        });
      } catch {
        // Event logging remains best-effort, as in the original implementation.
      }
      return { ok: true };
    }

    if (dispatch.status !== 'OnScene' && dispatch.status !== 'EnRoute') {
      throw new Error(`Illegal state transition: cannot complete from ${dispatch.status}`);
    }
    const completedAt = new Date().toISOString();
    const { error: dispatchError } = await supabase.from('dispatches').update({ status: 'Completed', completed_at: completedAt }).eq('id', id);
    if (dispatchError) throw new Error(dispatchError.message);
    const { error: ambulanceError } = await supabase.from('ambulances')
      .update({ status: 'Available', zone_id: dispatch.to_zone || dispatch.tozone, updated_at: completedAt })
      .eq('id', dispatch.ambulance_id);
    if (ambulanceError) throw new Error(ambulanceError.message);
    const { error: emergencyError } = await supabase.from('emergencies')
      .update({ status: 'Completed', updated_at: completedAt })
      .eq('id', dispatch.emergency_id);
    if (emergencyError) throw new Error(emergencyError.message);
    try {
      await supabase.from('event_log').insert({
        kind: 'DISPATCH_COMPLETED',
        entity_ids: [dispatch.ambulance_id, dispatch.emergency_id],
        details: { dispatchId: id, relocatedTo: dispatch.to_zone || dispatch.tozone },
        created_at: completedAt,
      });
    } catch {
      // Event logging remains best-effort, as in the original implementation.
    }
    return { ok: true };
  }

  const dispatch = fallbackState.dispatches.find((item) => item.id === id);
  if (!dispatch) throw new Error(`Dispatch ${id} not found`);

  if (nextStatus === 'OnScene') {
    if (dispatch.status !== 'EnRoute') {
      throw new Error(`Illegal state transition: cannot advance from ${dispatch.status} to OnScene`);
    }
    dispatch.status = 'OnScene';
    dispatch.arrived_at = new Date().toISOString();
    fallbackState.events.unshift({
      id: `evt-${Date.now()}`,
      kind: 'DISPATCH_ON_SCENE',
      entityIds: [dispatch.ambulance_id, dispatch.emergency_id],
      details: { dispatchId: id },
      createdAt: Date.now(),
    });
    return { ok: true };
  }

  dispatch.status = 'Completed';
  dispatch.completed_at = new Date().toISOString();
  const ambulance = fallbackState.ambulances.find((item) => item.id === dispatch.ambulance_id);
  if (ambulance) {
    ambulance.status = 'Available';
    ambulance.zoneId = dispatch.to_zone;
    ambulance.updatedAt = Date.now();
  }
  const emergency = fallbackState.emergencies.find((item) => item.id === dispatch.emergency_id);
  if (emergency) {
    emergency.status = 'Completed';
    emergency.updatedAt = Date.now();
  }
  fallbackState.events.unshift({
    id: `evt-${Date.now()}`,
    kind: 'DISPATCH_COMPLETED',
    entityIds: [dispatch.ambulance_id, dispatch.emergency_id],
    details: { dispatchId: id, relocatedTo: dispatch.to_zone },
    createdAt: Date.now(),
  });
  return { ok: true };
}

export async function cancelDispatch(id: string): Promise<{ ok: true }> {
  if (supabase) {
    const { data: dispatch, error } = await supabase.from('dispatches').select('*').eq('id', id).single();
    if (error || !dispatch) throw new Error(error?.message || `Dispatch ${id} not found`);
    const cancelledAt = new Date().toISOString();
    const { error: dispatchError } = await supabase.from('dispatches').update({ status: 'Cancelled' }).eq('id', id);
    if (dispatchError) throw new Error(dispatchError.message);
    const { error: ambulanceError } = await supabase.from('ambulances')
      .update({ status: 'Available', updated_at: cancelledAt }).eq('id', dispatch.ambulance_id);
    if (ambulanceError) throw new Error(ambulanceError.message);
    const { error: emergencyError } = await supabase.from('emergencies')
      .update({ status: 'Pending', updated_at: cancelledAt }).eq('id', dispatch.emergency_id);
    if (emergencyError) throw new Error(emergencyError.message);
    try {
      await supabase.from('event_log').insert({
        kind: 'DISPATCH_CANCELLED',
        entity_ids: [dispatch.ambulance_id, dispatch.emergency_id],
        details: { dispatchId: id },
        created_at: cancelledAt,
      });
    } catch {
      // Event logging remains best-effort, as in the original implementation.
    }
    return { ok: true };
  }

  const dispatch = fallbackState.dispatches.find((item) => item.id === id);
  if (!dispatch) throw new Error(`Dispatch ${id} not found`);
  dispatch.status = 'Cancelled';
  const ambulance = fallbackState.ambulances.find((item) => item.id === dispatch.ambulance_id);
  if (ambulance) {
    ambulance.status = 'Available';
    ambulance.updatedAt = Date.now();
  }
  const emergency = fallbackState.emergencies.find((item) => item.id === dispatch.emergency_id);
  if (emergency) {
    emergency.status = 'Pending';
    emergency.updatedAt = Date.now();
  }
  fallbackState.events.unshift({
    id: `evt-${Date.now()}`,
    kind: 'DISPATCH_CANCELLED',
    entityIds: [dispatch.ambulance_id, dispatch.emergency_id],
    details: { dispatchId: id },
    createdAt: Date.now(),
  });
  return { ok: true };
}

async function runSimulationTick(): Promise<void> {
  const now = Date.now();
  let activeDispatches: readonly unknown[] = [];
  if (supabase) {
    const { data, error } = await supabase.from('dispatches').select('*').in('status', ['EnRoute', 'OnScene']);
    if (!error && data) activeDispatches = data as unknown[];
  } else {
    activeDispatches = fallbackState.dispatches.filter((dispatch) => dispatch.status === 'EnRoute' || dispatch.status === 'OnScene');
  }

  for (const item of activeDispatches) {
    const dispatch = item as Record<string, unknown>;
    const dispatchId = String(dispatch.id);
    const dispatchedAt = dispatch.dispatched_at
      ? typeof dispatch.dispatched_at === 'number' ? dispatch.dispatched_at : new Date(String(dispatch.dispatched_at)).getTime()
      : now;
    const arrivedAt = dispatch.arrived_at
      ? typeof dispatch.arrived_at === 'number' ? dispatch.arrived_at : new Date(String(dispatch.arrived_at)).getTime()
      : undefined;
    const etaMin = Number(dispatch.eta_min ?? dispatch.etaMin ?? 5.0);

    if (dispatch.status === 'EnRoute') {
      const elapsedSimMin = ((now - dispatchedAt) / 1000) * (simSpeed / 1.0);
      if (elapsedSimMin >= etaMin) {
        await advanceDispatch(dispatchId, 'OnScene').catch((reason: unknown) => {
          console.warn(`Sim advance to OnScene failed for ${dispatchId}:`, reason instanceof Error ? reason.message : String(reason));
        });
      }
    } else if (dispatch.status === 'OnScene') {
      const onSceneBase = arrivedAt || dispatchedAt;
      const onSceneSimMin = ((now - onSceneBase) / 1000) * (simSpeed / 1.0);
      if (onSceneSimMin >= SERVICE_TIME_MIN) {
        await advanceDispatch(dispatchId, 'Completed').catch((reason: unknown) => {
          console.warn(`Sim advance to Completed failed for ${dispatchId}:`, reason instanceof Error ? reason.message : String(reason));
        });
      }
    }
  }
}

export function startSimulationClock(): void {
  if (simulationTimer) return;
  simulationTimer = setInterval(() => {
    void runSimulationTick().catch((reason: unknown) => {
      console.error('Simulation tick error:', reason);
    });
  }, 1000);
}

export function stopSimulationClock(): void {
  if (simulationTimer) clearInterval(simulationTimer);
  simulationTimer = null;
}

export type { ServerDispatch };