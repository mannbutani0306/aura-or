/**
 * AURA Shortest-Path Graph Engine
 * Pure TypeScript module with zero UI dependencies.
 * Implements Dijkstra with Binary Min-Heap and Yen's K-Shortest Loopless Paths.
 */

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
 * Minimal Binary Min-Heap for Dijkstra
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
 * Standard Dijkstra shortest path using Binary Min-Heap
 */
export function dijkstra(
  edges: GraphEdge[],
  start: string,
  target: string,
  excludedEdges: Set<string> = new Set()
): PathResult {
  if (start === target) {
    return { path: [start], totalTime: 0, deltaMinutes: 0 };
  }

  // Build adjacency list (filtering blocked and dynamically excluded edges)
  const adj = new Map<string, { to: string; weight: number; edgeKey: string }[]>();
  const nodes = new Set<string>();

  edges.forEach((e) => {
    if (e.blocked) return;
    const edgeKey1 = `${e.from}->${e.to}`;
    const edgeKey2 = `${e.to}->${e.from}`;
    if (excludedEdges.has(edgeKey1) || excludedEdges.has(edgeKey2)) return;

    nodes.add(e.from);
    nodes.add(e.to);

    const fromList = adj.get(e.from) || [];
    fromList.push({ to: e.to, weight: e.weight, edgeKey: edgeKey1 });
    adj.set(e.from, fromList);

    const toList = adj.get(e.to) || [];
    toList.push({ to: e.from, weight: e.weight, edgeKey: edgeKey2 });
    adj.set(e.to, toList);
  });

  if (!nodes.has(start) || !nodes.has(target)) {
    return { path: [], totalTime: Infinity };
  }

  const dist: Record<string, number> = {};
  const prev: Record<string, string | null> = {};
  nodes.forEach((n) => {
    dist[n] = Infinity;
    prev[n] = null;
  });

  dist[start] = 0;
  const heap = new MinHeap<string>();
  heap.push(0, start);

  while (heap.size > 0) {
    const item = heap.pop();
    if (!item) break;
    const { key: d, value: u } = item;

    if (d > dist[u]) continue;
    if (u === target) break;

    const neighbors = adj.get(u) || [];
    for (const edge of neighbors) {
      const alt = dist[u] + edge.weight;
      if (alt < dist[edge.to]) {
        dist[edge.to] = alt;
        prev[edge.to] = u;
        heap.push(alt, edge.to);
      }
    }
  }

  if (dist[target] === Infinity) {
    return { path: [], totalTime: Infinity };
  }

  const path: string[] = [];
  let curr: string | null = target;
  while (curr) {
    path.unshift(curr);
    curr = prev[curr];
  }

  return {
    path,
    totalTime: +dist[target].toFixed(1),
    deltaMinutes: 0,
  };
}

/**
 * Step-by-Step Dijkstra Algorithm Execution Engine
 * Generates exact chronological states of Dijkstra exploration for step scrubbing.
 */
export function traceDijkstra(
  edges: GraphEdge[],
  start: string,
  target: string
): DijkstraTraceResult {
  const steps: DijkstraStep[] = [];

  // Build adjacency list
  const adj = new Map<string, { to: string; weight: number }[]>();
  const allNodesSet = new Set<string>();

  edges.forEach((e) => {
    allNodesSet.add(e.from);
    allNodesSet.add(e.to);
    if (e.blocked) return;

    const fromList = adj.get(e.from) || [];
    fromList.push({ to: e.to, weight: e.weight });
    adj.set(e.from, fromList);

    const toList = adj.get(e.to) || [];
    toList.push({ to: e.from, weight: e.weight });
    adj.set(e.to, toList);
  });

  allNodesSet.add(start);
  allNodesSet.add(target);

  const allNodes = Array.from(allNodesSet).sort();
  const dist: Record<string, number> = {};
  const prev: Record<string, string | null> = {};
  const visited = new Set<string>();
  const unvisited = new Set<string>(allNodes);

  allNodes.forEach((n) => {
    dist[n] = Infinity;
    prev[n] = null;
  });
  dist[start] = 0;

  let stepCounter = 0;

  // Step 0: Initial state
  steps.push({
    stepIndex: stepCounter++,
    currentNode: start,
    currentDistance: 0,
    visitedNodes: [],
    unvisitedNodes: [...unvisited],
    tentativeDistances: { ...dist },
    previousNodes: { ...prev },
    evaluatingEdge: null,
    phase: 'init',
    description: `Initialize distances. Origin ${start} set to 0.0m; all other sectors set to ∞.`,
  });

  while (unvisited.size > 0) {
    // Pick unvisited node with smallest distance
    let u: string | null = null;
    let minDist = Infinity;

    for (const n of unvisited) {
      if (dist[n] < minDist) {
        minDist = dist[n];
        u = n;
      }
    }

    if (!u || minDist === Infinity) {
      // Remaining nodes unreachable
      steps.push({
        stepIndex: stepCounter++,
        currentNode: null,
        currentDistance: Infinity,
        visitedNodes: [...visited],
        unvisitedNodes: [...unvisited],
        tentativeDistances: { ...dist },
        previousNodes: { ...prev },
        evaluatingEdge: null,
        phase: 'unreachable',
        description: `No traversable road corridor found to remaining sectors. Destination unreachable.`,
      });
      break;
    }

    // Step: Select minimum node
    unvisited.delete(u);
    visited.add(u);

    steps.push({
      stepIndex: stepCounter++,
      currentNode: u,
      currentDistance: minDist,
      visitedNodes: [...visited],
      unvisitedNodes: [...unvisited],
      tentativeDistances: { ...dist },
      previousNodes: { ...prev },
      evaluatingEdge: null,
      phase: 'select_min',
      description: `Selected sector ${u} with minimum tentative distance ${minDist.toFixed(1)}m from queue.`,
    });

    if (u === target) {
      steps.push({
        stepIndex: stepCounter++,
        currentNode: u,
        currentDistance: minDist,
        visitedNodes: [...visited],
        unvisitedNodes: [...unvisited],
        tentativeDistances: { ...dist },
        previousNodes: { ...prev },
        evaluatingEdge: null,
        phase: 'finished',
        description: `Target incident sector ${target} reached! Optimal shortest path locked.`,
      });
      break;
    }

    // Relax all edges from u
    const neighbors = adj.get(u) || [];
    for (const edge of neighbors) {
      if (!visited.has(edge.to)) {
        const newDist = +(dist[u] + edge.weight).toFixed(1);
        const oldDist = dist[edge.to];
        const relaxed = newDist < oldDist;

        if (relaxed) {
          dist[edge.to] = newDist;
          prev[edge.to] = u;
        }

        steps.push({
          stepIndex: stepCounter++,
          currentNode: u,
          currentDistance: dist[u],
          visitedNodes: [...visited],
          unvisitedNodes: [...unvisited],
          tentativeDistances: { ...dist },
          previousNodes: { ...prev },
          evaluatingEdge: {
            from: u,
            to: edge.to,
            weight: edge.weight,
            newTentativeDist: newDist,
            relaxed,
          },
          phase: 'relax_edge',
          description: relaxed
            ? `Corridor ${u} ↔ ${edge.to} (${edge.weight}m): Relaxed tentative distance of ${edge.to} from ${
                oldDist === Infinity ? '∞' : `${oldDist}m`
              } down to ${newDist}m.`
            : `Corridor ${u} ↔ ${edge.to} (${edge.weight}m): Candidate ${newDist}m does not improve current ${oldDist}m. Kept existing route.`,
        });
      }
    }
  }

  const success = dist[target] !== Infinity;
  const path: string[] = [];
  if (success) {
    let curr: string | null = target;
    while (curr) {
      path.unshift(curr);
      curr = prev[curr];
    }
  }

  return {
    path,
    totalTime: success ? +dist[target].toFixed(1) : Infinity,
    steps,
    success,
  };
}

/**
 * Yen's K-Shortest Loopless Paths Algorithm
 * Computes the optimal path plus up to (k-1) loopless alternate paths.
 */
export function yenKShortestPaths(
  edges: GraphEdge[],
  start: string,
  target: string,
  k = 3
): PathResult[] {
  const firstPath = dijkstra(edges, start, target);
  if (firstPath.path.length === 0 || firstPath.totalTime === Infinity) {
    return [];
  }

  const A: PathResult[] = [firstPath];
  const B: { path: string[]; totalTime: number }[] = [];

  for (let kIndex = 1; kIndex < k; kIndex++) {
    const prevPath = A[kIndex - 1].path;

    for (let i = 0; i < prevPath.length - 1; i++) {
      const spurNode = prevPath[i];
      const rootPath = prevPath.slice(0, i + 1);

      const excludedEdges = new Set<string>();

      // Exclude edges that are part of previous paths that share the same root path
      for (const p of A) {
        if (p.path.length > i && rootPath.every((node, idx) => node === p.path[idx])) {
          excludedEdges.add(`${p.path[i]}->${p.path[i + 1]}`);
          excludedEdges.add(`${p.path[i + 1]}->${p.path[i]}`);
        }
      }

      // Spur path from spurNode to target
      const spurPathResult = dijkstra(edges, spurNode, target, excludedEdges);

      if (spurPathResult.path.length > 0 && spurPathResult.totalTime !== Infinity) {
        const totalPath = [...rootPath.slice(0, -1), ...spurPathResult.path];

        // Ensure loopless
        const isLoopless = new Set(totalPath).size === totalPath.length;
        if (isLoopless) {
          // Calculate total time
          let totalTime = 0;
          for (let step = 0; step < totalPath.length - 1; step++) {
            const u = totalPath[step];
            const v = totalPath[step + 1];
            const edge = edges.find((e) => !e.blocked && ((e.from === u && e.to === v) || (e.from === v && e.to === u)));
            if (edge) totalTime += edge.weight;
          }

          const pathStr = totalPath.join('->');
          if (!B.some((candidate) => candidate.path.join('->') === pathStr)) {
            B.push({ path: totalPath, totalTime: +totalTime.toFixed(1) });
          }
        }
      }
    }

    if (B.length === 0) break;

    // Sort B by total time and move shortest to A
    B.sort((a, b) => a.totalTime - b.totalTime);
    const bestCandidate = B.shift()!;
    const delta = +(bestCandidate.totalTime - A[0].totalTime).toFixed(1);

    A.push({
      path: bestCandidate.path,
      totalTime: bestCandidate.totalTime,
      deltaMinutes: delta,
    });
  }

  return A;
}
