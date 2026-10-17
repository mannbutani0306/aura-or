import React, { useEffect, useState } from 'react';
import { Tooltip } from './Tooltip';

export type ThemeMode = 'paper' | 'night';

const STORAGE_KEY = 'aura-theme-mode';

export function getInitialTheme(): ThemeMode {
  if (typeof window === 'undefined') return 'paper';
  const saved = localStorage.getItem(STORAGE_KEY) as ThemeMode | null;
  if (saved === 'night' || saved === 'paper') return saved;
  if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    return 'night';
  }
  return 'paper';
}

export function applyTheme(theme: ThemeMode) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (theme === 'night') {
    root.classList.add('dark');
  } else {
    root.classList.remove('dark');
  }
  localStorage.setItem(STORAGE_KEY, theme);
}

interface ThemeToggleProps {
  theme?: ThemeMode;
  onToggle?: (nextTheme: ThemeMode) => void;
  className?: string;
  compact?: boolean;
}

export function ThemeToggle({ theme: controlledTheme, onToggle, className = '', compact = false }: ThemeToggleProps) {
  const [internalTheme, setInternalTheme] = useState<ThemeMode>(getInitialTheme);
  const activeTheme = controlledTheme ?? internalTheme;

  useEffect(() => {
    applyTheme(activeTheme);
  }, [activeTheme]);

  const handleToggle = () => {
    const next: ThemeMode = activeTheme === 'paper' ? 'night' : 'paper';
    if (onToggle) {
      onToggle(next);
    } else {
      setInternalTheme(next);
      applyTheme(next);
    }
  };

  const isNight = activeTheme === 'night';

  return (
    <Tooltip content={isNight ? 'Switch to Paper' : 'Switch to Night'} shortcut="T">
      <button
        onClick={handleToggle}
        aria-label={isNight ? 'Switch to Paper' : 'Switch to Night'}
        className={`relative inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border-2 border-[var(--line)] shadow-[3px_3px_0_var(--shadow-ink)] transition-all select-none cursor-pointer hover:-translate-y-0.5 active:translate-y-0.5 active:shadow-none ${
          isNight
            ? 'bg-[#1F2C25] text-[#FDF2D0]'
            : 'bg-[var(--sun)] text-[#382602]'
        } ${className}`}
      >
        <span className="text-sm leading-none drop-shadow-xs">
          {isNight ? '🌙' : '☀️'}
        </span>
        <span className={`font-mono-numbers text-[10px] font-bold uppercase tracking-wider ${compact ? 'hidden sm:inline' : ''}`}>
          {isNight ? 'Night' : 'Paper'}
        </span>
      </button>
    </Tooltip>
  );
}
