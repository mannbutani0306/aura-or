import React, { useId } from 'react';
import { IconOffline } from './icons';

export type EcgState = 'idle' | 'pending' | 'critical' | 'offline';

interface EcgStripProps {
  state?: EcgState;
  bpm?: number;
  className?: string;
  showStatusLabel?: boolean;
  compact?: boolean;
}

export function EcgStrip({
  state = 'idle',
  bpm,
  className = '',
  showStatusLabel = false,
  compact = false,
}: EcgStripProps) {
  const gradientId = useId();

  const colorMap: Record<EcgState, string> = {
    idle: 'var(--unit-available)',
    pending: 'var(--high)',
    critical: 'var(--critical)',
    offline: 'var(--ink-subtle)',
  };

  const activeColor = colorMap[state];

  const durationMap: Record<EcgState, string> = {
    idle: '2.4s',
    pending: '1.4s',
    critical: '0.85s',
    offline: '0s',
  };

  const sinusPath = `
    M 0 14 
    L 32 14 
    Q 36 12.5 39 14 
    L 46 14 
    L 49 16 
    L 54 2 
    L 59 25 
    L 62 14 
    L 67 14 
    Q 73 10 79 14 
    L 160 14
  `;

  const flatlinePath = 'M 0 14 L 160 14';

  return (
    <div
      className={`inline-flex items-center gap-2 select-none ${className}`}
      role="status"
      aria-label={`Rhythm: ${state}`}
    >
      <div
        className={
          compact
            ? 'relative w-16 sm:w-20 h-4 sm:h-5 overflow-hidden flex items-center justify-center'
            : 'relative w-32 sm:w-40 h-7 overflow-hidden rounded-[8px] bg-[var(--surface-raised)] border-2 border-[var(--line)] shadow-[2px_2px_0_var(--shadow-ink)] flex items-center justify-center'
        }
      >
        <svg
          viewBox="0 0 160 28"
          className="w-full h-full overflow-visible"
          preserveAspectRatio="none"
        >
          <defs>
            <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor={activeColor} stopOpacity="0.2" />
              <stop offset="50%" stopColor={activeColor} stopOpacity="1" />
              <stop offset="100%" stopColor={activeColor} stopOpacity="0.3" />
            </linearGradient>
          </defs>

          {/* Background grid hairline */}
          <line x1="0" y1="14" x2="160" y2="14" stroke="var(--line)" strokeWidth="0.75" strokeDasharray="3 3" opacity={compact ? 0.15 : 0.3} />

          {state === 'offline' ? (
            <path
              d={flatlinePath}
              fill="none"
              stroke={activeColor}
              strokeWidth={compact ? 1.5 : 2}
              strokeDasharray={compact ? 'none' : '4 3'}
            />
          ) : (
            <>
              <path
                d={sinusPath}
                fill="none"
                stroke={activeColor}
                strokeWidth={compact ? 1 : 1.25}
                opacity={0.3}
              />
              <path
                d={sinusPath}
                fill="none"
                stroke={`url(#${gradientId})`}
                strokeWidth={compact ? 1.8 : 2.2}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="ecg-pulse-line"
                style={{
                  strokeDasharray: '60 120',
                  animation: `ecgScan ${durationMap[state]} linear infinite`,
                }}
              />
            </>
          )}
        </svg>

        {state === 'offline' && !compact && (
          <div className="absolute inset-0 flex items-center justify-center gap-1 text-[10px] font-mono-numbers font-bold text-[var(--ink-subtle)] bg-[var(--surface)]/80">
            <IconOffline size={12} />
            <span>OFFLINE</span>
          </div>
        )}
      </div>

      {showStatusLabel && (
        <div className="hidden sm:flex items-center gap-1.5 text-[11px] font-mono-numbers font-bold text-[var(--ink-muted)]">
          <span className="w-2 h-2 rounded-full border border-[var(--line)]" style={{ backgroundColor: activeColor }} />
          <span className="uppercase tracking-wider">
            {state === 'idle' && (bpm ? `${bpm} BPM` : 'SINUS')}
            {state === 'pending' && 'PENDING'}
            {state === 'critical' && 'CRITICAL'}
            {state === 'offline' && 'FLATLINE'}
          </span>
        </div>
      )}

      <style>{`
        @keyframes ecgScan {
          0% {
            stroke-dashoffset: 180;
          }
          100% {
            stroke-dashoffset: -180;
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .ecg-pulse-line {
            animation: none !important;
            stroke-dasharray: none !important;
          }
        }
      `}</style>
    </div>
  );
}
