import type { VoiceBeamProps } from 'voice-glow';
import type { VoiceSessionState } from '../services/voice-session.interface';

export interface BlinkVisualPreset {
  /** Whether VoiceBeam effect layers are active (false fades out gracefully) */
  active: boolean;
  /** Overall opacity of VoiceBeam layers (0..1) */
  strength: number;
  /** Resting breathing level when silent (0..1) */
  idle: number;
  /** Idle breathing cycle duration in seconds */
  breatheDuration: number;
  /** Attack / release tuning on VoiceBeam's internal envelope */
  attack: number;
  release: number;
  /** Vertical rise & horizontal spread multipliers */
  reach: number;
  spread: number;
  /** Horizontal spectrum travel speed (px/s at full level) */
  flow: number;
  /** Contour bend height (px at full level) */
  bend: number;
  /** Luminous contour band styling */
  bandStrength: number;
  bandAberration: number;
  /** Bloom & diffusion controls */
  glowSize: number;
  brightness: number;
  saturation: number;
  distortion: number;
  innerHeight: number;
  bloomHeight: number;
  /** Hue drift parameters */
  staticColors: boolean;
  hueRange: number;
  hueDuration: number;
  /** 7 lobe colors (center first, then pairs outward) */
  colors: string[];
  /** Chromatic band ridge & fringes */
  bandColors: NonNullable<VoiceBeamProps['bandColors']>;
  /** Fullscreen atmospheric horizon backdrop gradient colors & base opacity */
  ambientPrimaryRgba: string;
  ambientSecondaryRgba: string;
  ambientBaseOpacity: number;
  ambientEnergyBoost: number;
}

/**
 * Blink Signature Cyan / Electric Blue / Restrained Violet Palettes
 */
const PALETTE_IDLE = [
  '#35DFFF', // center: Blink cyan
  '#0EA5E9', // inner pair: electric sky
  '#0284C7',
  '#1D4ED8', // mid pair: deep electric blue
  '#2563EB',
  '#4F46E5', // outer pair: restrained indigo-violet
  '#0369A1',
];

const PALETTE_LISTENING = [
  '#35DFFF', // center: crisp Blink cyan
  '#22D3EE',
  '#38BDF8',
  '#0EA5E9',
  '#2563EB',
  '#6366F1', // restrained violet edge
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
  '#38BDF8', // focused luminous blue-cyan core
  '#2563EB',
  '#3B82F6',
  '#6366F1', // deeper contemplative violet accents
  '#7C3AED',
  '#8B5CF6',
  '#0EA5E9',
];

const PALETTE_SPEAKING = [
  '#7CEEFF', // radiant bright cyan core
  '#35DFFF',
  '#0EA5E9',
  '#3B82F6',
  '#7C3AED', // expressive electric violet harmonics
  '#6366F1',
  '#22D3EE',
];

const PALETTE_INTERRUPTED = [
  '#A5F3FC', // crisp bright cyan acknowledgment
  '#35DFFF',
  '#38BDF8',
  '#0EA5E9',
  '#0284C7',
  '#3B82F6',
  '#22D3EE',
];

const PALETTE_ERROR = [
  '#FB7185', // restrained warm rose-amber warning
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
  isMuted: boolean
): BlinkVisualPreset {
  const base = BLINK_VISUAL_PRESETS[state];
  if (state === 'listening' && isMuted) {
    return {
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
    };
  }
  return base;
}

/**
 * Compute proportional VoiceBeam scale across mobile portrait, mobile landscape,
 * and wide desktop viewports so the glow remains balanced without distortion.
 */
export function computeResponsiveBeamScale(width: number, height: number): number {
  const minDim = Math.min(width, height);
  // Wide desktop displays get a more generous presence; narrow phones stay crisp
  if (width >= 1280) {
    return Math.min(1.65, Math.max(1.25, width / 960));
  }
  if (width >= 768) {
    return Math.min(1.35, Math.max(1.05, width / 760));
  }
  // Compact mobile (portrait or landscape)
  return Math.min(1.12, Math.max(0.88, minDim / 380));
}
