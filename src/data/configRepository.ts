import { AppConfig, DEFAULT_CONFIG } from '../../engine/types';
import { supabase } from './supabaseClient';

const CONFIG_STORAGE_KEY = 'aura.appConfig';

export function readPersistedConfig(): AppConfig | null {
  if (typeof window === 'undefined') return null;
  const raw = window.localStorage.getItem(CONFIG_STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<AppConfig>;
    return { ...DEFAULT_CONFIG, ...parsed };
  } catch {
    return null;
  }
}

export async function getAppConfig(): Promise<AppConfig> {
  const persisted = readPersistedConfig();
  if (persisted) return persisted;

  if (!supabase) return { ...DEFAULT_CONFIG };
  const { data, error } = await supabase
    .from('app_config')
    .select('sla_min, als_policy, als_penalty_min, unserved_min, max_response_min, service_min')
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`app_config: ${error.message}`);
  const config: AppConfig = {
    sla_min: Number(data?.sla_min ?? DEFAULT_CONFIG.sla_min),
    als_policy: (data?.als_policy as AppConfig['als_policy']) ?? DEFAULT_CONFIG.als_policy,
    als_penalty_min: Number(data?.als_penalty_min ?? DEFAULT_CONFIG.als_penalty_min),
    unserved_min: Number(data?.unserved_min ?? DEFAULT_CONFIG.unserved_min),
    max_response_min: data?.max_response_min ?? DEFAULT_CONFIG.max_response_min,
    service_min: Number(data?.service_min ?? DEFAULT_CONFIG.service_min),
  };
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(config));
  }
  return config;
}

export async function saveAppConfig(nextConfig: AppConfig): Promise<AppConfig> {
  const normalised: AppConfig = {
    ...DEFAULT_CONFIG,
    ...nextConfig,
    max_response_min: nextConfig.max_response_min === undefined ? DEFAULT_CONFIG.max_response_min : nextConfig.max_response_min,
  };
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(normalised));
  }

  const response = await fetch('/api/config', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(normalised),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error?.message || 'Unable to save configuration');
  }
  return payload.config ?? normalised;
}

export async function getSlaBenchmarkMinutes(): Promise<number> {
  const config = await getAppConfig();
  return config.sla_min;
}