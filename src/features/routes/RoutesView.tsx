import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  Panel,
  Button,
  ProvenanceChip,
  TriageTag,
  SlaRing,
  Tooltip,
  SectionTitle,
} from '../../design-system';
import { dataSource } from '../../data';
import { Zone, RoadEdge, Ambulance, Emergency, Dispatch } from '../../types';
import {
  GraphEdge,
  PathResult,
  DijkstraStep,
  dijkstra,
  traceDijkstra,
  yenKShortestPaths,
} from '../../engine/graph';
import { RouteMap } from './RouteMap';

interface RoutesViewProps {
  onNavigate: (route: string) => void;
  theme?: 'paper' | 'night';
}

export function RoutesView({ onNavigate, theme = 'paper' }: RoutesViewProps) {
  // Data subscriptions
  const [zones, setZones] = useState<Zone[]>([]);
  const [roads, setRoads] = useState<RoadEdge[]>([]);
  const [ambulances, setAmbulances] = useState<Ambulance[]>([]);
  const [emergencies, setEmergencies] = useState<Emergency[]>([]);
  const [dispatches, setDispatches] = useState<Dispatch[]>([]);

  // Selection states
  const [selectionMode, setSelectionMode] = useState<'dispatched' | 'custom'>('custom');
  const [selectedDispatchId, setSelectedDispatchId] = useState<string>('');
  const [selectedAmbulanceId, setSelectedAmbulanceId] = useState<string>('A1');
  const [selectedEmergencyId, setSelectedEmergencyId] = useState<string>('E1');
  const [targetZoneOverride, setTargetZoneOverride] = useState<string>('');

  // Alternative route selection
  const [selectedPathOverride, setSelectedPathOverride] = useState<string[] | null>(null);

  // Dijkstra Tracing states
  const [isTracing, setIsTracing] = useState<boolean>(false);
  const [traceStepIndex, setTraceStepIndex] = useState<number>(0);
  const [isTracePlaying, setIsTracePlaying] = useState<boolean>(false);
  const [traceSpeed, setTraceSpeed] = useState<number>(800); // ms per step

  // Simulated Vehicle states
  const [isVehiclePlaying, setIsVehiclePlaying] = useState<boolean>(false);
  const [vehicleProgress, setVehicleProgress] = useState<number>(0); // 0.0 to 1.0
  const [vehicleSpeedMultiplier, setVehicleSpeedMultiplier] = useState<number>(1); // 1x, 5x, 20x

  // Animation frame references
  const vehicleAnimRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number | null>(null);

  // Fetch initial data & setup subscriber
  const loadData = useCallback(async () => {
    try {
      const [z, r, a, e, d] = await Promise.all([
        dataSource.getZones(),
        dataSource.getRoads(),
        dataSource.getAmbulances(),
        dataSource.getEmergencies(),
        dataSource.getDispatches(),
      ]);
      setZones(z);
      setRoads(r);
      setAmbulances(a);
      setEmergencies(e);
      setDispatches(d);

      if (d.length > 0 && !selectedDispatchId) {
        setSelectedDispatchId(d[0].id);
      }
    } catch (err) {
      console.error('Failed to load route telemetry:', err);
    }
  }, [selectedDispatchId]);

  useEffect(() => {
    loadData();
    const unsubscribe = dataSource.subscribe(() => {
      loadData();
    });
    return () => unsubscribe();
  }, [loadData]);

  // Determine current origin zone & destination zone
  const { originZone, targetZone, targetCall, originUnit } = useMemo(() => {
    if (selectionMode === 'dispatched' && selectedDispatchId) {
      const disp = dispatches.find((d) => d.id === selectedDispatchId);
      if (disp) {
        const amb = ambulances.find((a) => a.id === disp.ambulanceId);
        const em = emergencies.find((e) => e.id === disp.emergencyId);
        return {
          originZone: disp.fromZone,
          targetZone: disp.toZone,
          targetCall: em || null,
          originUnit: amb || null,
        };
      }
    }

    // Custom pair mode
    const amb = ambulances.find((a) => a.id === selectedAmbulanceId) || ambulances[0];
    const em = emergencies.find((e) => e.id === selectedEmergencyId) || emergencies[0];
    const oZone = amb ? amb.zoneId : 'A';
    const tZone = targetZoneOverride || (em ? em.zoneId : 'B');

    return {
      originZone: oZone,
      targetZone: tZone,
      targetCall: em || null,
      originUnit: amb || null,
    };
  }, [
    selectionMode,
    selectedDispatchId,
    dispatches,
    ambulances,
    emergencies,
    selectedAmbulanceId,
    selectedEmergencyId,
    targetZoneOverride,
  ]);

  // Convert roads to GraphEdge[]
  const graphEdges: GraphEdge[] = useMemo(() => {
    return roads.map((r) => ({
      from: r.a,
      to: r.b,
      weight: r.minutes,
      blocked: r.blocked,
    }));
  }, [roads]);

  // Server-computed route telemetry from GET /api/route?from=&to=&k=3
  const [serverRoutes, setServerRoutes] = useState<PathResult[] | null>(null);

  useEffect(() => {
    if (!originZone || !targetZone) {
      setServerRoutes(null);
      return;
    }

    let isSubscribed = true;
    fetch(`/api/route?from=${encodeURIComponent(originZone)}&to=${encodeURIComponent(targetZone)}&k=3`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => {
        if (isSubscribed && data) {
          const routes: PathResult[] =
            data.all || (data.optimal ? [data.optimal, ...(data.alternatives || [])] : []);
          if (routes.length > 0) {
            setServerRoutes(routes);
          }
        }
      })
      .catch(() => {
        if (isSubscribed) setServerRoutes(null);
      });

    return () => {
      isSubscribed = false;
    };
  }, [originZone, targetZone, roads]);

  // Compute K-Shortest Paths via Server Endpoint or Yen's Algorithm from /engine/graph.ts
  const computedRoutes: PathResult[] = useMemo(() => {
    if (serverRoutes && serverRoutes.length > 0) return serverRoutes;
    if (!originZone || !targetZone) return [];
    return yenKShortestPaths(graphEdges, originZone, targetZone, 3);
  }, [serverRoutes, graphEdges, originZone, targetZone]);

  const optimalRoute = computedRoutes[0] || null;
  const alternativeRoutes = computedRoutes.slice(1);

  // Active path to draw
  const activePath = useMemo(() => {
    if (selectedPathOverride && selectedPathOverride.length > 0) {
      return selectedPathOverride;
    }
    return optimalRoute ? optimalRoute.path : [];
  }, [selectedPathOverride, optimalRoute]);

  // Active route travel time
  const activeTravelTime = useMemo(() => {
    if (activePath.length < 2) return 0;
    let time = 0;
    for (let i = 0; i < activePath.length - 1; i++) {
      const u = activePath[i];
      const v = activePath[i + 1];
      const edge = roads.find(
        (r) => !r.blocked && ((r.a === u && r.b === v) || (r.a === v && r.b === u))
      );
      if (edge) time += edge.minutes;
    }
    return +time.toFixed(1);
  }, [activePath, roads]);

  // Calculate Reachability and Nearest Alternative Unit if unreachable
  const isUnreachable = useMemo(() => {
    return !optimalRoute || optimalRoute.path.length === 0 || optimalRoute.totalTime === Infinity;
  }, [optimalRoute]);

  const nearestAlternativeUnit = useMemo(() => {
    if (!isUnreachable || !targetZone) return null;

    // Check other available or busy ambulances to find one that CAN reach targetZone
    const reachableUnits: { ambulance: Ambulance; time: number; path: string[] }[] = [];

    ambulances.forEach((amb) => {
      if (amb.id === originUnit?.id) return;
      const res = dijkstra(graphEdges, amb.zoneId, targetZone);
      if (res.path.length > 0 && res.totalTime !== Infinity) {
        reachableUnits.push({
          ambulance: amb,
          time: res.totalTime,
          path: res.path,
        });
      }
    });

    reachableUnits.sort((a, b) => a.time - b.time);
    return reachableUnits.length > 0 ? reachableUnits[0] : null;
  }, [isUnreachable, targetZone, ambulances, originUnit, graphEdges]);

  // Dijkstra Tracing execution
  const traceResult = useMemo(() => {
    if (!originZone || !targetZone) return null;
    return traceDijkstra(graphEdges, originZone, targetZone);
  }, [graphEdges, originZone, targetZone]);

  const traceSteps = traceResult ? traceResult.steps : [];
  const currentTraceStep: DijkstraStep | null =
    traceSteps.length > 0 && traceStepIndex < traceSteps.length
      ? traceSteps[traceStepIndex]
      : null;

  // Handle Trace Playback Timer
  useEffect(() => {
    if (!isTracing || !isTracePlaying || traceSteps.length === 0) return;

    const timer = setInterval(() => {
      setTraceStepIndex((prev) => {
        if (prev < traceSteps.length - 1) {
          return prev + 1;
        } else {
          setIsTracePlaying(false);
          return prev;
        }
      });
    }, traceSpeed);

    return () => clearInterval(timer);
  }, [isTracing, isTracePlaying, traceSteps.length, traceSpeed]);

  // Reset Tracing when origin or target changes
  useEffect(() => {
    setTraceStepIndex(0);
    setIsTracePlaying(false);
    setSelectedPathOverride(null);
    setVehicleProgress(0);
    setIsVehiclePlaying(false);
  }, [originZone, targetZone]);

  // Road closure toggle handler
  const handleToggleRoad = async (a: string, b: string) => {
    try {
      await dataSource.toggleRoadBlock(a, b);
    } catch (err) {
      console.error('Failed to toggle road corridor blockage:', err);
    }
  };

  // Vehicle Simulation Animation Loop
  const animateVehicle = useCallback(
    (timestamp: number) => {
      if (!lastTimeRef.current) {
        lastTimeRef.current = timestamp;
      }
      const deltaMs = timestamp - lastTimeRef.current;
      lastTimeRef.current = timestamp;

      if (isVehiclePlaying && activeTravelTime > 0) {
        // Assume activeTravelTime minutes maps to (activeTravelTime * 60) seconds in real life.
        // In the simulator at 1x speed, let 1 minute = 3 seconds of animation for smooth visibility
        const simDurationSec = activeTravelTime * 3;
        const progressIncrement = (deltaMs / 1000 / simDurationSec) * vehicleSpeedMultiplier;

        setVehicleProgress((prev) => {
          const next = prev + progressIncrement;
          if (next >= 1) {
            setIsVehiclePlaying(false);
            return 1;
          }
          return next;
        });
      }

      if (isVehiclePlaying) {
        vehicleAnimRef.current = requestAnimationFrame(animateVehicle);
      }
    },
    [isVehiclePlaying, activeTravelTime, vehicleSpeedMultiplier]
  );

  useEffect(() => {
    if (isVehiclePlaying) {
      lastTimeRef.current = null;
      vehicleAnimRef.current = requestAnimationFrame(animateVehicle);
    } else {
      if (vehicleAnimRef.current) {
        cancelAnimationFrame(vehicleAnimRef.current);
        vehicleAnimRef.current = null;
      }
    }
    return () => {
      if (vehicleAnimRef.current) {
        cancelAnimationFrame(vehicleAnimRef.current);
      }
    };
  }, [isVehiclePlaying, animateVehicle]);

  // Benchmark SLA in seconds (e.g., 600s = 10m for Critical, 720s = 12m for High, 900s for Medium)
  const slaBenchmarkMinutes =
    targetCall?.priority === 'Critical'
      ? 8
      : targetCall?.priority === 'High'
      ? 10
      : targetCall?.priority === 'Medium'
      ? 12
      : 15;

  const activeElapsedSeconds = Math.round(activeTravelTime * 60);
  const benchmarkSeconds = slaBenchmarkMinutes * 60;
  const isWithinSla = activeTravelTime <= slaBenchmarkMinutes;

  return (
    <div className="flex flex-col gap-5 w-full max-w-7xl mx-auto pb-12">
      {/* Top Bar Header with SectionTitle */}
      <SectionTitle
        eyebrow="MADURAI ROADS"
        title="Network topology & shortest-path calculation"
        accentWord="topology"
        action={
          <div className="flex flex-wrap items-center gap-2">
            <ProvenanceChip kind="REAL SAMPLE" />

            {isTracing ? (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setIsTracing(false);
                  setIsTracePlaying(false);
                }}
              >
                Exit Trace
              </Button>
            ) : (
              <Button
                variant="primary"
                size="sm"
                onClick={() => {
                  setIsTracing(true);
                  setTraceStepIndex(0);
                  setIsTracePlaying(false);
                }}
              >
                Trace Dijkstra
              </Button>
            )}

            <Button
              variant="secondary"
              size="sm"
              onClick={() => onNavigate('dispatch')}
            >
              Dispatch
            </Button>
          </div>
        }
      />

      {/* Unreachable Corridor Warning Banner */}
      {isUnreachable && (
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 rounded-[8px] border border-[var(--critical)] bg-[var(--critical)]/10 text-[var(--ink)]">
          <div className="flex items-center gap-3">
            <span className="text-2xl">⚠</span>
            <div>
              <div className="text-sm font-semibold text-[var(--critical)]">
                Corridor Unreachable
              </div>
              <div className="text-xs text-[var(--ink-muted)] mt-0.5">
                No open corridor currently connects Sector {originZone} to Sector {targetZone} due to road closures.
              </div>
            </div>
          </div>

          {nearestAlternativeUnit ? (
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono-numbers text-[var(--ink-muted)]">
                Nearest reachable unit:
              </span>
              <Button
                variant="primary"
                size="sm"
                onClick={() => {
                  setSelectionMode('custom');
                  setSelectedAmbulanceId(nearestAlternativeUnit.ambulance.id);
                  setTargetZoneOverride(targetZone);
                }}
              >
                Switch to {nearestAlternativeUnit.ambulance.id} (Sector {nearestAlternativeUnit.ambulance.zoneId} · {nearestAlternativeUnit.time.toFixed(1)}m)
              </Button>
            </div>
          ) : (
            <span className="text-xs font-mono-numbers text-[var(--critical)]">
              All sectors currently blocked to this destination.
            </span>
          )}
        </div>
      )}

      {/* Main Grid: Map & Telematics */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Left Column: Interactive Map & Tracing / Vehicle Controls */}
        <div className="lg:col-span-8 flex flex-col gap-4">
          <Panel
            title="Corridor Graph"
            badge="REAL SAMPLE"
            className="p-0 overflow-hidden relative border border-[var(--line)]"
          >
            <div className="h-[520px] w-full relative">
              <RouteMap
                zones={zones}
                roads={roads}
                activePath={activePath}
                alternativePaths={alternativeRoutes}
                onSelectPath={(path) => setSelectedPathOverride(path)}
                onToggleRoad={handleToggleRoad}
                theme={theme}
                traceStep={currentTraceStep}
                isTracing={isTracing}
                vehicleProgress={vehicleProgress}
              />

              {/* Map Floating HUD Overlay */}
              <div className="absolute top-3 left-3 z-[400] flex flex-wrap items-center gap-2 pointer-events-auto">
                <div className="px-2.5 py-1.5 rounded-[6px] bg-[var(--surface)]/90 backdrop-blur-md border border-[var(--line)] text-xs shadow-sm flex items-center gap-2">
                  <span className="font-mono-numbers text-[var(--ink-muted)]">Origin:</span>
                  <span className="font-semibold text-[var(--ink)]">
                    Sector {originZone}
                  </span>
                  <span className="text-[var(--ink-subtle)]">→</span>
                  <span className="font-mono-numbers text-[var(--ink-muted)]">Target:</span>
                  <span className="font-semibold text-[var(--ink)]">
                    Sector {targetZone}
                  </span>
                </div>

                {/* Road closure hint */}
                <div className="px-2 py-1 rounded-[6px] bg-[var(--surface)]/90 backdrop-blur-md border border-[var(--line)] text-[10px] font-mono-numbers text-[var(--ink-muted)]">
                  Click road line to toggle closure
                </div>
              </div>
            </div>

            {/* In-Panel Tracing / Simulation Toolbar */}
            {isTracing ? (
              <div className="p-4 border-t border-[var(--line)] bg-[var(--surface-raised)] flex flex-col gap-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold uppercase tracking-wider text-[var(--high)]">
                      Step-by-Step Dijkstra Trace
                    </span>
                    <span className="font-mono-numbers text-xs text-[var(--ink-muted)]">
                      Step {traceSteps.length > 0 ? traceStepIndex + 1 : 0} of {traceSteps.length}
                    </span>
                  </div>

                  {/* Playback Controls */}
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setTraceStepIndex((p) => Math.max(0, p - 1))}
                      disabled={traceStepIndex <= 0}
                    >
                      ‹ Prev
                    </Button>

                    <Button
                      variant={isTracePlaying ? 'secondary' : 'primary'}
                      size="sm"
                      onClick={() => {
                        if (traceStepIndex >= traceSteps.length - 1) {
                          setTraceStepIndex(0);
                        }
                        setIsTracePlaying((p) => !p);
                      }}
                    >
                      {isTracePlaying ? 'Pause ⏸' : 'Play ▶'}
                    </Button>

                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        setTraceStepIndex((p) => Math.min(traceSteps.length - 1, p + 1))
                      }
                      disabled={traceStepIndex >= traceSteps.length - 1}
                    >
                      Next ›
                    </Button>

                    <div className="h-4 w-px bg-[var(--line)] mx-1" />

                    {/* Speed selector */}
                    <div className="flex items-center gap-1">
                      {[
                        { label: '0.5x', speed: 1200 },
                        { label: '1x', speed: 800 },
                        { label: '2x', speed: 350 },
                      ].map((item) => (
                        <button
                          key={item.label}
                          onClick={() => setTraceSpeed(item.speed)}
                          className={`px-1.5 py-0.5 rounded text-[10px] font-mono-numbers cursor-pointer transition-colors ${
                            traceSpeed === item.speed
                              ? 'bg-[var(--ink)] text-[var(--bg-app)]'
                              : 'bg-[var(--surface)] text-[var(--ink-muted)] hover:text-[var(--ink)] border border-[var(--line)]'
                          }`}
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Scrub Slider */}
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min="0"
                    max={Math.max(0, traceSteps.length - 1)}
                    value={traceStepIndex}
                    onChange={(e) => {
                      setTraceStepIndex(parseInt(e.target.value, 10));
                      setIsTracePlaying(false);
                    }}
                    className="flex-1 accent-[var(--high)] h-1.5 bg-[var(--surface)] rounded cursor-pointer"
                  />
                </div>

                {/* Step Description Card */}
                {currentTraceStep && (
                  <div className="p-2.5 rounded-[6px] bg-[var(--surface)] border border-[var(--line)] text-xs font-mono-numbers flex flex-col gap-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] uppercase font-bold text-[var(--ink-muted)]">
                        Phase: {currentTraceStep.phase}
                      </span>
                      {currentTraceStep.currentNode && (
                        <span className="text-[10px] text-[var(--high)] font-semibold">
                          Current Node: {currentTraceStep.currentNode} ({currentTraceStep.currentDistance.toFixed(1)}m)
                        </span>
                      )}
                    </div>
                    <div className="text-[var(--ink)] text-xs leading-relaxed">
                      {currentTraceStep.description}
                    </div>
                    <div className="flex flex-wrap gap-1.5 pt-1 border-t border-[var(--line)] text-[10px] text-[var(--ink-muted)]">
                      <span>Tentative distances:</span>
                      {Object.entries(currentTraceStep.tentativeDistances).map(([nid, d]) => (
                        <span
                          key={nid}
                          className={`px-1 rounded ${
                            nid === currentTraceStep.currentNode
                              ? 'bg-[var(--high)]/20 text-[var(--high)] font-bold'
                              : currentTraceStep.visitedNodes.includes(nid)
                              ? 'text-[var(--unit-available)]'
                              : 'text-[var(--ink-subtle)]'
                          }`}
                        >
                          {nid}:{d === Infinity ? '∞' : `${d.toFixed(1)}m`}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              /* Simulated Vehicle Toolbar */
              <div className="p-3 border-t border-[var(--line)] bg-[var(--surface-raised)] flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="text-xl">🚑</span>
                  <div>
                    <div className="text-xs font-semibold text-[var(--ink)]">
                      Vehicle Telemetry Simulator
                    </div>
                    <div className="text-[10px] font-mono-numbers text-[var(--ink-muted)]">
                      Progress: {(vehicleProgress * 100).toFixed(0)}% · Remaining: {Math.max(0, (activeTravelTime * (1 - vehicleProgress))).toFixed(1)}m
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    variant={isVehiclePlaying ? 'secondary' : 'primary'}
                    size="sm"
                    disabled={isUnreachable || activePath.length < 2}
                    onClick={() => {
                      if (vehicleProgress >= 1) {
                        setVehicleProgress(0);
                      }
                      setIsVehiclePlaying((p) => !p);
                    }}
                  >
                    {isVehiclePlaying ? 'Pause ⏸' : vehicleProgress >= 1 ? 'Replay ↺' : 'Simulate 🚑'}
                  </Button>

                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setIsVehiclePlaying(false);
                      setVehicleProgress(0);
                    }}
                  >
                    Reset
                  </Button>

                  <div className="h-4 w-px bg-[var(--line)] mx-1" />

                  {/* Multiplier buttons */}
                  <div className="flex items-center gap-1">
                    {[1, 5, 20].map((m) => (
                      <button
                        key={m}
                        onClick={() => setVehicleSpeedMultiplier(m)}
                        className={`px-1.5 py-0.5 rounded text-[10px] font-mono-numbers cursor-pointer transition-colors ${
                          vehicleSpeedMultiplier === m
                            ? 'bg-[var(--unit-available)] text-white'
                            : 'bg-[var(--surface)] text-[var(--ink-muted)] hover:text-[var(--ink)] border border-[var(--line)]'
                        }`}
                      >
                        ×{m}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </Panel>

          {/* Alternative Routes Strip (Yen's K-Shortest) */}
          {alternativeRoutes.length > 0 && !isUnreachable && (
            <Panel title="K-Shortest Alternatives" badge="DERIVED">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {alternativeRoutes.map((alt, idx) => {
                  const isSelected = selectedPathOverride === alt.path;
                  return (
                    <div
                      key={idx}
                      onClick={() =>
                        setSelectedPathOverride(isSelected ? null : alt.path)
                      }
                      className={`p-3 rounded-[6px] border cursor-pointer transition-all duration-150 flex items-center justify-between ${
                        isSelected
                          ? 'border-[var(--unit-available)] bg-[var(--unit-available)]/10 shadow-xs'
                          : 'border-[var(--line)] bg-[var(--surface-raised)] hover:border-[var(--line)]'
                      }`}
                    >
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-[var(--ink)]">
                            Alternative {idx + 1}
                          </span>
                          <span className="font-mono-numbers text-[10px] px-1.5 py-0.5 rounded bg-[var(--surface)] border border-[var(--line)] text-[var(--high)]">
                            +{alt.deltaMinutes ?? 0}m
                          </span>
                        </div>
                        <span className="font-mono-numbers text-[11px] text-[var(--ink-muted)]">
                          {alt.path.join(' → ')}
                        </span>
                      </div>

                      <div className="text-right">
                        <div className="font-serif-display text-lg text-[var(--ink)]">
                          {alt.totalTime.toFixed(1)}
                        </div>
                        <div className="font-mono-numbers text-[9px] text-[var(--ink-muted)]">
                          minutes
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Panel>
          )}
        </div>

        {/* Right Column: Routing Controls, SLA Metrics & Road Closures */}
        <div className="lg:col-span-4 flex flex-col gap-5">
          {/* Pair Selector Panel */}
          <Panel title="Origin & Target Selection" badge="SIMULATED">
            <div className="flex flex-col gap-3">
              {/* Mode switch */}
              <div className="flex rounded-[6px] p-0.5 bg-[var(--surface-raised)] border border-[var(--line)] text-xs">
                <button
                  onClick={() => setSelectionMode('custom')}
                  className={`flex-1 py-1 rounded-[4px] font-mono-numbers text-center cursor-pointer transition-colors ${
                    selectionMode === 'custom'
                      ? 'bg-[var(--surface)] text-[var(--ink)] shadow-xs font-medium'
                      : 'text-[var(--ink-muted)] hover:text-[var(--ink)]'
                  }`}
                >
                  Custom Pair
                </button>
                <button
                  onClick={() => setSelectionMode('dispatched')}
                  className={`flex-1 py-1 rounded-[4px] font-mono-numbers text-center cursor-pointer transition-colors ${
                    selectionMode === 'dispatched'
                      ? 'bg-[var(--surface)] text-[var(--ink)] shadow-xs font-medium'
                      : 'text-[var(--ink-muted)] hover:text-[var(--ink)]'
                  }`}
                >
                  Active Dispatches ({dispatches.length})
                </button>
              </div>

              {selectionMode === 'dispatched' ? (
                <div className="flex flex-col gap-2">
                  {dispatches.length === 0 ? (
                    <div className="p-3 text-center text-xs text-[var(--ink-muted)] font-mono-numbers">
                      No active dispatches. Use Custom Pair or Dispatch console.
                    </div>
                  ) : (
                    dispatches.map((disp) => {
                      const isSelected = selectedDispatchId === disp.id;
                      return (
                        <div
                          key={disp.id}
                          onClick={() => setSelectedDispatchId(disp.id)}
                          className={`p-2.5 rounded-[6px] border cursor-pointer transition-colors text-xs flex items-center justify-between ${
                            isSelected
                              ? 'border-[var(--unit-available)] bg-[var(--unit-available)]/10'
                              : 'border-[var(--line)] bg-[var(--surface-raised)] hover:border-[var(--line)]'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <span className="font-mono-numbers font-bold text-[var(--ink)]">
                              {disp.ambulanceId}
                            </span>
                            <span className="text-[var(--ink-subtle)]">→</span>
                            <span className="font-mono-numbers text-[var(--ink-muted)]">
                              {disp.emergencyId} (Sector {disp.toZone})
                            </span>
                          </div>
                          <span className="font-mono-numbers text-[var(--unit-available)] font-semibold">
                            {disp.etaMin.toFixed(1)}m
                          </span>
                        </div>
                      );
                    })
                  )}
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  {/* Ambulance selector */}
                  <div>
                    <label className="text-[10px] font-mono-numbers uppercase text-[var(--ink-muted)] block mb-1">
                      Ambulance Unit (Origin)
                    </label>
                    <div className="grid grid-cols-5 gap-1.5">
                      {ambulances.map((amb) => (
                        <button
                          key={amb.id}
                          onClick={() => setSelectedAmbulanceId(amb.id)}
                          className={`py-1.5 px-1 rounded-[4px] text-xs font-mono-numbers border text-center cursor-pointer transition-colors ${
                            selectedAmbulanceId === amb.id
                              ? 'bg-[var(--unit-available)] text-white border-[var(--unit-available)]'
                              : 'bg-[var(--surface-raised)] text-[var(--ink)] border-[var(--line)] hover:border-[var(--line)]'
                          }`}
                        >
                          <div className="font-bold">{amb.id}</div>
                          <div className="text-[9px] opacity-75">@{amb.zoneId}</div>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Target Emergency or Zone */}
                  <div>
                    <label className="text-[10px] font-mono-numbers uppercase text-[var(--ink-muted)] block mb-1">
                      Target Emergency (Call)
                    </label>
                    <div className="grid grid-cols-2 gap-1.5">
                      {emergencies.map((em) => (
                        <button
                          key={em.id}
                          onClick={() => {
                            setSelectedEmergencyId(em.id);
                            setTargetZoneOverride(em.zoneId);
                          }}
                          className={`p-1.5 rounded-[4px] text-xs border text-left cursor-pointer transition-colors flex items-center justify-between ${
                            selectedEmergencyId === em.id
                              ? 'border-[var(--critical)] bg-[var(--critical)]/10 text-[var(--ink)]'
                              : 'bg-[var(--surface-raised)] border-[var(--line)] text-[var(--ink)] hover:border-[var(--line)]'
                          }`}
                        >
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono-numbers font-bold">{em.id}</span>
                            <span className="text-[10px] text-[var(--ink-muted)]">
                              Sec {em.zoneId}
                            </span>
                          </div>
                          <TriageTag priority={em.priority} size="sm" />
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </Panel>

          {/* SLA Performance & Travel Time Panel */}
          <Panel title="Corridor Metrics" badge="DERIVED">
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[10px] font-mono-numbers uppercase text-[var(--ink-muted)]">
                    Transit Duration
                  </div>
                  <div className="flex items-baseline gap-1.5">
                    <span className="font-serif-display text-4xl text-[var(--ink)]">
                      {isUnreachable ? '∞' : activeTravelTime.toFixed(1)}
                    </span>
                    <span className="font-mono-numbers text-xs text-[var(--ink-muted)]">
                      minutes
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <div className="text-[10px] font-mono-numbers text-[var(--ink-muted)]">
                      SLA Target: {slaBenchmarkMinutes}m
                    </div>
                    <div
                      className={`text-xs font-mono-numbers font-semibold ${
                        isWithinSla ? 'text-[var(--unit-available)]' : 'text-[var(--critical)]'
                      }`}
                    >
                      {isWithinSla ? '✓ Within SLA' : '⚠ Exceeds SLA'}
                    </div>
                  </div>
                  <SlaRing
                    elapsedSeconds={activeElapsedSeconds}
                    benchmarkSeconds={benchmarkSeconds}
                    size={48}
                  />
                </div>
              </div>

              {/* Path Breadcrumbs */}
              <div className="pt-3 border-t border-[var(--line)]">
                <div className="text-[10px] font-mono-numbers uppercase text-[var(--ink-muted)] mb-1">
                  Corridor Path ({activePath.length} Waypoints)
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {activePath.map((nodeId, idx) => {
                    const z = zones.find((item) => item.id === nodeId);
                    const isLast = idx === activePath.length - 1;
                    return (
                      <React.Fragment key={nodeId}>
                        <div className="flex items-center gap-1 px-2 py-0.5 rounded bg-[var(--surface-raised)] border border-[var(--line)] text-xs font-mono-numbers">
                          <span className="font-bold text-[var(--ink)]">{nodeId}</span>
                          {z && (
                            <span className="text-[10px] text-[var(--ink-muted)]">
                              {z.name}
                            </span>
                          )}
                        </div>
                        {!isLast && <span className="text-[var(--ink-subtle)] text-xs">→</span>}
                      </React.Fragment>
                    );
                  })}
                </div>
              </div>
            </div>
          </Panel>

          {/* Road Corridors & Closures Management Panel */}
          <Panel title="Road Closures" badge="REAL SAMPLE">
            <div className="flex flex-col gap-2">
              <div className="text-[11px] text-[var(--ink-muted)] leading-tight">
                Click any corridor to toggle road blockage. Network paths and Yen alternatives will recompute instantly.
              </div>

              <div className="flex flex-col gap-1.5 mt-1 max-h-48 overflow-y-auto pr-1">
                {roads.map((road) => {
                  const isBlocked = road.blocked;
                  return (
                    <div
                      key={`${road.a}-${road.b}`}
                      onClick={() => handleToggleRoad(road.a, road.b)}
                      className={`px-3 py-2 rounded-[6px] border cursor-pointer transition-colors flex items-center justify-between text-xs font-mono-numbers ${
                        isBlocked
                          ? 'border-[var(--critical)] bg-[var(--critical)]/10 text-[var(--critical)]'
                          : 'border-[var(--line)] bg-[var(--surface-raised)] text-[var(--ink)] hover:border-[var(--line)]'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className={isBlocked ? 'text-[var(--critical)] font-bold' : ''}>
                          Sector {road.a} ↔ Sector {road.b}
                        </span>
                        <span className="text-[10px] text-[var(--ink-muted)]">
                          ({road.minutes.toFixed(1)}m)
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <span
                          className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                            isBlocked
                              ? 'bg-[var(--critical)] text-white'
                              : 'bg-[var(--surface)] text-[var(--ink-muted)] border border-[var(--line)]'
                          }`}
                        >
                          {isBlocked ? 'BLOCKED 🚫' : 'OPEN'}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
