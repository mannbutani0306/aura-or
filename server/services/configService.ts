import { AppConfig } from '../../engine/types';
import { supabase } from './supabase';

export async function loadConfig(): Promise<AppConfig> {
  const config: AppConfig = { unserved_min: 60.0, sla_min: 10.0 };
  if (!supabase) return config;

  const { data } = await supabase.from('app_config').select('*');
  if (!data) return config;
  if (Array.isArray(data)) {
    for (const row of data as unknown[]) {
      if (!row || typeof row !== 'object') continue;
      const record = row as Record<string, unknown>;
      if (typeof record.key === 'string' && record.value !== undefined) {
        config[record.key] = Number(record.value) || record.value;
      } else if (record.unserved_min !== undefined) {
        config.unserved_min = Number(record.unserved_min);
      }
      if (record.sla_min !== undefined) config.sla_min = Number(record.sla_min);
    }
  } else {
    Object.assign(config, data);
  }
  return config;
}