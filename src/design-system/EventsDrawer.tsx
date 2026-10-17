import React from 'react';
import { Drawer } from './Drawer';
import { EventLogRow } from '../data/DataSource';
import { EmptyState } from './EmptyState';

interface EventsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  events: EventLogRow[];
}

export function EventsDrawer({ isOpen, onClose, events }: EventsDrawerProps) {
  const formatTime = (ts: number | string) => {
    try {
      const d = typeof ts === 'number' ? new Date(ts) : new Date(ts);
      return d.toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } catch {
      return String(ts);
    }
  };

  const formatRelative = (ts: number | string) => {
    try {
      const now = Date.now();
      const time = typeof ts === 'number' ? ts : new Date(ts).getTime();
      const diffSec = Math.max(0, Math.floor((now - time) / 1000));
      if (diffSec < 60) return `${diffSec}s ago`;
      const diffMin = Math.floor(diffSec / 60);
      if (diffMin < 60) return `${diffMin}m ago`;
      const diffHr = Math.floor(diffMin / 60);
      return `${diffHr}h ago`;
    } catch {
      return '';
    }
  };

  return (
    <Drawer isOpen={isOpen} onClose={onClose} title="Events" width="max-w-md">
      <div className="flex flex-col h-full gap-4">
        <div className="flex items-center justify-between pb-3 border-b-2 border-[var(--line)]">
          <span className="text-xs font-mono-numbers font-bold uppercase tracking-wider text-[var(--ink-muted)]">
            Live Stream ({events.length})
          </span>
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border border-[var(--line)] bg-[var(--mint)] text-[10px] font-mono-numbers font-bold text-[var(--ink)]">
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--unit-available)] animate-pulse" />
            LIVE
          </span>
        </div>

        {events.length === 0 ? (
          <EmptyState
            title="No events yet"
            description="Operational actions and status updates stream here."
            emoji="📋"
          />
        ) : (
          <div className="flex-1 overflow-y-auto space-y-2.5 pr-1">
            {events.map((ev, idx) => {
              let entityStr = '';
              if (ev.entityIds) {
                if (Array.isArray(ev.entityIds)) {
                  entityStr = ev.entityIds.join(', ');
                } else if (typeof ev.entityIds === 'object') {
                  entityStr = Object.entries(ev.entityIds)
                    .map(([k, v]) => `${k}:${v}`)
                    .join(' · ');
                } else {
                  entityStr = String(ev.entityIds);
                }
              }

              let detailsStr = '';
              if (ev.details) {
                if (typeof ev.details === 'string') {
                  detailsStr = ev.details;
                } else {
                  try {
                    detailsStr = JSON.stringify(ev.details);
                  } catch {
                    detailsStr = '';
                  }
                }
              }

              return (
                <div
                  key={ev.id || idx}
                  className="p-3 rounded-[12px] bg-[var(--surface)] border-2 border-[var(--line)] shadow-[2px_2px_0_var(--shadow-ink)] flex flex-col gap-1.5 transition-all"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-mono-numbers font-bold uppercase tracking-wider text-[var(--signal)]">
                      {ev.kind}
                    </span>
                    <div className="flex items-center gap-1.5 text-[10px] font-mono-numbers text-[var(--ink-muted)]">
                      <span>{formatTime(ev.createdAt)}</span>
                      <span>·</span>
                      <span>{formatRelative(ev.createdAt)}</span>
                    </div>
                  </div>

                  {entityStr && (
                    <div className="text-xs font-mono-numbers font-bold text-[var(--ink)]">
                      {entityStr}
                    </div>
                  )}

                  {detailsStr && (
                    <div className="text-[11px] font-mono-numbers text-[var(--ink-muted)] break-all line-clamp-2">
                      {detailsStr}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Drawer>
  );
}
