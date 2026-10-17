import React from 'react';
import { PriorityLevel } from './tokens';

export interface HangTagProps {
  priority: PriorityLevel;
  id?: string;
  weight?: number;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  onClick?: () => void;
  showGlyph?: boolean;
}

export function HangTag({
  priority,
  id,
  weight,
  size = 'md',
  className = '',
  onClick,
  showGlyph = true,
}: HangTagProps) {
  const colorMap: Record<
    PriorityLevel,
    {
      bg: string;
      text: string;
      line: string;
      glyph: string;
      dots: number;
    }
  > = {
    Critical: {
      bg: 'var(--critical)',
      text: '#FFFFFF',
      line: 'var(--line)',
      glyph: 'C',
      dots: 4,
    },
    High: {
      bg: 'var(--high)',
      text: '#FFFFFF',
      line: 'var(--line)',
      glyph: 'H',
      dots: 3,
    },
    Medium: {
      bg: 'var(--medium)',
      text: '#15201C',
      line: 'var(--line)',
      glyph: 'M',
      dots: 2,
    },
    Low: {
      bg: 'var(--low)',
      text: '#FFFFFF',
      line: 'var(--line)',
      glyph: 'L',
      dots: 1,
    },
  };

  const scheme = colorMap[priority];

  const sizeStyles = {
    sm: 'h-6 pl-5 pr-2.5 text-[10px] gap-1.5',
    md: 'h-7.5 pl-6 pr-3.5 text-xs gap-2',
    lg: 'h-9 pl-7 pr-4 text-sm gap-2.5',
  };

  const dotCount = weight !== undefined ? Math.min(Math.max(1, weight), 5) : scheme.dots;

  return (
    <div
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      aria-label={`Triage priority: ${priority} (Level ${scheme.glyph})`}
      className={`relative inline-flex items-center font-mono-numbers font-bold tracking-wider uppercase select-none rounded-[12px] border-2 shadow-[2px_2px_0_var(--shadow-ink)] transition-transform focus-ring active:scale-95 ${
        onClick ? 'cursor-pointer hover:-translate-y-0.5' : ''
      } ${sizeStyles[size]} ${className}`}
      style={{
        backgroundColor: scheme.bg,
        color: scheme.text,
        borderColor: 'var(--line)',
        // Cut-corner notch on the left side where the punched hole lives
        clipPath: 'polygon(12px 0%, 100% 0%, 100% 100%, 12px 100%, 0% 50%)',
      }}
    >
      {/* Curved string loop coming out of notched hole */}
      <svg
        aria-hidden="true"
        width="16"
        height="16"
        viewBox="0 0 16 16"
        className="absolute -left-3 top-1/2 -translate-y-1/2 pointer-events-none overflow-visible"
      >
        <path
          d="M 12 8 C 4 3, -1 10, 5 15"
          fill="none"
          stroke="var(--line)"
          strokeWidth="1.5"
          strokeLinecap="round"
          opacity="0.75"
        />
      </svg>

      {/* Punched hole */}
      <span
        aria-hidden="true"
        className="absolute left-[6px] top-1/2 -translate-y-1/2 w-2 h-2 rounded-full border border-black/40 bg-[var(--bg-app)] shadow-inner"
      />

      {/* Optional ID or Glyph */}
      {id ? (
        <span className="font-bold tracking-normal">{id}</span>
      ) : showGlyph ? (
        <span className="font-bold text-[10px] px-1 py-0.5 rounded-[4px] bg-black/20 leading-none">
          {scheme.glyph}
        </span>
      ) : null}

      <span className="leading-none">{priority}</span>

      {/* Weight Dots */}
      <div className="flex items-center gap-0.5 ml-1" title={`Weight level ${dotCount}`}>
        {Array.from({ length: dotCount }).map((_, i) => (
          <span
            key={i}
            className="w-1.5 h-1.5 rounded-full bg-current opacity-90 inline-block shadow-xs"
          />
        ))}
      </div>
    </div>
  );
}
