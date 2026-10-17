import React from 'react';

interface IconProps extends React.SVGProps<SVGSVGElement> {
  size?: number;
  className?: string;
}

export function IconHeartbeat({ size = 16, className = '', ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className} {...props}>
      <path d="M1.5 8.5H4L5.5 3L7.5 13L9.5 6L11 9H14.5" />
    </svg>
  );
}

export function IconUnit({ size = 16, className = '', ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" className={className} {...props}>
      <rect x="2" y="4" width="9" height="7" rx="1.5" />
      <path d="M11 6.5H13.5L14.5 9.5V11H11" />
      <circle cx="4.5" cy="11.5" r="1.25" fill="currentColor" />
      <circle cx="12.5" cy="11.5" r="1.25" fill="currentColor" />
      <path d="M6.5 6V9M5 7.5H8" strokeWidth="1.2" />
    </svg>
  );
}

export function IconCall({ size = 16, className = '', ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" className={className} {...props}>
      <path d="M8 2.5V4M8 12V13.5M2.5 8H4M12 8H13.5" />
      <circle cx="8" cy="8" r="3.25" />
      <circle cx="8" cy="8" r="0.75" fill="currentColor" />
    </svg>
  );
}

export function IconRoute({ size = 16, className = '', ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" className={className} {...props}>
      <circle cx="3.5" cy="12.5" r="1.75" />
      <circle cx="12.5" cy="3.5" r="1.75" />
      <path d="M5.25 12.5H8C10.2 12.5 12 10.7 12 8.5V5.25" strokeDasharray="2 1.5" />
    </svg>
  );
}

export function IconZone({ size = 16, className = '', ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" className={className} {...props}>
      <polygon points="8 2.5 13.5 5.5 13.5 11.5 8 14.5 2.5 11.5 2.5 5.5" />
      <circle cx="8" cy="8.5" r="1.25" fill="currentColor" />
    </svg>
  );
}

export function IconClock({ size = 16, className = '', ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" className={className} {...props}>
      <circle cx="8" cy="8" r="5.75" />
      <path d="M8 5V8.25L10.25 9.5" />
    </svg>
  );
}

export function IconSolver({ size = 16, className = '', ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" className={className} {...props}>
      <rect x="2.5" y="2.5" width="4.5" height="4.5" rx="1" />
      <rect x="9" y="2.5" width="4.5" height="4.5" rx="1" />
      <rect x="2.5" y="9" width="4.5" height="4.5" rx="1" />
      <rect x="9" y="9" width="4.5" height="4.5" rx="1" />
      <path d="M7 4.75H9M7 11.25H9M4.75 7V9M11.25 7V9" strokeWidth="1" strokeDasharray="1 1" />
    </svg>
  );
}

export function IconRoadClosed({ size = 16, className = '', ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" className={className} {...props}>
      <rect x="2" y="5" width="12" height="6" rx="1" />
      <path d="M4 11V14M12 11V14M4 5V2M12 5V2" />
      <path d="M5 5L7 11M9 5L11 11" strokeWidth="1" />
    </svg>
  );
}

export function IconAls({ size = 16, className = '', ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" className={className} {...props}>
      <path d="M8 2L9.5 6.5H14L10.5 9.5L12 14L8 11.2L4 14L5.5 9.5L2 6.5H6.5L8 2Z" />
    </svg>
  );
}

export function IconBls({ size = 16, className = '', ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" className={className} {...props}>
      <rect x="3" y="3" width="10" height="10" rx="2" />
      <path d="M8 5.5V10.5M5.5 8H10.5" strokeWidth="1.5" />
    </svg>
  );
}

export function IconInsights({ size = 16, className = '', ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" className={className} {...props}>
      <path d="M2.5 13.5V2.5" />
      <path d="M2.5 13.5H14" />
      <path d="M5 10.5V13.5M8 6.5V13.5M11 4V13.5" strokeWidth="1.6" />
    </svg>
  );
}

export function IconSearch({ size = 16, className = '', ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" className={className} {...props}>
      <circle cx="7" cy="7" r="4.25" />
      <path d="M10.25 10.25L13.75 13.75" />
    </svg>
  );
}

export function IconClose({ size = 16, className = '', ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" className={className} {...props}>
      <path d="M4 4L12 12M12 4L4 12" />
    </svg>
  );
}

export function IconCheck({ size = 16, className = '', ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className} {...props}>
      <path d="M3.5 8.5L6.5 11.5L12.5 4.5" />
    </svg>
  );
}

export function IconAlert({ size = 16, className = '', ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" className={className} {...props}>
      <circle cx="8" cy="8" r="5.5" />
      <path d="M8 5V8.5M8 11H8.01" strokeWidth="1.5" />
    </svg>
  );
}

export function IconSun({ size = 16, className = '', ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" className={className} {...props}>
      <circle cx="8" cy="8" r="3" />
      <path d="M8 1.5V3M8 13V14.5M1.5 8H3M13 8H14.5M3.4 3.4L4.5 4.5M11.5 11.5L12.6 12.6M3.4 12.6L4.5 11.5M11.5 4.5L12.6 3.4" />
    </svg>
  );
}

export function IconMoon({ size = 16, className = '', ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" className={className} {...props}>
      <path d="M13.5 9.5C12.8 12.2 10.3 14 7.5 14C4.2 14 1.5 11.3 1.5 8C1.5 5.2 3.3 2.7 6 2C5.5 3.1 5.4 4.3 5.8 5.5C6.4 7.4 8.1 8.8 10 9.2C11.2 9.5 12.4 9.4 13.5 9.5Z" />
    </svg>
  );
}

export function IconOffline({ size = 16, className = '', ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" className={className} {...props}>
      <line x1="2" y1="8" x2="14" y2="8" strokeDasharray="3 2" />
      <circle cx="8" cy="8" r="1.5" fill="currentColor" />
    </svg>
  );
}
