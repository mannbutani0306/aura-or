import { describe, expect, it } from 'vitest';
import { solveFleetAllocation } from '../engine/assignment';
import { GUIDE_SCENARIOS } from '../engine/scenarios';

describe('independent solver cross-check', () => {
  it('matches HiGHS with the Hungarian solver on guide scenarios', async () => {
    for (const scenario of GUIDE_SCENARIOS) {
      const solution = await solveFleetAllocation(scenario.units, scenario.calls, scenario.zones, scenario.edges, scenario.config, 'Weighted');
      expect(solution.crossCheck.ok).toBe(true);
      expect(solution.crossCheck.value).toBeCloseTo(solution.objective, 6);
    }
  });
});
