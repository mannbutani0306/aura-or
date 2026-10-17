import { Router } from 'express';
import { Emergency } from '../../engine/types';
import { asyncHandler, postSchemas, validateBody } from '../services/http';
import { resetFallbackState, supabase, fallbackState } from '../services/supabase';
import { getSimSpeed } from '../services/simClock';

export const stateRouter = Router();

stateRouter.get('/dispatches', asyncHandler(async (_request, response) => {
  if (supabase) {
    const { data, error } = await supabase.from('dispatches').select('*').order('dispatched_at', { ascending: false });
    if (error) throw new Error(error.message);
    return response.json(data || []);
  }
  return response.json(fallbackState.dispatches);
}));

stateRouter.get('/state', asyncHandler(async (_request, response) => {
  if (supabase) {
    const [ambulances, emergencies, dispatches, zones, roads, events] = await Promise.all([
      supabase.from('ambulances').select('*').order('id'),
      supabase.from('emergencies').select('*').order('requested_at', { ascending: false }),
      supabase.from('dispatches').select('*').order('dispatched_at', { ascending: false }),
      supabase.from('zones').select('*'),
      supabase.from('road_edges').select('*'),
      supabase.from('event_log').select('*').order('created_at', { ascending: false }).limit(60),
    ]);
    return response.json({
      ok: true,
      ambulances: ambulances.data || [],
      emergencies: emergencies.data || [],
      dispatches: dispatches.data || [],
      zones: zones.data || [],
      roads: roads.data || [],
      events: events.data || [],
      simSpeed: getSimSpeed(),
    });
  }
  return response.json({
    ok: true,
    ambulances: fallbackState.ambulances,
    emergencies: fallbackState.emergencies,
    dispatches: fallbackState.dispatches,
    zones: fallbackState.zones,
    roads: fallbackState.roads,
    events: fallbackState.events,
    simSpeed: getSimSpeed(),
  });
}));

stateRouter.post('/emergencies', validateBody(postSchemas.emergency), asyncHandler(async (request, response) => {
  const body = request.body as {
    zoneId: string;
    priority: Emergency['priority'];
    requiresAls?: boolean;
    source?: string;
  };
  const weight = body.priority === 'Critical' ? 5 : body.priority === 'High' ? 3 : body.priority === 'Medium' ? 2 : 1;
  if (supabase) {
    const payload: Record<string, unknown> = {
      zone_id: body.zoneId,
      priority: body.priority,
      status: 'Pending',
      requested_at: new Date().toISOString(),
    };
    if (body.source === 'simulated') payload.source = 'simulated';
    const { data, error } = await supabase.from('emergencies').insert(payload).select().single();
    if (error) throw new Error(error.message);
    return response.json(data);
  }

  const newEmergency: Emergency = {
    id: `E${Date.now().toString().slice(-4)}`,
    zoneId: body.zoneId,
    priority: body.priority,
    weight,
    requiresAls: body.requiresAls ?? true,
    status: 'Pending',
    source: body.source === 'simulated' ? 'simulated' : undefined,
    requestedAt: Date.now(),
    updatedAt: Date.now(),
  };
  fallbackState.emergencies.unshift(newEmergency);
  fallbackState.events.unshift({
    id: `evt-${Date.now()}`,
    kind: 'EMERGENCY_REPORTED',
    entityIds: [newEmergency.id],
    details: { zoneId: body.zoneId, priority: body.priority },
    createdAt: Date.now(),
  });
  return response.json(newEmergency);
}));

stateRouter.post('/reset-demo', validateBody(postSchemas.reset), asyncHandler(async (_request, response) => {
  if (supabase) {
    try {
      await supabase.rpc('reset_demo');
    } catch {
      // Preserve the original reset behavior if the RPC is unavailable.
    }
  }
  resetFallbackState();
  return response.json({ ok: true });
}));