import React, { useState, useEffect, useMemo } from 'react';
import { Emergency, EmergencyPriority, EmergencyStatus, Zone } from '../../types';
import { dataSource } from '../../data';
import {
  TriageTag,
  Button,
  IconButton,
  Modal,
  EmptyState,
  IconClose,
  IconCheck,
  IconAls,
  IconBls,
  ToastMessage,
} from '../../design-system';

interface EmergencyTableViewProps {
  emergencies: Emergency[];
  zones: Zone[];
  onAddToast: (toast: Omit<ToastMessage, 'id'>) => void;
  compact?: boolean;
  onSelectCall?: (call: Emergency) => void;
}

export function EmergencyTableView({
  emergencies,
  zones,
  onAddToast,
  compact = false,
  onSelectCall,
}: EmergencyTableViewProps) {
  const [filter, setFilter] = useState<string>('all');
  const [sortField, setSortField] = useState<'id' | 'priority' | 'zone' | 'status' | 'age'>('priority');
  const [sortAsc, setSortAsc] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(0);
  const [currentTime, setCurrentTime] = useState(Date.now());

  // Cancel Confirmation Modal State
  const [pendingCancelCall, setPendingCancelCall] = useState<Emergency | null>(null);

  // Zone Map Lookup
  const zoneMap = useMemo(() => {
    const map = new Map<string, Zone>();
    zones.forEach((z) => map.set(z.id, z));
    return map;
  }, [zones]);

  // Live timer for relative elapsed time
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const formatElapsed = (timestamp: number) => {
    const sec = Math.max(0, Math.floor((currentTime - timestamp) / 1000));
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}m ${String(s).padStart(2, '0')}s`;
  };

  const priorityWeights: Record<EmergencyPriority, number> = {
    Critical: 4,
    High: 3,
    Medium: 2,
    Low: 1,
  };

  // Filter & Sort
  const filteredEmergencies = useMemo(() => {
    return emergencies
      .filter((e) => {
        if (filter === 'all') return true;
        if (filter === 'Pending' || filter === 'Dispatched' || filter === 'Completed' || filter === 'Cancelled') {
          return e.status === filter;
        }
        if (filter === 'Critical' || filter === 'High' || filter === 'Medium' || filter === 'Low') {
          return e.priority === filter;
        }
        return true;
      })
      .sort((a, b) => {
        let diff = 0;
        if (sortField === 'priority') {
          diff = priorityWeights[a.priority] - priorityWeights[b.priority];
        } else if (sortField === 'id') {
          diff = a.id.localeCompare(b.id, undefined, { numeric: true });
        } else if (sortField === 'zone') {
          diff = a.zoneId.localeCompare(b.zoneId);
        } else if (sortField === 'status') {
          diff = a.status.localeCompare(b.status);
        } else if (sortField === 'age') {
          diff = a.requestedAt - b.requestedAt;
        }
        return sortAsc ? diff : -diff;
      });
  }, [emergencies, filter, sortField, sortAsc]);

  const toggleSort = (field: typeof sortField) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(false);
    }
  };

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setFocusedIndex((prev) => Math.min(prev + 1, filteredEmergencies.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setFocusedIndex((prev) => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter') {
      const call = filteredEmergencies[focusedIndex];
      if (call) onSelectCall?.(call);
    }
  };

  // Step Status Forward (Pending -> Dispatched -> Completed)
  const handleStepStatus = async (call: Emergency) => {
    const oldStatus = call.status;
    let nextStatus: EmergencyStatus = 'Pending';
    if (oldStatus === 'Pending') nextStatus = 'Dispatched';
    else if (oldStatus === 'Dispatched') nextStatus = 'Completed';
    else return;

    try {
      await dataSource.updateEmergencyStatus(call.id, nextStatus);
      onAddToast({
        type: 'success',
        message: `${call.id} status updated to ${nextStatus}`,
        ...(nextStatus === 'Completed' ? { stamp: 'CLEARED' as const } : {}),
      });
    } catch (err: any) {
      onAddToast({
        type: 'error',
        message: err?.message || `Failed to update status for ${call.id}`,
      });
    }
  };

  // Cancel call with Undo support
  const handleConfirmCancel = async () => {
    if (!pendingCancelCall) return;
    const callToCancel = pendingCancelCall;
    setPendingCancelCall(null);

    try {
      await dataSource.updateEmergencyStatus(callToCancel.id, 'Cancelled');
      onAddToast({
        type: 'undo',
        message: `Call ${callToCancel.id} cancelled`,
        durationMs: 6000,
        undoAction: async () => {
          await dataSource.updateEmergencyStatus(callToCancel.id, callToCancel.status);
        },
      });
    } catch (err: any) {
      onAddToast({
        type: 'error',
        message: err?.message || `Failed to cancel call ${callToCancel.id}`,
      });
    }
  };

  return (
    <div className="flex flex-col gap-4 w-full" onKeyDown={handleKeyDown} tabIndex={0}>
      {/* Filter Chips Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b-2 border-[var(--line)]">
        <div className="flex flex-wrap items-center gap-2">
          {(['all', 'Pending', 'Dispatched', 'Completed', 'Critical', 'High'] as const).map((opt) => (
            <button
              key={opt}
              onClick={() => setFilter(opt)}
              className={`px-3 py-1 text-xs font-mono-numbers uppercase tracking-wider rounded-full border-2 transition-all cursor-pointer font-bold select-none ${
                filter === opt
                  ? 'bg-[var(--ink)] text-[var(--bg-app)] border-[var(--line)] shadow-[2px_2px_0_var(--signal)]'
                  : 'bg-[var(--surface-raised)] border-[var(--line)] text-[var(--ink)] shadow-[2px_2px_0_var(--shadow-ink)] hover:-translate-y-0.5'
              }`}
            >
              {opt}
            </button>
          ))}
        </div>

        <span className="font-mono-numbers text-xs text-[var(--ink-muted)] font-bold">
          {filteredEmergencies.length} of {emergencies.length} calls
        </span>
      </div>

      {/* Dense Emergency Table */}
      {filteredEmergencies.length === 0 ? (
        <EmptyState
          title="Empty"
          actionLabel="Reset filter"
          onAction={() => setFilter('all')}
        />
      ) : (
        <div className="overflow-x-auto rounded-[20px] border-2 border-[var(--line)] bg-[var(--surface)] shadow-[6px_6px_0_var(--shadow-ink)]">
          <table className="w-full text-left text-xs font-ui border-collapse">
            <thead>
              <tr className="border-b-2 border-[var(--line)] bg-[var(--surface-raised)] text-[11px] font-mono-numbers text-[var(--ink-muted)] uppercase tracking-wider select-none font-bold">
                <th
                  onClick={() => toggleSort('id')}
                  className="py-2.5 px-3.5 font-medium cursor-pointer hover:text-[var(--ink)]"
                >
                  Call {sortField === 'id' && (sortAsc ? '↑' : '↓')}
                </th>
                <th
                  onClick={() => toggleSort('priority')}
                  className="py-2.5 px-3 font-medium cursor-pointer hover:text-[var(--ink)]"
                >
                  Priority {sortField === 'priority' && (sortAsc ? '↑' : '↓')}
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
                  onClick={() => toggleSort('age')}
                  className="py-2.5 px-3 font-medium cursor-pointer hover:text-[var(--ink)]"
                >
                  Elapsed {sortField === 'age' && (sortAsc ? '↑' : '↓')}
                </th>
                {!compact && <th className="py-2.5 px-3 font-medium">Equipment</th>}
                <th className="py-2.5 px-3.5 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--line)]">
              {filteredEmergencies.map((em, idx) => {
                const zone = zoneMap.get(em.zoneId);
                const isFocused = idx === focusedIndex;

                // 3-dot status stepper track calculation
                const stepIdx =
                  em.status === 'Pending'
                    ? 0
                    : em.status === 'Dispatched'
                    ? 1
                    : em.status === 'Completed'
                    ? 2
                    : -1;

                return (
                  <tr
                    key={em.id}
                    onClick={() => onSelectCall?.(em)}
                    onMouseEnter={() => setFocusedIndex(idx)}
                    className={`transition-colors cursor-pointer ${
                      isFocused
                        ? 'bg-[var(--surface-raised)] ring-1 ring-inset ring-[var(--line)]'
                        : 'hover:bg-[var(--surface-raised)]/60'
                    }`}
                  >
                    {/* Call ID */}
                    <td className="py-2.5 px-3.5 font-mono-numbers font-semibold text-[var(--ink)] whitespace-nowrap">
                      {em.id}
                    </td>

                    {/* Priority Triage Tag */}
                    <td className="py-2.5 px-3 whitespace-nowrap">
                      <TriageTag priority={em.priority} weight={em.weight} size="sm" />
                    </td>

                    {/* Zone */}
                    <td className="py-2.5 px-3 font-mono-numbers text-[var(--ink)] whitespace-nowrap">
                      {zone ? `${zone.id} · ${zone.name}` : `Zone ${em.zoneId}`}
                    </td>

                    {/* Status Stepper: 3-dot track (Pending → Dispatched → Completed) */}
                    <td className="py-2.5 px-3 whitespace-nowrap">
                      {em.status === 'Cancelled' ? (
                        <span className="font-mono-numbers text-[10px] text-[var(--critical)] uppercase">
                          Cancelled
                        </span>
                      ) : (
                        <div className="inline-flex items-center gap-1.5" title={`Status: ${em.status}`}>
                          {/* 3-dot track with connecting hairline */}
                          <div className="relative flex items-center gap-2">
                            <div className="absolute top-1/2 left-1.5 right-1.5 -translate-y-1/2 h-[1px] bg-[var(--line)] pointer-events-none" />
                            {[0, 1, 2].map((s) => {
                              const isCompletedStep = stepIdx >= s;
                              const isCurrent = stepIdx === s;
                              return (
                                <span
                                  key={s}
                                  className={`relative z-10 w-2 h-2 rounded-full transition-all ${
                                    isCurrent
                                      ? 'bg-[var(--unit-available)] ring-2 ring-[var(--unit-available)]/30 scale-125'
                                      : isCompletedStep
                                      ? 'bg-[var(--unit-available)]'
                                      : 'bg-[var(--line)]'
                                  }`}
                                />
                              );
                            })}
                          </div>
                          <span className="font-mono-numbers text-[10px] text-[var(--ink-muted)] uppercase ml-1">
                            {em.status}
                          </span>
                        </div>
                      )}
                    </td>

                    {/* Elapsed Waiting Time */}
                    <td className="py-2.5 px-3 font-mono-numbers text-[11px] text-[var(--ink)] tabular-nums whitespace-nowrap">
                      {formatElapsed(em.requestedAt)}
                    </td>

                    {/* Equipment */}
                    {!compact && (
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1 font-mono-numbers text-[10px] text-[var(--ink-muted)]">
                          {em.requiresAls ? (
                            <>
                              <IconAls size={12} className="text-[var(--high)]" />
                              <span>ALS</span>
                            </>
                          ) : (
                            <>
                              <IconBls size={12} className="text-[var(--unit-available)]" />
                              <span>BLS</span>
                            </>
                          )}
                        </span>
                      </td>
                    )}

                    {/* Actions */}
                    <td className="py-2.5 px-3.5 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                        {em.status !== 'Completed' && em.status !== 'Cancelled' && (
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => handleStepStatus(em)}
                          >
                            {em.status === 'Pending' ? 'Dispatch' : 'Complete'}
                          </Button>
                        )}
                        {em.status !== 'Cancelled' && em.status !== 'Completed' && (
                          <Button
                            variant="danger"
                            size="sm"
                            onClick={() => setPendingCancelCall(em)}
                          >
                            Cancel
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Cancel Confirmation Modal */}
      <Modal
        isOpen={Boolean(pendingCancelCall)}
        onClose={() => setPendingCancelCall(null)}
        title="Cancel Incident"
      >
        <div className="flex flex-col gap-4">
          <p className="text-xs text-[var(--ink-muted)] leading-relaxed font-ui">
            Are you sure you want to cancel call <strong className="text-[var(--ink)] font-mono-numbers">{pendingCancelCall?.id}</strong>? An undo window will remain open for 6 seconds.
          </p>
          <div className="flex items-center justify-end gap-2 pt-3 border-t border-[var(--line)]">
            <Button variant="ghost" size="sm" onClick={() => setPendingCancelCall(null)}>
              Dismiss
            </Button>
            <Button variant="danger" size="sm" onClick={handleConfirmCancel}>
              Cancel Call
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
