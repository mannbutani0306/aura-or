import React, { useEffect } from 'react';
import { playStampThud } from '../utils/audio';

export type StampVariant = 'DISPATCHED' | 'ON SCENE' | 'CLEARED' | 'STAT' | 'SIM' | 'CUSTOM';
export type StampColor = 'signal' | 'ink' | 'available' | 'high';
export type StampShape = 'rect' | 'circle';

export interface StampProps {
  variant?: StampVariant;
  color?: StampColor;
  shape?: StampShape;
  animate?: boolean;
  rotation?: number;
  className?: string;
  ariaLabel?: string;
  children?: React.ReactNode;
}

export function Stamp({
  variant = 'DISPATCHED',
  color = 'signal',
  shape = 'rect',
  animate = false,
  rotation = -6,
  className = '',
  ariaLabel,
  children,
}: StampProps) {
  const text = children || variant;
  const accessibleText = ariaLabel ?? (typeof text === 'string' || typeof text === 'number' ? String(text) : variant);

  useEffect(() => {
    if (animate) playStampThud();
  }, [animate]);

  const colorStyles: Record<StampColor, string> = {
    signal: 'text-[var(--signal)] border-[var(--signal)]',
    ink: 'text-[var(--ink)] border-[var(--ink)]',
    available: 'text-[var(--unit-available)] border-[var(--unit-available)]',
    high: 'text-[var(--high)] border-[var(--high)]',
  };

  if (shape === 'circle') {
    return (
      <div
        role="img"
        aria-label={accessibleText}
        style={{ transform: `rotate(${rotation}deg)` }}
        className={`inline-flex flex-col items-center justify-center rounded-full border-2 border-dashed p-1.5 select-none font-mono-numbers uppercase text-[10px] font-bold tracking-widest ${
          colorStyles[color]
        } ${animate ? 'animate-stamp-down' : ''} ${className}`}
      >
        <div className="w-12 h-12 rounded-full border border-current flex items-center justify-center text-center p-1 leading-tight">
          {text}
        </div>
      </div>
    );
  }

  return (
    <div
      role="img"
      aria-label={accessibleText}
      style={{ transform: `rotate(${rotation}deg)` }}
      className={`stamp px-2.5 py-0.5 text-[11px] rounded-[4px] border-2 shadow-[0_0_0_2px_currentColor] ${
        colorStyles[color]
      } ${animate ? 'animate-stamp-down' : ''} ${className}`}
    >
      <span>{text}</span>
    </div>
  );
}
