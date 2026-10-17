import React from 'react';

export interface SectionTitleProps {
  eyebrow: string; // real data label, e.g. "04 PENDING", "MADURAI SECTOR"
  title: string;
  accentWord?: string; // Word that becomes italic + accent colour with hand-drawn underline
  action?: {
    label: string;
    onClick?: () => void;
    href?: string;
  } | React.ReactNode;
  className?: string;
}

export function SectionTitle({
  eyebrow,
  title,
  accentWord,
  action,
  className = '',
}: SectionTitleProps) {
  // Render headline with the specified word highlighted
  const renderHeadline = () => {
    if (!accentWord) {
      return title;
    }

    const regex = new RegExp(`\\b(${accentWord})\\b`, 'i');
    const parts = title.split(regex);

    return parts.map((part, index) => {
      if (part.toLowerCase() === accentWord.toLowerCase()) {
        return (
          <span key={index} className="relative inline-block italic text-[var(--signal)] px-0.5">
            {part}
            {/* Hand-drawn underline SVG */}
            <svg
              aria-hidden="true"
              viewBox="0 0 100 12"
              preserveAspectRatio="none"
              className="absolute -bottom-1 left-0 w-full h-2 overflow-visible text-[var(--signal)] pointer-events-none"
            >
              <path
                d="M 2 8 C 30 2, 70 12, 98 6"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
              />
            </svg>
          </span>
        );
      }
      return <span key={index}>{part}</span>;
    });
  };

  const isActionObject = action && typeof action === 'object' && 'label' in action;

  return (
    <div className={`flex flex-col sm:flex-row sm:items-end justify-between gap-2 pb-3 ${className}`}>
      <div className="flex flex-col gap-1">
        {/* Mono uppercase letter-spaced micro-label */}
        <span className="font-mono-numbers text-[11px] uppercase tracking-widest text-[var(--ink-muted)] font-semibold select-none">
          {eyebrow}
        </span>

        {/* Fraunces serif headline */}
        <h2 className="font-serif-display text-2xl sm:text-3xl font-bold tracking-tight text-[var(--ink)] leading-tight">
          {renderHeadline()}
        </h2>
      </div>

      {/* Right-aligned mono action/link */}
      {action && (
        <div className="font-mono-numbers text-xs font-semibold shrink-0">
          {isActionObject ? (
            <button
              onClick={(action as any).onClick}
              className="inline-flex items-center gap-1.5 text-[var(--ink)] hover:text-[var(--signal)] transition-colors cursor-pointer underline underline-offset-4 decoration-2 decoration-[var(--line)] hover:decoration-[var(--signal)]"
            >
              <span>{(action as any).label}</span>
              <span aria-hidden="true">→</span>
            </button>
          ) : (
            action
          )}
        </div>
      )}
    </div>
  );
}
