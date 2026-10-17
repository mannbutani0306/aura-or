import React, { useEffect } from 'react';
import { IconClose } from './icons';
import { IconButton } from './IconButton';

interface DrawerProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  width?: string;
}

export function Drawer({
  isOpen,
  onClose,
  title,
  children,
  width = 'max-w-md',
}: DrawerProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden" role="dialog" aria-modal="true">
      {/* Backdrop */}
      <div
        onClick={onClose}
        className="fixed inset-0 bg-black/50 backdrop-blur-[2px] transition-opacity animate-in fade-in duration-200"
      />

      <div className="fixed inset-y-0 right-0 max-w-full flex pl-8 sm:pl-10">
        <div
          className={`relative w-screen ${width} bg-[var(--surface-raised)] border-l-2 border-[var(--line)] shadow-[-8px_0_0_var(--shadow-ink)] flex flex-col animate-in slide-in-from-right duration-240`}
          style={{ animationTimingFunction: 'var(--ease-aura)' }}
        >
          {/* Perforated edge on the left border using a radial-gradient mask strip */}
          <div
            aria-hidden="true"
            className="absolute -left-2.5 inset-y-0 w-3 pointer-events-none z-20"
            style={{
              backgroundImage: 'radial-gradient(circle at 5px 12px, transparent 4px, var(--line) 4.5px, var(--line) 6px, transparent 6.5px)',
              backgroundSize: '12px 24px',
              backgroundRepeat: 'repeat-y',
            }}
          />

          {/* Drawer Header */}
          <div className="flex items-center justify-between px-6 py-4.5 border-b-2 border-[var(--line)] bg-[var(--surface)]">
            <h2 className="text-sm font-mono-numbers font-bold uppercase tracking-wider text-[var(--ink)]">
              {title || 'Details'}
            </h2>
            <IconButton icon={<IconClose size={16} />} label="Close" onClick={onClose} shortcut="Esc" size="sm" />
          </div>

          {/* Drawer Body */}
          <div className="flex-1 overflow-y-auto p-6">{children}</div>
        </div>
      </div>
    </div>
  );
}
