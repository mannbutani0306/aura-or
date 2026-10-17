import React from 'react';

export type StickerTone = 'mint' | 'sky' | 'blush' | 'sun' | 'paper';
export type StickerSize = 'sm' | 'md' | 'lg';

export interface StickerBlobProps {
  emoji: string;
  tone?: StickerTone;
  size?: StickerSize | number;
  rotation?: number;
  className?: string;
  onClick?: () => void;
  title?: string;
}

export function StickerBlob({
  emoji,
  tone = 'sun',
  size = 'md',
  rotation,
  className = '',
  onClick,
  title,
}: StickerBlobProps) {
  // Pastel tones mapped to CSS variables
  const toneClasses: Record<StickerTone, string> = {
    mint: 'bg-[var(--mint)] text-[#0F3825] dark:text-[#E2F7EB]',
    sky: 'bg-[var(--sky)] text-[#10344B] dark:text-[#D9EDFB]',
    blush: 'bg-[var(--blush)] text-[#4A1613] dark:text-[#FCDEDC]',
    sun: 'bg-[var(--sun)] text-[#4D3803] dark:text-[#FDF2D0]',
    paper: 'bg-[var(--surface-raised)] text-[var(--ink)]',
  };

  const sizeClasses: Record<StickerSize, { box: string; text: string }> = {
    sm: { box: 'w-7 h-7', text: 'text-sm' },
    md: { box: 'w-10 h-10', text: 'text-xl' },
    lg: { box: 'w-14 h-14', text: 'text-3xl' },
  };

  const isPresetSize = typeof size === 'string';
  const preset = isPresetSize ? sizeClasses[size as StickerSize] : null;

  // Default subtle tilt between -4 and 4 degrees if not provided
  const tilt = rotation !== undefined ? rotation : -3;

  return (
    <div
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      title={title}
      style={{
        transform: `rotate(${tilt}deg)`,
        ...(isPresetSize ? {} : { width: size, height: size }),
      }}
      className={`sticker-blob select-none shrink-0 ${preset ? preset.box : ''} ${
        toneClasses[tone]
      } ${onClick ? 'cursor-pointer hover:scale-110 active:scale-95' : ''} ${className}`}
    >
      <span className={`${preset ? preset.text : 'text-xl'} leading-none pointer-events-none drop-shadow-xs`}>
        {emoji}
      </span>
    </div>
  );
}
