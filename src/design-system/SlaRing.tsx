import React from 'react';

interface SlaRingProps {
  elapsedSeconds: number;
  benchmarkSeconds?: number;
  size?: number;
  strokeWidth?: number;
  showLabel?: boolean;
  className?: string;
}

export function SlaRing({
  elapsedSeconds,
  benchmarkSeconds = 600,
  size = 40,
  strokeWidth = 3.5,
  showLabel = true,
  className = '',
}: SlaRingProps) {
  const isBreached = elapsedSeconds > benchmarkSeconds;
  const ratio = Math.min(elapsedSeconds / benchmarkSeconds, 1);
  const color = isBreached ? 'var(--critical)' : 'var(--unit-available)';

  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - ratio * circumference;

  const minutes = Math.floor(elapsedSeconds / 60);
  const seconds = elapsedSeconds % 60;
  const formattedTime = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

  return (
    <div
      className={`inline-flex items-center gap-2 select-none ${className}`}
      role="timer"
      aria-label={`Response time: ${formattedTime}, Benchmark: ${benchmarkSeconds / 60}m`}
    >
      <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="transform -rotate-90">
          {/* Background track with 2px stroke */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="var(--line)"
            strokeWidth={strokeWidth}
            opacity="0.2"
          />
          {/* Progress fill */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            className="transition-all duration-300"
          />
        </svg>

        {isBreached && (
          <span
            aria-hidden="true"
            className="absolute text-[10px] text-[var(--critical)] font-bold animate-pulse"
          >
            !
          </span>
        )}
      </div>

      {showLabel && (
        <div className="flex flex-col font-mono-numbers">
          <span
            className="text-xs font-bold leading-none tabular-nums"
            style={{ color: isBreached ? 'var(--critical)' : 'var(--ink)' }}
          >
            {formattedTime}
          </span>
          <span className="text-[10px] font-semibold text-[var(--ink-muted)] leading-none mt-0.5">
            {isBreached ? 'BREACH' : `${Math.round(benchmarkSeconds / 60)}M BENCHMARK`}
          </span>
        </div>
      )}
    </div>
  );
}
