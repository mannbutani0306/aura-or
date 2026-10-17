import React, { useState, useEffect, useMemo } from 'react';
import {
  Ambulance,
  AmbulanceStatus,
  AmbulanceType,
  Emergency,
  Zone,
} from '../../types';
import { dataSource } from '../../data';
import {
  UnitMarker,
  Button,
  IconButton,
  Modal,
  Drawer,
  EmptyState,
  ProvenanceChip,
  ToastContainer,
  ToastMessage,
  IconClose,
  IconAls,
  IconBls,
  SectionTitle,
  Wristband,
} from '../../design-system';
import { EmergencyTableView } from './EmergencyTableView';

interface FleetViewProps {
  onNavigate: (route: string) => void;
}

export function FleetView({ onNavigate }: FleetViewProps) {
  // Mode Toggle: 'fleet' | 'calls'
  const [activeMode, setActiveMode] = useState<'fleet' | 'calls'>('fleet');

  // Domain Data State
  const [ambulances, setAmbulances] = useState<Ambulance[]>([]);
  const [emergencies, setEmergencies] = useState<Emergency[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);
  const [currentTime, setCurrentTime] = useState(Date.now());

  // Filter & Sort State for Fleet
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedZoneFilter, setSelectedZoneFilter] = useState<string | null>(null);
  const [sortField, setSortField] = useState<'id' | 'type' | 'zone' | 'status' | 'updatedAt'>('id');
  const [sortAsc, setSortAsc] = useState(true);
  const [focusedIndex, setFocusedIndex] = useState(0);

  // Modals & Drawers State
  const [isAddUnitOpen, setIsAddUnitOpen] = useState(false);
  const [newUnitId, setNewUnitId] = useState('');
  const [newUnitType, setNewUnitType] = useState<AmbulanceType>('BLS');
  const [newUnitZone, setNewUnitZone] = useState('A');
  const [newUnitStatus, setNewUnitStatus] = useState<AmbulanceStatus>('Available');
  const [isDeploying, setIsDeploying] = useState(false);

  const [unitToDelete, setUnitToDelete] = useState<Ambulance | null>(null);
  const [inspectedUnit, setInspectedUnit] = useState<Ambulance | null>(null);

  // Toast State
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const addToast = (toast: Omit<ToastMessage, 'id'>) => {
    const id = `toast-${Date.now()}-${Math.random()}`;
    setToasts((prev) => [...prev, { ...toast, id }]);
  };

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  // Load and Subscribe
  useEffect(() => {
    const load = async () => {
      const [ambs, ems, zs] = await Promise.all([
        dataSource.getAmbulances(),
        dataSource.getEmergencies(),
        dataSource.getZones(),
      ]);
      setAmbulances(ambs);
      setEmergencies(ems);
      setZones(zs);
    };

    load();
    const unsubscribe = dataSource.subscribe(load);
    return () => unsubscribe();
  }, []);

  // Timer for relative time formatting
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(Date.now()), 2000);
    return () => clearInterval(timer);
  }, []);

  const formatRelativeTime = (timestamp?: number) => {
    if (!timestamp) return 'idle';
    const elapsedSec = Math.max(0, Math.floor((currentTime - timestamp) / 1000));
    if (elapsedSec < 60) return `${elapsedSec}s ago`;
    const m = Math.floor(elapsedSec / 60);
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    return `${h}h ago`;
  };

  // Zone Map Lookup
  const zoneMap = useMemo(() => {
    const map = new Map<string, Zone>();
    zones.forEach((z) => map.set(z.id, z));
    return map;
  }, [zones]);

  // Stacked Units per Zone for Slim Right Sidebar
  const unitsByZone = useMemo(() => {
    const counts = new Map<string, { available: number; busy: number; offline: number }>();
    zones.forEach((z) => counts.set(z.id, { available: 0, busy: 0, offline: 0 }));

    ambulances.forEach((a) => {
      const c = counts.get(a.zoneId);
      if (c) {
        if (a.status === 'Available') c.available++;
        else if (a.status === 'Busy') c.busy++;
        else c.offline++;
      }
    });

    return counts;
  }, [zones, ambulances]);

  // Filtered and Sorted Fleet
  const filteredAmbulances = useMemo(() => {
    return ambulances
      .filter((amb) => {
        // Status or type filter
        if (statusFilter === 'Available' || statusFilter === 'Busy' || statusFilter === 'Offline') {
          if (amb.status !== statusFilter) return false;
        } else if (statusFilter === 'ALS' || statusFilter === 'BLS') {
          if (amb.type !== statusFilter) return false;
        }

        // Zone sidebar filter
        if (selectedZoneFilter && amb.zoneId !== selectedZoneFilter) {
          return false;
        }

        return true;
      })
      .sort((a, b) => {
        let diff = 0;
        if (sortField === 'id') {
          diff = a.id.localeCompare(b.id, undefined, { numeric: true });
        } else if (sortField === 'type') {
          diff = a.type.localeCompare(b.type);
        } else if (sortField === 'zone') {
          diff = a.zoneId.localeCompare(b.zoneId);
        } else if (sortField === 'status') {
          diff = a.status.localeCompare(b.status);
        } else if (sortField === 'updatedAt') {
          diff = (a.updatedAt ?? 0) - (b.updatedAt ?? 0);
        }
        return sortAsc ? diff : -diff;
      });
  }, [ambulances, statusFilter, selectedZoneFilter, sortField, sortAsc]);

  const toggleSort = (field: typeof sortField) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(true);
    }
  };

  // Keyboard Navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (activeMode !== 'fleet') return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setFocusedIndex((prev) => Math.min(prev + 1, filteredAmbulances.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setFocusedIndex((prev) => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter') {
      const amb = filteredAmbulances[focusedIndex];
      if (amb) setInspectedUnit(amb);
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      const amb = filteredAmbulances[focusedIndex];
      if (amb) setUnitToDelete(amb);
    }
  };

  // Inline Status Change via Segmented Control
  const handleStatusChange = async (amb: Ambulance, newStatus: AmbulanceStatus) => {
    const prevStatus = amb.status;
    if (prevStatus === newStatus) return;

    try {
      await dataSource.updateAmbulanceStatus(amb.id, newStatus);
      addToast({
        type: 'success',
        message: `Unit ${amb.id} marked ${newStatus}`,
      });
    } catch (err: any) {
      addToast({
        type: 'error',
        message: err?.message || `Failed to update status for ${amb.id}`,
      });
    }
  };

  // Add Unit
  const handleDeployUnit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsDeploying(true);

    try {
      const generatedId = newUnitId.trim() || `A${ambulances.length + 1}`;
      const created = await dataSource.createAmbulance({
        id: generatedId,
        zoneId: newUnitZone,
        type: newUnitType,
        status: newUnitStatus,
      });

      setIsAddUnitOpen(false);
      setNewUnitId('');
      addToast({
        type: 'success',
        message: `Unit ${created.id} deployed to ${zoneMap.get(created.zoneId)?.name}`,
      });
    } catch (err: unknown) {
      addToast({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to deploy unit',
      });
    } finally {
      setIsDeploying(false);
    }
  };

  // Delete Unit with 6s Undo Toast
  const handleConfirmDelete = async () => {
    if (!unitToDelete) return;
    const toDelete = unitToDelete;
    setUnitToDelete(null);

    try {
      await dataSource.deleteAmbulance(toDelete.id);
      addToast({
        type: 'undo',
        message: `Unit ${toDelete.id} deleted`,
        durationMs: 6000,
        undoAction: async () => {
          await dataSource.restoreAmbulance(toDelete);
        },
      });
    } catch (err: any) {
      addToast({
        type: 'error',
        message: err?.message || `Failed to delete unit ${toDelete.id}`,
      });
    }
  };

  return (
    <div
      className="flex flex-col gap-6 w-full max-w-7xl mx-auto focus:outline-none"
      onKeyDown={handleKeyDown}
      tabIndex={0}
    >
      {/* Top Header & Mode Toggle: "Fleet | Calls" */}
      <SectionTitle
        eyebrow="MADURAI DIRECTORY"
        title={activeMode === 'fleet' ? 'Fleet inventory & sector distribution' : 'Emergency call registry'}
        accentWord={activeMode === 'fleet' ? 'inventory' : 'registry'}
        action={
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center p-1 rounded-full bg-[var(--surface-raised)] border-2 border-[var(--line)] shadow-[2px_2px_0_var(--shadow-ink)]">
              <button
                onClick={() => setActiveMode('fleet')}
                className={`px-3.5 py-1 text-xs font-mono-numbers uppercase tracking-wider rounded-full transition-all cursor-pointer ${
                  activeMode === 'fleet'
                    ? 'bg-[var(--ink)] text-[var(--bg-app)] font-bold shadow-[2px_2px_0_var(--signal)]'
                    : 'text-[var(--ink-muted)] hover:text-[var(--ink)]'
                }`}
              >
                Fleet ({ambulances.length})
              </button>
              <button
                onClick={() => setActiveMode('calls')}
                className={`px-3.5 py-1 text-xs font-mono-numbers uppercase tracking-wider rounded-full transition-all cursor-pointer ${
                  activeMode === 'calls'
                    ? 'bg-[var(--ink)] text-[var(--bg-app)] font-bold shadow-[2px_2px_0_var(--signal)]'
                    : 'text-[var(--ink-muted)] hover:text-[var(--ink)]'
                }`}
              >
                Calls ({emergencies.length})
              </button>
            </div>
            {activeMode === 'fleet' ? (
              <Button
                variant="primary"
                size="sm"
                onClick={() => {
                  setNewUnitId(`A${ambulances.length + 1}`);
                  setIsAddUnitOpen(true);
                }}
              >
                Deploy Unit
              </Button>
            ) : (
              <Button variant="secondary" size="sm" onClick={() => onNavigate('command')}>
                New Call
              </Button>
            )}
          </div>
        }
      />

      {/* Mode 1: FLEET TABLE + SLIM RIGHT ZONE SELECTOR */}
      {activeMode === 'fleet' ? (
        <div className="flex flex-col lg:flex-row items-start gap-6 w-full">
          {/* Main Fleet Table Column */}
          <div className="flex-1 flex flex-col gap-4 w-full">
            {/* Filter Chips Bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 pb-2 border-b border-[var(--line)]">
              <div className="flex flex-wrap items-center gap-1.5">
                {(['all', 'Available', 'Busy', 'Offline', 'ALS', 'BLS'] as const).map((opt) => (
                  <button
                    key={opt}
                    onClick={() => setStatusFilter(opt)}
                    className={`px-2.5 py-1 text-xs font-mono-numbers uppercase tracking-wider rounded-[6px] border transition-colors cursor-pointer ${
                      statusFilter === opt
                        ? 'bg-[var(--surface-raised)] border-[var(--line)] text-[var(--ink)] font-semibold shadow-xs'
                        : 'bg-[var(--surface)] border-[var(--line)] text-[var(--ink-muted)] hover:text-[var(--ink)]'
                    }`}
                  >
                    {opt}
                  </button>
                ))}

                {selectedZoneFilter && (
                  <button
                    onClick={() => setSelectedZoneFilter(null)}
                    className="px-2 py-1 text-xs font-mono-numbers rounded-[6px] bg-[var(--surface-raised)] border border-[var(--line)] text-[var(--ink)] flex items-center gap-1 cursor-pointer"
                  >
                    <span>Zone {selectedZoneFilter}</span>
                    <IconClose size={12} />
                  </button>
                )}
              </div>

              <span className="font-mono-numbers text-xs text-[var(--ink-muted)]">
                {filteredAmbulances.length} of {ambulances.length} units
              </span>
            </div>

            {/* Dense Fleet Table */}
            {filteredAmbulances.length === 0 ? (
              <EmptyState
                title="Empty"
                actionLabel="Deploy Unit"
                onAction={() => setIsAddUnitOpen(true)}
              />
            ) : (
              <div className="overflow-x-auto rounded-[20px] border-2 border-[var(--line)] bg-[var(--surface)] shadow-[6px_6px_0_var(--shadow-ink)]">
                <table className="w-full text-left text-xs font-ui border-collapse">
                  <thead>
                    <tr className="border-b border-[var(--line)] bg-[var(--surface-raised)]/60 text-[11px] font-mono-numbers text-[var(--ink-muted)] uppercase tracking-wider select-none">
                      <th
                        onClick={() => toggleSort('id')}
                        className="py-2.5 px-3.5 font-medium cursor-pointer hover:text-[var(--ink)]"
                      >
                        Unit {sortField === 'id' && (sortAsc ? '↑' : '↓')}
                      </th>
                      <th
                        onClick={() => toggleSort('type')}
                        className="py-2.5 px-3 font-medium cursor-pointer hover:text-[var(--ink)]"
                      >
                        Type {sortField === 'type' && (sortAsc ? '↑' : '↓')}
                      </th>
                      <th
                        onClick={() => toggleSort('zone')}
                        className="py-2.5 px-3 font-medium cursor-pointer hover:text-[var(--ink)]"
                      >
                        Zone {sortField === 'zone' && (sortAsc ? '↑' : '↓')}
                      </th>
                      <th
                        onClick={() => toggleSort('status')}
                        className="py-2.5 px-3 font-medium cursor-pointer hover:text-[var(--ink)]"
                      >
                        Status {sortField === 'status' && (sortAsc ? '↑' : '↓')}
                      </th>
                      <th
                        onClick={() => toggleSort('updatedAt')}
                        className="py-2.5 px-3 font-medium cursor-pointer hover:text-[var(--ink)]"
                      >
                        Last Change {sortField === 'updatedAt' && (sortAsc ? '↑' : '↓')}
                      </th>
                      <th className="py-2.5 px-3.5 font-medium text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--line)]">
                    {filteredAmbulances.map((amb, idx) => {
                      const zone = zoneMap.get(amb.zoneId);
                      const isFocused = idx === focusedIndex;

                      return (
                        <tr
                          key={amb.id}
                          onClick={() => setInspectedUnit(amb)}
                          onMouseEnter={() => setFocusedIndex(idx)}
                          className={`transition-colors cursor-pointer ${
                            isFocused
                              ? 'bg-[var(--surface-raised)] ring-1 ring-inset ring-[var(--line)]'
                              : 'hover:bg-[var(--surface-raised)]/60'
                          }`}
                        >
                          {/* Unit (Marker + ID) */}
                          <td className="py-2.5 px-3.5 whitespace-nowrap">
                            <div className="flex items-center gap-2">
                              <UnitMarker status={amb.status} size="sm" />
                              <span className="font-mono-numbers font-semibold text-sm text-[var(--ink)]">
                                {amb.id}
                              </span>
                            </div>
                          </td>

                          {/* Type (Glyph + text) */}
                          <td className="py-2.5 px-3 whitespace-nowrap">
                            <span className="inline-flex items-center gap-1.5 font-mono-numbers text-[11px] text-[var(--ink)]">
                              {amb.type === 'ALS' ? (
                                <IconAls size={14} className="text-[var(--high)]" />
                              ) : (
                                <IconBls size={14} className="text-[var(--unit-available)]" />
                              )}
                              <span>{amb.type}</span>
                            </span>
                          </td>

                          {/* Zone */}
                          <td className="py-2.5 px-3 font-mono-numbers text-[var(--ink)] whitespace-nowrap">
                            {zone ? `${zone.id} · ${zone.name}` : `Zone ${amb.zoneId}`}
                          </td>

                          {/* Status: Inline Segmented Control */}
                          <td className="py-2 px-3 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                            <div className="inline-flex items-center p-0.5 rounded-[6px] bg-[var(--surface-raised)] border border-[var(--line)]">
                              {(['Available', 'Busy', 'Offline'] as const).map((st) => (
                                <button
                                  key={st}
                                  onClick={() => handleStatusChange(amb, st)}
                                  className={`px-2 py-0.5 text-[10px] font-mono-numbers uppercase tracking-wider rounded-[4px] transition-colors cursor-pointer ${
                                    amb.status === st
                                      ? st === 'Available'
                                        ? 'bg-[var(--unit-available)] text-white font-medium shadow-xs'
                                        : st === 'Busy'
                                        ? 'bg-[var(--unit-busy)] text-white font-medium shadow-xs'
                                        : 'bg-[var(--ink-subtle)] text-white font-medium shadow-xs'
                                      : 'text-[var(--ink-muted)] hover:text-[var(--ink)]'
                                  }`}
                                >
                                  {st}
                                </button>
                              ))}
                            </div>
                          </td>

                          {/* Last Change (Relative, mono) */}
                          <td className="py-2.5 px-3 font-mono-numbers text-[11px] text-[var(--ink-muted)] tabular-nums whitespace-nowrap">
                            {formatRelativeTime(amb.updatedAt)}
                          </td>

                          {/* Row Actions */}
                          <td className="py-2.5 px-3.5 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                            <div className="inline-flex items-center gap-1.5">
                              <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => setInspectedUnit(amb)}
                              >
                                Inspect
                              </Button>
                              <Button
                                variant="danger"
                                size="sm"
                                onClick={() => setUnitToDelete(amb)}
                              >
                                Delete
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Right Slim Zone Selector Sidebar with Stacked Dots */}
          <div className="w-full lg:w-64 bg-[var(--surface-raised)] border-2 border-[var(--line)] rounded-[20px] shadow-[6px_6px_0_var(--shadow-ink)] p-4 flex flex-col gap-3 shrink-0">
            <div className="flex items-center justify-between pb-2 border-b border-[var(--line)]">
              <span className="text-xs font-mono-numbers font-semibold uppercase tracking-wider text-[var(--ink)]">
                Sector Units
              </span>
              <span className="font-mono-numbers text-[10px] text-[var(--ink-muted)]">
                {zones.length} Zones
              </span>
            </div>

            <div className="flex flex-col gap-2">
              {zones.map((zone) => {
                const isSelected = selectedZoneFilter === zone.id;
                const counts = unitsByZone.get(zone.id) || { available: 0, busy: 0, offline: 0 };
                const totalInZone = counts.available + counts.busy + counts.offline;

                return (
                  <div
                    key={zone.id}
                    onClick={() =>
                      setSelectedZoneFilter(isSelected ? null : zone.id)
                    }
                    className={`p-2 rounded-[6px] border transition-colors cursor-pointer flex items-center justify-between ${
                      isSelected
                        ? 'bg-[var(--surface-raised)] border-[var(--line)] ring-1 ring-[var(--line)]'
                        : 'bg-[var(--surface-raised)]/40 border-[var(--line)] hover:border-[var(--line)]'
                    }`}
                  >
                    <div className="flex flex-col">
                      <span className="font-serif-display text-sm font-semibold text-[var(--ink)]">
                        {zone.id} · {zone.name}
                      </span>
                      <span className="text-[9px] font-mono-numbers text-[var(--ink-muted)] uppercase">
                        {zone.areaType}
                      </span>
                    </div>

                    {/* Stacked Dots for Units in this Zone */}
                    <div className="flex items-center gap-1">
                      {Array.from({ length: counts.available }).map((_, i) => (
                        <span
                          key={`avail-${i}`}
                          title="Available Unit"
                          className="w-2.5 h-2.5 rounded-full bg-[var(--unit-available)]"
                        />
                      ))}
                      {Array.from({ length: counts.busy }).map((_, i) => (
                        <span
                          key={`busy-${i}`}
                          title="Busy Unit"
                          className="w-2.5 h-2.5 rounded-full bg-[var(--unit-busy)]"
                        />
                      ))}
                      {Array.from({ length: counts.offline }).map((_, i) => (
                        <span
                          key={`off-${i}`}
                          title="Offline Unit"
                          className="w-2.5 h-2.5 rounded-full bg-[var(--ink-subtle)]"
                        />
                      ))}

                      {totalInZone === 0 && (
                        <span className="font-mono-numbers text-[10px] text-[var(--ink-subtle)]">
                          None
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {selectedZoneFilter && (
              <Button
                variant="ghost"
                size="sm"
                className="mt-1 w-full"
                onClick={() => setSelectedZoneFilter(null)}
              >
                Clear Zone Filter
              </Button>
            )}
          </div>
        </div>
      ) : (
        /* Mode 2: FULL-WIDTH CALLS TABLE */
        <EmergencyTableView
          emergencies={emergencies}
          zones={zones}
          onAddToast={addToast}
        />
      )}

      {/* Add Unit Modal */}
      <Modal
        isOpen={isAddUnitOpen}
        onClose={() => setIsAddUnitOpen(false)}
        title="Deploy Ambulance"
      >
        <form onSubmit={handleDeployUnit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-mono-numbers uppercase text-[var(--ink-muted)]">
              Unit Fleet ID
            </label>
            <input
              type="text"
              required
              value={newUnitId}
              onChange={(e) => setNewUnitId(e.target.value.toUpperCase())}
              placeholder="e.g. A6"
              className="px-3 py-2 text-xs font-mono-numbers rounded-[6px] bg-[var(--surface)] border border-[var(--line)] text-[var(--ink)] outline-none focus:border-[var(--ink)]"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-mono-numbers uppercase text-[var(--ink-muted)]">
              Equipment Type
            </label>
            <div className="grid grid-cols-2 gap-2">
              {(['BLS', 'ALS'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setNewUnitType(t)}
                  className={`p-2.5 rounded-[6px] border flex items-center justify-center gap-2 font-mono-numbers text-xs uppercase cursor-pointer ${
                    newUnitType === t
                      ? 'bg-[var(--surface-raised)] border-[var(--ink)] text-[var(--ink)] font-semibold'
                      : 'bg-[var(--surface)] border-[var(--line)] text-[var(--ink-muted)]'
                  }`}
                >
                  {t === 'ALS' ? <IconAls size={14} /> : <IconBls size={14} />}
                  <span>{t === 'ALS' ? 'ALS (Paramedic)' : 'BLS (Basic)'}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-mono-numbers uppercase text-[var(--ink-muted)]">
              Station Zone
            </label>
            <select
              value={newUnitZone}
              onChange={(e) => setNewUnitZone(e.target.value)}
              className="px-3 py-2 text-xs font-mono-numbers rounded-[6px] bg-[var(--surface)] border border-[var(--line)] text-[var(--ink)] outline-none focus:border-[var(--ink)]"
            >
              {zones.map((z) => (
                <option key={z.id} value={z.id}>
                  {z.id} · {z.name} ({z.areaType})
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-mono-numbers uppercase text-[var(--ink-muted)]">
              Initial Status
            </label>
            <div className="grid grid-cols-3 gap-2">
              {(['Available', 'Busy', 'Offline'] as const).map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setNewUnitStatus(st)}
                  className={`py-1.5 px-2 rounded-[6px] border text-center font-mono-numbers text-[10px] uppercase cursor-pointer ${
                    newUnitStatus === st
                      ? 'bg-[var(--surface-raised)] border-[var(--ink)] text-[var(--ink)] font-semibold'
                      : 'bg-[var(--surface)] border-[var(--line)] text-[var(--ink-muted)]'
                  }`}
                >
                  {st}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-[var(--line)]">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setIsAddUnitOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              isLoading={isDeploying}
            >
              Deploy
            </Button>
          </div>
        </form>
      </Modal>

      {/* Delete Unit Confirmation Modal */}
      <Modal
        isOpen={Boolean(unitToDelete)}
        onClose={() => setUnitToDelete(null)}
        title="Delete Unit"
      >
        <div className="flex flex-col gap-4">
          <p className="text-xs text-[var(--ink-muted)] leading-relaxed font-ui">
            Remove ambulance <strong className="text-[var(--ink)] font-mono-numbers">{unitToDelete?.id}</strong> from active fleet? An undo window will remain open for 6 seconds.
          </p>
          <div className="flex items-center justify-end gap-2 pt-3 border-t border-[var(--line)]">
            <Button variant="ghost" size="sm" onClick={() => setUnitToDelete(null)}>
              Dismiss
            </Button>
            <Button variant="danger" size="sm" onClick={handleConfirmDelete}>
              Delete
            </Button>
          </div>
        </div>
      </Modal>

      {/* Inspect / Edit Unit Drawer */}
      <Drawer
        isOpen={Boolean(inspectedUnit)}
        onClose={() => setInspectedUnit(null)}
        title={`Ambulance ${inspectedUnit?.id}`}
      >
        {inspectedUnit && (
          <div className="flex flex-col gap-5">
            <div className="flex items-center justify-between">
              <UnitMarker
                status={inspectedUnit.status}
                id={inspectedUnit.id}
                type={inspectedUnit.type}
                size="md"
              />
              <ProvenanceChip kind="REAL SAMPLE" />
            </div>

            <div className="p-3 bg-[var(--surface)] border border-[var(--line)] rounded-[8px] flex flex-col gap-2 font-mono-numbers text-xs">
              <div className="flex justify-between">
                <span className="text-[var(--ink-muted)]">Base Station</span>
                <span className="text-[var(--ink)] font-semibold">
                  {inspectedUnit.zoneId} · {zoneMap.get(inspectedUnit.zoneId)?.name}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--ink-muted)]">Classification</span>
                <span className="text-[var(--ink)] font-semibold">
                  {inspectedUnit.type === 'ALS' ? 'Advanced Life Support' : 'Basic Life Support'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--ink-muted)]">Current State</span>
                <span className="text-[var(--ink)] font-semibold">{inspectedUnit.status}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--ink-muted)]">Last Updated</span>
                <span className="text-[var(--ink)] tabular-nums">
                  {formatRelativeTime(inspectedUnit.updatedAt)}
                </span>
              </div>
            </div>

            {/* Reassign Zone Form */}
            <div className="flex flex-col gap-2 pt-2 border-t border-[var(--line)]">
              <label className="text-[11px] font-mono-numbers uppercase text-[var(--ink-muted)]">
                Reassign Base Station
              </label>
              <div className="grid grid-cols-3 gap-1.5">
                {zones.map((z) => (
                  <button
                    key={z.id}
                    onClick={async () => {
                      await dataSource.updateAmbulance(inspectedUnit.id, { zoneId: z.id });
                      setInspectedUnit((prev) => (prev ? { ...prev, zoneId: z.id } : null));
                      addToast({
                        type: 'success',
                        message: `Reassigned ${inspectedUnit.id} to Zone ${z.id}`,
                      });
                    }}
                    className={`p-1.5 rounded-[4px] border text-center font-mono-numbers text-xs cursor-pointer ${
                      inspectedUnit.zoneId === z.id
                        ? 'bg-[var(--surface-raised)] border-[var(--ink)] text-[var(--ink)] font-semibold'
                        : 'bg-[var(--surface)] border-[var(--line)] text-[var(--ink-muted)] hover:text-[var(--ink)]'
                    }`}
                  >
                    {z.id} · {z.name}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2 mt-auto pt-4 border-t border-[var(--line)]">
              <Button
                variant="danger"
                size="sm"
                className="w-full"
                onClick={() => {
                  setUnitToDelete(inspectedUnit);
                  setInspectedUnit(null);
                }}
              >
                Delete Unit
              </Button>
            </div>
          </div>
        )}
      </Drawer>

      {/* Floating 6-Second Undo / Action Toast Container */}
      <ToastContainer toasts={toasts} onDismiss={removeToast} />
    </div>
  );
}
