import { SupabaseClient } from '@supabase/supabase-js';

export interface PulseState {
  readonly running: boolean;
  readonly ratePerHour: number;
  readonly zoneWeights: Readonly<Record<string, number>> | null;
  readonly error: string | null;
}

interface HourWeight {
  readonly hour: number;
  readonly probability: number;
}

interface PriorityWeight {
  readonly priority: 'Critical' | 'High' | 'Medium' | 'Low';
  readonly probability: number;
}

const recordOf = (value: unknown): Readonly<Record<string, unknown>> | null =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as Readonly<Record<string, unknown>>
    : null;

const readNumber = (row: Readonly<Record<string, unknown>>, keys: readonly string[]): number | null => {
  for (const key of keys) {
    const parsed = Number(row[key]);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
};

const readText = (row: Readonly<Record<string, unknown>>, keys: readonly string[]): string | null => {
  for (const key of keys) {
    if (typeof row[key] === 'string') return row[key] as string;
  }
  return null;
};

export class PulseManager {
  private running = false;
  private ratePerHour = 6;
  private zoneWeights: Readonly<Record<string, number>> | null = null;
  private error: string | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private hourlyWeights: readonly HourWeight[] = [];
  private priorityWeights: readonly PriorityWeight[] = [];
  private zones: readonly string[] = [];
  private isTicking = false;
  private randomState: number | null;

  constructor(
    private readonly supabase: SupabaseClient | null,
    private readonly getSimulationSpeed: () => number,
    seedText = process.env.PULSE_SEED
  ) {
    const seed = Number(seedText);
    this.randomState = seedText && Number.isFinite(seed) ? seed >>> 0 : null;
  }

  getState(): PulseState {
    return {
      running: this.running,
      ratePerHour: this.ratePerHour,
      zoneWeights: this.zoneWeights ? { ...this.zoneWeights } : null,
      error: this.error,
    };
  }

  async update(input: unknown): Promise<PulseState> {
    const body = recordOf(input);
    if (!body || typeof body.running !== 'boolean') {
      throw new Error('Pulse requires a running boolean');
    }

    const rate = body.ratePerHour === undefined ? this.ratePerHour : Number(body.ratePerHour);
    if (!Number.isFinite(rate) || rate < 1 || rate > 120) {
      throw new Error('Pulse rate must be between 1 and 120 calls per hour');
    }

    const weights = this.parseZoneWeights(body.zoneWeights);
    if (body.running) {
      await this.loadDistributions();
      if (weights && !this.zones.some((zone) => (weights[zone] ?? 0) > 0)) {
        throw new Error('Pulse zone weights do not match any available zone');
      }
      this.ratePerHour = rate;
      this.zoneWeights = weights;
      this.error = null;
      this.start();
    } else {
      this.ratePerHour = rate;
      this.zoneWeights = weights;
      this.stop();
      this.error = null;
    }
    return this.getState();
  }

  stop(): void {
    this.running = false;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private parseZoneWeights(value: unknown): Readonly<Record<string, number>> | null {
    if (value === undefined || value === null) return null;
    const record = recordOf(value);
    if (!record) throw new Error('zoneWeights must be a map of zone IDs to positive weights');
    const weights: Record<string, number> = {};
    for (const [zone, rawWeight] of Object.entries(record)) {
      const weight = Number(rawWeight);
      if (!Number.isFinite(weight) || weight < 0) throw new Error(`Invalid zone weight for ${zone}`);
      if (weight > 0) weights[zone] = weight;
    }
    if (Object.keys(weights).length === 0) throw new Error('At least one zone weight must be positive');
    return weights;
  }

  private async loadDistributions(): Promise<void> {
    if (!this.supabase) throw new Error('Pulse needs the EMS sample and a connected database');
    const [hourResult, caseResult, zoneResult] = await Promise.all([
      this.supabase.from('v_ems_by_hour').select('*'),
      this.supabase.from('ems_cases').select('priority'),
      this.supabase.from('zones').select('id'),
    ]);
    if (hourResult.error) throw new Error(`v_ems_by_hour: ${hourResult.error.message}`);
    if (caseResult.error) throw new Error(`ems_cases: ${caseResult.error.message}`);
    if (zoneResult.error) throw new Error(`zones: ${zoneResult.error.message}`);

    const hourCounts = new Array<number>(24).fill(0);
    for (const raw of (hourResult.data ?? []) as unknown[]) {
      const row = recordOf(raw);
      if (!row) continue;
      const hour = readNumber(row, ['hour', 'hour_of_day', 'call_hour']);
      const count = readNumber(row, ['calls', 'call_count', 'count', 'n']);
      if (hour !== null && count !== null && Number.isInteger(hour) && hour >= 0 && hour < 24 && count > 0) {
        hourCounts[hour] = count;
      }
    }
    const hourTotal = hourCounts.reduce((sum, count) => sum + count, 0);
    if (hourTotal === 0) throw new Error('v_ems_by_hour returned no usable hourly counts');
    this.hourlyWeights = hourCounts.map((count, hour) => ({ hour, probability: count / hourTotal }));

    const priorityCounts = new Map<string, number>();
    for (const raw of (caseResult.data ?? []) as unknown[]) {
      const row = recordOf(raw);
      const priority = row ? readText(row, ['priority']) : null;
      if (priority && ['Critical', 'High', 'Medium', 'Low'].includes(priority)) {
        priorityCounts.set(priority, (priorityCounts.get(priority) ?? 0) + 1);
      }
    }
    const priorityTotal = [...priorityCounts.values()].reduce((sum, count) => sum + count, 0);
    if (priorityTotal === 0) throw new Error('ems_cases returned no supported priority mix');
    this.priorityWeights = [...priorityCounts.entries()].map(([priority, count]) => ({
      priority: priority as PriorityWeight['priority'],
      probability: count / priorityTotal,
    }));
    this.zones = ((zoneResult.data ?? []) as unknown[]).flatMap((raw) => {
      const row = recordOf(raw);
      const id = row ? readText(row, ['id']) : null;
      return id ? [id] : [];
    });
    if (this.zones.length === 0) throw new Error('No zones are available for Pulse calls');
  }

  private start(): void {
    if (this.timer) clearInterval(this.timer);
    this.running = true;
    this.timer = setInterval(() => {
      void this.tick().catch((reason: unknown) => {
        this.error = reason instanceof Error ? reason.message : 'Pulse could not create a call';
        this.stop();
      });
    }, 1000);
  }

  private nextRandom(): number {
    if (this.randomState === null) return Math.random();
    let value = this.randomState;
    value ^= value << 13;
    value ^= value >>> 17;
    value ^= value << 5;
    this.randomState = value >>> 0;
    return this.randomState / 0x100000000;
  }

  private poisson(mean: number): number {
    if (mean <= 0) return 0;
    const limit = Math.exp(-mean);
    let product = 1;
    let count = 0;
    do {
      count += 1;
      product *= this.nextRandom();
    } while (product > limit);
    return count - 1;
  }

  private draw<T extends { readonly probability: number }>(weights: readonly T[]): T {
    let sample = this.nextRandom();
    for (const item of weights) {
      sample -= item.probability;
      if (sample <= 0) return item;
    }
    return weights[weights.length - 1];
  }

  private async tick(): Promise<void> {
    if (!this.running || this.isTicking || !this.hourlyWeights.length || !this.priorityWeights.length) return;
    this.isTicking = true;
    try {
      const hour = new Date().getHours();
      const hourlyProbability = this.hourlyWeights[hour]?.probability ?? 0;
      const maxProbability = Math.max(...this.hourlyWeights.map((item) => item.probability));
      if (hourlyProbability === 0 || maxProbability === 0) return;

      const scale = Math.max(0, this.getSimulationSpeed());
      const envelopeRatePerSecond = this.ratePerHour * 24 * maxProbability * scale / 60;
      const candidateCount = this.poisson(envelopeRatePerSecond);
      const acceptance = hourlyProbability / maxProbability;
      for (let index = 0; index < candidateCount; index += 1) {
        if (this.nextRandom() > acceptance) continue;
        await this.insertCall();
      }
    } finally {
      this.isTicking = false;
    }
  }

  private async insertCall(): Promise<void> {
    if (!this.supabase) throw new Error('Pulse database connection was lost');
    const priority = this.draw(this.priorityWeights).priority;
    const availableZones = this.zones.flatMap((zone) => {
      const weight = this.zoneWeights ? this.zoneWeights[zone] ?? 0 : 1;
      return weight > 0 ? [{ zone, probability: weight }] : [];
    });
    const totalZoneWeight = availableZones.reduce((sum, item) => sum + item.probability, 0);
    if (totalZoneWeight <= 0) throw new Error('Pulse zone weights do not match available zones');
    const zoneId = this.draw(availableZones.map((item) => ({
      zone: item.zone,
      probability: item.probability / totalZoneWeight,
    }))).zone;

    const { error } = await this.supabase.from('emergencies').insert({
      zone_id: zoneId,
      priority,
      status: 'Pending',
      source: 'simulated',
      requested_at: new Date().toISOString(),
    });
    if (error) throw new Error(error.message);
  }
}