import { z } from 'zod';
import { AppConfig, DEFAULT_CONFIG } from '../../engine/types';
import { supabase } from './supabase';

const configSchema = z.object({
  sla_min: z.number().finite().positive(),
  als_policy: z.enum(['hard', 'penalty', 'off']),
  als_penalty_min: z.number().finite().nonnegative(),
  unserved_min: z.number().finite().positive(),
  max_response_min: z.number().finite().positive().nullable(),
  service_min: z.number().finite().positive(),
}) satisfies z.ZodType<AppConfig>;

const numericConfigValue = (value: unknown, fallback: number, field: string): number => {
  if (value === undefined || value === null) return fallback;
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(`app_config.${field} must be a finite number`);
  return number;
};

export async function loadConfig(): Promise<AppConfig> {
  if (!supabase) return { ...DEFAULT_CONFIG };

  const { data, error } = await supabase
    .from('app_config')
    .select('sla_min, als_policy, als_penalty_min, unserved_min, max_response_min, service_min')
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`app_config: ${error.message}`);
  if (!data) return { ...DEFAULT_CONFIG };

  const candidate = {
    sla_min: numericConfigValue(data.sla_min, DEFAULT_CONFIG.sla_min, 'sla_min'),
    als_policy: data.als_policy ?? DEFAULT_CONFIG.als_policy,
    als_penalty_min: numericConfigValue(data.als_penalty_min, DEFAULT_CONFIG.als_penalty_min, 'als_penalty_min'),
    unserved_min: numericConfigValue(data.unserved_min, DEFAULT_CONFIG.unserved_min, 'unserved_min'),
    max_response_min: data.max_response_min === null || data.max_response_min === undefined
      ? null
      : numericConfigValue(data.max_response_min, DEFAULT_CONFIG.max_response_min ?? DEFAULT_CONFIG.sla_min, 'max_response_min'),
    service_min: numericConfigValue(data.service_min, DEFAULT_CONFIG.service_min, 'service_min'),
  };
  const parsed = configSchema.safeParse(candidate);
  if (!parsed.success) {
    throw new Error(`app_config: ${parsed.error.issues.map((issue) => issue.message).join('; ')}`);
  }
  return parsed.data;
}