import React, { useState } from 'react';
import { Kbd } from './Kbd';

interface TooltipProps {
  content: string;
  shortcut?: string;
  position?: 'top' | 'bottom' | 'left' | 'right';
  children: React.ReactElement;
  className?: string;
}

export function Tooltip({
  content,
  shortcut,
  position = 'top',
  children,
  className = '',
}: TooltipProps) {
  const [isVisible, setIsVisible] = useState(false);

  const positionClasses = {
    top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
    left: 'right-full top-1/2 -translate-y-1/2 mr-2',
    right: 'left-full top-1/2 -translate-y-1/2 ml-2',
  };

  return (
    <div
      className={`relative inline-flex ${className}`}
      onMouseEnter={() => setIsVisible(true)}
      onMouseLeave={() => setIsVisible(false)}
      onFocus={() => setIsVisible(true)}
      onBlur={() => setIsVisible(false)}
    >
      {children}
      {isVisible && (
        <div
          role="tooltip"
          className={`absolute z-50 pointer-events-none whitespace-nowrap px-2.5 py-1 text-[11px] font-mono-numbers font-semibold text-[var(--bg-app)] bg-[var(--ink)] border border-[var(--line)] rounded-[6px] shadow-[2px_2px_0_var(--shadow-ink)] flex items-center gap-1.5 ${positionClasses[position]}`}
          style={{ animation: 'fadeIn 120ms ease-out' }}
        >
          <span>{content}</span>
          {shortcut && <Kbd className="bg-[var(--line)] text-white border-transparent">{shortcut}</Kbd>}
        </div>
      )}
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: scale(0.96); }
          to { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  );
}
