import { supabase } from './supabaseClient';

export interface EmsSourceColumns {
  readonly id: string;
  readonly district: string;
  readonly callType: string;
  readonly triage: string;
  readonly priority: string;
  readonly responseSec: string;
  readonly benchmarkSec: string;
  readonly hour: string;
  readonly hourUsesTimestamp: boolean;
}

export interface EmsCase {
  readonly id: string;
  readonly district: string;
  readonly callType: string;
  readonly triage: string;
  readonly priority: string;
  readonly responseSec: number;
  readonly benchmarkSec: number;
  readonly hour: number;
  readonly sourceColumns: EmsSourceColumns;
}

export type EmsViewRow = Readonly<Record<string, unknown>>;

const pick = (row: Readonly<Record<string, unknown>>, keys: readonly string[]): unknown => {
  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== null) return row[key];
  }
  return undefined;
};

const requiredField = (
  row: Readonly<Record<string, unknown>>,
  keys: readonly string[],
  label: string
): string => {
  const field = keys.find((key) => row[key] !== undefined && row[key] !== null);
  if (!field) throw new Error(`EMS sample is missing its ${label} field`);
  return field;
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
  const hourUsesTimestamp = explicitHour === undefined;
  const hourField = requiredField(
    row,
    hourUsesTimestamp
      ? ['call_timestamp', 'incident_time', 'call_datetime', 'created_at', 'timestamp']
      : ['hour', 'hour_of_day', 'call_hour'],
    hourUsesTimestamp ? 'call time' : 'hour'
  );
  let hour: number;
  if (explicitHour !== undefined) {
    hour = requiredNumber(row, ['hour', 'hour_of_day', 'call_hour'], 'hour');
  } else {
    const timestamp = requiredText(
      row,
      [hourField],
      'call time'
    );
    hour = new Date(timestamp).getHours();
  }
  if (hour < 0 || hour > 23) throw new Error('EMS sample has an invalid hour field');

  const triageFields = ['triage', 'triage_level', 'priority'] as const;
  const callTypeFields = ['call_type', 'case_type', 'emergency_type', 'emergency_ift', 'type'] as const;
  const responseFields = ['response_sec', 'response_seconds', 'response_time_sec'] as const;
  const benchmarkFields = ['benchmark_sec', 'benchmark_seconds'] as const;
  const priorityFields = ['priority', 'triage', 'triage_level'] as const;
  const idFields = ['id', 'case_id'] as const;
  const districtFields = ['district'] as const;
  const triage = requiredText(row, triageFields, 'triage');
  const sourceColumns: EmsSourceColumns = {
    id: requiredField(row, idFields, 'case ID'),
    district: requiredField(row, districtFields, 'district'),
    callType: requiredField(row, callTypeFields, 'call type'),
    triage: requiredField(row, triageFields, 'triage'),
    priority: requiredField(row, priorityFields, 'priority'),
    responseSec: requiredField(row, responseFields, 'response time'),
    benchmarkSec: requiredField(row, benchmarkFields, 'benchmark'),
    hour: hourField,
    hourUsesTimestamp,
  };
  return {
    id: requiredText(row, idFields, 'case ID'),
    district: requiredText(row, districtFields, 'district'),
    callType: requiredText(row, callTypeFields, 'call type'),
    triage,
    priority: requiredText(row, priorityFields, 'priority'),
    responseSec: requiredNumber(row, responseFields, 'response time'),
    benchmarkSec: requiredNumber(row, benchmarkFields, 'benchmark'),
    hour,
    sourceColumns,
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