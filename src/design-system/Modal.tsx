import React, { useEffect } from 'react';
import { IconClose } from './icons';
import { IconButton } from './IconButton';
import { Tape } from './Tape';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  maxWidth?: string;
}

export function Modal({
  isOpen,
  onClose,
  title,
  children,
  maxWidth = 'max-w-lg',
}: ModalProps) {
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
    <div
      className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-4 sm:p-6"
      role="dialog"
      aria-modal="true"
    >
      {/* Backdrop */}
      <div
        onClick={onClose}
        className="fixed inset-0 bg-black/60 transition-opacity animate-in fade-in duration-150"
      />

      {/* Modal Surface: Big Slip with Tape and Stamp-Down Animation */}
      <div
        className={`group relative w-full ${maxWidth} bg-[var(--surface-raised)] border-2 border-[var(--line)] rounded-[28px] shadow-[8px_8px_0_var(--shadow-ink)] flex flex-col overflow-visible paper-slide-in`}
        style={{ animationTimingFunction: 'var(--ease-aura)' }}
      >
        {/* Surgical tape in corner */}
        <Tape position="top-right" rotation={6} />

        {title && (
          <div className="flex items-center justify-between px-6 py-4.5 border-b-2 border-[var(--line)] bg-[var(--surface)]/70 rounded-t-[26px]">
            <h2 className="text-sm font-mono-numbers font-bold uppercase tracking-wider text-[var(--ink)]">
              {title}
            </h2>
            <IconButton icon={<IconClose size={16} />} label="Close" onClick={onClose} shortcut="Esc" size="sm" />
          </div>
        )}
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}
