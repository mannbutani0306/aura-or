/**
 * AURA Design System Tokens
 * Dispatch Slip aesthetic: Warm paper, chunky ink, hard offset shadows
 */

export const COLORS = {
  critical: '#E5322D',
  high: '#F08A00',
  medium: '#E8C21A',
  low: '#3FA66B',
  unitAvailable: '#0F8B8D',
  unitBusy: '#6B7785',
  signal: '#E8452C',
  sun: '#F2B632',
  mint: '#BFDCCB',
  sky: '#A8CBE2',
  blush: '#F2C4C0',
  tape: '#FBF8F0',
  paper: {
    bg: '#F2EBDD',
    surface: '#F7F1E4',
    surfaceRaised: '#FFFDF7',
    ink: '#15201C',
    inkMuted: '#56615B',
    inkSubtle: '#8A928D',
    line: '#15201C',
    shadowInk: '#15201C',
    signal: '#E8452C',
    sun: '#F2B632',
    mint: '#BFDCCB',
    sky: '#A8CBE2',
    blush: '#F2C4C0',
    tape: '#FBF8F0',
    hairline: '#15201C',
    hairlineHover: '#15201C',
  },
  night: {
    bg: '#0F1512',
    surface: '#151D19',
    surfaceRaised: '#1B2520',
    ink: '#EFE8D6',
    inkMuted: '#9E9785',
    inkSubtle: '#6A6659',
    line: '#CFC7B4',
    shadowInk: '#000000',
    signal: '#FF543B',
    sun: '#E5A820',
    mint: '#2E4E3C',
    sky: '#264559',
    blush: '#5E2F2B',
    tape: 'rgba(255, 255, 255, 0.08)',
    hairline: '#CFC7B4',
    hairlineHover: '#CFC7B4',
  },
} as const;

export const MOTION = {
  durationFast: 0.12, // 120ms
  durationBase: 0.24, // 240ms
  durationSlow: 0.48, // 480ms
  easing: [0.16, 1, 0.3, 1] as const,
  cssEasing: 'cubic-bezier(0.16, 1, 0.3, 1)',
} as const;

export type PriorityLevel = 'Critical' | 'High' | 'Medium' | 'Low';
export type UnitStatus = 'Available' | 'Busy' | 'Offline';
export type ProvenanceKind = 'REAL SAMPLE' | 'SIMULATED' | 'DERIVED' | 'DEMO';
