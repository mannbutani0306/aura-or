import React from 'react';

export interface ChevronRuleProps {
  className?: string;
  height?: number;
}

export function ChevronRule({ className = '', height = 8 }: ChevronRuleProps) {
  return (
    <div
      aria-hidden="true"
      style={{ height }}
      className={`chevron-rule ${className}`}
    />
  );
}
