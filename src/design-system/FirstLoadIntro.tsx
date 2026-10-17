import React, { useEffect, useState } from 'react';

interface FirstLoadIntroProps {
  onComplete: () => void;
}

export function FirstLoadIntro({ onComplete }: FirstLoadIntroProps) {
  const [isFadingOut, setIsFadingOut] = useState(false);

  useEffect(() => {
    // If user prefers reduced motion, skip instantly
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      onComplete();
      return;
    }

    // Auto complete after 1.2s max
    const timer = setTimeout(() => {
      setIsFadingOut(true);
      setTimeout(onComplete, 240); // 240ms exit fade
    }, 1100);

    return () => clearTimeout(timer);
  }, [onComplete]);

  const handleSkip = () => {
    setIsFadingOut(true);
    setTimeout(onComplete, 120);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="AURA initialization sequence"
      onClick={handleSkip}
      className={`fixed inset-0 z-50 flex flex-col items-center justify-center bg-[var(--bg-app)] cursor-pointer select-none transition-opacity duration-240 ${
        isFadingOut ? 'opacity-0 pointer-events-none' : 'opacity-100'
      }`}
    >
      <div className="flex flex-col items-center gap-6 max-w-sm px-6 text-center">
        {/* Heartbeat path drawing itself directly into the wordmark */}
        <div className="relative w-64 h-20 flex items-center justify-center">
          <svg
            viewBox="0 0 240 60"
            className="w-full h-full overflow-visible"
            fill="none"
          >
            {/* Guide line */}
            <line
              x1="0"
              y1="30"
              x2="240"
              y2="30"
              stroke="var(--hairline)"
              strokeWidth="1"
              strokeDasharray="3 3"
            />
            {/* Drawing ECG rhythm stroke */}
            <path
              d="M 10 30 L 60 30 Q 70 27 75 30 L 85 30 L 92 34 L 102 6 L 112 52 L 118 30 L 128 30 Q 138 22 148 30 L 230 30"
              stroke="var(--critical)"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="intro-ecg-draw"
            />
          </svg>
        </div>

        {/* Wordmark resolving */}
        <div className="flex items-baseline gap-2 intro-wordmark-fade">
          <span className="font-serif-display italic tracking-tight lowercase text-[var(--ink)] text-5xl">
            aura
          </span>
          <span className="text-xl text-[var(--critical)] animate-pulse">🫀</span>
        </div>

        {/* Subtitle & skip hint */}
        <div className="flex flex-col items-center gap-1.5 intro-meta-fade">
          <span className="font-mono-numbers text-[11px] uppercase tracking-widest text-[var(--ink-muted)]">
            Madurai Emergency Telematics
          </span>
          <span className="text-[10px] font-mono-numbers text-[var(--ink-subtle)]">
            Press any key or click to skip
          </span>
        </div>
      </div>

      <style>{`
        .intro-ecg-draw {
          stroke-dasharray: 400;
          stroke-dashoffset: 400;
          animation: drawIntroEcg 0.85s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        @keyframes drawIntroEcg {
          to {
            stroke-dashoffset: 0;
          }
        }
        .intro-wordmark-fade {
          opacity: 0;
          transform: translateY(6px);
          animation: introWordmarkIn 0.4s cubic-bezier(0.16, 1, 0.3, 1) 0.5s forwards;
        }
        @keyframes introWordmarkIn {
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .intro-meta-fade {
          opacity: 0;
          animation: introMetaIn 0.3s ease-out 0.75s forwards;
        }
        @keyframes introMetaIn {
          to {
            opacity: 1;
          }
        }
      `}</style>
    </div>
  );
}
