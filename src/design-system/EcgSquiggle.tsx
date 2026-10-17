import React, { useEffect, useState } from 'react';

export interface EcgSquiggleProps {
  color?: string;
  className?: string;
  strokeWidth?: number;
}

export function EcgSquiggle({
  color = 'var(--line)',
  className = '',
  strokeWidth = 2,
}: EcgSquiggleProps) {
  const [drawn, setDrawn] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setDrawn(true), 40);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className={`w-full overflow-hidden py-2 select-none ${className}`} aria-hidden="true">
      <svg
        viewBox="0 0 400 24"
        className="w-full h-6 overflow-visible"
        fill="none"
        preserveAspectRatio="none"
      >
        <path
          d="M 0 12 L 120 12 L 132 12 Q 138 9 142 12 L 150 12 L 156 16 L 166 2 L 176 22 L 182 12 L 192 12 Q 200 6 208 12 L 400 12"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{
            strokeDasharray: 450,
            strokeDashoffset: drawn ? 0 : 450,
            transition: 'stroke-dashoffset 800ms cubic-bezier(0.16, 1, 0.3, 1)',
          }}
        />
      </svg>
    </div>
  );
}
