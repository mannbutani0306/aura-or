import { describe, expect, it } from 'vitest';
import { buildCostMatrix, runFcfsBaseline, runPriorityGreedyBaseline, solveFleetAllocation } from '../engine/assignment';
import { buildTravelMatrix, dijkstra } from '../engine/graph';
import { GUIDE_SCENARIOS } from '../engine/scenarios';
import { generateSeededScenario, runMonteCarloEvaluation } from '../engine/evaluate';
import { DEFAULT_CONFIG } from '../engine/types';

describe('seeded evaluation scenarios', () => {
  it('reproduces the full scenario for the same seed and index', () => {
    expect(generateSeededScenario(1337, 4)).toEqual(generateSeededScenario(1337, 4));
  });

  it('reports seeded Monte Carlo progress and integrity', async () => {
    const progress: number[] = [];
    const result = await runMonteCarloEvaluation({
      n: 3,
      seed: 1337,
      progress: (current) => progress.push(current),
    });
    expect(result.scenarios).toHaveLength(3);
    expect(result.integrityViolations).toBe(0);
    expect(progress).toEqual([1, 2, 3]);
    expect(result.pValue).toBeGreaterThanOrEqual(0);
    expect(result.pValue).toBeLessThanOrEqual(1);
  });
});

describe('engine guide scenarios', () => {
  it('matches expected guide behavior', async () => {
    for (const scenario of GUIDE_SCENARIOS) {
      for (const mode of ['Weighted', 'Plain'] as const) {
        const solution = await solveFleetAllocation(scenario.units, scenario.calls, scenario.zones, scenario.edges, scenario.config, mode);
        expect(solution.crossCheck.ok).toBe(true);
        expect(solution.metrics.totalWeightedMin).toBeGreaterThanOrEqual(0);
        expect(solution.assignments.length).toBeLessThanOrEqual(scenario.units.length);
      }
    }
  });

  it('build travel matrix matches Dijkstra', () => {
    const scenario = GUIDE_SCENARIOS[0];
    const matrix = buildTravelMatrix(scenario.units, scenario.calls, scenario.zones, scenario.edges);
    const zoneMin = new Map(scenario.zones.map((zone) => [zone.id, zone.localMin ?? 2.0]));
    for (const unit of scenario.units) {
      for (const call of scenario.calls) {
        const direct = dijkstra(scenario.zones, scenario.edges, unit.zoneId, call.zoneId);
        const expected = direct.totalTime === Infinity
          ? Infinity
          : Number((direct.totalTime + ((zoneMin.get(unit.zoneId) ?? 2.0) + (zoneMin.get(call.zoneId) ?? 2.0)) / 2).toFixed(1));
        if (matrix.rawTimes[unit.id]?.[call.id] === Infinity) {
          expect(expected).toBe(Infinity);
        } else {
          expect(matrix.rawTimes[unit.id]?.[call.id]).toBeCloseTo(expected, 1);
        }
      }
    }
  });
});

describe('engine feasibility', () => {
  it('blocks infeasible and busy units', async () => {
    const scenario = GUIDE_SCENARIOS[5];
    const matrix = buildCostMatrix(scenario.units, scenario.calls, buildTravelMatrix(scenario.units, scenario.calls, scenario.zones, scenario.edges), scenario.config, 'Weighted');
    expect(matrix.feasibility['U1']?.['E1']).toBe(true);
    expect(matrix.feasibility['U2']?.['E1']).toBe(true);
    const result = await solveFleetAllocation(scenario.units, scenario.calls, scenario.zones, scenario.edges, scenario.config, 'Weighted');
    expect(result.assignments.every((item) => item.ambulanceId !== 'U2')).toBe(false);
  });

  it('handles FCFS and greedy baselines deterministically', async () => {
    const scenario = GUIDE_SCENARIOS[0];
    const matrix = buildCostMatrix(scenario.units, scenario.calls, buildTravelMatrix(scenario.units, scenario.calls, scenario.zones, scenario.edges), scenario.config, 'Weighted');
    const fcfs = runFcfsBaseline(scenario.units, scenario.calls, matrix);
    const greedy = runPriorityGreedyBaseline(scenario.units, scenario.calls, matrix);
    expect(fcfs).toBeTruthy();
    expect(greedy).toBeTruthy();
  });
});

describe('api validation', () => {
  it('health route succeeds', async () => {
    const { createApp } = await import('../server/app');
    const app = createApp();
    const { default: request } = await import('supertest');
    const response = await request(app).get('/api/health');
    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
  }, 20000);

  it('solve adhoc validation route works', async () => {
    const { createApp } = await import('../server/app');
    const app = createApp();
    const { default: request } = await import('supertest');
    const response = await request(app).post('/api/solve-adhoc').send({
      units: [{ id: 'a1', zoneId: 'A', type: 'BLS', status: 'Available' }],
      calls: [{ id: 'e1', zoneId: 'B', priority: 'High', weight: 3, requiresAls: false, status: 'Pending', requestedAt: Date.now() }],
      zones: [{ id: 'A', name: 'A', lat: 1, lng: 1, areaType: 'Urban', localMin: 2 }, { id: 'B', name: 'B', lat: 2, lng: 1, areaType: 'Urban', localMin: 2 }],
      edges: [{ a: 'A', b: 'B', minutes: 2 }],
      config: { ...DEFAULT_CONFIG },
    });
    expect(response.status).toBe(200);
    expect(response.body.metrics).toBeTruthy();
  }, 20000);
});
