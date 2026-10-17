import React, { useState } from 'react';
import { Dispatch, Ambulance, Emergency, EmergencyPriority } from '../../types';
import { dataSource } from '../../data';
import { Button, Tooltip, TriageTag, ToastMessage } from '../../design-system';

interface LiveTimelineStripProps {
  dispatches: Dispatch[];
  ambulances: Ambulance[];
  emergencies: Emergency[];
  simSpeed?: number;
  currentTime?: number;
  slaBenchmarkMin?: number | null;
  onSelectDispatch?: (dispatch: Dispatch) => void;
  onNavigate?: (tab: string) => void;
  onToast?: (toast: Omit<ToastMessage, 'id'>) => void;
}

const PRIORITY_COLORS: Record<EmergencyPriority, string> = {
  Critical: '#E5322D',
  High: '#F08A00',
  Medium: '#E8C21A',
  Low: '#3FA66B',
};

export function LiveTimelineStrip({
  dispatches,
  ambulances,
  emergencies,
  simSpeed = 1,
  currentTime = Date.now(),
  slaBenchmarkMin = null,
  onSelectDispatch,
  onNavigate,
  onToast,
}: LiveTimelineStripProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [isActionLoading, setIsActionLoading] = useState<string | null>(null);

  const ambulanceMap = new Map(ambulances.map((a) => [a.id, a]));
  const emergencyMap = new Map(emergencies.map((e) => [e.id, e]));

  // Active dispatches (EnRoute, OnScene) + recent Completed (last 5 min)
  const activeDispatches = dispatches.filter(
    (d) => d.status === 'EnRoute' || d.status === 'OnScene' || d.status === 'Completed'
  );

  const enRouteCount = dispatches.filter((d) => d.status === 'EnRoute').length;
  const onSceneCount = dispatches.filter((d) => d.status === 'OnScene').length;

  const handleAdvance = async (dispatchId: string, nextStatus: 'OnScene' | 'Completed') => {
    setIsActionLoading(`${dispatchId}-${nextStatus}`);
    try {
      await dataSource.advanceDispatch(dispatchId, nextStatus);
      onToast?.({
        type: 'success',
        message: `Dispatch ${dispatchId} advanced to ${nextStatus}`,
        stamp: nextStatus === 'Completed' ? 'CLEARED' : 'ON SCENE',
      });
    } catch (err: any) {
      onToast?.({
        type: 'error',
        message: err.message || `Failed to advance dispatch to ${nextStatus}`,
      });
    } finally {
      setIsActionLoading(null);
    }
  };

  const handleCancel = async (dispatchId: string) => {
    setIsActionLoading(`${dispatchId}-cancel`);
    try {
      await dataSource.cancelDispatch(dispatchId);
      onToast?.({
        type: 'info',
        message: `Dispatch ${dispatchId} cancelled: Unit returned to Available, Call returned to Pending`,
      });
    } catch (err: any) {
      onToast?.({
        type: 'error',
        message: err.message || 'Failed to cancel dispatch',
      });
    } finally {
      setIsActionLoading(null);
    }
  };

  // Timeline maximum scale in minutes (default 15m to fit 10m SLA comfortably)
  const maxTimelineMin = 15.0;

  return (
    <div className="w-full bg-[var(--surface-raised)] border-t-2 border-[var(--line)] shadow-[0_-4px_0_var(--shadow-ink)] transition-all duration-200 z-20 flex flex-col font-mono-numbers">
      {/* Strip Header Bar */}
      <div className="flex items-center justify-between px-4 sm:px-6 py-2.5 border-b-2 border-[var(--line)] bg-[var(--surface)]/60 text-xs font-mono-numbers">
        <div className="flex items-center gap-2 sm:gap-3">
          <button
            onClick={() => setIsExpanded((prev) => !prev)}
            className="flex items-center gap-1.5 text-[var(--ink)] hover:text-[var(--signal)] transition-colors cursor-pointer select-none"
            aria-label={isExpanded ? 'Collapse timeline' : 'Expand timeline'}
          >
            <span className="text-[11px] transform transition-transform duration-150 inline-block font-bold">
              {isExpanded ? '▼' : '▲'}
            </span>
            <span className="font-bold tracking-wider uppercase text-xs">
              Live Dispatches
            </span>
          </button>

          {/* Active summary badges */}
          <div className="flex items-center gap-2 text-[10px]">
            <span className="px-2.5 py-0.5 rounded-full bg-[var(--surface-raised)] border-2 border-[var(--line)] shadow-[1px_1px_0_var(--shadow-ink)] text-[var(--ink)] font-bold">
              {activeDispatches.length} Total
            </span>
            {enRouteCount > 0 && (
              <span className="px-2.5 py-0.5 rounded-full bg-[var(--mint)] text-[#0F3825] dark:text-[#E2F7EB] border-2 border-[var(--line)] shadow-[1px_1px_0_var(--shadow-ink)] font-bold">
                {enRouteCount} En Route
              </span>
            )}
            {onSceneCount > 0 && (
              <span className="px-2.5 py-0.5 rounded-full bg-[var(--sun)] text-[#4D3803] dark:text-[#FDF2D0] border-2 border-[var(--line)] shadow-[1px_1px_0_var(--shadow-ink)] font-bold">
                {onSceneCount} On Scene
              </span>
            )}
          </div>
        </div>

        {/* Right side: SLA Reference & Simulation note */}
        <div className="flex items-center gap-3 text-[10px] text-[var(--ink-muted)]">
          <div className="hidden sm:flex items-center gap-1.5">
            <span className="inline-block w-2.5 h-[2px] bg-[var(--critical)] border-t border-dashed" />
            <span>SLA Benchmark: {slaBenchmarkMin === null ? 'unavailable' : `${slaBenchmarkMin.toFixed(1)}m`}</span>
          </div>
          {onNavigate && (
            <button
              onClick={() => onNavigate('dispatch')}
              className="text-[var(--unit-available)] hover:underline cursor-pointer"
            >
              Dispatch Console →
            </button>
          )}
        </div>
      </div>

      {/* Expanded Content: Timeline Tracks */}
      {isExpanded && (
        <div className="max-h-56 overflow-y-auto p-2 sm:p-3 flex flex-col gap-2">
          {activeDispatches.length === 0 ? (
            <div className="py-4 text-center text-xs font-mono-numbers text-[var(--ink-muted)] flex flex-col items-center gap-1.5">
              <span>No active dispatches currently in progress.</span>
              <span className="text-[11px] opacity-75">
                Dispatch available units to pending calls to view live en-route tracking.
              </span>
            </div>
          ) : (
            activeDispatches.map((disp) => {
              const amb = ambulanceMap.get(disp.ambulanceId);
              const em = emergencyMap.get(disp.emergencyId);
              const priority = em?.priority || 'High';
              const priorityColor = PRIORITY_COLORS[priority] || '#0F8B8D';

              const dispatchedAt = disp.dispatchedAt;
              const elapsedSimSec = Math.max(
                0,
                ((currentTime - dispatchedAt) / 1000) * simSpeed
              );
              const elapsedSimMin = elapsedSimSec / 60;
              const isBreached = slaBenchmarkMin !== null && elapsedSimMin > slaBenchmarkMin;

              const progressPercent = Math.min(
                100,
                Math.max(0, (elapsedSimMin / maxTimelineMin) * 100)
              );
              const etaPercent = Math.min(
                100,
                (disp.etaMin / maxTimelineMin) * 100
              );
              const benchmarkPercent = slaBenchmarkMin === null
                ? null
                : Math.min(100, (slaBenchmarkMin / maxTimelineMin) * 100);

              return (
                <div
                  key={disp.id}
                  onClick={() => onSelectDispatch?.(disp)}
                  className={`p-2 rounded-[8px] border transition-all duration-150 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 ${
                    isBreached
                      ? 'bg-[var(--critical)]/5 border-[var(--critical)]/40'
                      : 'bg-[var(--surface-raised)] border-[var(--line)] hover:border-[var(--line)]'
                  }`}
                >
                  {/* Left: Unit & Incident Identifiers */}
                  <div className="flex items-center gap-2 sm:gap-3 shrink-0 min-w-[210px]">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm">🚑</span>
                      <span className="font-semibold text-xs text-[var(--ink)]">
                        {disp.ambulanceId}
                      </span>
                      {amb && (
                        <span className="px-1 py-0.2 rounded text-[9px] bg-[var(--surface)] text-[var(--ink-muted)] font-mono-numbers border border-[var(--line)]">
                          {amb.type}
                        </span>
                      )}
                    </div>

                    <span className="text-[var(--ink-subtle)]">→</span>

                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-mono-numbers text-[var(--ink)]">
                        {disp.emergencyId}
                      </span>
                      <TriageTag priority={priority} size="sm" />
                    </div>

                    <span className="text-[10px] text-[var(--ink-muted)] font-mono-numbers">
                      {disp.fromZone}→{disp.toZone}
                    </span>
                  </div>

                  {/* Center: Horizontal Timeline Bar */}
                  <div className="flex-1 flex flex-col gap-1 min-w-[180px]">
                    <div className="flex items-center justify-between text-[10px] font-mono-numbers">
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`font-semibold uppercase tracking-wider text-[9px] px-1.5 py-0.2 rounded ${
                            disp.status === 'Completed'
                              ? 'bg-[var(--unit-available)]/20 text-[var(--unit-available)]'
                              : disp.status === 'OnScene'
                              ? 'bg-[#0F8B8D]/20 text-[#0F8B8D]'
                              : 'bg-[var(--surface)] text-[var(--ink)]'
                          }`}
                        >
                          {disp.status}
                        </span>
                        {disp.status === 'EnRoute' && (
                          <span className="text-[var(--ink-muted)]">
                            {elapsedSimMin.toFixed(1)}m / ETA {disp.etaMin.toFixed(1)}m
                          </span>
                        )}
                        {disp.status === 'OnScene' && (
                          <span className="text-[#0F8B8D] font-medium">
                            On Scene {(elapsedSimMin - disp.etaMin).toFixed(1)}m (Svc 8m)
                          </span>
                        )}
                        {disp.status === 'Completed' && (
                          <span className="text-[var(--unit-available)] font-medium">
                            Finished · Relocated to Zone {disp.toZone}
                          </span>
                        )}
                      </div>

                      {isBreached && disp.status !== 'Completed' && (
                        <span className="text-[var(--critical)] font-semibold text-[9px] animate-pulse">
                          ⚠️ SLA BREACH (+{(elapsedSimMin - disp.benchmarkMin).toFixed(1)}m)
                        </span>
                      )}
                    </div>

                    {/* Timeline Track with Benchmark and Progress Fill */}
                    <div className="relative w-full h-3.5 bg-[var(--surface)] rounded-[4px] border border-[var(--line)] overflow-hidden">
                      {benchmarkPercent !== null && (
                        <div
                          className="absolute top-0 bottom-0 w-[2px] bg-[var(--critical)] z-10 opacity-80"
                          style={{ left: `${benchmarkPercent}%` }}
                          title={`SLA Benchmark: ${slaBenchmarkMin?.toFixed(1) ?? 'unavailable'} min`}
                        />
                      )}

                      {/* Planned ETA Marker */}
                      <div
                        className="absolute top-0 bottom-0 w-[1px] bg-[var(--ink-muted)] z-10 opacity-50"
                        style={{ left: `${etaPercent}%` }}
                        title={`ETA: ${disp.etaMin.toFixed(1)} min`}
                      />

                      {/* Elapsed Time Fill Bar */}
                      <div
                        className={`h-full transition-all duration-300 rounded-[3px] ${
                          disp.status === 'Completed'
                            ? 'bg-[var(--unit-available)]'
                            : isBreached
                            ? 'bg-[var(--critical)] animate-pulse'
                            : ''
                        }`}
                        style={{
                          width: `${disp.status === 'Completed' ? 100 : progressPercent}%`,
                          backgroundColor:
                            disp.status === 'Completed'
                              ? 'var(--unit-available)'
                              : isBreached
                              ? 'var(--critical)'
                              : priorityColor,
                          opacity: 0.85,
                        }}
                      />
                    </div>
                  </div>

                  {/* Right: Manual Lifecycle Action Buttons */}
                  <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-center">
                    {disp.status === 'EnRoute' && (
                      <>
                        <Button
                          variant="secondary"
                          size="sm"
                          isLoading={isActionLoading === `${disp.id}-OnScene`}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleAdvance(disp.id, 'OnScene');
                          }}
                        >
                          Mark On Scene
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          isLoading={isActionLoading === `${disp.id}-cancel`}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCancel(disp.id);
                          }}
                        >
                          Cancel
                        </Button>
                      </>
                    )}

                    {disp.status === 'OnScene' && (
                      <>
                        <Button
                          variant="primary"
                          size="sm"
                          isLoading={isActionLoading === `${disp.id}-Completed`}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleAdvance(disp.id, 'Completed');
                          }}
                        >
                          Mark Completed
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          isLoading={isActionLoading === `${disp.id}-cancel`}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCancel(disp.id);
                          }}
                        >
                          Cancel
                        </Button>
                      </>
                    )}

                    {disp.status === 'Completed' && (
                      <span className="text-[10px] font-mono-numbers text-[var(--unit-available)] font-semibold px-2 py-1 rounded bg-[var(--unit-available)]/10 border border-[var(--unit-available)]/30">
                        ✓ Relocated
                      </span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
