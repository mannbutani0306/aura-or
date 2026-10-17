import React from 'react';
import { PriorityLevel } from './tokens';
import { HangTag } from './HangTag';

export interface TriageTagProps {
  priority: PriorityLevel;
  weight?: number;
  size?: 'sm' | 'md';
  className?: string;
  onClick?: () => void;
  showGlyph?: boolean;
}

export function TriageTag(props: TriageTagProps) {
  return <HangTag {...props} />;
}
