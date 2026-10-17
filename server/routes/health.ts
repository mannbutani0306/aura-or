import { Router } from 'express';
import { ENGINE_NAME, ENGINE_VERSION, getHighsInstance } from '../../engine/assignment';
import { supabase } from '../services/supabase';
import { asyncHandler } from '../services/http';

export const healthRouter = Router();

healthRouter.get('/health', asyncHandler(async (_request, response) => {
  let dbOk = false;
  let dbLatencyMs = 0;
  if (supabase) {
    try {
      const start = performance.now();
      const { error } = await supabase.from('zones').select('id').limit(1);
      dbLatencyMs = Math.round(performance.now() - start);
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

  return response.json({
    ok: true,
    db: { ok: dbOk, latencyMs: dbLatencyMs },
    engine: { name: ENGINE_NAME, version: ENGINE_VERSION, solverLoaded },
  });
}));