import { supabase } from './supabaseClient';

export interface EmsCase {
  readonly id: string;
  readonly district: string;
  readonly callType: string;
  readonly triage: string;
  readonly priority: string;
  readonly responseSec: number;
  readonly benchmarkSec: number;
  readonly hour: number;
}

export type EmsViewRow = Readonly<Record<string, unknown>>;

const pick = (row: Readonly<Record<string, unknown>>, keys: readonly string[]): unknown => {
  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== null) return row[key];
  }
  return undefined;
};

const requiredText = (
  row: Readonly<Record<string, unknown>>,
  keys: readonly string[],
  label: string
): string => {
  const value = pick(row, keys);
  if (typeof value !== 'string' && typeof value !== 'number') {
    throw new Error(`EMS sample is missing its ${label} field`);
  }
  return String(value);
};

const requiredNumber = (
  row: Readonly<Record<string, unknown>>,
  keys: readonly string[],
  label: string
): number => {
  const value = pick(row, keys);
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`EMS sample has an invalid ${label} field`);
  return parsed;
};

const normalizeCase = (value: unknown): EmsCase => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('EMS sample returned an invalid case row');
  }
  const row = value as Readonly<Record<string, unknown>>;
  const explicitHour = pick(row, ['hour', 'hour_of_day', 'call_hour']);
  let hour: number;
  if (explicitHour !== undefined) {
    hour = requiredNumber(row, ['hour', 'hour_of_day', 'call_hour'], 'hour');
  } else {
    const timestamp = requiredText(
      row,
      ['call_timestamp', 'incident_time', 'call_datetime', 'created_at', 'timestamp'],
      'call time'
    );
    hour = new Date(timestamp).getHours();
  }
  if (hour < 0 || hour > 23) throw new Error('EMS sample has an invalid hour field');

  const triage = requiredText(row, ['triage', 'triage_level'], 'triage');
  return {
    id: requiredText(row, ['id', 'case_id'], 'case ID'),
    district: requiredText(row, ['district'], 'district'),
    callType: requiredText(row, ['call_type', 'case_type', 'emergency_type', 'emergency_ift'], 'call type'),
    triage,
    priority: requiredText(row, ['priority', 'triage', 'triage_level'], 'priority'),
    responseSec: requiredNumber(row, ['response_sec', 'response_seconds', 'response_time_sec'], 'response time'),
    benchmarkSec: requiredNumber(row, ['benchmark_sec', 'benchmark_seconds'], 'benchmark'),
    hour,
  };
};

const readView = async (name: string): Promise<readonly EmsViewRow[]> => {
  if (!supabase) throw new Error('EMS sample unavailable: Supabase is not configured');
  const { data, error } = await supabase.from(name).select('*');
  if (error) throw new Error(`${name}: ${error.message}`);
  return (data ?? []) as unknown as readonly EmsViewRow[];
};

export async function getEmsCases(): Promise<readonly EmsCase[]> {
  if (!supabase) throw new Error('EMS sample unavailable: Supabase is not configured');
  const { data, error } = await supabase.from('ems_cases').select('*');
  if (error) throw new Error(`ems_cases: ${error.message}`);
  return (data ?? []).map((row: unknown) => normalizeCase(row));
}

export function getEmsByHour(): Promise<readonly EmsViewRow[]> {
  return readView('v_ems_by_hour');
}

export function getEmsByType(): Promise<readonly EmsViewRow[]> {
  return readView('v_ems_by_type');
}

export function getEmsSlaByTriage(): Promise<readonly EmsViewRow[]> {
  return readView('v_ems_sla_by_triage');
}