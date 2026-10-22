import React, { lazy, Suspense, useState, useEffect, useMemo } from 'react';
import {
  Zone,
  RoadEdge,
  Ambulance,
  Emergency,
  EmergencyPriority,
  Dispatch,
} from '../../types';
import { dataSource, getSlaBenchmarkMinutes } from '../../data';
import { LiveTimelineStrip } from './LiveTimelineStrip';
import { CallsSlip } from './CallsSlip';
import {
  TriageTag,
  Button,
  IconButton,
  Tooltip,
  Drawer,
  Modal,
  ProvenanceChip,
  ConnectionChip,
  UnitMarker,
  ToastContainer,
  ToastMessage,
  IconClose,
  IconCheck,
  IconCall,
  AnimatedCounter,
  Stamp,
} from '../../design-system';
import { ConnectionStatus } from '../../data/DataSource';
import { EmergencyTableView } from '../fleet/EmergencyTableView';

const MaduraiMap = lazy(() => import('./MaduraiMap').then((module) => ({ default: module.MaduraiMap })));

interface CommandViewProps {
  onNavigate: (route: string) => void;
  theme?: 'paper' | 'night';
  onTriggerSiren?: () => void;
  presentStep?: number | null;
}

export function CommandView({
  onNavigate,
  theme = 'paper',
  onTriggerSiren,
  presentStep = null,
}: CommandViewProps) {
  // Domain Data State
  const [zones, setZones] = useState<Zone[]>([]);
  const [roads, setRoads] = useState<RoadEdge[]>([]);
  const [ambulances, setAmbulances] = useState<Ambulance[]>([]);
  const [emergencies, setEmergencies] = useState<Emergency[]>([]);
  const [dispatches, setDispatches] = useState<Dispatch[]>([]);
  const [hasLoadedState, setHasLoadedState] = useState(dataSource.isReady());
  const [simSpeed, setSimSpeed] = useState<number>(1);
  const [currentTime, setCurrentTime] = useState<number>(Date.now());

  // Navigation / Selection State
  const [selectedCall, setSelectedCall] = useState<Emergency | null>(null);
  const [selectedUnit, setSelectedUnit] = useState<Ambulance | null>(null);
  const [flyTarget, setFlyTarget] = useState<{ lat: number; lng: number; zoom?: number; timestamp?: number } | null>(null);

  // Modal State for "+" New Call
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newZoneId, setNewZoneId] = useState<string>('B');
  const [newPriority, setNewPriority] = useState<EmergencyPriority>('Critical');
  const [newRequiresAls, setNewRequiresAls] = useState<boolean>(true);
  const [isSubmittingCall, setIsSubmittingCall] = useState(false);

  // Sub-tab inside Calls Left Panel: 'queue' | 'table'
  const [callsPanelTab, setCallsPanelTab] = useState<'queue' | 'table'>('queue');

  useEffect(() => {
    if (presentStep === 1) setIsAddModalOpen(true);
  }, [presentStep]);

  // Breakpoint 768-1279px: Collapsible Calls Overlay
  const [overlayPanel, setOverlayPanel] = useState<'calls' | null>(null);

  // Mobile Bottom Sheet Snap (390-767px): 'peek' | 'half' | 'full'
  const [sheetSnap, setSheetSnap] = useState<'peek' | 'half' | 'full'>('peek');
  const [touchStartY, setTouchStartY] = useState<number | null>(null);

  // Connection State Machine
  const [connStatus, setConnStatus] = useState<ConnectionStatus>(dataSource.getConnectionStatus());
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(dataSource.getLastSyncedAt());
  const [roundTripMs, setRoundTripMs] = useState<number>(dataSource.getRoundTripMs());
  const [slaBenchmarkMin, setSlaBenchmarkMin] = useState<number | null>(null);
  const [slaBenchmarkError, setSlaBenchmarkError] = useState<string | null>(null);

  useEffect(() => {
    const unsub = dataSource.subscribeConnection((status, rtt, lastSync) => {
      setConnStatus(status);
      setRoundTripMs(rtt);
      setLastSyncedAt(lastSync);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    let isCurrent = true;
    getSlaBenchmarkMinutes().then(
      (minutes) => { if (isCurrent) setSlaBenchmarkMin(minutes); },
      (reason: unknown) => { if (isCurrent) setSlaBenchmarkError(reason instanceof Error ? reason.message : 'SLA benchmark unavailable'); }
    );
    return () => { isCurrent = false; };
  }, []);

  // Toast Notifications
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const addToast = (toast: Omit<ToastMessage, 'id'>) => {
    const id = `toast-${Date.now()}-${Math.random()}`;
    setToasts((prev) => [...prev, { ...toast, id }]);
  };

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  // Load and subscribe to data source
  useEffect(() => {
    const loadData = async () => {
      const [z, r, a, e, d, s] = await Promise.all([
        dataSource.getZones(),
        dataSource.getRoads(),
        dataSource.getAmbulances(),
        dataSource.getEmergencies(),
        dataSource.getDispatches(),
        dataSource.getSimSpeed(),
      ]);
      setZones(z);
      setRoads(r);
      setAmbulances(a);
      setEmergencies(e);
      setDispatches(d);
      setSimSpeed(s);
      setHasLoadedState(dataSource.isReady());
    };

    loadData();
    const unsubscribe = dataSource.subscribe(loadData);
    return () => unsubscribe();
  }, []);

  // 1-second live ticker for waiting times
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Priority sorting weight helper
  const priorityRank: Record<EmergencyPriority, number> = {
    Critical: 4,
    High: 3,
    Medium: 2,
    Low: 1,
  };

  // Live sorted pending calls: priority first, then age (oldest first)
  const pendingCalls = useMemo(() => {
    return emergencies
      .filter((e) => e.status === 'Pending')
      .sort((a, b) => {
        const pDiff = priorityRank[b.priority] - priorityRank[a.priority];
        if (pDiff !== 0) return pDiff;
        return a.requestedAt - b.requestedAt;
      });
  }, [emergencies]);

  // Derived KPI Numerals (NEVER hard-coded)
  const availableCount = useMemo(
    () => ambulances.filter((a) => a.status === 'Available').length,
    [ambulances]
  );

  const busyCount = useMemo(
    () => ambulances.filter((a) => a.status === 'Busy').length,
    [ambulances]
  );

  const pendingCount = pendingCalls.length;

  const medianWaitMinutes = useMemo(() => {
    if (pendingCalls.length === 0) return 0;
    const waitTimes = pendingCalls
      .map((c) => Math.max(0, (currentTime - c.requestedAt) / 60000))
      .sort((a, b) => a - b);
    const mid = Math.floor(waitTimes.length / 2);
    const median =
      waitTimes.length % 2 === 0
        ? (waitTimes[mid - 1] + waitTimes[mid]) / 2
        : waitTimes[mid];
    return Number(median.toFixed(1));
  }, [pendingCalls, currentTime]);

  // Lookup Zone Helper
  const zoneMap = useMemo(() => {
    const map = new Map<string, Zone>();
    zones.forEach((z) => map.set(z.id, z));
    return map;
  }, [zones]);

  // Handle Call Select (Fly to zone and open details drawer)
  const handleSelectCall = (call: Emergency) => {
    setSelectedCall(call);
    setSelectedUnit(null);
    const zone = zoneMap.get(call.zoneId);
    if (zone) {
      setFlyTarget({ lat: zone.lat, lng: zone.lng, zoom: 15, timestamp: Date.now() });
    }
  };

  // Handle Unit Select (Fly to zone and open details drawer)
  const handleSelectUnit = (unit: Ambulance) => {
    setSelectedUnit(unit);
    setSelectedCall(null);
    const zone = zoneMap.get(unit.zoneId);
    if (zone) {
      setFlyTarget({ lat: zone.lat, lng: zone.lng, zoom: 15, timestamp: Date.now() });
    }
  };

  // Format Elapsed Waiting Time (ticking live)
  const formatWaitTime = (requestedAt: number) => {
    const elapsedSec = Math.max(0, Math.floor((currentTime - requestedAt) / 1000));
    const m = Math.floor(elapsedSec / 60);
    const s = elapsedSec % 60;
    return `${m}m ${String(s).padStart(2, '0')}s`;
  };

  // Handle Register New Call (weight & requiresAls are DB GENERATED columns)
  const handleRegisterCall = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmittingCall(true);

    try {
      const created = await dataSource.createEmergency({
        zoneId: newZoneId,
        priority: newPriority,
      });

      // Siren sweep and optional audio if Critical
      if (created.priority === 'Critical') {
        onTriggerSiren?.();
      }

      setIsAddModalOpen(false);
      handleSelectCall(created);
      addToast({
        type: 'success',
        message: `Registered ${created.priority} call ${created.id} in Sector ${newZoneId}`,
      });
    } catch (err: unknown) {
      addToast({
        type: 'error',
        message: err instanceof Error ? err.message : 'Database error: unable to register call',
      });
    } finally {
      setIsSubmittingCall(false);
    }
  };

  return (
    <div className="relative h-[calc(100vh-4.5rem)] w-full overflow-hidden rounded-[28px] border-2 border-[var(--line)] bg-[var(--surface)] shadow-[8px_8px_0_var(--shadow-ink)]">
      {/* 1. Framed Leaflet Map Card */}
      <div className={`absolute inset-0 z-0 overflow-hidden rounded-[28px] border-2 border-[var(--line)] transition-all duration-300 ${connStatus === 'offline' ? 'grayscale opacity-60' : ''}`}>
        <Suspense fallback={<div role="status" className="h-full min-h-[480px] w-full bg-[var(--surface)] ecg-grid" aria-label="Loading map" />}>
          <MaduraiMap
          zones={zones}
          roads={roads}
          ambulances={ambulances}
          emergencies={emergencies}
          dispatches={dispatches}
          simSpeed={simSpeed}
          currentTime={currentTime}
          theme={theme}
          flyToTarget={flyTarget}
          onSelectEmergency={handleSelectCall}
          onSelectAmbulance={handleSelectUnit}
          onSelectDispatch={(d) => {
            const amb = ambulances.find((a) => a.id === d.ambulanceId);
            if (amb) setSelectedUnit(amb);
          }}
          onSelectZone={(z) => {
            setFlyTarget({ lat: z.lat, lng: z.lng, zoom: 15, timestamp: Date.now() });
          }}
          />
        </Suspense>
      </div>

      {/* Offline Status Warning Ribbon over Map */}
      {connStatus === 'offline' && (
        <div className="absolute top-16 sm:top-20 left-1/2 -translate-x-1/2 z-25 px-3.5 py-1.5 rounded-full bg-[var(--surface-raised)] border-2 border-[var(--critical)] text-[var(--critical)] text-xs font-mono-numbers shadow-[3px_3px_0_var(--shadow-ink)] flex items-center gap-2 select-none font-bold">
          <span className="w-2 h-2 rounded-full bg-[var(--critical)]" />
          <span>OFFLINE · Map view paused</span>
          <span className="text-[var(--ink-muted)]">
            (last synced {lastSyncedAt ? new Date(lastSyncedAt).toLocaleTimeString() : 'never'})
          </span>
        </div>
      )}

      {/* 2. Top-Left Floating Metric Strip (Four Large Serif Numerals on Slip) */}
      <div className="absolute top-2 left-2 sm:top-4 sm:left-4 z-20 pointer-events-auto max-w-[calc(100vw-1rem)] sm:max-w-none">
        <div className="p-2 sm:p-3.5 rounded-[16px] bg-[var(--surface-raised)] border-2 border-[var(--line)] shadow-[4px_4px_0_var(--shadow-ink)] flex items-center gap-2.5 sm:gap-6 overflow-x-auto">
          <div className="flex flex-col shrink-0">
            <span className="font-serif-display text-xl sm:text-3xl text-[var(--unit-available)] leading-none tabular-nums">
              {hasLoadedState ? <AnimatedCounter value={availableCount} /> : '—'}
            </span>
            <span className="font-mono-numbers text-[9px] sm:text-[10px] text-[var(--ink-muted)] uppercase tracking-wider mt-0.5 sm:mt-1">
              available
            </span>
          </div>

          <div className="w-[1px] h-6 sm:h-7 bg-[var(--line)] shrink-0" />

          <div className="flex flex-col shrink-0">
            <span className="font-serif-display text-xl sm:text-3xl text-[var(--unit-busy)] leading-none tabular-nums">
              {hasLoadedState ? <AnimatedCounter value={busyCount} /> : '—'}
            </span>
            <span className="font-mono-numbers text-[9px] sm:text-[10px] text-[var(--ink-muted)] uppercase tracking-wider mt-0.5 sm:mt-1">
              busy
            </span>
          </div>

          <div className="w-[1px] h-6 sm:h-7 bg-[var(--line)] shrink-0" />

          <div className="flex flex-col shrink-0">
            <span className="font-serif-display text-xl sm:text-3xl text-[var(--critical)] leading-none tabular-nums">
              {hasLoadedState ? <AnimatedCounter value={pendingCount} /> : '—'}
            </span>
            <span className="font-mono-numbers text-[9px] sm:text-[10px] text-[var(--ink-muted)] uppercase tracking-wider mt-0.5 sm:mt-1">
              pending
            </span>
          </div>

          <div className="w-[1px] h-6 sm:h-7 bg-[var(--line)] shrink-0" />

          <div className="flex flex-col shrink-0">
            <span className="font-serif-display text-xl sm:text-3xl text-[var(--ink)] leading-none tabular-nums">
              {hasLoadedState ? <AnimatedCounter value={medianWaitMinutes} decimals={1} /> : '—'}
            </span>
            <span className="font-mono-numbers text-[9px] sm:text-[10px] text-[var(--ink-muted)] uppercase tracking-wider mt-0.5 sm:mt-1">
              min wait
            </span>
          </div>

          <div className="w-[1px] h-6 sm:h-7 bg-[var(--line)] shrink-0" />

          <div className="flex flex-col shrink-0" title={slaBenchmarkError ?? undefined}>
            <span className="font-serif-display text-xl sm:text-3xl text-[var(--ink)] leading-none tabular-nums">
              {slaBenchmarkMin === null ? '—' : slaBenchmarkMin}
            </span>
            <span className="font-mono-numbers text-[9px] sm:text-[10px] text-[var(--ink-muted)] uppercase tracking-wider mt-0.5 sm:mt-1">
              SLA min
            </span>
          </div>
        </div>
      </div>

      {/* 3. Collapsible Calls Overlay Toggle (768px – 1279px) */}
      <div className="hidden md:flex xl:hidden absolute top-4 right-4 z-20 items-center gap-2 pointer-events-auto">
        <button
          onClick={() => setOverlayPanel((prev) => (prev === 'calls' ? null : 'calls'))}
          aria-label="Toggle Calls Overlay"
          className={`px-3 py-1.5 rounded-[8px] text-xs font-mono-numbers border backdrop-blur-md transition-all shadow-xs flex items-center gap-1.5 cursor-pointer focus-ring active:scale-95 ${
            overlayPanel === 'calls'
              ? 'bg-[var(--ink)] text-[var(--bg-app)] border-[var(--ink)] font-medium'
              : 'bg-[var(--surface)]/90 text-[var(--ink)] border-[var(--line)] hover:border-[var(--line)]'
          }`}
        >
          <IconCall size={13} />
          <span>Calls ({pendingCalls.length})</span>
        </button>
      </div>

      {/* 4. Right Panel "Calls" (≥1280 persistent, 768-1279 collapsible overlay, <768 in bottom sheet) */}
      <div
        className={`absolute right-3 sm:right-4 bottom-20 top-20 sm:top-24 z-25 pointer-events-auto flex-col transition-all duration-240 ${
          callsPanelTab === 'table' ? 'w-[360px] sm:w-[480px] lg:w-[540px]' : 'w-[320px] sm:w-[360px]'
        } ${
          overlayPanel === 'calls' ? 'flex' : 'hidden xl:flex'
        }`}
      >
        <CallsSlip
          calls={pendingCalls}
          selectedCallId={selectedCall?.id}
          onSelectCall={handleSelectCall}
          onAddCall={() => setIsAddModalOpen(true)}
          formatWaitTime={formatWaitTime}
          zoneName={(zoneId) => {
            const zone = zoneMap.get(zoneId);
            return zone ? `${zone.id} · ${zone.name}` : `Zone ${zoneId}`;
          }}
        />
      </div>

      {/* 5. Mobile Draggable Bottom Sheet (390px - 767px) */}
      <div
        className={`md:hidden absolute left-0 right-0 bottom-0 z-30 bg-[var(--surface)]/98 backdrop-blur-md border-t border-[var(--line)] shadow-2xl rounded-t-[16px] flex flex-col transition-all duration-240 ease-[cubic-bezier(0.16,1,0.3,1)] pointer-events-auto ${
          sheetSnap === 'peek' ? 'h-14' : sheetSnap === 'half' ? 'h-[46%]' : 'h-[78%]'
        }`}
        onTouchStart={(e) => setTouchStartY(e.touches[0].clientY)}
        onTouchEnd={(e) => {
          if (touchStartY === null) return;
          const diff = e.changedTouches[0].clientY - touchStartY;
          if (diff < -40) {
            setSheetSnap((prev) => (prev === 'peek' ? 'half' : 'full'));
          } else if (diff > 40) {
            setSheetSnap((prev) => (prev === 'full' ? 'half' : 'peek'));
          }
          setTouchStartY(null);
        }}
      >
        {/* Grab Handle */}
        <button
          onClick={() => {
            setSheetSnap((prev) => (prev === 'peek' ? 'half' : prev === 'half' ? 'full' : 'peek'));
          }}
          aria-label="Toggle Bottom Sheet Height"
          className="w-full flex flex-col items-center pt-2 pb-1 cursor-pointer focus-ring"
        >
          <div className="w-10 h-1 rounded-full bg-[var(--line)]" />
        </button>

        {/* Calls Sheet Controls */}
        <div className="flex items-center justify-between px-3 pb-2 border-b border-[var(--line)] shrink-0">
          <span className="px-2.5 py-1 text-xs font-mono-numbers uppercase tracking-wider text-[var(--ink)]">
            Calls ({hasLoadedState ? pendingCalls.length : '…'})
          </span>

          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setIsAddModalOpen(true)}
              aria-label="Log Call"
              className="w-6 h-6 flex items-center justify-center rounded-[4px] bg-[var(--surface-raised)] border border-[var(--line)] text-xs font-semibold text-[var(--ink)] focus-ring active:scale-95 cursor-pointer"
            >
              +
            </button>
            <button
              onClick={() => setSheetSnap((prev) => (prev === 'peek' ? 'half' : prev === 'half' ? 'full' : 'peek'))}
              aria-label="Expand or minimize sheet"
              className="text-[10px] font-mono-numbers px-2 py-0.5 rounded-[4px] bg-[var(--surface-raised)] border border-[var(--line)] text-[var(--ink-muted)] focus-ring cursor-pointer"
            >
              {sheetSnap === 'peek' ? '↑ Open' : sheetSnap === 'half' ? '↑ Full' : '↓ Hide'}
            </button>
          </div>
        </div>

        {/* Sheet Scroll Body */}
        {sheetSnap !== 'peek' && (
          <div className="flex-1 overflow-y-auto p-2 divide-y divide-[var(--line)]">
            {pendingCalls.length === 0 ? (
              <div className="py-8 text-center text-xs font-mono-numbers text-[var(--ink-muted)]">
                No pending calls in queue
              </div>
            ) : (
              pendingCalls.map((call) => {
                const zone = zoneMap.get(call.zoneId);
                const isSelected = selectedCall?.id === call.id;
                return (
                  <div
                    key={call.id}
                    onClick={() => {
                      handleSelectCall(call);
                      setSheetSnap('peek');
                    }}
                    className={`p-2.5 rounded-[6px] transition-colors cursor-pointer flex items-center justify-between gap-2 ${
                      isSelected
                        ? 'bg-[var(--surface-raised)] ring-1 ring-[var(--line)]'
                        : 'hover:bg-[var(--surface-raised)]/70'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <TriageTag priority={call.priority} weight={call.weight} size="sm" />
                      <div className="flex flex-col min-w-0">
                        <span className="font-mono-numbers text-xs font-semibold text-[var(--ink)] truncate">
                          {call.id}
                        </span>
                        <span className="font-mono-numbers text-[10px] text-[var(--ink-muted)] truncate">
                          {zone ? `${zone.id} · ${zone.name}` : `Zone ${call.zoneId}`}
                        </span>
                      </div>
                    </div>
                    <div className="flex flex-col items-end shrink-0">
                      <span className="font-mono-numbers text-[11px] text-[var(--ink)] font-medium tabular-nums">
                        {formatWaitTime(call.requestedAt)}
                      </span>
                      <span className="font-mono-numbers text-[9px] text-[var(--ink-subtle)] uppercase">
                        waiting
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>

      {/* 7. Bottom-Centre Primary Action: "Dispatch" */}
      <div
        className={`absolute bottom-3 sm:bottom-4 left-1/2 -translate-x-1/2 z-20 pointer-events-auto transition-opacity ${
          sheetSnap !== 'peek' ? 'hidden md:block' : 'block'
        }`}
      >
        <Tooltip
          content={pendingCalls.length === 0 ? 'No calls pending in queue' : 'Execute optimal fleet allocation'}
          position="top"
        >
          <Button
            variant="primary"
            size="md"
            disabled={pendingCalls.length === 0}
            onClick={() => onNavigate('dispatch')}
            className="shadow-lg px-5 sm:px-6"
            icon={<IconCall size={16} />}
          >
            Dispatch
          </Button>
        </Tooltip>
      </div>

      {/* 7. Modal: Register New Call ("+") */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title="Register Call"
      >
        <form onSubmit={handleRegisterCall} className="flex flex-col gap-5">
          {/* Priority Selection with 4 Triage Tags */}
          <div className="flex flex-col gap-2">
            <label className="text-xs font-mono-numbers uppercase text-[var(--ink-muted)]">
              Triage Priority
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {(['Critical', 'High', 'Medium', 'Low'] as const).map((p) => {
                const isSelected = newPriority === p;
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => {
                      setNewPriority(p);
                      if (p === 'Critical') setNewRequiresAls(true);
                    }}
                    className={`p-2 rounded-[6px] border flex flex-col items-center gap-1.5 transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-[var(--surface-raised)] border-[var(--line)] ring-1 ring-[var(--line)]'
                        : 'bg-[var(--surface)] border-[var(--line)] hover:border-[var(--line)]'
                    }`}
                  >
                    <TriageTag priority={p} size="sm" />
                    <span className="text-[10px] font-mono-numbers text-[var(--ink-muted)]">
                      {p === 'Critical' ? 'Weight 5' : p === 'High' ? 'Weight 3' : p === 'Medium' ? 'Weight 2' : 'Weight 1'}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Zone Selector */}
          <div className="flex flex-col gap-2">
            <label className="text-xs font-mono-numbers uppercase text-[var(--ink-muted)]">
              Madurai Sector Zone
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {zones.map((z) => (
                <button
                  key={z.id}
                  type="button"
                  onClick={() => setNewZoneId(z.id)}
                  className={`p-2 rounded-[6px] border text-left flex flex-col transition-all cursor-pointer ${
                    newZoneId === z.id
                      ? 'bg-[var(--surface-raised)] border-[var(--ink)] text-[var(--ink)]'
                      : 'bg-[var(--surface)] border-[var(--line)] text-[var(--ink-muted)] hover:text-[var(--ink)]'
                  }`}
                >
                  <span className="font-serif-display text-base text-[var(--ink)]">
                    {z.id} · {z.name}
                  </span>
                  <span className="text-[9px] font-mono-numbers text-[var(--ink-muted)] uppercase">
                    {z.areaType}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* ALS Requirement Toggle */}
          <div className="flex items-center justify-between p-3 rounded-[6px] bg-[var(--surface)] border border-[var(--line)]">
            <div className="flex flex-col">
              <span className="text-xs font-ui font-medium text-[var(--ink)]">
                Requires Advanced Life Support (ALS)
              </span>
              <span className="text-[10px] text-[var(--ink-muted)]">
                Assigns defibrillator & paramedic certified unit
              </span>
            </div>
            <input
              type="checkbox"
              checked={newRequiresAls}
              onChange={(e) => setNewRequiresAls(e.target.checked)}
              className="w-4 h-4 rounded cursor-pointer accent-[var(--ink)]"
            />
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--line)]">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setIsAddModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              isLoading={isSubmittingCall}
            >
              Log Incident
            </Button>
          </div>
        </form>
      </Modal>

      {/* 8. Details Drawer (for Call or Unit) */}
      <Drawer
        isOpen={Boolean(selectedCall || selectedUnit)}
        onClose={() => {
          setSelectedCall(null);
          setSelectedUnit(null);
        }}
        title={selectedCall ? `Incident ${selectedCall.id}` : `Unit ${selectedUnit?.id}`}
      >
        {selectedCall && (
          <div className="flex flex-col gap-5">
            <div className="flex items-center justify-between">
              <TriageTag priority={selectedCall.priority} weight={selectedCall.weight} size="md" />
              {selectedCall.source === 'simulated' && <Stamp variant="SIM" color="high" rotation={0} />}
            </div>

            <div className="p-3 bg-[var(--surface)] border border-[var(--line)] rounded-[8px] flex flex-col gap-2 font-mono-numbers text-xs">
              <div className="flex justify-between">
                <span className="text-[var(--ink-muted)]">Status</span>
                <span className="text-[var(--ink)] font-semibold">{selectedCall.status}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--ink-muted)]">Zone</span>
                <span className="text-[var(--ink)] font-semibold">
                  {selectedCall.zoneId} · {zoneMap.get(selectedCall.zoneId)?.name}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--ink-muted)]">Area Type</span>
                <span className="text-[var(--ink)]">
                  {zoneMap.get(selectedCall.zoneId)?.areaType}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--ink-muted)]">Equipment</span>
                <span className="text-[var(--ink)]">
                  {selectedCall.requiresAls ? 'ALS Required' : 'BLS Capable'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--ink-muted)]">Waiting Duration</span>
                <span className="text-[var(--critical)] font-semibold tabular-nums">
                  {formatWaitTime(selectedCall.requestedAt)}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2 mt-auto pt-4 border-t border-[var(--line)]">
              <Button
                variant="secondary"
                size="sm"
                className="flex-1"
                onClick={() => {
                  const z = zoneMap.get(selectedCall.zoneId);
                  if (z) setFlyTarget({ lat: z.lat, lng: z.lng, zoom: 16, timestamp: Date.now() });
                }}
              >
                Focus
              </Button>
              <Button
                variant="primary"
                size="sm"
                className="flex-1"
                onClick={() => onNavigate('dispatch')}
              >
                Dispatch
              </Button>
            </div>
          </div>
        )}

        {selectedUnit && (
          <div className="flex flex-col gap-5">
            <div className="flex items-center justify-between">
              <UnitMarker
                status={selectedUnit.status}
                id={selectedUnit.id}
                type={selectedUnit.type}
                size="md"
              />
              <ProvenanceChip kind="REAL SAMPLE" />
            </div>

            <div className="p-3 bg-[var(--surface)] border border-[var(--line)] rounded-[8px] flex flex-col gap-2 font-mono-numbers text-xs">
              <div className="flex justify-between">
                <span className="text-[var(--ink-muted)]">Fleet ID</span>
                <span className="text-[var(--ink)] font-semibold">{selectedUnit.id}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--ink-muted)]">Capability</span>
                <span className="text-[var(--ink)] font-semibold">
                  {selectedUnit.type === 'ALS' ? 'Advanced Life Support' : 'Basic Life Support'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--ink-muted)]">Base Station</span>
                <span className="text-[var(--ink)] font-semibold">
                  {selectedUnit.zoneId} · {zoneMap.get(selectedUnit.zoneId)?.name}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--ink-muted)]">Operational State</span>
                <span
                  className="font-semibold"
                  style={{
                    color: selectedUnit.status === 'Available' ? 'var(--unit-available)' : 'var(--unit-busy)',
                  }}
                >
                  {selectedUnit.status}
                </span>
              </div>
            </div>

            {/* Active Dispatch Details & Manual Lifecycle Actions */}
            {(() => {
              const activeDisp = dispatches.find(
                (d) =>
                  d.ambulanceId === selectedUnit.id &&
                  (d.status === 'EnRoute' || d.status === 'OnScene')
              );
              if (!activeDisp) return null;

              return (
                <div className="p-2.5 rounded-[8px] bg-[var(--surface-raised)] border border-[var(--line)] flex flex-col gap-2 mt-2">
                  <div className="flex items-center justify-between text-xs font-mono-numbers">
                    <span className="font-semibold text-[var(--ink)]">
                      Active Dispatch: {activeDisp.emergencyId}
                    </span>
                    <span className="px-1.5 py-0.2 rounded text-[10px] bg-[var(--surface)] text-[var(--ink-muted)] font-semibold uppercase">
                      {activeDisp.status}
                    </span>
                  </div>
                  <div className="text-[11px] text-[var(--ink-muted)] font-mono-numbers">
                    Route: {activeDisp.fromZone} → {activeDisp.toZone} (ETA {activeDisp.etaMin}m)
                  </div>
                  <div className="flex items-center gap-1.5 pt-1">
                    {activeDisp.status === 'EnRoute' && (
                      <Button
                        variant="secondary"
                        size="sm"
                        className="flex-1"
                        onClick={async () => {
                          try {
                            await dataSource.advanceDispatch(activeDisp.id, 'OnScene');
                            addToast({ type: 'success', message: `${selectedUnit.id} marked On Scene` });
                          } catch (e: unknown) {
                            addToast({ type: 'error', message: e instanceof Error ? e.message : 'Unable to advance dispatch' });
                          }
                        }}
                      >
                        Mark On Scene
                      </Button>
                    )}
                    {activeDisp.status === 'OnScene' && (
                      <Button
                        variant="primary"
                        size="sm"
                        className="flex-1"
                        onClick={async () => {
                          try {
                            await dataSource.advanceDispatch(activeDisp.id, 'Completed');
                            addToast({ type: 'success', message: `${selectedUnit.id} dispatch completed` });
                          } catch (e: unknown) {
                            addToast({ type: 'error', message: e instanceof Error ? e.message : 'Unable to complete dispatch' });
                          }
                        }}
                      >
                        Mark Completed
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={async () => {
                        try {
                          await dataSource.cancelDispatch(activeDisp.id);
                          addToast({ type: 'info', message: `Dispatch cancelled for ${selectedUnit.id}` });
                        } catch (e: unknown) {
                          addToast({ type: 'error', message: e instanceof Error ? e.message : 'Unable to cancel dispatch' });
                        }
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              );
            })()}

            <div className="flex items-center gap-2 mt-auto pt-4 border-t border-[var(--line)]">
              <Button
                variant="secondary"
                size="sm"
                className="flex-1"
                onClick={() => {
                  const z = zoneMap.get(selectedUnit.zoneId);
                  if (z) setFlyTarget({ lat: z.lat, lng: z.lng, zoom: 16, timestamp: Date.now() });
                }}
              >
                Locate
              </Button>
              <span className="flex-1 text-right font-mono-numbers text-[10px] font-bold uppercase text-[var(--ink-muted)]">
                {selectedUnit.status}
              </span>
            </div>
          </div>
        )}
      </Drawer>

      {/* 5. Bottom "Live" Timeline Strip */}
      <div className="mt-auto shrink-0 z-20 pointer-events-auto">
        <LiveTimelineStrip
          dispatches={dispatches}
          ambulances={ambulances}
          emergencies={emergencies}
          simSpeed={simSpeed}
          currentTime={currentTime}
          slaBenchmarkMin={slaBenchmarkMin}
          onSelectDispatch={(d) => {
            const amb = ambulances.find((a) => a.id === d.ambulanceId);
            if (amb) setSelectedUnit(amb);
          }}
          onNavigate={onNavigate}
          onToast={addToast}
        />
      </div>

      {/* Floating 6-Second Undo / Action Toast Container */}
      <ToastContainer toasts={toasts} onDismiss={removeToast} />
    </div>
  );
}
