import React from 'react';

export interface TapeProps {
  position?: 'top-left' | 'top-right' | 'top-center';
  rotation?: number;
  width?: string | number;
  className?: string;
}

export function Tape({
  position = 'top-left',
  rotation,
  width,
  className = '',
}: TapeProps) {
  const positionStyles = {
    'top-left': '-top-2.5 -left-3 rotate-[-5deg]',
    'top-right': '-top-2.5 -right-3 rotate-[5deg]',
    'top-center': '-top-2.5 left-1/2 -translate-x-1/2 rotate-[-1deg]',
  };

  const customStyle: React.CSSProperties = {
    ...(rotation !== undefined ? { transform: `rotate(${rotation}deg)` } : {}),
    ...(width ? { width } : {}),
  };

  return (
    <div
      aria-hidden="true"
      style={customStyle}
      className={`tape ${positionStyles[position]} ${className}`}
    />
  );
}
