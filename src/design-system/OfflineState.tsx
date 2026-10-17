import React, { useState } from 'react';
import { Button } from './Button';
import { Wordmark } from './Wordmark';
import { EcgStrip } from './EcgStrip';
import { StickerBlob } from './StickerBlob';
import { Tape } from './Tape';

interface OfflineStateProps {
  error: string | null;
  onRetry: () => Promise<void>;
}

export function OfflineState({ error, onRetry }: OfflineStateProps) {
  const [isRetrying, setIsRetrying] = useState(false);

  const handleRetry = async () => {
    setIsRetrying(true);
    try {
      await onRetry();
    } finally {
      setIsRetrying(false);
    }
  };

  return (
    <div
      role="alert"
      className="fixed inset-0 z-50 flex flex-col items-center justify-center p-6 bg-[var(--bg-app)] text-[var(--ink)] select-none ecg-grid"
    >
      <div className="group relative w-full max-w-md flex flex-col items-center text-center gap-5 p-8 rounded-[28px] bg-[var(--surface-raised)] border-2 border-[var(--line)] shadow-[8px_8px_0_var(--shadow-ink)] animate-stamp-down">
        <Tape position="top-right" rotation={5} />

        {/* Brand & Flatline + Sticker */}
        <div className="flex flex-col items-center gap-3">
          <Wordmark size="lg" />
          <div className="flex items-center gap-2">
            <EcgStrip state="offline" showStatusLabel />
            <StickerBlob emoji="🚑" tone="blush" size="sm" />
          </div>
        </div>

        {/* Short clean headline and message */}
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-serif-display font-bold tracking-tight text-[var(--ink)]">
            Connection paused
          </h1>
          <p className="text-xs font-ui text-[var(--ink-muted)]">
            Database connection offline. Live dispatch is paused.
          </p>
        </div>

        {error && (
          <div className="w-full text-left p-3 rounded-[12px] bg-[var(--surface)] border-2 border-[var(--line)] flex flex-col gap-1">
            <span className="text-[10px] font-mono-numbers uppercase tracking-wider text-[var(--critical)] font-bold">
              Diagnostics
            </span>
            <code className="text-[11px] font-mono-numbers text-[var(--ink)] break-all leading-tight">
              {error}
            </code>
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-col sm:flex-row items-center gap-3 w-full justify-center pt-2">
          <Button
            variant="primary"
            size="md"
            isLoading={isRetrying}
            onClick={handleRetry}
            className="w-full sm:w-auto px-6"
          >
            Retry
          </Button>

          <Button
            variant="secondary"
            size="md"
            onClick={() => {
              if (typeof window !== 'undefined') {
                sessionStorage.setItem('aura_demo_mode', 'true');
                window.location.reload();
              }
            }}
            className="w-full sm:w-auto px-6"
          >
            Sample mode
          </Button>
        </div>
      </div>
    </div>
  );
}
