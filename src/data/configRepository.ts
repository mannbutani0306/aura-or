import { supabase } from './supabaseClient';

export async function getSlaBenchmarkMinutes(): Promise<number> {
  if (!supabase) throw new Error('SLA benchmark unavailable: Supabase is not configured');
  const { data, error } = await supabase
    .from('app_config')
    .select('sla_min')
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`app_config: ${error.message}`);
  const benchmark = Number(data?.sla_min);
  if (!Number.isFinite(benchmark) || benchmark <= 0) {
    throw new Error('app_config.sla_min is missing or invalid');
  }
  return benchmark;
}