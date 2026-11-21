import type { VoiceBeamProps } from 'voice-glow';
import type { VoiceSessionState } from '../services/voice-session.interface';

export type BlinkAtmosphereId =
  | 'blink-cyan'
  | 'aurora-violet'
  | 'bioluminescent'
  | 'midnight-ice'
  | 'obsidian-mono';

export interface VoiceGlowTuning {
  atmosphere: BlinkAtmosphereId;
  glowIntensity: number; // 0.3..1.5 (default 1.0)
  horizonReach: number; // 0.5..1.6 (default 1.0)
  motionFlow: number; // 0.0..2.0 (default 1.0)
  beamScale: number; // 0.65..1.5 (default 1.0)
  ambientHalo: number; // 0.0..1.8 (default 1.0)
  chromaticRim: boolean; // default true
  useCustomColors: boolean;
  primaryColor: string;
  accentColor: string;
}

export const DEFAULT_VOICE_GLOW_TUNING: VoiceGlowTuning = {
  atmosphere: 'blink-cyan',
  glowIntensity: 1.0,
  horizonReach: 1.0,
  motionFlow: 1.0,
  beamScale: 1.0,
  ambientHalo: 1.0,
  chromaticRim: true,
  useCustomColors: false,
  primaryColor: '#35DFFF',
  accentColor: '#7C3AED',
};

export interface BlinkVisualPreset {
  active: boolean;
  strength: number;
  idle: number;
  breatheDuration: number;
  attack: number;
  release: number;
  reach: number;
  spread: number;
  flow: number;
  bend: number;
  bandStrength: number;
  bandAberration: number;
  glowSize: number;
  brightness: number;
  saturation: number;
  distortion: number;
  innerHeight: number;
  bloomHeight: number;
  staticColors: boolean;
  hueRange: number;
  hueDuration: number;
  colors: string[];
  bandColors: NonNullable<VoiceBeamProps['bandColors']>;
  ambientPrimaryRgba: string;
  ambientSecondaryRgba: string;
  ambientBaseOpacity: number;
  ambientEnergyBoost: number;
}

/**
 * Curated top-1% color harmonies for DialKit atmosphere switching.
 */
interface AtmosphereOverride {
  colors: string[];
  bandColors: NonNullable<VoiceBeamProps['bandColors']>;
  ambientPrimaryRgba: string;
  ambientSecondaryRgba: string;
  staticColors?: boolean;
}

export const ATMOSPHERE_OVERRIDES: Record<
  Exclude<BlinkAtmosphereId, 'blink-cyan'>,
  AtmosphereOverride
> = {
  'aurora-violet': {
    colors: ['#A78BFA', '#8B5CF6', '#38BDF8', '#7C3AED', '#2563EB', '#C084FC', '#0EA5E9'],
    bandColors: { core: '#F5F3FF', above: '#C4B5FD', mid: '#38BDF8', below: '#7C3AED' },
    ambientPrimaryRgba: 'rgba(139, 92, 246, 0.32)',
    ambientSecondaryRgba: 'rgba(56, 189, 248, 0.18)',
  },
  bioluminescent: {
    colors: ['#2DD4BF', '#35DFFF', '#10B981', '#0EA5E9', '#14B8A6', '#06B6D4', '#0284C7'],
    bandColors: { core: '#ECFEFF', above: '#5EEAD4', mid: '#35DFFF', below: '#059669' },
    ambientPrimaryRgba: 'rgba(45, 212, 191, 0.30)',
    ambientSecondaryRgba: 'rgba(14, 165, 233, 0.16)',
  },
  'midnight-ice': {
    colors: ['#E0F2FE', '#7DD3FC', '#38BDF8', '#0284C7', '#1D4ED8', '#60A5FA', '#0369A1'],
    bandColors: { core: '#FFFFFF', above: '#BAE6FD', mid: '#38BDF8', below: '#1E40AF' },
    ambientPrimaryRgba: 'rgba(125, 211, 252, 0.28)',
    ambientSecondaryRgba: 'rgba(30, 64, 175, 0.18)',
  },
  'obsidian-mono': {
    colors: ['#F8FAFC', '#CBD5E1', '#94A3B8', '#64748B', '#E2E8F0', '#475569', '#334155'],
    bandColors: { core: '#FFFFFF', above: '#E2E8F0', mid: '#94A3B8', below: '#475569' },
    ambientPrimaryRgba: 'rgba(226, 232, 240, 0.22)',
    ambientSecondaryRgba: 'rgba(100, 116, 139, 0.12)',
    staticColors: true,
  },
};

function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace('#', '').trim();
  const full =
    clean.length === 3
      ? clean
          .split('')
          .map((c) => c + c)
          .join('')
      : clean;
  if (full.length !== 6) return `rgba(53, 223, 255, ${alpha})`;
  const r = Number.parseInt(full.slice(0, 2), 16);
  const g = Number.parseInt(full.slice(2, 4), 16);
  const b = Number.parseInt(full.slice(4, 6), 16);
  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) {
    return `rgba(53, 223, 255, ${alpha})`;
  }
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * Blink Signature Cyan / Electric Blue / Restrained Violet Palettes (H1 Approved)
 */
const PALETTE_IDLE = [
  '#35DFFF',
  '#0EA5E9',
  '#0284C7',
  '#1D4ED8',
  '#2563EB',
  '#4F46E5',
  '#0369A1',
];

const PALETTE_LISTENING = [
  '#35DFFF',
  '#22D3EE',
  '#38BDF8',
  '#0EA5E9',
  '#2563EB',
  '#6366F1',
  '#0284C7',
];

const PALETTE_LISTENING_MUTED = [
  '#1E6F88',
  '#1B5773',
  '#1D4E72',
  '#1E3A5F',
  '#243B64',
  '#312E59',
  '#164E63',
];

const PALETTE_THINKING = [
  '#38BDF8',
  '#2563EB',
  '#3B82F6',
  '#6366F1',
  '#7C3AED',
  '#8B5CF6',
  '#0EA5E9',
];

const PALETTE_SPEAKING = [
  '#7CEEFF',
  '#35DFFF',
  '#0EA5E9',
  '#3B82F6',
  '#7C3AED',
  '#6366F1',
  '#22D3EE',
];

const PALETTE_INTERRUPTED = [
  '#A5F3FC',
  '#35DFFF',
  '#38BDF8',
  '#0EA5E9',
  '#0284C7',
  '#3B82F6',
  '#22D3EE',
];

const PALETTE_ERROR = [
  '#FB7185',
  '#F43F5E',
  '#E11D48',
  '#F59E0B',
  '#BE123C',
  '#9F1239',
  '#881337',
];

export const BLINK_VISUAL_PRESETS: Record<VoiceSessionState, BlinkVisualPreset> = {
  idle: {
    active: true,
    strength: 0.34,
    idle: 0.14,
    breatheDuration: 7.4,
    attack: 0.45,
    release: 1.1,
    reach: 2.1,
    spread: 0.38,
    flow: 10,
    bend: 34,
    bandStrength: 0.42,
    bandAberration: 0.28,
    glowSize: 1.15,
    brightness: 0.92,
    saturation: 1.15,
    distortion: 0.16,
    innerHeight: 1.25,
    bloomHeight: 1.35,
    staticColors: false,
    hueRange: 10,
    hueDuration: 18,
    colors: PALETTE_IDLE,
    bandColors: {
      core: '#A5F3FC',
      above: '#35DFFF',
      mid: '#0EA5E9',
      below: '#3B82F6',
    },
    ambientPrimaryRgba: 'rgba(53, 223, 255, 0.14)',
    ambientSecondaryRgba: 'rgba(37, 99, 235, 0.08)',
    ambientBaseOpacity: 0.28,
    ambientEnergyBoost: 0.12,
  },

  entering: {
    active: true,
    strength: 0.88,
    idle: 0.28,
    breatheDuration: 4.5,
    attack: 0.18,
    release: 0.5,
    reach: 2.8,
    spread: 0.52,
    flow: 36,
    bend: 64,
    bandStrength: 1.35,
    bandAberration: 0.52,
    glowSize: 1.22,
    brightness: 1.18,
    saturation: 1.32,
    distortion: 0.35,
    innerHeight: 1.45,
    bloomHeight: 1.55,
    staticColors: false,
    hueRange: 14,
    hueDuration: 12,
    colors: PALETTE_LISTENING,
    bandColors: {
      core: '#E0FAFF',
      above: '#35DFFF',
      mid: '#38BDF8',
      below: '#6366F1',
    },
    ambientPrimaryRgba: 'rgba(53, 223, 255, 0.26)',
    ambientSecondaryRgba: 'rgba(99, 102, 241, 0.14)',
    ambientBaseOpacity: 0.58,
    ambientEnergyBoost: 0.25,
  },

  listening: {
    active: true,
    strength: 0.95,
    idle: 0.22,
    breatheDuration: 5.0,
    attack: 0.08,
    release: 0.32,
    reach: 3.0,
    spread: 0.56,
    flow: 44,
    bend: 74,
    bandStrength: 1.55,
    bandAberration: 0.58,
    glowSize: 1.15,
    brightness: 1.18,
    saturation: 1.35,
    distortion: 0.45,
    innerHeight: 1.5,
    bloomHeight: 1.65,
    staticColors: false,
    hueRange: 16,
    hueDuration: 14,
    colors: PALETTE_LISTENING,
    bandColors: {
      core: '#E0FAFF',
      above: '#35DFFF',
      mid: '#0EA5E9',
      below: '#6366F1',
    },
    ambientPrimaryRgba: 'rgba(53, 223, 255, 0.28)',
    ambientSecondaryRgba: 'rgba(37, 99, 235, 0.16)',
    ambientBaseOpacity: 0.42,
    ambientEnergyBoost: 0.48,
  },

  thinking: {
    active: true,
    strength: 0.96,
    idle: 0.24,
    breatheDuration: 4.2,
    attack: 0.16,
    release: 0.45,
    reach: 2.5,
    spread: 0.42,
    flow: 22,
    bend: 52,
    bandStrength: 1.4,
    bandAberration: 0.65,
    glowSize: 1.1,
    brightness: 1.22,
    saturation: 1.45,
    distortion: 0.12,
    innerHeight: 1.35,
    bloomHeight: 1.45,
    staticColors: false,
    hueRange: 18,
    hueDuration: 10,
    colors: PALETTE_THINKING,
    bandColors: {
      core: '#E0E7FF',
      above: '#38BDF8',
      mid: '#6366F1',
      below: '#7C3AED',
    },
    ambientPrimaryRgba: 'rgba(59, 130, 246, 0.28)',
    ambientSecondaryRgba: 'rgba(124, 58, 237, 0.19)',
    ambientBaseOpacity: 0.56,
    ambientEnergyBoost: 0.16,
  },

  speaking: {
    active: true,
    strength: 1.0,
    idle: 0.25,
    breatheDuration: 4.0,
    attack: 0.06,
    release: 0.28,
    reach: 3.65,
    spread: 0.68,
    flow: 78,
    bend: 92,
    bandStrength: 1.9,
    bandAberration: 0.72,
    glowSize: 1.26,
    brightness: 1.28,
    saturation: 1.46,
    distortion: 0.58,
    innerHeight: 1.7,
    bloomHeight: 1.85,
    staticColors: false,
    hueRange: 20,
    hueDuration: 9,
    colors: PALETTE_SPEAKING,
    bandColors: {
      core: '#F0FDFF',
      above: '#7CEEFF',
      mid: '#38BDF8',
      below: '#8B5CF6',
    },
    ambientPrimaryRgba: 'rgba(53, 223, 255, 0.34)',
    ambientSecondaryRgba: 'rgba(124, 58, 237, 0.20)',
    ambientBaseOpacity: 0.48,
    ambientEnergyBoost: 0.52,
  },

  interrupted: {
    active: true,
    strength: 0.92,
    idle: 0.2,
    breatheDuration: 3.5,
    attack: 0.04,
    release: 0.14,
    reach: 2.3,
    spread: 0.45,
    flow: 0,
    bend: 48,
    bandStrength: 1.6,
    bandAberration: 0.35,
    glowSize: 1.05,
    brightness: 1.32,
    saturation: 1.25,
    distortion: 0.08,
    innerHeight: 1.3,
    bloomHeight: 1.35,
    staticColors: true,
    hueRange: 0,
    hueDuration: 12,
    colors: PALETTE_INTERRUPTED,
    bandColors: {
      core: '#FFFFFF',
      above: '#7CEEFF',
      mid: '#35DFFF',
      below: '#0EA5E9',
    },
    ambientPrimaryRgba: 'rgba(124, 238, 255, 0.30)',
    ambientSecondaryRgba: 'rgba(14, 165, 233, 0.15)',
    ambientBaseOpacity: 0.55,
    ambientEnergyBoost: 0.1,
  },

  error: {
    active: true,
    strength: 0.56,
    idle: 0.18,
    breatheDuration: 6.5,
    attack: 0.3,
    release: 0.8,
    reach: 1.9,
    spread: 0.36,
    flow: 0,
    bend: 28,
    bandStrength: 0.82,
    bandAberration: 0.22,
    glowSize: 1.0,
    brightness: 0.98,
    saturation: 1.15,
    distortion: 0,
    innerHeight: 1.15,
    bloomHeight: 1.25,
    staticColors: true,
    hueRange: 0,
    hueDuration: 12,
    colors: PALETTE_ERROR,
    bandColors: {
      core: '#FFE4E6',
      above: '#FB7185',
      mid: '#F43F5E',
      below: '#F59E0B',
    },
    ambientPrimaryRgba: 'rgba(244, 63, 94, 0.22)',
    ambientSecondaryRgba: 'rgba(245, 158, 11, 0.10)',
    ambientBaseOpacity: 0.42,
    ambientEnergyBoost: 0.05,
  },

  ending: {
    active: false,
    strength: 0.0,
    idle: 0.0,
    breatheDuration: 6.0,
    attack: 0.2,
    release: 0.35,
    reach: 1.5,
    spread: 0.3,
    flow: 0,
    bend: 16,
    bandStrength: 0.2,
    bandAberration: 0.1,
    glowSize: 0.9,
    brightness: 0.8,
    saturation: 1.0,
    distortion: 0,
    innerHeight: 1.0,
    bloomHeight: 1.0,
    staticColors: true,
    hueRange: 0,
    hueDuration: 12,
    colors: PALETTE_IDLE,
    bandColors: {
      core: '#A5F3FC',
      above: '#35DFFF',
      mid: '#0EA5E9',
      below: '#2563EB',
    },
    ambientPrimaryRgba: 'rgba(53, 223, 255, 0.08)',
    ambientSecondaryRgba: 'rgba(37, 99, 235, 0.04)',
    ambientBaseOpacity: 0.0,
    ambientEnergyBoost: 0.0,
  },
};

export function resolveVisualPreset(
  state: VoiceSessionState,
  isMuted: boolean,
  tuning?: Partial<VoiceGlowTuning>
): BlinkVisualPreset {
  const base = BLINK_VISUAL_PRESETS[state];
  let resolved: BlinkVisualPreset =
    state === 'listening' && isMuted
      ? {
          ...base,
          strength: 0.46,
          idle: 0.14,
          flow: 10,
          bandStrength: 0.55,
          distortion: 0.12,
          brightness: 0.88,
          saturation: 0.92,
          colors: PALETTE_LISTENING_MUTED,
          ambientPrimaryRgba: 'rgba(30, 111, 136, 0.18)',
          ambientSecondaryRgba: 'rgba(30, 58, 95, 0.10)',
          ambientBaseOpacity: 0.28,
          ambientEnergyBoost: 0.0,
        }
      : { ...base };

  if (!tuning || state === 'error' || state === 'ending') {
    return resolved;
  }

  const intensity = tuning.glowIntensity ?? 1;
  const reachMult = tuning.horizonReach ?? 1;
  const flowMult = tuning.motionFlow ?? 1;
  const haloMult = tuning.ambientHalo ?? 1;

  resolved = {
    ...resolved,
    strength: Math.min(1, Math.max(0.08, resolved.strength * intensity)),
    brightness: Math.min(1.6, Math.max(0.5, resolved.brightness * (0.65 + 0.35 * intensity))),
    reach: resolved.reach * reachMult,
    bend: resolved.bend * reachMult,
    innerHeight: resolved.innerHeight * reachMult,
    bloomHeight: resolved.bloomHeight * reachMult,
    flow: resolved.flow * flowMult,
    bandStrength: tuning.chromaticRim === false ? 0 : resolved.bandStrength * intensity,
    ambientBaseOpacity: Math.min(1, resolved.ambientBaseOpacity * haloMult),
    ambientEnergyBoost: Math.min(1, resolved.ambientEnergyBoost * haloMult),
  };

  if (tuning.useCustomColors && tuning.primaryColor && tuning.accentColor && !(state === 'listening' && isMuted)) {
    const p = tuning.primaryColor;
    const a = tuning.accentColor;
    resolved = {
      ...resolved,
      colors: [p, p, a, p, a, a, p],
      bandColors: {
        core: '#F8FAFC',
        above: p,
        mid: p,
        below: a,
      },
      ambientPrimaryRgba: hexToRgba(p, state === 'idle' ? 0.16 : 0.32),
      ambientSecondaryRgba: hexToRgba(a, state === 'idle' ? 0.09 : 0.19),
    };
  } else if (
    tuning.atmosphere &&
    tuning.atmosphere !== 'blink-cyan' &&
    !(state === 'listening' && isMuted)
  ) {
    const theme = ATMOSPHERE_OVERRIDES[tuning.atmosphere];
    resolved = {
      ...resolved,
      colors: theme.colors,
      bandColors: theme.bandColors,
      ambientPrimaryRgba: theme.ambientPrimaryRgba,
      ambientSecondaryRgba: theme.ambientSecondaryRgba,
      staticColors: theme.staticColors ?? resolved.staticColors,
    };
  }

  return resolved;
}

export function computeResponsiveBeamScale(width: number, height: number): number {
  const minDim = Math.min(width, height);
  if (width >= 1280) {
    return Math.min(1.65, Math.max(1.25, width / 960));
  }
  if (width >= 768) {
    return Math.min(1.35, Math.max(1.05, width / 760));
  }
  return Math.min(1.12, Math.max(0.88, minDim / 380));
}
