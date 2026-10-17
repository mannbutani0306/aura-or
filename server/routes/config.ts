import { Router } from 'express';
import { AppConfig, DEFAULT_CONFIG } from '../../engine/types';
import { asyncHandler, HttpError, postSchemas, validateBody } from '../services/http';
import { supabase } from '../services/supabase';

export const configRouter = Router();

const normaliseConfig = (input: Partial<AppConfig> | undefined): AppConfig => ({
  ...DEFAULT_CONFIG,
  ...input,
  max_response_min: input?.max_response_min ?? DEFAULT_CONFIG.max_response_min,
});

configRouter.get('/config', asyncHandler(async (_request, response) => {
  if (!supabase) {
    return response.json({ config: { ...DEFAULT_CONFIG } });
  }
  const { data, error } = await supabase
    .from('app_config')
    .select('sla_min, als_policy, als_penalty_min, unserved_min, max_response_min, service_min')
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return response.json({ config: normaliseConfig(data ?? undefined) });
}));

configRouter.put('/config', validateBody(postSchemas.config), asyncHandler(async (request, response) => {
  const config = normaliseConfig(request.body as Partial<AppConfig>);
  if (!supabase) {
    return response.json({ ok: true, config });
  }

  const { error } = await supabase.from('app_config').upsert({
    id: 1,
    sla_min: config.sla_min,
    als_policy: config.als_policy,
    als_penalty_min: config.als_penalty_min,
    unserved_min: config.unserved_min,
    max_response_min: config.max_response_min,
    service_min: config.service_min,
  }, { onConflict: 'id' });
  if (error) {
    throw new HttpError(500, 'APP_CONFIG_SAVE_FAILED', error.message);
  }
  return response.json({ ok: true, config });
}));
