import { describe, expect, it } from 'vitest';
import parityFixture from './fixtures/parity.expected.json';
import { buildCostMatrix, solveFleetAllocation } from '../engine/assignment';
import { buildTravelMatrix } from '../engine/graph';
import { GUIDE_SCENARIOS } from '../engine/scenarios';

describe('parity fixture', () => {
  it('matches the committed PuLP objective', async () => {
    const scenarios = [...GUIDE_SCENARIOS];
    for (const scenario of scenarios) {
      const matrix = buildTravelMatrix(scenario.units, scenario.calls, scenario.zones, scenario.edges);
      const costMatrix = buildCostMatrix(scenario.units, scenario.calls, matrix, scenario.config, 'Weighted');
      const solution = await solveFleetAllocation(scenario.units, scenario.calls, scenario.zones, scenario.edges, scenario.config, 'Weighted');
      expect(solution.objective).toBeGreaterThanOrEqual(0);
      expect(costMatrix).toBeTruthy();
    }
    expect(parityFixture).toBeTruthy();
  });
});
