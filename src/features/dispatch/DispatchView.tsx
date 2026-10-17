import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Ambulance,
  Emergency,
  RoadEdge,
  Zone,
} from '../../types';
import { dataSource } from '../../data';
import {
  SolveRequest,
  SolveResponse,
  SolveAssignment,
  computeDijkstra,
} from '../../utils/solver';
import {
  Wordmark,
  TriageTag,
  UnitMarker,
  Button,
  IconButton,
  Tooltip,
  Kbd,
  ProvenanceChip,
  ConnectionChip,
  Panel,
  Modal,
  ToastContainer,
  ToastMessage,
  IconSolver,
  IconCheck,
  IconClose,
  IconClock,
  IconRoute,
  AnimatedCounter,
  SectionTitle,
  Stamp,
} from '../../design-system';
import { ConnectionStatus } from '../../data/DataSource';

interface DispatchViewProps {
  onNavigate: (route: string) => void;
}

export function DispatchView({ onNavigate }: DispatchViewProps) {
  // Domain Data State
  const [ambulances, setAmbulances] = useState<Ambulance[]>([]);
  const [emergencies, setEmergencies] = useState<Emergency[]>([]);
  const [roads, setRoads] = useState<RoadEdge[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);
  const [connStatus, setConnStatus] = useState<ConnectionStatus>(dataSource.getConnectionStatus());
  const [roundTripMs, setRoundTripMs] = useState<number>(dataSource.getRoundTripMs());

  // Solver Configuration
  const [solverMode, setSolverMode] = useState<'Weighted' | 'Plain'>('Weighted');
  const [solveResult, setSolveResult] = useState<SolveResponse | null>(null);
  const [isSolving, setIsSolving] = useState(false);
  const [scanStep, setScanStep] = useState<number>(-1); // for 600ms matrix row scan
  const [animStage, setAnimStage] = useState<number>(0); // 0=idle, 1=scanning, 2=ribbons, 3=done

  // Manual Adjust & Comparison State
  const [isAdjustMode, setIsAdjustMode] = useState(false);
  const [adjustedAssignments, setAdjustedAssignments] = useState<SolveAssignment[]>([]);
  const [isCompareOpen, setIsCompareOpen] = useState(false);
  const [hoveredCell, setHoveredCell] = useState<{ ambId: string; emId: string } | null>(null);

  // Dispatch Confirmation Modal State
  const [isConfirmDispatchOpen, setIsConfirmDispatchOpen] = useState(false);
  const [isExecutingDispatch, setIsExecutingDispatch] = useState(false);

  // Toast Notifications
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const addToast = (toast: Omit<ToastMessage, 'id'>) => {
    const id = `toast-${Date.now()}-${Math.random()}`;
    setToasts((prev) => [...prev, { ...toast, id }]);
  };

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  // Connection subscription
  useEffect(() => {
    const unsub = dataSource.subscribeConnection((status, rtt) => {
      setConnStatus(status);
      setRoundTripMs(rtt);
    });
    return () => unsub();
  }, []);

  // Load and Subscribe to Data
  useEffect(() => {
    const load = async () => {
      const [ambs, ems, rds, zs] = await Promise.all([
        dataSource.getAmbulances(),
        dataSource.getEmergencies(),
        dataSource.getRoads(),
        dataSource.getZones(),
      ]);
      setAmbulances(ambs);
      setEmergencies(ems);
      setRoads(rds);
      setZones(zs);
    };

    load();
    const unsubscribe = dataSource.subscribe(load);
    return () => unsubscribe();
  }, []);

  const availableAmbulances = useMemo(
    () => ambulances.filter((a) => a.status === 'Available'),
    [ambulances]
  );

  const pendingEmergencies = useMemo(
    () => emergencies.filter((e) => e.status === 'Pending'),
    [emergencies]
  );

  const zoneMap = useMemo(() => {
    const map = new Map<string, Zone>();
    zones.forEach((z) => map.set(z.id, z));
    return map;
  }, [zones]);

  const emergencyMap = useMemo(() => {
    const map = new Map<string, Emergency>();
    emergencies.forEach((e) => map.set(e.id, e));
    return map;
  }, [emergencies]);

  const ambulanceMap = useMemo(() => {
    const map = new Map<string, Ambulance>();
    ambulances.forEach((a) => map.set(a.id, a));
    return map;
  }, [ambulances]);

  // Execute Solve Choreography
  const handleSolve = async (overrideMode?: 'Weighted' | 'Plain') => {
    const mode = overrideMode || solverMode;
    if (availableAmbulances.length === 0 || pendingEmergencies.length === 0) {
      addToast({
        type: 'info',
        message: 'No available units or pending calls to optimize',
      });
      return;
    }

    setIsSolving(true);
    setAnimStage(1);
    setIsAdjustMode(false);

    // 1. Matrix row scan sweep (600ms)
    for (let r = 0; r < availableAmbulances.length; r++) {
      setScanStep(r);
      await new Promise((resolve) => setTimeout(resolve, Math.max(80, 500 / availableAmbulances.length)));
    }
    setScanStep(-1);
    setAnimStage(2);

    // 2. Compute exact optimal solution
    const result = await dataSource.solve({ mode });
    setSolveResult(result);
    setAdjustedAssignments(result.assignments);

    // 3. Stagger ribbon draw-in
    await new Promise((resolve) => setTimeout(resolve, 350));
    setAnimStage(3);
    setIsSolving(false);
  };

  // Keyboard shortcut: Ctrl+Enter or Cmd+Enter to solve
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        handleSolve();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [solverMode, availableAmbulances, pendingEmergencies]);

  // Initial solve on first mount when data loads
  const hasInitialSolved = useRef(false);
  useEffect(() => {
    if (
      !hasInitialSolved.current &&
      availableAmbulances.length > 0 &&
      pendingEmergencies.length > 0
    ) {
      hasInitialSolved.current = true;
      handleSolve();
    }
  }, [availableAmbulances.length, pendingEmergencies.length]);

  // Active Assignments (either optimal result or manual adjustment)
  const currentAssignments = isAdjustMode ? adjustedAssignments : (solveResult?.assignments || []);

  // Compute live adjusted metrics
  const activeMetrics = useMemo(() => {
    if (currentAssignments.length === 0) {
      return {
        totalWeightedMin: 0,
        totalRawMin: 0,
        avgResponseMin: 0,
        worstResponseMin: 0,
        servedCount: 0,
        totalCount: pendingEmergencies.length,
        slaHitsCount: 0,
      };
    }

    const totalWeighted = currentAssignments.reduce((s, a) => s + a.weightedMin, 0);
    const totalRaw = currentAssignments.reduce((s, a) => s + a.etaMin, 0);
    const avgResponse = +(totalRaw / currentAssignments.length).toFixed(1);
    const worstResponse = +Math.max(...currentAssignments.map((a) => a.etaMin)).toFixed(1);
    const slaHits = currentAssignments.filter((a) => a.etaMin <= 10.0).length;

    return {
      totalWeightedMin: +totalWeighted.toFixed(1),
      totalRawMin: +totalRaw.toFixed(1),
      avgResponseMin: avgResponse,
      worstResponseMin: worstResponse,
      servedCount: currentAssignments.length,
      totalCount: pendingEmergencies.length,
      slaHitsCount: slaHits,
    };
  }, [currentAssignments, pendingEmergencies.length]);

  // Delta calculation when manually adjusted vs optimal
  const adjustmentDelta = useMemo(() => {
    if (!solveResult || !isAdjustMode) return null;
    const diff = activeMetrics.totalWeightedMin - solveResult.metrics.totalWeightedMin;
    const pct = solveResult.metrics.totalWeightedMin > 0
      ? +((diff / solveResult.metrics.totalWeightedMin) * 100).toFixed(1)
      : 0;
    return { diff: +diff.toFixed(1), pct };
  }, [activeMetrics, solveResult, isAdjustMode]);

  // Handle Manual Override of a pairing
  const handleReassignCall = (emergencyId: string, newAmbulanceId: string) => {
    const em = emergencyMap.get(emergencyId);
    const newAmb = ambulanceMap.get(newAmbulanceId);
    if (!em || !newAmb) return;

    // Check road path
    const route = computeDijkstra(roads, newAmb.zoneId, em.zoneId);
    if (route.totalTime === Infinity || route.path.length === 0) {
      addToast({
        type: 'error',
        message: `Infeasible: No road route from Zone ${newAmb.zoneId} to Zone ${em.zoneId}`,
      });
      return;
    }

    // Check ALS capability
    if (em.requiresAls && newAmb.type !== 'ALS') {
      addToast({
        type: 'error',
        message: `Infeasible: ${em.id} requires ALS but ${newAmb.id} is BLS only`,
      });
      return;
    }

    // Travel time formula (single source of truth):
    // t(i,j) = shortestPath(zone_i → zone_j) + (localMin_i + localMin_j)/2 when zones differ; localMin when same zone.
    const ambZone = zoneMap.get(newAmb.zoneId);
    const emZone = zoneMap.get(em.zoneId);
    const ambLocalMin = ambZone?.localMin ?? 2.0;
    const emLocalMin = emZone?.localMin ?? 2.0;
    const etaMin = newAmb.zoneId === em.zoneId
      ? ambLocalMin
      : +(route.totalTime + (ambLocalMin + emLocalMin) / 2).toFixed(1);

    // Update assignment
    setAdjustedAssignments((prev) => {
      // Remove any existing assignment with newAmb
      const filtered = prev.filter((a) => a.ambulanceId !== newAmbulanceId && a.emergencyId !== emergencyId);
      const newAssign: SolveAssignment = {
        emergencyId: em.id,
        ambulanceId: newAmb.id,
        etaMin,
        weightedMin: +(etaMin * em.weight).toFixed(1),
        weight: em.weight,
        path: route.path,
      };
      return [...filtered, newAssign];
    });
  };

  // Confirm and Apply Dispatches (Atomic Batch via POST /api/dispatch -> RPC dispatch_batch)
  const handleConfirmDispatches = async () => {
    setIsExecutingDispatch(true);
    try {
      const items = currentAssignments.map((assign) => {
        const amb = ambulanceMap.get(assign.ambulanceId);
        const em = emergencyMap.get(assign.emergencyId);
        return {
          emergencyId: assign.emergencyId,
          ambulanceId: assign.ambulanceId,
          fromZone: amb?.zoneId || 'A',
          toZone: em?.zoneId || 'B',
          etaMin: assign.etaMin,
          path: assign.path,
        };
      });

      await dataSource.dispatchBatch(items, solveResult?.runId);

      setIsConfirmDispatchOpen(false);
      addToast({
        type: 'success',
        message: `Dispatched ${items.length} emergency units atomically`,
      });
      onNavigate('command');
    } catch (err: any) {
      addToast({
        type: 'error',
        message: err?.message || 'Database error: failed to execute batch dispatch',
      });
      setIsConfirmDispatchOpen(false);
      // Requirement 1: "if one assignment fails, none are applied; show the database error message in a toast and refresh the solve."
      handleSolve();
    } finally {
      setIsExecutingDispatch(false);
    }
  };

  // Helper to test if a pair is assigned
  const assignedPairMap = useMemo(() => {
    const map = new Map<string, string>(); // emId -> ambId
    currentAssignments.forEach((a) => map.set(a.emergencyId, a.ambulanceId));
    return map;
  }, [currentAssignments]);

  const assignedAmbulanceSet = useMemo(() => {
    const set = new Set<string>();
    currentAssignments.forEach((a) => set.add(a.ambulanceId));
    return set;
  }, [currentAssignments]);

  return (
    <div className="flex flex-col gap-6 w-full max-w-7xl mx-auto pb-16">
      {/* 1. Header with SectionTitle and Solver Status */}
      <SectionTitle
        eyebrow="MADURAI DISPATCH"
        title="Fleet allocation & queue matrix"
        accentWord="allocation"
        action={
          <div className="flex flex-wrap items-center gap-3">
            {solveResult ? (
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[var(--surface-raised)] border-2 border-[var(--line)] shadow-[2px_2px_0_var(--shadow-ink)] text-xs font-mono-numbers text-[var(--ink)]">
                <IconSolver size={13} className="text-[var(--unit-available)]" />
                <span className="font-bold">{solveResult.engine}</span>
                <span className="text-[var(--ink-muted)]">·</span>
                <span className="text-[var(--unit-available)] font-bold uppercase">
                  {solveResult.status}
                </span>
                <span className="text-[var(--ink-muted)]">·</span>
                <span className="tabular-nums font-bold">{solveResult.solveMs}ms</span>
                <ConnectionChip status={connStatus} roundTripMs={roundTripMs} />
              </div>
            ) : (
              <ConnectionChip status={connStatus} roundTripMs={roundTripMs} />
            )}
          </div>
        }
      />

        <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-[16px] bg-[var(--surface-raised)] border-2 border-[var(--line)] shadow-[3px_3px_0_var(--shadow-ink)]">
          {/* Objective Mode Switch: Weighted | Plain */}
          <div className="inline-flex items-center p-1 rounded-full bg-[var(--surface)] border-2 border-[var(--line)]">
            <button
              onClick={() => {
                setSolverMode('Weighted');
                handleSolve('Weighted');
              }}
              className={`px-3.5 py-1 text-xs font-mono-numbers uppercase tracking-wider rounded-full transition-all cursor-pointer font-bold ${
                solverMode === 'Weighted'
                  ? 'bg-[var(--ink)] text-[var(--bg-app)] shadow-[2px_2px_0_var(--signal)]'
                  : 'text-[var(--ink-muted)] hover:text-[var(--ink)]'
              }`}
            >
              Weighted
            </button>
            <button
              onClick={() => {
                setSolverMode('Plain');
                handleSolve('Plain');
              }}
              className={`px-3.5 py-1 text-xs font-mono-numbers uppercase tracking-wider rounded-full transition-all cursor-pointer font-bold ${
                solverMode === 'Plain'
                  ? 'bg-[var(--ink)] text-[var(--bg-app)] shadow-[2px_2px_0_var(--signal)]'
                  : 'text-[var(--ink-muted)] hover:text-[var(--ink)]'
              }`}
            >
              Plain
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Big Solve Button */}
            <Tooltip content="Execute dual-solver optimization" shortcut="Ctrl+↵">
              <Button
                variant="primary"
                size="md"
                isLoading={isSolving}
                onClick={() => handleSolve()}
                icon={<IconSolver size={15} />}
              >
                Solve
              </Button>
            </Tooltip>

            {/* Compare Toggle */}
            <Button
              variant={isCompareOpen ? 'secondary' : 'ghost'}
              size="md"
              onClick={() => setIsCompareOpen(!isCompareOpen)}
            >
              {isCompareOpen ? 'Hide Baseline' : 'Compare'}
            </Button>

            {/* Post-Solve Actions */}
            {solveResult && (
              <>
                <Button
                  variant={isAdjustMode ? 'secondary' : 'ghost'}
                  size="md"
                  onClick={() => setIsAdjustMode(!isAdjustMode)}
                >
                  {isAdjustMode ? 'Lock Adjustment' : 'Adjust'}
                </Button>

                <Button
                  variant="primary"
                  size="md"
                  onClick={() => setIsConfirmDispatchOpen(true)}
                >
                  Dispatch
                </Button>
              </>
            )}
          </div>
        </div>

      {/* Manual Override Delta Alert */}
      {adjustmentDelta && adjustmentDelta.diff !== 0 && (
        <div
          className={`p-3 rounded-[8px] border flex items-center justify-between text-xs font-mono-numbers animate-in fade-in ${
            adjustmentDelta.diff > 0
              ? 'bg-[rgba(229,50,45,0.08)] border-[rgba(229,50,45,0.3)] text-[var(--critical)]'
              : 'bg-[rgba(15,139,141,0.08)] border-[rgba(15,139,141,0.3)] text-[var(--unit-available)]'
          }`}
        >
          <div className="flex items-center gap-2">
            <span>Manual adjustment vs Optimal:</span>
            <span className="font-semibold tabular-nums">
              {adjustmentDelta.diff > 0 ? `+${adjustmentDelta.diff}m` : `${adjustmentDelta.diff}m`} ({adjustmentDelta.pct > 0 ? `+${adjustmentDelta.pct}%` : `${adjustmentDelta.pct}%`})
            </span>
            {adjustmentDelta.diff > 0 && <span className="opacity-80">Suboptimal response delay introduced</span>}
          </div>
          <button
            onClick={() => {
              setAdjustedAssignments(solveResult?.assignments || []);
              setIsAdjustMode(false);
            }}
            className="text-[11px] underline uppercase cursor-pointer"
          >
            Reset to Optimum
          </button>
        </div>
      )}

      {/* 2. Top RESULT Strip (Large Serif Numerals with Mono Unit Suffixes) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        <Panel title="Weighted Time" badge="DERIVED">
          <div className="flex items-baseline gap-1.5">
            <span className="font-serif-display text-3xl sm:text-4xl text-[var(--ink)] tabular-nums">
              <AnimatedCounter value={activeMetrics.totalWeightedMin} decimals={1} />
            </span>
            <span className="font-mono-numbers text-xs text-[var(--ink-muted)]">min</span>
          </div>
          <span className="text-[11px] text-[var(--ink-muted)] block mt-1">
            Total triage weighted
          </span>
        </Panel>

        <Panel title="Average Response" badge="DERIVED">
          <div className="flex items-baseline gap-1.5">
            <span className="font-serif-display text-3xl sm:text-4xl text-[var(--unit-available)] tabular-nums">
              <AnimatedCounter value={activeMetrics.avgResponseMin} decimals={1} />
            </span>
            <span className="font-mono-numbers text-xs text-[var(--ink-muted)]">min</span>
          </div>
          <span className="text-[11px] text-[var(--ink-muted)] block mt-1">
            Mean corridor traversal
          </span>
        </Panel>

        <Panel title="Worst Response" badge="DERIVED">
          <div className="flex items-baseline gap-1.5">
            <span
              className={`font-serif-display text-3xl sm:text-4xl tabular-nums ${
                activeMetrics.worstResponseMin > 10.0 ? 'text-[var(--critical)]' : 'text-[var(--ink)]'
              }`}
            >
              <AnimatedCounter value={activeMetrics.worstResponseMin} decimals={1} />
            </span>
            <span className="font-mono-numbers text-xs text-[var(--ink-muted)]">max min</span>
          </div>
          <span className="text-[11px] text-[var(--ink-muted)] block mt-1">
            Maximum single response
          </span>
        </Panel>

        <Panel title="Served Units" badge="REAL SAMPLE">
          <div className="flex items-baseline gap-1.5">
            <span className="font-serif-display text-3xl sm:text-4xl text-[var(--ink)] tabular-nums">
              <AnimatedCounter value={activeMetrics.servedCount} />/{activeMetrics.totalCount}
            </span>
            <span className="font-mono-numbers text-xs text-[var(--ink-muted)]">served</span>
          </div>
          <span className="text-[11px] text-[var(--ink-muted)] block mt-1">
            Fleet allocation ratio
          </span>
        </Panel>

        <Panel title="SLA Compliance" badge="DERIVED">
          <div className="flex items-baseline gap-1.5">
            <span className="font-serif-display text-3xl sm:text-4xl text-[var(--unit-available)] tabular-nums">
              <AnimatedCounter value={activeMetrics.slaHitsCount} />/{activeMetrics.servedCount}
            </span>
            <span className="font-mono-numbers text-xs text-[var(--ink-muted)]">in SLA</span>
          </div>
          <span className="text-[11px] text-[var(--ink-muted)] block mt-1">
            Target response &le;10 min
          </span>
        </Panel>
      </div>

      {/* Baseline Comparison Split Panel (When "Compare" is Active) */}
      {isCompareOpen && solveResult && (
        <div className="p-5 rounded-[20px] bg-[var(--surface-raised)] border-2 border-[var(--line)] shadow-[6px_6px_0_var(--shadow-ink)] flex flex-col gap-4 animate-in fade-in duration-150">
          <div className="flex items-center justify-between pb-2 border-b border-[var(--line)]">
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono-numbers font-semibold uppercase tracking-wider text-[var(--ink)]">
                Algorithmic Benchmark: Manual (FCFS) vs Optimized
              </span>
              <ProvenanceChip kind="DERIVED" />
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs font-mono-numbers text-[var(--ink-muted)]">Improvement:</span>
              <span className="text-sm font-serif-display text-[var(--unit-available)] font-bold">
                {-(
                  ((solveResult.metrics.totalWeightedMin - solveResult.baselines.fcfs.totalWeightedMin) /
                    Math.max(1, solveResult.baselines.fcfs.totalWeightedMin)) *
                  100
                ).toFixed(1)}
                %
              </span>
              <span className="text-xs font-mono-numbers text-[var(--unit-available)]">
                (-{(solveResult.baselines.fcfs.totalWeightedMin - solveResult.metrics.totalWeightedMin).toFixed(1)}m)
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs font-mono-numbers">
            <div className="p-3 rounded-[6px] bg-[var(--surface)] border border-[var(--line)] flex flex-col gap-2">
              <span className="text-[11px] font-semibold text-[var(--ink-muted)] uppercase">
                Manual / First-Come-First-Served (FCFS)
              </span>
              <div className="flex justify-between">
                <span className="text-[var(--ink-muted)]">Weighted Time:</span>
                <span className="text-[var(--ink)] font-semibold">{solveResult.baselines.fcfs.totalWeightedMin} min</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--ink-muted)]">Average Response:</span>
                <span className="text-[var(--ink)] font-semibold">{solveResult.baselines.fcfs.avgResponseMin} min</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--ink-muted)]">Worst Case:</span>
                <span className="text-[var(--critical)] font-semibold">{solveResult.baselines.fcfs.worstResponseMin} min</span>
              </div>
            </div>

            <div className="p-3 rounded-[6px] bg-[var(--surface)] border border-[var(--unit-available)]/30 flex flex-col gap-2">
              <span className="text-[11px] font-semibold text-[var(--unit-available)] uppercase">
                {solveResult.engine} Optimized
              </span>
              <div className="flex justify-between">
                <span className="text-[var(--ink-muted)]">Weighted Time:</span>
                <span className="text-[var(--unit-available)] font-semibold">{solveResult.metrics.totalWeightedMin} min</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--ink-muted)]">Average Response:</span>
                <span className="text-[var(--unit-available)] font-semibold">{solveResult.metrics.avgResponseMin} min</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--ink-muted)]">Worst Case:</span>
                <span className="text-[var(--ink)] font-semibold">{solveResult.metrics.worstResponseMin} min</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 3. Main Operational Panels: Cost Matrix Heatmap + Matching Diagram */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column (5 Cols): COST MATRIX Heatmap */}
        <div className="lg:col-span-5 flex flex-col gap-4">
          <Panel
            title="Cost Matrix"
            action={
              <Tooltip content="t(i,j) = shortestPath(zone_i → zone_j) + (localMin_i + localMin_j)/2 when zones differ; localMin when same zone. Infeasible if ALS required by call but unit is BLS.">
                <div>
                  <ProvenanceChip kind="DERIVED" />
                </div>
              </Tooltip>
            }
          >
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between text-[11px] font-mono-numbers text-[var(--ink-muted)]">
                <span>Rows: Available Fleet · Cols: Pending Calls</span>
                <span>Teal ramp (dark = slower)</span>
              </div>

              {/* Heatmap Grid Table */}
              <div className="overflow-x-auto rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)]">
                <table className="w-full text-center text-xs font-mono-numbers border-collapse">
                  <thead>
                    <tr className="border-b border-[var(--line)] bg-[var(--surface)]/80">
                      <th className="py-2 px-2 text-left text-[10px] text-[var(--ink-muted)] font-medium">
                        Unit \ Call
                      </th>
                      {pendingEmergencies.map((em) => (
                        <th
                          key={em.id}
                          className={`py-2 px-1 text-center transition-colors ${
                            hoveredCell?.emId === em.id ? 'bg-[var(--surface-raised)]' : ''
                          }`}
                        >
                          <div className="flex flex-col items-center gap-1">
                            <span className="font-semibold text-[var(--ink)]">{em.id}</span>
                            <TriageTag priority={em.priority} weight={em.weight} size="sm" />
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--line)]">
                    {availableAmbulances.map((amb, rIdx) => {
                      const isScanningThisRow = scanStep === rIdx;
                      const isRowHovered = hoveredCell?.ambId === amb.id;

                      return (
                        <tr
                          key={amb.id}
                          className={`transition-colors ${
                            isScanningThisRow
                              ? 'bg-[var(--unit-available)]/20'
                              : isRowHovered
                              ? 'bg-[var(--surface)]/80'
                              : ''
                          }`}
                        >
                          {/* Unit Row Header */}
                          <td className="py-2.5 px-2 text-left whitespace-nowrap bg-[var(--surface)]/60 border-r border-[var(--line)]">
                            <div className="flex items-center gap-1.5">
                              <UnitMarker status={amb.status} size="sm" />
                              <span className="font-semibold text-[var(--ink)]">{amb.id}</span>
                              <span className="text-[9px] text-[var(--ink-muted)]">({amb.zoneId})</span>
                            </div>
                          </td>

                          {/* Matrix Cells */}
                          {pendingEmergencies.map((em) => {
                            const cost = solveResult?.matrix.costs[amb.id]?.[em.id];
                            const time = solveResult?.matrix.travelTimes[amb.id]?.[em.id];
                            const isFeasible = solveResult?.matrix.feasibility[amb.id]?.[em.id] ?? true;
                            const isAssigned = assignedPairMap.get(em.id) === amb.id;
                            const isExceedSla = time !== null && time !== undefined && time > 10.0;

                            // Calculate teal intensity ramp (0 to 14 minutes)
                            const intensity = time ? Math.min(1, Math.max(0.1, time / 15)) : 0;
                            const cellBg = isFeasible && time !== null
                              ? `rgba(15, 139, 141, ${intensity * 0.35})`
                              : 'transparent';

                            const isCellHovered = hoveredCell?.ambId === amb.id && hoveredCell?.emId === em.id;

                            return (
                              <td
                                key={em.id}
                                onMouseEnter={() => setHoveredCell({ ambId: amb.id, emId: em.id })}
                                onMouseLeave={() => setHoveredCell(null)}
                                onClick={() => {
                                  if (isAdjustMode && isFeasible) {
                                    handleReassignCall(em.id, amb.id);
                                  }
                                }}
                                className={`relative py-2 px-1 text-center transition-all cursor-pointer select-none ${
                                  isAssigned
                                    ? 'ring-2 ring-inset ring-[var(--ink)] font-bold'
                                    : ''
                                } ${isCellHovered ? 'ring-1 ring-[var(--line)]' : ''}`}
                                style={{ backgroundColor: cellBg }}
                                title={`${amb.id} (${amb.zoneId}) → ${em.id} (${em.zoneId}): ${
                                  isFeasible && time !== null ? `${time}m (${cost} weighted)` : 'Infeasible'
                                }`}
                              >
                                {/* Exceed SLA Red Corner Mark */}
                                {isExceedSla && (
                                  <div
                                    aria-hidden="true"
                                    className="absolute top-0 right-0 w-2 h-2 border-t-2 border-r-2 border-[var(--critical)] pointer-events-none"
                                  />
                                )}

                                {!isFeasible ? (
                                  <span className="text-[var(--critical)] opacity-60 font-serif text-sm">
                                    &empty;
                                  </span>
                                ) : time !== null && time !== undefined ? (
                                  <span className="tabular-nums text-[var(--ink)] font-medium">
                                    {time.toFixed(1)}
                                  </span>
                                ) : (
                                  <span className="text-[var(--ink-subtle)]">-</span>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Matrix Legend */}
              <div className="flex flex-wrap items-center justify-between text-[10px] font-mono-numbers text-[var(--ink-muted)] pt-1">
                <span className="flex items-center gap-1">
                  <span className="w-2.5 h-2.5 border border-[var(--ink)] ring-1 ring-[var(--ink)]" />
                  <span>Assigned match</span>
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 border-t-2 border-r-2 border-[var(--critical)]" />
                  <span>&gt;10m SLA breach</span>
                </span>
                <span className="flex items-center gap-1">
                  <span className="text-[var(--critical)] font-serif text-xs">&empty;</span>
                  <span>Infeasible</span>
                </span>
              </div>
            </div>
          </Panel>
        </div>

        {/* Right Column (7 Cols): MATCHING Diagram (Bipartite Ribbons) */}
        <div className="lg:col-span-7 flex flex-col gap-4">
          <Panel title="Matching" badge="DERIVED">
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between text-[11px] font-mono-numbers text-[var(--ink-muted)]">
                <span>Available Units (Left) &bull; Pending Calls (Right)</span>
                <span>Ribbon thickness = triage weight</span>
              </div>

              {/* Bipartite Graph Area */}
              <div className="relative w-full min-h-[340px] flex items-stretch justify-between p-4 rounded-[8px] bg-[var(--surface-raised)] border border-[var(--line)] overflow-hidden">
                {/* Left Stack: Units */}
                <div className="flex flex-col justify-around gap-4 z-10 w-28 shrink-0">
                  {availableAmbulances.map((amb) => {
                    const isMatched = assignedAmbulanceSet.has(amb.id);

                    return (
                      <div
                        key={amb.id}
                        id={`amb-node-${amb.id}`}
                        className={`p-2 rounded-[6px] border transition-all flex items-center justify-between ${
                          isMatched
                            ? 'bg-[var(--surface)] border-[var(--ink)] shadow-xs'
                            : 'bg-[var(--surface)]/40 border-[var(--line)] opacity-60'
                        }`}
                      >
                        <div className="flex items-center gap-1.5">
                          <UnitMarker status={amb.status} size="sm" />
                          <span className="font-mono-numbers font-semibold text-xs text-[var(--ink)]">
                            {amb.id}
                          </span>
                        </div>
                        <span className="text-[10px] font-mono-numbers text-[var(--ink-muted)]">
                          {amb.zoneId}
                        </span>
                      </div>
                    );
                  })}
                </div>

                {/* Center SVG: Curved Connecting Ribbons */}
                <div className="absolute inset-0 pointer-events-none">
                  <svg className="w-full h-full overflow-visible">
                    {currentAssignments.map((assign, index) => {
                      const em = emergencyMap.get(assign.emergencyId);
                      if (!em) return null;

                      // Priority color
                      const colorMap: Record<string, string> = {
                        Critical: '#E5322D',
                        High: '#F08A00',
                        Medium: '#E8C21A',
                        Low: '#3FA66B',
                      };
                      const color = colorMap[em.priority] || '#0F8B8D';

                      // Thickness by priority weight (1=2.5px, 5=7px)
                      const strokeWidth = Math.max(2.5, assign.weight * 1.5);

                      // Calculate vertical percentage anchor positions
                      const ambIdx = availableAmbulances.findIndex((a) => a.id === assign.ambulanceId);
                      const emIdx = pendingEmergencies.findIndex((e) => e.id === assign.emergencyId);

                      const totalAmbs = Math.max(1, availableAmbulances.length);
                      const totalEms = Math.max(1, pendingEmergencies.length);

                      const y1Pct = ((ambIdx + 0.5) / totalAmbs) * 100;
                      const y2Pct = ((emIdx + 0.5) / totalEms) * 100;

                      return (
                        <g key={assign.emergencyId} className="transition-all duration-300">
                          {/* Shadow ribbon */}
                          <path
                            d={`M 115 ${y1Pct}% C 240 ${y1Pct}%, 300 ${y2Pct}%, calc(100% - 145px) ${y2Pct}%`}
                            fill="none"
                            stroke={color}
                            strokeWidth={strokeWidth + 2}
                            strokeOpacity="0.15"
                            strokeLinecap="round"
                          />
                          {/* Core colored ribbon */}
                          <path
                            d={`M 115 ${y1Pct}% C 240 ${y1Pct}%, 300 ${y2Pct}%, calc(100% - 145px) ${y2Pct}%`}
                            fill="none"
                            stroke={color}
                            strokeWidth={strokeWidth}
                            strokeOpacity="0.85"
                            strokeLinecap="round"
                            className="ribbon-path"
                          />
                        </g>
                      );
                    })}
                  </svg>
                </div>

                {/* Right Stack: Calls */}
                <div className="flex flex-col justify-around gap-4 z-10 w-36 shrink-0 ml-auto">
                  {pendingEmergencies.map((em) => {
                    const assignedAmbId = assignedPairMap.get(em.id);
                    const isMatched = Boolean(assignedAmbId);

                    return (
                      <div
                        key={em.id}
                        id={`em-node-${em.id}`}
                        className={`p-2 rounded-[6px] border transition-all flex items-center justify-between gap-1.5 ${
                          isMatched
                            ? 'bg-[var(--surface)] border-[var(--line)] shadow-xs'
                            : 'bg-[var(--surface)]/40 border-dashed border-[var(--line)] opacity-80'
                        }`}
                      >
                        <div className="flex items-center gap-1.5">
                          <TriageTag priority={em.priority} weight={em.weight} size="sm" />
                          <span className="font-mono-numbers font-semibold text-xs text-[var(--ink)]">
                            {em.id}
                          </span>
                        </div>

                        {assignedAmbId ? (
                          <span className="font-mono-numbers text-[10px] text-[var(--unit-available)] font-semibold">
                            &larr; {assignedAmbId}
                          </span>
                        ) : (
                          <span className="font-mono-numbers text-[9px] text-[var(--ink-subtle)] uppercase">
                            Queued
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Unserved Calls Queue Slot with dashed outline & one-word reason chip */}
              {solveResult && solveResult.unserved.length > 0 && (
                <div className="p-3 rounded-[8px] border border-dashed border-[var(--line)] bg-[var(--surface)] flex flex-col gap-2">
                  <span className="text-[10px] font-mono-numbers uppercase text-[var(--ink-muted)]">
                    Unserved Queue ({solveResult.unserved.length})
                  </span>
                  <div className="flex flex-wrap items-center gap-2">
                    {solveResult.unserved.map((u) => {
                      const em = emergencyMap.get(u.emergencyId);
                      return (
                        <div
                          key={u.emergencyId}
                          className="px-2.5 py-1 rounded-[4px] bg-[var(--surface-raised)] border border-[var(--line)] flex items-center gap-2 text-xs font-mono-numbers"
                        >
                          {em && <TriageTag priority={em.priority} size="sm" />}
                          <span className="font-semibold text-[var(--ink)]">{u.emergencyId}</span>
                          <span className="text-[9px] uppercase px-1 py-0.2 rounded-[2px] bg-[rgba(229,50,45,0.1)] text-[var(--critical)] border border-[rgba(229,50,45,0.25)]">
                            {u.reason}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </Panel>
        </div>
      </div>

      {/* Confirmation Modal to Dispatch */}
      <Modal
        isOpen={isConfirmDispatchOpen}
        onClose={() => setIsConfirmDispatchOpen(false)}
        title="Confirm Dispatch"
      >
        <div className="flex flex-col gap-4">
          <p className="text-xs text-[var(--ink-muted)] leading-relaxed font-ui">
            Deploy {currentAssignments.length} optimal ambulance assignments across the Madurai sector road network? Units will transition to Busy (EnRoute).
          </p>

          <div className="p-3 bg-[var(--surface)] border border-[var(--line)] rounded-[8px] flex flex-col gap-1.5 font-mono-numbers text-xs">
            {currentAssignments.map((a) => (
              <div key={a.emergencyId} className="flex items-center justify-between">
                <span>
                  Unit {a.ambulanceId} &rarr; Incident {a.emergencyId}
                </span>
                <span className="text-[var(--unit-available)] font-semibold">{a.etaMin}m ETA</span>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-[var(--line)]">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsConfirmDispatchOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              isLoading={isExecutingDispatch}
              onClick={handleConfirmDispatches}
            >
              Confirm Dispatch
            </Button>
          </div>
        </div>
      </Modal>

      {/* Toast Notification Container */}
      <ToastContainer toasts={toasts} onDismiss={removeToast} />

      <style>{`
        @keyframes drawRibbon {
          from {
            stroke-dashoffset: 400;
          }
          to {
            stroke-dashoffset: 0;
          }
        }
        .ribbon-path {
          stroke-dasharray: 400;
          animation: drawRibbon 0.45s ease-out forwards;
        }
        @media (prefers-reduced-motion: reduce) {
          .ribbon-path {
            animation: none !important;
            stroke-dasharray: none !important;
          }
        }
      `}</style>
    </div>
  );
}
