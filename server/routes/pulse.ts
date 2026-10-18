import { Router } from 'express';
import { PulseManager } from '../pulse';
import { asyncHandler, postSchemas, pulseRateLimit, validateBody } from '../services/http';
import { getSimSpeed } from '../services/simClock';
import { supabase } from '../services/supabase';

export const pulseManager = new PulseManager(supabase, getSimSpeed);
export const pulseRouter = Router();

pulseRouter.get('/pulse', (_request, response) => response.json(pulseManager.getState()));

pulseRouter.post('/pulse', pulseRateLimit, validateBody(postSchemas.pulse), asyncHandler(async (request, response) => {
  return response.json(await pulseManager.update(request.body));
}));