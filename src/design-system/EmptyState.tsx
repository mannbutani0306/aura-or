import React from 'react';
import { Button } from './Button';
import { StickerBlob } from './StickerBlob';

interface EmptyStateProps {
  title?: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
  emoji?: string;
}

export function EmptyState({
  title = 'No active entries',
  description,
  actionLabel,
  onAction,
  className = '',
  emoji = '🫀',
}: EmptyStateProps) {
  return (
    <div
      className={`flex flex-col items-center justify-center p-8 text-center select-none rounded-[20px] border-2 border-dashed border-[var(--line)] bg-[var(--surface)]/40 ${className}`}
    >
      <div className="mb-3">
        <StickerBlob emoji={emoji} tone="blush" size="md" />
      </div>

      <span className="font-serif-display text-base font-semibold text-[var(--ink)]">
        {title}
      </span>

      {description && (
        <span className="text-xs font-ui text-[var(--ink-muted)] mt-1 max-w-xs">
          {description}
        </span>
      )}

      {actionLabel && onAction && (
        <div className="mt-4">
          <Button variant="secondary" size="sm" onClick={onAction}>
            {actionLabel}
          </Button>
        </div>
      )}
    </div>
  );
}
