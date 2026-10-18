/**
 * AURA Shortest-Path Graph Engine & Travel Time Model
 * Pure TypeScript module with zero UI dependencies.
 * 
 * ASSUMPTION / MODEL SPECIFICATION:
 * Single source of truth for travel times across Madurai telematics:
 * 1. The road network is modeled as a weighted graph of zone vertices and road edges.
 *    Blocked road edges are strictly excluded from graph traversals.
 * 2. When an ambulance in zone_i responds to an emergency in zone_j (zone_i != zone_j):
 *      t(i,j) = shortestPath(zone_i -> zone_j) + (localMin_i + localMin_j) / 2
 *    accounting for intra-zone station egress and incident approach delays.
 * 3. When an ambulance and emergency are located within the same zone (zone_i == zone_j):
 *      t(i,j) = localMin of that zone (default 2.0 min baseline).
 * 4. Unreachable pairs (disconnected graph component) yield t(i,j) = Infinity (infeasible).
 */

import { Zone, RoadEdge, Ambulance, Emergency, TravelMatrix } from './types';

export interface GraphEdge {
  from: string;
  to: string;
  weight: number;
  blocked?: boolean;
}

export interface PathResult {
  path: string[];
  totalTime: number;
  deltaMinutes?: number;
}

export interface DijkstraStep {
  stepIndex: number;
  currentNode: string | null;
  currentDistance: number;
  visitedNodes: string[];
  unvisitedNodes: string[];
  tentativeDistances: Record<string, number>;
  previousNodes: Record<string, string | null>;
  evaluatingEdge: {
    from: string;
    to: string;
    weight: number;
    newTentativeDist: number;
    relaxed: boolean;
  } | null;
  phase: 'init' | 'select_min' | 'relax_edge' | 'finished' | 'unreachable';
  description: string;
}

export interface DijkstraTraceResult {
  path: string[];
  totalTime: number;
  steps: DijkstraStep[];
  success: boolean;
}

/**
 * Minimal Binary Min-Heap for Dijkstra priority queue
 */
class MinHeap<T> {
  private heap: { key: number; value: T }[] = [];

  get size(): number {
    return this.heap.length;
  }

  push(key: number, value: T): void {
    this.heap.push({ key, value });
    this.bubbleUp(this.heap.length - 1);
  }

  pop(): { key: number; value: T } | null {
    if (this.heap.length === 0) return null;
    const top = this.heap[0];
    const bottom = this.heap.pop()!;
    if (this.heap.length > 0) {
      this.heap[0] = bottom;
      this.bubbleDown(0);
    }
    return top;
  }

  private bubbleUp(idx: number): void {
    while (idx > 0) {
      const parentIdx = Math.floor((idx - 1) / 2);
      if (this.heap[idx].key < this.heap[parentIdx].key) {
        [this.heap[idx], this.heap[parentIdx]] = [this.heap[parentIdx], this.heap[idx]];
        idx = parentIdx;
      } else {
        break;
      }
    }
  }

  private bubbleDown(idx: number): void {
    const len = this.heap.length;
    while (true) {
      let smallest = idx;
      const left = 2 * idx + 1;
      const right = 2 * idx + 2;

      if (left < len && this.heap[left].key < this.heap[smallest].key) {
        smallest = left;
      }
      if (right < len && this.heap[right].key < this.heap[smallest].key) {
        smallest = right;
      }
      if (smallest !== idx) {
        [this.heap[idx], this.heap[smallest]] = [this.heap[smallest], this.heap[idx]];
        idx = smallest;
      } else {
        break;
      }
    }
  }
}

/**
 * Internal helper to normalize inputs for Dijkstra & Yen algorithms
 */
function normalizeGraphArgs(
  arg1: Zone[] | GraphEdge[] | RoadEdge[] | undefined,
  arg2: GraphEdge[] | RoadEdge[] | string | undefined,
  arg3?: string,
  arg4?: string
): {
  nodeIds: string[];
  edges: { a: string; b: string; minutes: number; blocked?: boolean }[];
  start: string;
  end: string;
} {
  if (typeof arg2 === 'string') {
    // Called as: fn(edges, startZone, endZone)
    const rawEdges = Array.isArray(arg1) ? (arg1 as Array<{ a?: string; b?: string; from?: string; to?: string; minutes?: number; weight?: number; blocked?: boolean }>) : [];
    const start = String(arg2 || '');
    const end = String(arg3 || '');
    const nodes = new Set<string>();
    nodes.add(start);
    if (end) nodes.add(end);
    const edges = rawEdges.map((e) => {
      const a = String(e.a ?? e.from ?? '');
      const b = String(e.b ?? e.to ?? '');
      const minutes = Number(e.minutes ?? e.weight ?? 0);
      const blocked = Boolean(e.blocked);
      if (a) nodes.add(a);
      if (b) nodes.add(b);
      return { a, b, minutes, blocked };
    });
    return { nodeIds: Array.from(nodes), edges, start, end };
  }

  // Called as: fn(zones, edges, startZone, endZone)
  const rawZones: Zone[] = Array.isArray(arg1) && arg1.every((item) => item && typeof item === 'object' && 'id' in item)
    ? (arg1 as Zone[])
    : [];
  const rawEdges = Array.isArray(arg2) ? (arg2 as Array<{ a?: string; b?: string; from?: string; to?: string; minutes?: number; weight?: number; blocked?: boolean }>) : [];
  const start = String(arg3 || '');
  const end = String(arg4 || '');
  const nodes = new Set<string>(rawZones.map((z) => z.id));
  nodes.add(start);
  if (end) nodes.add(end);
  const edges = rawEdges.map((e) => {
    const a = String(e.a ?? e.from ?? '');
    const b = String(e.b ?? e.to ?? '');
    const minutes = Number(e.minutes ?? e.weight ?? 0);
    const blocked = Boolean(e.blocked);
    if (a) nodes.add(a);
    if (b) nodes.add(b);
    return { a, b, minutes, blocked };
  });
  return { nodeIds: Array.from(nodes), edges, start, end };
}

/**
 * Dijkstra shortest path algorithm on an undirected road network
 * Blocked edges are strictly ignored.
 * Supports both:
 *   dijkstra(zones, edges, startZone, endZone)
 *   dijkstra(edges, startZone, endZone)
 */
export function dijkstra(
  zonesOrEdges: Zone[] | GraphEdge[] | RoadEdge[],
  edgesOrStart: RoadEdge[] | GraphEdge[] | string,
  startZone?: string,
  endZone?: string
): PathResult {
  const { nodeIds, edges, start, end } = normalizeGraphArgs(
    zonesOrEdges,
    edgesOrStart,
    startZone,
    endZone
  );

  if (start === end) {
    return { path: [start], totalTime: 0, deltaMinutes: 0 };
  }

  // Build adjacency list ignoring blocked edges
  const adj = new Map<string, { to: string; weight: number }[]>();
  nodeIds.forEach((id) => adj.set(id, []));

  edges.forEach((e) => {
    if (!e.blocked) {
      if (!adj.has(e.a)) adj.set(e.a, []);
      if (!adj.has(e.b)) adj.set(e.b, []);
      adj.get(e.a)!.push({ to: e.b, weight: e.minutes });
      adj.get(e.b)!.push({ to: e.a, weight: e.minutes });
    }
  });

  const distances = new Map<string, number>();
  const previous = new Map<string, string | null>();
  const pq = new MinHeap<string>();

  nodeIds.forEach((id) => {
    distances.set(id, Infinity);
    previous.set(id, null);
  });

  distances.set(start, 0);
  pq.push(0, start);

  while (pq.size > 0) {
    const item = pq.pop()!;
    const u = item.value;
    const distU = item.key;

    if (distU > (distances.get(u) ?? Infinity)) continue;
    if (u === end) break;

    const neighbors = adj.get(u) || [];
    for (const edge of neighbors) {
      const v = edge.to;
      const alt = distU + edge.weight;
      if (alt < (distances.get(v) ?? Infinity)) {
        distances.set(v, alt);
        previous.set(v, u);
        pq.push(alt, v);
      }
    }
  }

  const finalDist = distances.get(end) ?? Infinity;
  if (finalDist === Infinity) {
    return { path: [], totalTime: Infinity, deltaMinutes: Infinity };
  }

  // Reconstruct path
  const path: string[] = [];
  let curr: string | null = end;
  while (curr !== null) {
    path.unshift(curr);
    curr = previous.get(curr) ?? null;
  }

  return {
    path,
    totalTime: Number(finalDist.toFixed(2)),
    deltaMinutes: 0,
  };
}

/**
 * Detailed step-by-step trace of Dijkstra for algorithmic verification
 * Supports both:
 *   traceDijkstra(zones, edges, startZone, endZone)
 *   traceDijkstra(edges, startZone, endZone)
 */
export function traceDijkstra(
  zonesOrEdges: Zone[] | GraphEdge[] | RoadEdge[],
  edgesOrStart: RoadEdge[] | GraphEdge[] | string,
  startZone?: string,
  endZone?: string
): DijkstraTraceResult {
  const { nodeIds, edges, start, end } = normalizeGraphArgs(
    zonesOrEdges,
    edgesOrStart,
    startZone,
    endZone
  );

  const steps: DijkstraStep[] = [];
  let stepCounter = 0;

  const adj = new Map<string, { to: string; weight: number }[]>();
  nodeIds.forEach((id) => adj.set(id, []));

  edges.forEach((e) => {
    if (!e.blocked) {
      if (!adj.has(e.a)) adj.set(e.a, []);
      if (!adj.has(e.b)) adj.set(e.b, []);
      adj.get(e.a)!.push({ to: e.b, weight: e.minutes });
      adj.get(e.b)!.push({ to: e.a, weight: e.minutes });
    }
  });

  const tentativeDistances: Record<string, number> = {};
  const previousNodes: Record<string, string | null> = {};
  const unvisitedNodes = new Set<string>();
  const visitedNodes: string[] = [];

  nodeIds.forEach((id) => {
    tentativeDistances[id] = Infinity;
    previousNodes[id] = null;
    unvisitedNodes.add(id);
  });

  tentativeDistances[start] = 0;

  steps.push({
    stepIndex: stepCounter++,
    currentNode: null,
    currentDistance: 0,
    visitedNodes: [],
    unvisitedNodes: Array.from(unvisitedNodes),
    tentativeDistances: { ...tentativeDistances },
    previousNodes: { ...previousNodes },
    evaluatingEdge: null,
    phase: 'init',
    description: `Initialize Dijkstra: Start Zone ${start} tentative distance = 0 min; all other zones set to ∞ min.`,
  });

  let currentNode: string | null = null;

  while (unvisitedNodes.size > 0) {
    let minNode: string | null = null;
    let minDist = Infinity;

    for (const node of unvisitedNodes) {
      const d = tentativeDistances[node];
      if (d < minDist) {
        minDist = d;
        minNode = node;
      }
    }

    if (!minNode || minDist === Infinity) {
      steps.push({
        stepIndex: stepCounter++,
        currentNode: null,
        currentDistance: Infinity,
        visitedNodes: [...visitedNodes],
        unvisitedNodes: Array.from(unvisitedNodes),
        tentativeDistances: { ...tentativeDistances },
        previousNodes: { ...previousNodes },
        evaluatingEdge: null,
        phase: 'unreachable',
        description: `Unreachable: remaining zones cannot be reached from ${start}.`,
      });
      break;
    }

    currentNode = minNode;
    unvisitedNodes.delete(currentNode);
    visitedNodes.push(currentNode);

    steps.push({
      stepIndex: stepCounter++,
      currentNode,
      currentDistance: minDist,
      visitedNodes: [...visitedNodes],
      unvisitedNodes: Array.from(unvisitedNodes),
      tentativeDistances: { ...tentativeDistances },
      previousNodes: { ...previousNodes },
      evaluatingEdge: null,
      phase: 'select_min',
      description: `Select unvisited zone with minimum distance: Zone ${currentNode} (${minDist.toFixed(1)} min).`,
    });

    if (currentNode === end) {
      break;
    }

    const neighbors = adj.get(currentNode) || [];
    for (const edge of neighbors) {
      const neighbor = edge.to;
      if (unvisitedNodes.has(neighbor)) {
        const altDist = minDist + edge.weight;
        const currentTentative = tentativeDistances[neighbor];
        const relaxed = altDist < currentTentative;

        if (relaxed) {
          tentativeDistances[neighbor] = altDist;
          previousNodes[neighbor] = currentNode;
        }

        steps.push({
          stepIndex: stepCounter++,
          currentNode,
          currentDistance: minDist,
          visitedNodes: [...visitedNodes],
          unvisitedNodes: Array.from(unvisitedNodes),
          tentativeDistances: { ...tentativeDistances },
          previousNodes: { ...previousNodes },
          evaluatingEdge: {
            from: currentNode,
            to: neighbor,
            weight: edge.weight,
            newTentativeDist: altDist,
            relaxed,
          },
          phase: 'relax_edge',
          description: relaxed
            ? `Relax edge ${currentNode} ➔ ${neighbor} (${edge.weight}m): New distance ${altDist.toFixed(1)}m < previous ${currentTentative === Infinity ? '∞' : currentTentative.toFixed(1)}m. Updated.`
            : `Examine edge ${currentNode} ➔ ${neighbor} (${edge.weight}m): Alternate distance ${altDist.toFixed(1)}m ≥ existing ${currentTentative.toFixed(1)}m. Kept.`,
        });
      }
    }
  }

  const finalDist = tentativeDistances[end] ?? Infinity;
  const path: string[] = [];

  if (finalDist !== Infinity) {
    let curr: string | null = end;
    while (curr !== null) {
      path.unshift(curr);
      curr = previousNodes[curr] ?? null;
    }
  }

  steps.push({
    stepIndex: stepCounter++,
    currentNode: end,
    currentDistance: finalDist,
    visitedNodes: [...visitedNodes],
    unvisitedNodes: Array.from(unvisitedNodes),
    tentativeDistances: { ...tentativeDistances },
    previousNodes: { ...previousNodes },
    evaluatingEdge: null,
    phase: finalDist !== Infinity ? 'finished' : 'unreachable',
    description: finalDist !== Infinity
      ? `Completed: Shortest route from ${start} to ${end} is ${path.join(' ➔ ')} (${finalDist.toFixed(1)} min).`
      : `Failed: No traversable path from ${start} to ${end}.`,
  });

  return {
    path,
    totalTime: finalDist === Infinity ? Infinity : Number(finalDist.toFixed(2)),
    steps,
    success: finalDist !== Infinity,
  };
}

/**
 * Yen's K-Shortest Loopless Paths Algorithm
 */
export function yenKShortestPaths(
  zones: Zone[],
  edges: RoadEdge[],
  startZone: string,
  endZone: string,
  k: number = 3
): PathResult[] {
  const result: PathResult[] = [];
  const p0 = dijkstra(zones, edges, startZone, endZone);
  if (p0.path.length === 0 || p0.totalTime === Infinity) {
    return result;
  }

  result.push(p0);
  const potentialPaths: PathResult[] = [];

  for (let i = 1; i < k; i++) {
    const prevPath = result[i - 1].path;

    for (let j = 0; j < prevPath.length - 1; j++) {
      const spurNode = prevPath[j];
      const rootPath = prevPath.slice(0, j + 1);

      // Temporarily block edges used by previous paths sharing rootPath
      const excludedEdges = new Set<string>();
      for (const p of result) {
        if (p.path.length > j && p.path.slice(0, j + 1).join('-') === rootPath.join('-')) {
          const u = p.path[j];
          const v = p.path[j + 1];
          excludedEdges.add(`${u}-${v}`);
          excludedEdges.add(`${v}-${u}`);
        }
      }

      // Filtered edges
      const filteredEdges = edges.filter(
        (e) => !e.blocked && !excludedEdges.has(`${e.a}-${e.b}`)
      );

      const spurResult = dijkstra(zones, filteredEdges, spurNode, endZone);
      if (spurResult.path.length > 0 && spurResult.totalTime !== Infinity) {
        const totalCandidatePath = [...rootPath.slice(0, -1), ...spurResult.path];

        // Compute total path time
        let totalTime = 0;
        let valid = true;
        for (let pIdx = 0; pIdx < totalCandidatePath.length - 1; pIdx++) {
          const u = totalCandidatePath[pIdx];
          const v = totalCandidatePath[pIdx + 1];
          const edge = edges.find((e) => !e.blocked && ((e.a === u && e.b === v) || (e.a === v && e.b === u)));
          if (edge) {
            totalTime += edge.minutes;
          } else {
            valid = false;
            break;
          }
        }

        if (valid) {
          const candidateStr = totalCandidatePath.join('-');
          const alreadyInA = result.some((r) => r.path.join('-') === candidateStr);
          const alreadyInB = potentialPaths.some((r) => r.path.join('-') === candidateStr);

          if (!alreadyInA && !alreadyInB) {
            potentialPaths.push({
              path: totalCandidatePath,
              totalTime: Number(totalTime.toFixed(2)),
              deltaMinutes: Number((totalTime - p0.totalTime).toFixed(2)),
            });
          }
        }
      }
    }

    if (potentialPaths.length === 0) break;

    potentialPaths.sort((a, b) => a.totalTime - b.totalTime);
    result.push(potentialPaths.shift()!);
  }

  return result;
}

/**
 * BUILD TRAVEL MATRIX (Single Source of Truth)
 * 
 * Computes t(i,j) dynamically from the Supabase graph (zones + road_edges).
 * 
 * Formula:
 * - If zone_i != zone_j:
 *     shortest = dijkstra(zones, edges, zone_i, zone_j)
 *     if (shortest == Infinity) => Infinity
 *     t(i,j) = shortest + (localMin_i + localMin_j) / 2
 * - If zone_i == zone_j:
 *     t(i,j) = localMin of that zone (default 2.0)
 * 
 * This matrix represents road reachability only. Policy and response-cap feasibility
 * are applied by buildCostMatrix in the allocation model.
 */
export function buildTravelMatrix(
  units: Ambulance[],
  calls: Emergency[],
  zones: Zone[],
  edges: RoadEdge[]
): TravelMatrix {
  const zoneMap = new Map<string, Zone>();
  zones.forEach((z) => zoneMap.set(z.id, z));

  const ambIds = units.map((u) => u.id);
  const emIds = calls.map((c) => c.id);

  const travelTimes: Record<string, Record<string, number | null>> = {};
  const costs: Record<string, Record<string, number | null>> = {};
  const feasibility: Record<string, Record<string, boolean>> = {};
  const paths: Record<string, Record<string, string[]>> = {};
  const rawTimes: Record<string, Record<string, number>> = {};

  // Cache zone-to-zone Dijkstra shortest paths to avoid redundant calculations
  const zoneDistCache = new Map<string, { path: string[]; time: number }>();

  ambIds.forEach((aId) => {
    travelTimes[aId] = {};
    costs[aId] = {};
    feasibility[aId] = {};
    paths[aId] = {};
    rawTimes[aId] = {};
  });

  for (const unit of units) {
    const aId = unit.id;
    const uZone = zoneMap.get(unit.zoneId);
    const uLocalMin = uZone?.localMin ?? 2.0;

    for (const call of calls) {
      const eId = call.id;
      const cZone = zoneMap.get(call.zoneId);
      const cLocalMin = cZone?.localMin ?? 2.0;

      // Compute travel time via graph shortest path.
      let t: number;
      let path: string[];

      if (unit.zoneId === call.zoneId) {
        // Both in same zone: intra-zone transit time
        t = uLocalMin;
        path = [unit.zoneId];
      } else {
        const cacheKey = `${unit.zoneId}->${call.zoneId}`;
        let cached = zoneDistCache.get(cacheKey);
        if (!cached) {
          const res = dijkstra(zones, edges, unit.zoneId, call.zoneId);
          cached = { path: res.path, time: res.totalTime };
          zoneDistCache.set(cacheKey, cached);
        }

        if (cached.time === Infinity || cached.path.length === 0) {
          // Unreachable pair
          t = Infinity;
          path = [];
        } else {
          // Formula: shortest road distance + average intra-zone deltas
          t = cached.time + (uLocalMin + cLocalMin) / 2;
          path = cached.path;
        }
      }

      if (t === Infinity) {
        feasibility[aId][eId] = false;
        travelTimes[aId][eId] = null;
        costs[aId][eId] = null;
        paths[aId][eId] = [];
        rawTimes[aId][eId] = Infinity;
      } else {
        const roundedTime = Number(t.toFixed(1));
        feasibility[aId][eId] = true;
        travelTimes[aId][eId] = roundedTime;
        costs[aId][eId] = roundedTime;
        paths[aId][eId] = path;
        rawTimes[aId][eId] = roundedTime;
      }
    }
  }

  return {
    ambulanceIds: ambIds,
    emergencyIds: emIds,
    travelTimes,
    costs,
    feasibility,
    paths,
    rawTimes,
  };
}
