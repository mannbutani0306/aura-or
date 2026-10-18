import fs from 'node:fs';
import path from 'node:path';
import { buildCostMatrix } from '../engine/assignment';
import { buildTravelMatrix } from '../engine/graph';
import { GUIDE_SCENARIOS, GuideScenario } from '../engine/scenarios';
import { Ambulance, DEFAULT_CONFIG, Emergency, RoadEdge, Zone } from '../engine/types';

const root = process.cwd();
const fixtureDir = path.join(root, 'tests', 'fixtures');
fs.mkdirSync(fixtureDir, { recursive: true });

const scenarios: GuideScenario[] = [...GUIDE_SCENARIOS];
for (let i = 0; i < 100; i += 1) {
  const seed = i * 101 + 17;
  const rand = (value: number) => {
    const x = Math.sin(value) * 10000;
    return x - Math.floor(x);
  };
  const zones: Zone[] = [
    { id: 'A', name: 'A', lat: 1, lng: 1, areaType: 'Urban', localMin: 2 },
    { id: 'B', name: 'B', lat: 2, lng: 1, areaType: 'Urban', localMin: 2 },
    { id: 'C', name: 'C', lat: 3, lng: 1, areaType: 'Urban', localMin: 2 },
    { id: 'D', name: 'D', lat: 1, lng: 2, areaType: 'Urban', localMin: 2 },
  ];
  const edges: RoadEdge[] = [
    { a: 'A', b: 'B', minutes: 2 },
    { a: 'B', b: 'C', minutes: 2 },
    { a: 'C', b: 'D', minutes: 2 },
    { a: 'D', b: 'A', minutes: 2 },
    { a: 'A', b: 'C', minutes: 4 },
  ];
  const units: Ambulance[] = Array.from({ length: 3 + Math.floor(rand(seed) * 3) }, (_, idx) => ({
    id: `U${idx + 1}`,
    zoneId: zones[Math.floor(rand(seed + idx + 7) * zones.length)].id,
    type: idx % 2 === 0 ? 'ALS' : 'BLS',
    status: 'Available',
    updatedAt: seed + idx,
  }));
  const calls: Emergency[] = Array.from({ length: 3 + Math.floor(rand(seed + 11) * 4) }, (_, idx) => ({
    id: `E${idx + 1}`,
    zoneId: zones[Math.floor(rand(seed + idx + 17) * zones.length)].id,
    priority: ['Critical', 'High', 'Medium', 'Low'][Math.floor(rand(seed + idx + 29) * 4)] as Emergency['priority'],
    weight: [5, 3, 2, 1][Math.floor(rand(seed + idx + 47) * 4)],
    requiresAls: rand(seed + idx + 59) > 0.7,
    status: 'Pending',
    requestedAt: seed + idx * 5000,
  }));
  const config = { ...DEFAULT_CONFIG };

  scenarios.push({
    id: `seeded-${i}`,
    zones,
    edges,
    units,
    calls,
    config,
  });
}

const payload = {
  scenarios: scenarios.map((scenario) => {
    const matrix = buildTravelMatrix(scenario.units, scenario.calls, scenario.zones, scenario.edges);
    const costMatrix = buildCostMatrix(scenario.units, scenario.calls, matrix, scenario.config, 'Weighted');
    return {
      id: scenario.id,
      units: scenario.units,
      calls: scenario.calls,
      mode: 'weighted',
      unserved_min: scenario.config.unserved_min,
      cost_matrix: scenario.units.map((unit) => scenario.calls.map((call) => {
        return costMatrix.feasibility[unit.id]?.[call.id] ? costMatrix.costs[unit.id][call.id] ?? 0 : Number.MAX_SAFE_INTEGER;
      })),
    };
  }),
};

fs.writeFileSync(path.join(fixtureDir, 'parity.json'), JSON.stringify(payload, null, 2));
console.log('Wrote', fixtureDir + '/parity.json');
