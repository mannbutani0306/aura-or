import React from 'react';
import { Button } from './Button';
import { StickerBlob } from './StickerBlob';
import { EcgStrip } from './EcgStrip';

interface ErrorStateProps {
  title?: string;
  message: string;
  onRetry?: () => void;
  retryLabel?: string;
  className?: string;
}

export function ErrorState({
  title = 'Offline',
  message,
  onRetry,
  retryLabel = 'Retry',
  className = '',
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      className={`flex flex-col items-center justify-center p-8 text-center select-none rounded-[20px] border-2 border-[var(--critical)] bg-[var(--surface-raised)] shadow-[6px_6px_0_var(--shadow-ink)] ${className}`}
    >
      <div className="flex items-center gap-3 mb-4">
        <EcgStrip state="offline" />
        <StickerBlob emoji="🚑" tone="blush" size="md" />
      </div>

      <h4 className="font-serif-display text-lg font-bold text-[var(--critical)]">
        {title}
      </h4>

      <p className="text-xs text-[var(--ink-muted)] max-w-sm mt-1 font-mono-numbers">
        {message}
      </p>

      {onRetry && (
        <div className="mt-4">
          <Button variant="danger" size="sm" onClick={onRetry}>
            {retryLabel}
          </Button>
        </div>
      )}
    </div>
  );
}
