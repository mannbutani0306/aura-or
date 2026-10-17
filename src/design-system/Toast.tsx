import React, { useEffect, useState } from 'react';
import { IconClose, IconAlert, IconCheck } from './icons';
import { Stamp, StampVariant } from './Stamp';

export interface ToastMessage {
  id: string;
  type: 'undo' | 'error' | 'success' | 'info';
  message: string;
  undoAction?: () => void;
  durationMs?: number;
  stamp?: StampVariant;
  stampLabel?: string;
}

interface ToastProps {
  toasts: ToastMessage[];
  onDismiss: (id: string) => void;
}

export function ToastContainer({ toasts, onDismiss }: ToastProps) {
  return (
    <div
      aria-live="polite"
      className="fixed bottom-5 right-5 z-50 flex flex-col gap-3 max-w-sm w-full pointer-events-none"
    >
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onDismiss={() => onDismiss(toast.id)} />
      ))}
    </div>
  );
}

function ToastItem({ toast, onDismiss }: { toast: ToastMessage; onDismiss: () => void }) {
  const duration = toast.durationMs ?? (toast.type === 'undo' ? 6000 : 3500);
  const [progress, setProgress] = useState(100);

  useEffect(() => {
    const startTime = Date.now();
    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const remaining = Math.max(0, 100 - (elapsed / duration) * 100);
      setProgress(remaining);
      if (elapsed >= duration) {
        clearInterval(interval);
        onDismiss();
      }
    }, 50);

    return () => clearInterval(interval);
  }, [duration, onDismiss]);

  const isUndo = toast.type === 'undo';
  const isError = toast.type === 'error';

  return (
    <div
      className={`relative pointer-events-auto p-3.5 rounded-[14px] bg-[var(--surface-raised)] border-2 shadow-[4px_4px_0_var(--shadow-ink)] flex flex-col overflow-hidden toast-stamp-in ${
        isError
          ? 'border-[var(--critical)] text-[var(--critical)]'
          : 'border-[var(--line)] text-[var(--ink)]'
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          {isError ? (
            <span className="text-base">⚠️</span>
          ) : toast.type === 'success' ? (
            <span className="text-base">✅</span>
          ) : (
            <span className="text-base">📋</span>
          )}
          <span className="font-ui text-xs font-semibold leading-tight">
            {toast.message}
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {toast.stamp && <Stamp variant={toast.stamp} animate ariaLabel={toast.stampLabel ?? toast.stamp}>{toast.stampLabel ?? toast.stamp}</Stamp>}
          {isUndo && toast.undoAction && (
            <button
              onClick={() => {
                toast.undoAction?.();
                onDismiss();
              }}
              className="px-2.5 py-1 text-[11px] font-mono-numbers uppercase tracking-wider font-bold rounded-full bg-[var(--ink)] text-[var(--bg-app)] border border-[var(--line)] hover:opacity-90 transition-opacity cursor-pointer shadow-[2px_2px_0_var(--shadow-ink)]"
            >
              Undo
            </button>
          )}

          <button
            onClick={onDismiss}
            aria-label="Dismiss notification"
            className="p-1 rounded-full hover:bg-[var(--surface)] text-[var(--ink-muted)] hover:text-[var(--ink)] transition-colors cursor-pointer"
          >
            <IconClose size={14} />
          </button>
        </div>
      </div>

      {/* Countdown progress underline */}
      <div className="absolute inset-x-0 bottom-0 h-[3px] bg-[var(--surface)]">
        <div
          className="h-full transition-all linear"
          style={{
            width: `${progress}%`,
            backgroundColor: isError ? 'var(--critical)' : 'var(--unit-available)',
          }}
        />
      </div>
    </div>
  );
}
