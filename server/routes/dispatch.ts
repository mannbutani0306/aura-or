import { Router } from 'express';
import { asyncHandler, HttpError, postSchemas, validateBody } from '../services/http';
import { cancelDispatch, advanceDispatch } from '../services/simClock';
import { ServerDispatch, supabase, fallbackState } from '../services/supabase';

export const dispatchRouter = Router();

interface DispatchInput {
  emergencyId?: string;
  emergency_id?: string;
  ambulanceId?: string;
  ambulance_id?: string;
  fromZone?: string;
  from_zone?: string;
  toZone?: string;
  to_zone?: string;
  etaMin?: number;
  eta_min?: number;
  benchmarkMin?: number;
  benchmark_min?: number;
  path?: string[];
}

const emergencyIdOf = (item: DispatchInput) => String(item.emergency_id || item.emergencyId);
const ambulanceIdOf = (item: DispatchInput) => String(item.ambulance_id || item.ambulanceId);

dispatchRouter.post('/dispatch', validateBody(postSchemas.dispatch), asyncHandler(async (request, response) => {
  const { items, runId } = request.body as { items: DispatchInput[]; runId?: string | null };
  if (supabase) {
    try {
      const rpcResult = await supabase.rpc('dispatch_batch', { p_items: items, p_run_id: runId || null });
      if (!rpcResult.error) return response.json({ ok: true, count: items.length, runId });
    } catch {
      // Continue through the table-validation path if the RPC is unavailable.
    }

    const ambulanceIds = items.map(ambulanceIdOf);
    const emergencyIds = items.map(emergencyIdOf);
    const [ambulances, emergencies] = await Promise.all([
      supabase.from('ambulances').select('id, status').in('id', ambulanceIds),
      supabase.from('emergencies').select('id, status').in('id', emergencyIds),
    ]);
    if (ambulances.error) throw new Error(ambulances.error.message);
    if (emergencies.error) throw new Error(emergencies.error.message);
    for (const ambulance of ambulances.data || []) {
      if (ambulance.status !== 'Available') {
        throw new HttpError(400, 'DISPATCH_REJECTED', `Database constraint: Ambulance ${ambulance.id} is already ${ambulance.status} (expected Available).`);
      }
    }
    for (const emergency of emergencies.data || []) {
      if (emergency.status !== 'Pending') {
        throw new HttpError(400, 'DISPATCH_REJECTED', `Database constraint: Emergency ${emergency.id} is already ${emergency.status} (expected Pending).`);
      }
    }

    const dispatchRows = items.map((item) => ({
      emergency_id: item.emergency_id || item.emergencyId,
      ambulance_id: item.ambulance_id || item.ambulanceId,
      from_zone: item.from_zone || item.fromZone,
      to_zone: item.to_zone || item.toZone,
      eta_min: Number(item.eta_min ?? item.etaMin),
      benchmark_min: Number(item.benchmark_min ?? item.benchmarkMin ?? 10.0),
      path: item.path || [],
      status: 'EnRoute',
      dispatched_at: new Date().toISOString(),
    }));
    const inserted = await supabase.from('dispatches').insert(dispatchRows).select();
    if (inserted.error) throw new Error(inserted.error.message);
    const { error: ambulanceUpdateError } = await supabase.from('ambulances')
      .update({ status: 'Busy', updated_at: new Date().toISOString() }).in('id', ambulanceIds);
    if (ambulanceUpdateError) throw new Error(ambulanceUpdateError.message);
    const { error: emergencyUpdateError } = await supabase.from('emergencies')
      .update({ status: 'Dispatched', updated_at: new Date().toISOString() }).in('id', emergencyIds);
    if (emergencyUpdateError) throw new Error(emergencyUpdateError.message);
    try {
      await supabase.from('event_log').insert({
        kind: 'DISPATCH_BATCH', entity_ids: ambulanceIds, details: { count: items.length, runId }, created_at: new Date().toISOString(),
      });
    } catch {
      // Event logging remains best-effort.
    }
    return response.json({ ok: true, count: items.length, dispatches: inserted.data });
  }

  for (const item of items) {
    const ambulanceId = ambulanceIdOf(item);
    const emergencyId = emergencyIdOf(item);
    const ambulance = fallbackState.ambulances.find((candidate) => candidate.id === ambulanceId);
    if (!ambulance || ambulance.status !== 'Available') {
      throw new HttpError(400, 'DISPATCH_REJECTED', `Database constraint: Ambulance ${ambulanceId} is already ${ambulance?.status || 'Unknown'} (expected Available).`);
    }
    const emergency = fallbackState.emergencies.find((candidate) => candidate.id === emergencyId);
    if (!emergency || emergency.status !== 'Pending') {
      throw new HttpError(400, 'DISPATCH_REJECTED', `Database constraint: Emergency ${emergencyId} is already ${emergency?.status || 'Unknown'} (expected Pending).`);
    }
  }

  const created: ServerDispatch[] = [];
  for (const item of items) {
    const ambulanceId = ambulanceIdOf(item);
    const emergencyId = emergencyIdOf(item);
    const ambulance = fallbackState.ambulances.find((candidate) => candidate.id === ambulanceId)!;
    const emergency = fallbackState.emergencies.find((candidate) => candidate.id === emergencyId)!;
    ambulance.status = 'Busy';
    ambulance.updatedAt = Date.now();
    emergency.status = 'Dispatched';
    emergency.updatedAt = Date.now();
    const dispatch: ServerDispatch = {
      id: `disp-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      emergency_id: emergencyId,
      ambulance_id: ambulanceId,
      from_zone: item.from_zone || item.fromZone || ambulance.zoneId,
      to_zone: item.to_zone || item.toZone || emergency.zoneId,
      eta_min: Number(item.eta_min ?? item.etaMin),
      benchmark_min: Number(item.benchmark_min ?? item.benchmarkMin ?? 10.0),
      path: item.path || [ambulance.zoneId, emergency.zoneId],
      status: 'EnRoute',
      dispatched_at: new Date().toISOString(),
    };
    fallbackState.dispatches.unshift(dispatch);
    created.push(dispatch);
  }
  fallbackState.events.unshift({
    id: `evt-${Date.now()}`,
    kind: 'DISPATCH_BATCH',
    entityIds: items.map((item) => item.ambulance_id || item.ambulanceId || ''),
    details: { count: items.length, runId },
    createdAt: Date.now(),
  });
  return response.json({ ok: true, count: items.length, dispatches: created });
}));

dispatchRouter.post('/dispatch/:id/advance', validateBody(postSchemas.advance), asyncHandler(async (request, response) => {
  const { status } = request.body as { status: 'OnScene' | 'Completed' };
  const id = String(request.params.id);
  await advanceDispatch(id, status);
  return response.json({ ok: true, id, status });
}));

dispatchRouter.post('/dispatch/:id/cancel', validateBody(postSchemas.cancel), asyncHandler(async (request, response) => {
  const id = String(request.params.id);
  await cancelDispatch(id);
  return response.json({ ok: true, id, status: 'Cancelled' });
}));