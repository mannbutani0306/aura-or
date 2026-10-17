import React, { useState, useEffect, useMemo } from 'react';
import {
  Zone,
  RoadEdge,
  Ambulance,
  Emergency,
  EmergencyPriority,
  Dispatch,
} from '../../types';
import { dataSource } from '../../data';
import { MaduraiMap } from './MaduraiMap';
import { LiveTimelineStrip } from './LiveTimelineStrip';
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
  IconUnit,
  AnimatedCounter,
} from '../../design-system';
import { ConnectionStatus } from '../../data/DataSource';
import { EmergencyTableView } from '../fleet/EmergencyTableView';

interface CommandViewProps {
  onNavigate: (route: string) => void;
  theme?: 'paper' | 'night';
  onTriggerSiren?: () => void;
}

export function CommandView({
  onNavigate,
  theme = 'paper',
  onTriggerSiren,
}: CommandViewProps) {
  // Domain Data State
  const [zones, setZones] = useState<Zone[]>([]);
  const [roads, setRoads] = useState<RoadEdge[]>([]);
  const [ambulances, setAmbulances] = useState<Ambulance[]>([]);
  const [emergencies, setEmergencies] = useState<Emergency[]>([]);
  const [dispatches, setDispatches] = useState<Dispatch[]>([]);
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

  // Breakpoint 768-1279px: Collapsible Overlays
  const [overlayPanel, setOverlayPanel] = useState<'calls' | 'units' | null>(null);

  // Mobile Bottom Sheet Snap (390-767px): 'peek' | 'half' | 'full'
  const [sheetSnap, setSheetSnap] = useState<'peek' | 'half' | 'full'>('peek');
  const [sheetTab, setSheetTab] = useState<'calls' | 'units'>('calls');
  const [touchStartY, setTouchStartY] = useState<number | null>(null);

  // Connection State Machine
  const [connStatus, setConnStatus] = useState<ConnectionStatus>(dataSource.getConnectionStatus());
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(dataSource.getLastSyncedAt());
  const [roundTripMs, setRoundTripMs] = useState<number>(dataSource.getRoundTripMs());

  useEffect(() => {
    const unsub = dataSource.subscribeConnection((status, rtt, lastSync) => {
      setConnStatus(status);
      setRoundTripMs(rtt);
      setLastSyncedAt(lastSync);
    });
    return () => unsub();
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
    } catch (err: any) {
      addToast({
        type: 'error',
        message: err?.message || 'Database error: unable to register call',
      });
    } finally {
      setIsSubmittingCall(false);
    }
  };

  return (
    <div className="relative w-full h-[calc(100vh-4.5rem)] flex flex-col overflow-hidden rounded-[20px] border-2 border-[var(--line)] shadow-[6px_6px_0_var(--shadow-ink)]">
      {/* 1. Full-Bleed Leaflet Map Layer */}
      <div className={`absolute inset-0 z-0 transition-all duration-300 ${connStatus === 'offline' ? 'grayscale opacity-60' : ''}`}>
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
              <AnimatedCounter value={availableCount} />
            </span>
            <span className="font-mono-numbers text-[9px] sm:text-[10px] text-[var(--ink-muted)] uppercase tracking-wider mt-0.5 sm:mt-1">
              available
            </span>
          </div>

          <div className="w-[1px] h-6 sm:h-7 bg-[var(--hairline)] shrink-0" />

          <div className="flex flex-col shrink-0">
            <span className="font-serif-display text-xl sm:text-3xl text-[var(--unit-busy)] leading-none tabular-nums">
              <AnimatedCounter value={busyCount} />
            </span>
            <span className="font-mono-numbers text-[9px] sm:text-[10px] text-[var(--ink-muted)] uppercase tracking-wider mt-0.5 sm:mt-1">
              busy
            </span>
          </div>

          <div className="w-[1px] h-6 sm:h-7 bg-[var(--hairline)] shrink-0" />

          <div className="flex flex-col shrink-0">
            <span className="font-serif-display text-xl sm:text-3xl text-[var(--critical)] leading-none tabular-nums">
              <AnimatedCounter value={pendingCount} />
            </span>
            <span className="font-mono-numbers text-[9px] sm:text-[10px] text-[var(--ink-muted)] uppercase tracking-wider mt-0.5 sm:mt-1">
              pending
            </span>
          </div>

          <div className="w-[1px] h-6 sm:h-7 bg-[var(--hairline)] shrink-0" />

          <div className="flex flex-col shrink-0">
            <span className="font-serif-display text-xl sm:text-3xl text-[var(--ink)] leading-none tabular-nums">
              <AnimatedCounter value={medianWaitMinutes} decimals={1} />
            </span>
            <span className="font-mono-numbers text-[9px] sm:text-[10px] text-[var(--ink-muted)] uppercase tracking-wider mt-0.5 sm:mt-1">
              min wait
            </span>
          </div>
        </div>
      </div>

      {/* 3. Collapsible Overlay Toggles (768px – 1279px) */}
      <div className="hidden md:flex xl:hidden absolute top-4 right-4 z-20 items-center gap-2 pointer-events-auto">
        <button
          onClick={() => setOverlayPanel((prev) => (prev === 'calls' ? null : 'calls'))}
          aria-label="Toggle Calls Overlay"
          className={`px-3 py-1.5 rounded-[8px] text-xs font-mono-numbers border backdrop-blur-md transition-all shadow-xs flex items-center gap-1.5 cursor-pointer focus-ring active:scale-95 ${
            overlayPanel === 'calls'
              ? 'bg-[var(--ink)] text-[var(--bg-app)] border-[var(--ink)] font-medium'
              : 'bg-[var(--surface)]/90 text-[var(--ink)] border-[var(--hairline)] hover:border-[var(--hairline-hover)]'
          }`}
        >
          <IconCall size={13} />
          <span>Calls ({pendingCalls.length})</span>
        </button>
        <button
          onClick={() => setOverlayPanel((prev) => (prev === 'units' ? null : 'units'))}
          aria-label="Toggle Units Overlay"
          className={`px-3 py-1.5 rounded-[8px] text-xs font-mono-numbers border backdrop-blur-md transition-all shadow-xs flex items-center gap-1.5 cursor-pointer focus-ring active:scale-95 ${
            overlayPanel === 'units'
              ? 'bg-[var(--ink)] text-[var(--bg-app)] border-[var(--ink)] font-medium'
              : 'bg-[var(--surface)]/90 text-[var(--ink)] border-[var(--hairline)] hover:border-[var(--hairline-hover)]'
          }`}
        >
          <IconUnit size={13} />
          <span>Units ({ambulances.length})</span>
        </button>
      </div>

      {/* 4. Left Panel "Calls" (≥1280 persistent, 768-1279 collapsible overlay, <768 in bottom sheet) */}
      <div
        className={`absolute left-3 sm:left-4 bottom-20 top-20 sm:top-24 z-25 pointer-events-auto flex-col transition-all duration-240 ${
          callsPanelTab === 'table' ? 'w-[360px] sm:w-[480px] lg:w-[540px]' : 'w-[310px] sm:w-[330px]'
        } ${
          overlayPanel === 'calls' ? 'flex' : 'hidden xl:flex'
        }`}
      >
        <div className="flex-1 bg-[var(--surface-raised)] border-2 border-[var(--line)] rounded-[20px] shadow-[6px_6px_0_var(--shadow-ink)] flex flex-col overflow-hidden">
          {/* Panel Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b-2 border-[var(--line)] bg-[var(--surface)]/70 shrink-0 gap-2">
            <div className="flex items-center gap-2">
              <h2 className="text-xs font-mono-numbers font-semibold uppercase tracking-wider text-[var(--ink)]">
                Calls
              </h2>
              <span className="font-mono-numbers text-[11px] text-[var(--ink-muted)]">
                ({pendingCalls.length})
              </span>
            </div>

            {/* Sub-tab: Queue | Table */}
            <div className="inline-flex items-center p-0.5 rounded-[6px] bg-[var(--surface-raised)] border border-[var(--hairline)]">
              <button
                onClick={() => setCallsPanelTab('queue')}
                className={`px-2 py-0.5 text-[10px] font-mono-numbers uppercase tracking-wider rounded-[4px] transition-colors cursor-pointer ${
                  callsPanelTab === 'queue'
                    ? 'bg-[var(--ink)] text-[var(--bg-app)] font-medium shadow-xs'
                    : 'text-[var(--ink-muted)] hover:text-[var(--ink)]'
                }`}
              >
                Queue
              </button>
              <button
                onClick={() => setCallsPanelTab('table')}
                className={`px-2 py-0.5 text-[10px] font-mono-numbers uppercase tracking-wider rounded-[4px] transition-colors cursor-pointer ${
                  callsPanelTab === 'table'
                    ? 'bg-[var(--ink)] text-[var(--bg-app)] font-medium shadow-xs'
                    : 'text-[var(--ink-muted)] hover:text-[var(--ink)]'
                }`}
              >
                Table
              </button>
            </div>

            <div className="flex items-center gap-1">
              <Tooltip content="Register incoming call" shortcut="+">
                <button
                  onClick={() => setIsAddModalOpen(true)}
                  aria-label="Add call"
                  className="w-6 h-6 flex items-center justify-center rounded-[4px] bg-[var(--surface-raised)] border border-[var(--hairline)] hover:border-[var(--hairline-hover)] text-sm font-semibold text-[var(--ink)] cursor-pointer shrink-0 focus-ring active:scale-95"
                >
                  +
                </button>
              </Tooltip>

              {/* Close button on mid-screen overlay (768-1279) */}
              <button
                onClick={() => setOverlayPanel(null)}
                aria-label="Close calls overlay"
                className="xl:hidden w-6 h-6 flex items-center justify-center rounded-[4px] bg-[var(--surface-raised)] border border-[var(--hairline)] hover:border-[var(--hairline-hover)] text-[var(--ink-muted)] hover:text-[var(--ink)] cursor-pointer focus-ring active:scale-95"
              >
                <IconClose size={12} />
              </button>
            </div>
          </div>

          {/* Panel Body: Either Queue or Table */}
          {callsPanelTab === 'queue' ? (
            <div className="flex-1 overflow-y-auto divide-y divide-[var(--hairline)] p-1">
              {pendingCalls.length === 0 ? (
                <div className="py-12 text-center text-xs font-mono-numbers text-[var(--ink-muted)]">
                  No active pending calls
                </div>
              ) : (
                pendingCalls.map((call) => {
                  const zone = zoneMap.get(call.zoneId);
                  const isSelected = selectedCall?.id === call.id;

                  return (
                    <div
                      key={call.id}
                      onClick={() => handleSelectCall(call)}
                      className={`p-2.5 rounded-[6px] transition-colors cursor-pointer flex items-center justify-between gap-2 ${
                        isSelected
                          ? 'bg-[var(--surface-raised)] ring-1 ring-[var(--hairline-hover)]'
                          : 'hover:bg-[var(--surface-raised)]/70'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
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
          ) : (
            <div className="flex-1 overflow-y-auto p-2">
              <EmergencyTableView
                emergencies={emergencies}
                zones={zones}
                onAddToast={addToast}
                compact
                onSelectCall={handleSelectCall}
              />
            </div>
          )}
        </div>
      </div>

      {/* 5. Right Floating Panel "Units" (≥1280 persistent, 768-1279 collapsible overlay, <768 in bottom sheet) */}
      <div
        className={`absolute right-3 sm:right-4 bottom-20 top-20 sm:top-24 w-[270px] sm:w-[290px] z-25 pointer-events-auto flex-col transition-all duration-240 ${
          overlayPanel === 'units' ? 'flex' : 'hidden xl:flex'
        }`}
      >
        <div className="flex-1 bg-[var(--surface-raised)] border-2 border-[var(--line)] rounded-[20px] shadow-[6px_6px_0_var(--shadow-ink)] flex flex-col overflow-hidden">
          {/* Panel Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b-2 border-[var(--line)] bg-[var(--surface)]/70 shrink-0">
            <div className="flex items-center gap-2">
              <h2 className="text-xs font-mono-numbers font-semibold uppercase tracking-wider text-[var(--ink)]">
                Units
              </h2>
              <span className="font-mono-numbers text-[11px] text-[var(--ink-muted)]">
                ({ambulances.length})
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <ProvenanceChip kind="REAL SAMPLE" />
              {/* Close button on mid-screen overlay (768-1279) */}
              <button
                onClick={() => setOverlayPanel(null)}
                aria-label="Close units overlay"
                className="xl:hidden w-6 h-6 flex items-center justify-center rounded-[4px] bg-[var(--surface-raised)] border border-[var(--hairline)] hover:border-[var(--hairline-hover)] text-[var(--ink-muted)] hover:text-[var(--ink)] cursor-pointer focus-ring active:scale-95"
              >
                <IconClose size={12} />
              </button>
            </div>
          </div>

          {/* Units Scroll List */}
          <div className="flex-1 overflow-y-auto divide-y divide-[var(--hairline)] p-1">
            {ambulances.map((unit) => {
              const zone = zoneMap.get(unit.zoneId);
              const isSelected = selectedUnit?.id === unit.id;
              const isAvailable = unit.status === 'Available';

              return (
                <div
                  key={unit.id}
                  onClick={() => handleSelectUnit(unit)}
                  className={`p-2.5 rounded-[6px] transition-colors cursor-pointer flex items-center justify-between gap-2 ${
                    isSelected
                      ? 'bg-[var(--surface-raised)] ring-1 ring-[var(--hairline-hover)]'
                      : 'hover:bg-[var(--surface-raised)]/70'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{
                        backgroundColor: isAvailable ? 'var(--unit-available)' : 'var(--unit-busy)',
                      }}
                    />
                    <div className="flex flex-col">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono-numbers text-xs font-semibold text-[var(--ink)]">
                          {unit.id}
                        </span>
                        <span className="font-mono-numbers text-[10px] px-1 py-0.2 rounded-[2px] bg-[var(--surface-raised)] border border-[var(--hairline)] text-[var(--ink-muted)]">
                          {unit.type}
                        </span>
                      </div>
                      <span className="font-mono-numbers text-[10px] text-[var(--ink-muted)]">
                        {zone ? `${zone.id} · ${zone.name}` : `Zone ${unit.zoneId}`}
                      </span>
                    </div>
                  </div>

                  <span
                    className="font-mono-numbers text-[10px] uppercase tracking-wider font-medium"
                    style={{
                      color: isAvailable ? 'var(--unit-available)' : 'var(--unit-busy)',
                    }}
                  >
                    {unit.status}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* 6. Mobile Draggable Bottom Sheet (390px - 767px) */}
      <div
        className={`md:hidden absolute left-0 right-0 bottom-0 z-30 bg-[var(--surface)]/98 backdrop-blur-md border-t border-[var(--hairline)] shadow-2xl rounded-t-[16px] flex flex-col transition-all duration-240 ease-[cubic-bezier(0.16,1,0.3,1)] pointer-events-auto ${
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
          <div className="w-10 h-1 rounded-full bg-[var(--hairline-active)]" />
        </button>

        {/* Sheet Tabs Bar */}
        <div className="flex items-center justify-between px-3 pb-2 border-b border-[var(--hairline)] shrink-0">
          <div className="flex items-center gap-1">
            <button
              onClick={() => {
                setSheetTab('calls');
                if (sheetSnap === 'peek') setSheetSnap('half');
              }}
              className={`px-2.5 py-1 text-xs font-mono-numbers uppercase tracking-wider rounded-[6px] transition-colors focus-ring cursor-pointer ${
                sheetTab === 'calls'
                  ? 'bg-[var(--ink)] text-[var(--bg-app)] font-medium'
                  : 'text-[var(--ink-muted)] hover:text-[var(--ink)]'
              }`}
            >
              Calls ({pendingCalls.length})
            </button>
            <button
              onClick={() => {
                setSheetTab('units');
                if (sheetSnap === 'peek') setSheetSnap('half');
              }}
              className={`px-2.5 py-1 text-xs font-mono-numbers uppercase tracking-wider rounded-[6px] transition-colors focus-ring cursor-pointer ${
                sheetTab === 'units'
                  ? 'bg-[var(--ink)] text-[var(--bg-app)] font-medium'
                  : 'text-[var(--ink-muted)] hover:text-[var(--ink)]'
              }`}
            >
              Units ({ambulances.length})
            </button>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setIsAddModalOpen(true)}
              aria-label="Log Call"
              className="w-6 h-6 flex items-center justify-center rounded-[4px] bg-[var(--surface-raised)] border border-[var(--hairline)] text-xs font-semibold text-[var(--ink)] focus-ring active:scale-95 cursor-pointer"
            >
              +
            </button>
            <button
              onClick={() => setSheetSnap((prev) => (prev === 'peek' ? 'half' : prev === 'half' ? 'full' : 'peek'))}
              aria-label="Expand or minimize sheet"
              className="text-[10px] font-mono-numbers px-2 py-0.5 rounded-[4px] bg-[var(--surface-raised)] border border-[var(--hairline)] text-[var(--ink-muted)] focus-ring cursor-pointer"
            >
              {sheetSnap === 'peek' ? '↑ Open' : sheetSnap === 'half' ? '↑ Full' : '↓ Hide'}
            </button>
          </div>
        </div>

        {/* Sheet Scroll Body */}
        {sheetSnap !== 'peek' && (
          <div className="flex-1 overflow-y-auto p-2 divide-y divide-[var(--hairline)]">
            {sheetTab === 'calls' ? (
              pendingCalls.length === 0 ? (
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
                          ? 'bg-[var(--surface-raised)] ring-1 ring-[var(--hairline-hover)]'
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
              )
            ) : (
              ambulances.map((unit) => {
                const zone = zoneMap.get(unit.zoneId);
                const isSelected = selectedUnit?.id === unit.id;
                const isAvailable = unit.status === 'Available';
                return (
                  <div
                    key={unit.id}
                    onClick={() => {
                      handleSelectUnit(unit);
                      setSheetSnap('peek');
                    }}
                    className={`p-2.5 rounded-[6px] transition-colors cursor-pointer flex items-center justify-between gap-2 ${
                      isSelected
                        ? 'bg-[var(--surface-raised)] ring-1 ring-[var(--hairline-hover)]'
                        : 'hover:bg-[var(--surface-raised)]/70'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{
                          backgroundColor: isAvailable ? 'var(--unit-available)' : 'var(--unit-busy)',
                        }}
                      />
                      <div className="flex flex-col">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono-numbers text-xs font-semibold text-[var(--ink)]">
                            {unit.id}
                          </span>
                          <span className="font-mono-numbers text-[10px] px-1 rounded-[2px] bg-[var(--surface-raised)] border border-[var(--hairline)] text-[var(--ink-muted)]">
                            {unit.type}
                          </span>
                        </div>
                        <span className="font-mono-numbers text-[10px] text-[var(--ink-muted)]">
                          {zone ? `${zone.id} · ${zone.name}` : `Zone ${unit.zoneId}`}
                        </span>
                      </div>
                    </div>
                    <span
                      className="font-mono-numbers text-[10px] uppercase font-medium"
                      style={{
                        color: isAvailable ? 'var(--unit-available)' : 'var(--unit-busy)',
                      }}
                    >
                      {unit.status}
                    </span>
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
                        ? 'bg-[var(--surface-raised)] border-[var(--hairline-active)] ring-1 ring-[var(--hairline-active)]'
                        : 'bg-[var(--surface)] border-[var(--hairline)] hover:border-[var(--hairline-hover)]'
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
                      : 'bg-[var(--surface)] border-[var(--hairline)] text-[var(--ink-muted)] hover:text-[var(--ink)]'
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
          <div className="flex items-center justify-between p-3 rounded-[6px] bg-[var(--surface)] border border-[var(--hairline)]">
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
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--hairline)]">
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
              <ProvenanceChip kind="REAL SAMPLE" />
            </div>

            <div className="p-3 bg-[var(--surface)] border border-[var(--hairline)] rounded-[8px] flex flex-col gap-2 font-mono-numbers text-xs">
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

            <div className="flex items-center gap-2 mt-auto pt-4 border-t border-[var(--hairline)]">
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

            <div className="p-3 bg-[var(--surface)] border border-[var(--hairline)] rounded-[8px] flex flex-col gap-2 font-mono-numbers text-xs">
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
                <div className="p-2.5 rounded-[8px] bg-[var(--surface-raised)] border border-[var(--hairline)] flex flex-col gap-2 mt-2">
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
                          } catch (e: any) {
                            addToast({ type: 'error', message: e.message });
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
                          } catch (e: any) {
                            addToast({ type: 'error', message: e.message });
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
                        } catch (e: any) {
                          addToast({ type: 'error', message: e.message });
                        }
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              );
            })()}

            <div className="flex items-center gap-2 mt-auto pt-4 border-t border-[var(--hairline)]">
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
              <Button
                variant={selectedUnit.status === 'Available' ? 'secondary' : 'primary'}
                size="sm"
                className="flex-1"
                onClick={async () => {
                  const nextStatus = selectedUnit.status === 'Available' ? 'Busy' : 'Available';
                  await dataSource.updateAmbulanceStatus(selectedUnit.id, nextStatus);
                  setSelectedUnit((prev) => (prev ? { ...prev, status: nextStatus } : null));
                }}
              >
                {selectedUnit.status === 'Available' ? 'Hold' : 'Release'}
              </Button>
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
