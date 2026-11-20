import React, { useEffect, useRef } from 'react';
import { BlinkExpressionType } from '@/shared/contracts';
import { MaterialParams, DEFAULT_MATERIAL_PARAMS, useDeviceStore } from '../state';
import { eyeTrackingBridge } from '../tracking/eyeTrackingBridge';

interface EyeCanvasProps {
  expression?: BlinkExpressionType;
  isBlinking?: boolean;
  isWinkingLeft?: boolean;
  isWinkingRight?: boolean;
  brightness?: number;
  className?: string;
  isStandalone?: boolean;
  onNudgeComplete?: () => void;
  materialParams?: MaterialParams;
}

// Map expression strings to internal shader pose IDs (0..7)
export const EXPR_TO_ID: Record<BlinkExpressionType, number> = {
  idle: 0,
  happy: 1,
  sleepy: 2,
  thinking: 3,
  alert: 4,
  error: 4,
  speaking: 5,
  offline: 6,
  listening: 7,
  nudging: 0, // Nudging uses custom choreography
};

const VERTEX_SHADER_SOURCE = `
attribute vec2 a_position;
varying vec2 v_uv;

void main() {
  v_uv = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

const FRAGMENT_SHADER_SOURCE = `
precision highp float;

uniform vec2 u_resolution;
uniform float u_time;
uniform vec2 u_gazeLeft;
uniform vec2 u_gazeRight;
uniform float u_blinkScaleY;
uniform float u_blinkScaleLeftY;
uniform float u_blinkScaleRightY;
uniform float u_leftEyeVisible;
uniform float u_rightEyeVisible;
uniform float u_leftEyeColor;    // 0.0 = cyan/blue, 1.0 = red
uniform float u_rightEyeColor;   // 0.0 = cyan/blue, 1.0 = red
uniform int u_currExpr;          // 0..7
uniform int u_targetExpr;        // 0..7
uniform float u_transition;      // 0.0 to 1.0
uniform float u_brightness;
uniform float u_eyeScale;        // Scale multiplier (1.0 for integrated demo, ~1.8 for standalone landscape)

// Refinement 03: Optical Depth & Shader Material Quality Uniforms (defaults 1.0)
uniform float u_matInnerEmission;
uniform float u_matRimDiffusion;
uniform float u_matOuterHalo;
uniform float u_matTextureContrast;
uniform float u_matDepthVariation;

varying vec2 v_uv;

// Distance to line segment
float distToSegment(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a, ba = b - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h);
}

// 0: Neutral Circle
float sdfCircle(vec2 p, float r) {
  return length(p) - r;
}

// 1: Happy (Upward-smiling crescent arc - Reference Frame 3)
float sdfHappy(vec2 p, float r) {
  float dOuter = length(p) - r;
  // Soft upward-curving smile cutout from below (smiling cheeks pushing up)
  float bottomCurve = -(p.y - (-0.15 * r + 0.35 * (p.x / r) * (p.x / r) * r));
  return max(dOuter, bottomCurve);
}

// 2: Sleepy (Drooping heavy eyelid - Reference Frame 2)
float sdfSleepy(vec2 p, float r) {
  float dOuter = length(p) - r;
  // Relaxed, drooping upper eyelid horizontal boundary
  float topDroop = p.y - (0.05 * r);
  return max(dOuter, topDroop);
}

// 3: Thinking (Contemplative inquisitive asymmetry)
float sdfThinking(vec2 p, float r, bool isRight) {
  float qx = isRight ? -p.x : p.x;
  float dOuter = length(p) - r;
  if (isRight) {
    // Right eye: inquisitive slightly cocked upper lid
    float cut = (p.y - 0.22 * qx) - (r * 0.28);
    return max(dOuter, cut);
  } else {
    // Left eye: contemplative slightly lowered eyelid
    float cut = (p.y + 0.15 * qx) - (r * 0.35);
    return max(dOuter, cut);
  }
}

// 4: Angry / Alert (Red Slanted Angular Eyes - Reference Frame 5)
float sdfAngry(vec2 p, float r, bool isRight) {
  vec2 q = p;
  if (isRight) q.x = -q.x;
  float cutTop = (q.y + 0.48 * q.x) - (r * 0.28);
  float cutBottom = (-q.y - 0.16 * q.x) - (r * 0.75);
  float d = length(vec2(q.x * 1.08, q.y)) - r;
  return max(d, max(cutTop, cutBottom));
}

// 5: Speaking / Playful (Squinting >< Chevrons)
float sdfSquint(vec2 p, float r, bool isRight) {
  vec2 q = p;
  if (isRight) q.x = -q.x;
  vec2 vertex = vec2(-r * 0.72, 0.0);
  vec2 topEnd = vec2(r * 0.72, r * 0.58);
  vec2 bottomEnd = vec2(r * 0.72, -r * 0.58);
  float d1 = distToSegment(q, vertex, topEnd) - (r * 0.20);
  float d2 = distToSegment(q, vertex, bottomEnd) - (r * 0.20);
  return min(d1, d2);
}

// 6: Offline / Cool (8-bit Pixel Sunglasses)
float sdfSunglasses(vec2 p, float r, bool isRight) {
  vec2 q = p;
  if (isRight) q.x = -q.x;
  float top = q.y - (r * 0.45);
  float bottom = -q.y - (r * 0.65);
  float inner = -q.x - (r * 0.85);
  float slant = (q.x * 0.42 + q.y) - (r * 0.80);
  float dLens = max(max(top, bottom), max(inner, slant));
  vec2 pix = floor((q + vec2(r * 0.9, r * 0.5)) * (26.0 / (r * 4.5)));
  if ((pix.y == 3.0 && pix.x >= 2.0 && pix.x <= 4.0) ||
      (pix.y == 2.0 && pix.x >= 4.0 && pix.x <= 6.0) ||
      (pix.y == 1.0 && pix.x >= 6.0 && pix.x <= 8.0)) {
    dLens = max(dLens, r * 0.12);
  }
  return dLens;
}

// 7: Listening (Open, receptive focused aperture with attentive breath)
float sdfListening(vec2 p, float r) {
  float breathe = sin(u_time * 2.8) * (r * 0.025);
  vec2 q = vec2(p.x, p.y / 1.10);
  return length(q) - (r + breathe);
}

// Dispatch expression pose SDF
float evaluateExpr(int exprId, vec2 p, float r, bool isRight) {
  if (exprId == 0) return sdfCircle(p, r);
  if (exprId == 1) return sdfHappy(p, r);
  if (exprId == 2) return sdfSleepy(p, r);
  if (exprId == 3) return sdfThinking(p, r, isRight);
  if (exprId == 4) return sdfAngry(p, r, isRight);
  if (exprId == 5) return sdfSquint(p, r, isRight);
  if (exprId == 6) return sdfSunglasses(p, r, isRight);
  if (exprId == 7) return sdfListening(p, r);
  return sdfCircle(p, r);
}

// Procedural morphing interpolation (eased progress passed directly via u_transition)
float getMorphedSDF(vec2 p, float r, bool isRight) {
  float dCurrent = evaluateExpr(u_currExpr, p, r, isRight);
  if (u_currExpr == u_targetExpr || u_transition >= 0.999) {
    return dCurrent;
  }
  float dTarget = evaluateExpr(u_targetExpr, p, r, isRight);
  return mix(dCurrent, dTarget, clamp(u_transition, 0.0, 1.0));
}

// Calculate emissive eye color with core, halo, optical depth, and horizontal wavy scanline microtexture
vec3 calculateEyeColor(float d, vec2 p, float eyeRadius, float isRed, float visibility) {
  if (visibility < 0.01) return vec3(0.0);

  // Eye-local normalized texture coordinates:
  // p is centered on the eye; dividing by eyeRadius gives [-1.0, +1.0] across the eye.
  // This guarantees exact scale invariance across /demo, /device, and all display aspect ratios.
  vec2 localCoord = p / eyeRadius;
  float scanlineY = localCoord.y * (30.0 * 3.14159265);
  float waveShift = sin(localCoord.x * (14.0 * 3.14159265)) * 1.25;

  // Refined subpixel antialiased wave shaping (Refinement 03B: +18% contrast depth)
  // Harmonic soft-saturation avoids harsh sine peaks and temporal moiré across DPRs
  float phase = scanlineY + waveShift;
  float rawWave = sin(phase);
  float smoothWave = rawWave / sqrt(1.0 + rawWave * rawWave * 0.28);
  float textureMod = 1.0 - (0.5 - 0.5 * smoothWave) * 0.33 * u_matTextureContrast;

  // Gentle edge texture softening: texture fades softly toward the edge without harsh cutout
  float edgeTextureFade = smoothstep(0.010 * eyeRadius, -0.080 * eyeRadius, d);
  float wave = mix(1.0, textureMod, edgeTextureFade);

  // Optical Depth (Substrate attenuation & inner emission falloff)
  // Simulates light emitted from beneath a tinted dark diffusion glass matrix:
  // light path length increases towards the perimeter, giving subtle radial depth
  float normInternalDist = clamp(-d / eyeRadius, 0.0, 1.0);
  float substrateDepth = mix(0.78, 1.0, pow(normInternalDist, 0.45 * u_matDepthVariation));

  // Normalized relative distance outside the eye boundary (d >= 0)
  float relD = max(0.0, d) / eyeRadius;

  // Layered optical glow:
  // 1. Concentrated Royal Blue rim diffusion hugging the outer circumference
  float glow1 = exp(-relD * 9.8);
  // 2. Mid-halo diffusion
  float glow2 = exp(-relD * 4.4);
  // 3. Soft outer atmospheric halo
  float glow3 = exp(-relD * 2.1);

  vec3 finalColor = vec3(0.0);

  if (isRed > 0.5) {
    // Red color palette (Reference 5 Nudge right eye & Angry/Alert)
    vec3 coreHotspot = vec3(1.0, 0.72, 0.80);
    vec3 coreColorBase = vec3(1.0, 0.26, 0.36);
    vec3 innerHalo = vec3(0.95, 0.08, 0.18);
    vec3 outerHalo = vec3(0.40, 0.02, 0.07);

    float hotspotMask = smoothstep(0.25 * eyeRadius, -0.65 * eyeRadius, d);
    vec3 baseEmissive = mix(coreColorBase, coreHotspot, hotspotMask * 0.45);
    vec3 coreShade = baseEmissive * wave * substrateDepth * u_matInnerEmission;

    vec3 rimGlow = innerHalo * glow1 * 0.95 * u_matRimDiffusion;
    vec3 outerGlow = (outerHalo * glow2 * 0.42 + outerHalo * glow3 * 0.12) * u_matOuterHalo;
    vec3 glowColor = rimGlow + outerGlow;

    // Organic optical edge falloff: red body smoothly diffuses across the boundary
    // eliminating hard outline rings while preserving clear silhouette recognition
    float coreMask = smoothstep(0.015 * eyeRadius, -0.075 * eyeRadius, d);

    finalColor = mix(glowColor, coreShade, coreMask);
  } else {
    // Cyan / Royal Blue color palette (Reference 1, Reference 3, Reference 4)
    vec3 coreHotspot = vec3(0.70, 0.98, 1.0);
    vec3 coreColorBase = vec3(0.03, 0.96, 1.0);
    vec3 innerHalo = vec3(0.04, 0.40, 0.95);
    vec3 outerHalo = vec3(0.01, 0.10, 0.42);

    float hotspotMask = smoothstep(0.25 * eyeRadius, -0.65 * eyeRadius, d);
    vec3 baseEmissive = mix(coreColorBase, coreHotspot, hotspotMask * 0.45);
    vec3 coreShade = baseEmissive * wave * substrateDepth * u_matInnerEmission;

    vec3 rimGlow = innerHalo * glow1 * 0.95 * u_matRimDiffusion;
    vec3 outerGlow = (outerHalo * glow2 * 0.42 + outerHalo * glow3 * 0.12) * u_matOuterHalo;
    vec3 glowColor = rimGlow + outerGlow;

    // Organic optical edge falloff: cyan body smoothly diffuses across the boundary
    // eliminating hard outline rings while preserving clear silhouette recognition
    float coreMask = smoothstep(0.015 * eyeRadius, -0.075 * eyeRadius, d);

    finalColor = mix(glowColor, coreShade, coreMask);
  }

  return finalColor * visibility;
}

void main() {
  vec2 resolution = u_resolution;
  float scale = min(resolution.x, resolution.y);
  vec2 uv = (gl_FragCoord.xy - resolution * 0.5) / scale;

  // Single Normalized Coordinate System derived from 1024x1024 source reference:
  // Visible eye radius: 93.5px / 1024px = 0.0913
  // Inter-pupillary distance: 209px / 1024px = 0.2041 (half-spacing = 0.102)
  // Vertical center: 503.5px / 1024px -> offset +0.0083 from image center (512, 512)
  float eyeRadius = 0.0913 * u_eyeScale;
  float eyeSpacing = 0.1020 * u_eyeScale;
  float eyeCenterY = 0.0083 * u_eyeScale;

  vec2 leftCenter = vec2(-eyeSpacing, eyeCenterY);
  vec2 rightCenter = vec2(+eyeSpacing, eyeCenterY);

  // Independent gaze offsets (calibrated to 8-12% eye diameter displacement)
  vec2 gazeLeftOffset = u_gazeLeft * (0.018 * u_eyeScale);
  vec2 gazeRightOffset = u_gazeRight * (0.018 * u_eyeScale);

  // Blinking vertical compression with independent left/right dynamics
  vec2 pLeft = uv - leftCenter - gazeLeftOffset;
  pLeft.y /= max(0.025, u_blinkScaleLeftY);

  vec2 pRight = uv - rightCenter - gazeRightOffset;
  pRight.y /= max(0.025, u_blinkScaleRightY);

  float dLeft = getMorphedSDF(pLeft, eyeRadius, false);
  float dRight = getMorphedSDF(pRight, eyeRadius, true);

  vec3 leftColor = calculateEyeColor(dLeft, pLeft, eyeRadius, u_leftEyeColor, u_leftEyeVisible);
  vec3 rightColor = calculateEyeColor(dRight, pRight, eyeRadius, u_rightEyeColor, u_rightEyeVisible);

  vec3 col = (leftColor + rightColor) * u_brightness;
  gl_FragColor = vec4(col, 1.0);
}
`;

// Deterministic pseudo-random number generator for reproducible curiosity behaviors
export class SeededPRNG {
  private s: number;
  private initialSeed: number;

  constructor(seed: number = 1337) {
    this.initialSeed = seed;
    this.s = seed >>> 0;
  }

  public setSeed(seed: number): void {
    this.initialSeed = seed;
    this.s = seed >>> 0;
  }

  public getSeed(): number {
    return this.initialSeed;
  }

  next(): number {
    let t = (this.s += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }
}

// Cartoon-inspired overshoot ease-out for responsive curiosity glance
export function easeOutBack(t: number, s: number = 1.15): number {
  const t1 = t - 1;
  return t1 * t1 * ((s + 1) * t1 + s) + 1;
}

// Gentle cubic ease-out for returning to center
export function easeOutCubic(t: number): number {
  const t1 = 1 - t;
  return 1 - t1 * t1 * t1;
}

// Expression-specific motion configurations (Refinement 04)
export interface ExpressionMotionConfig {
  duration: number; // ms
  ease: (p: number) => number;
}

export const EXPRESSION_MOTION: Record<BlinkExpressionType, ExpressionMotionConfig> = {
  idle: {
    // Calm, gentle return to centered resting pose
    duration: 360,
    ease: (p) => {
      const t1 = 1.0 - p;
      return 1.0 - t1 * t1 * t1; // Gentle cubic ease-out
    },
  },
  happy: {
    // Buoyant, joyful lift into smiling crescent silhouette
    duration: 320,
    ease: (p) => {
      const s = 1.25;
      const t1 = p - 1.0;
      return t1 * t1 * ((s + 1.0) * t1 + s) + 1.0; // Overshoot ease-out
    },
  },
  sleepy: {
    // Slow, weighted eyelid droop
    duration: 520,
    ease: (p) => {
      return p * p * (2.2 - 1.2 * p); // Viscous ease-in with soft deceleration
    },
  },
  alert: {
    // Fast, crisp, controlled warning snap-in
    duration: 200,
    ease: (p) => {
      return 1.0 - Math.pow(1.0 - p, 3.8); // Snappy exponential ease-out
    },
  },
  thinking: {
    // Deliberate contemplative inquisitive blend
    duration: 380,
    ease: (p) => {
      return p * p * (3.0 - 2.0 * p); // S-curve smoothstep
    },
  },
  listening: {
    // Responsive, attentive opening movement
    duration: 280,
    ease: (p) => {
      return 1.0 - Math.pow(1.0 - p, 2.4); // Responsive quad-ease-out
    },
  },
  speaking: {
    duration: 260,
    ease: (p) => p * p * (3.0 - 2.0 * p),
  },
  offline: {
    duration: 340,
    ease: (p) => p * p * (3.0 - 2.0 * p),
  },
  error: {
    duration: 200,
    ease: (p) => 1.0 - Math.pow(1.0 - p, 3.8),
  },
  nudging: {
    duration: 350,
    ease: (p) => p,
  },
};

// Organic natural blink scaling function (Refinement 04)
export function calculateBlinkScale(t: number, duration: number): number {
  if (t < 0) return 1.0;
  if (t >= duration) return 1.0;
  const tClose = 0.32 * duration;
  const tHold = 0.10 * duration;
  if (t < tClose) {
    // Fast eyelid closure: smooth non-linear acceleration into descent
    const p = t / tClose;
    const ease = Math.pow(p * p * (3.0 - 2.0 * p), 1.2);
    return 1.0 - 0.96 * ease;
  }
  if (t < tClose + tHold) {
    // Brief instantaneous hold at closed minimum
    return 0.04;
  }
  // Slower, organic decelerating reopening
  const p = (t - (tClose + tHold)) / (duration - tClose - tHold);
  const ease = 1.0 - Math.pow(1.0 - p, 2.6);
  return 0.04 + 0.96 * ease;
}

export interface ActiveBlink {
  startTime: number;
  duration: number;
  isDouble: boolean;
  doubleGap: number;
  doubleDuration: number;
  leftOffset: number;  // micro-timing offset (0-14ms)
  rightOffset: number; // micro-timing offset (0-14ms)
  isLeftOnly?: boolean;  // For wink
  isRightOnly?: boolean; // For wink
}

export function evaluateActiveBlink(
  now: number,
  blink: ActiveBlink | null
): { scaleLeft: number; scaleRight: number; isDone: boolean } {
  if (!blink) return { scaleLeft: 1.0, scaleRight: 1.0, isDone: true };

  const totalCycle1 = blink.duration;
  const totalBlink = blink.isDouble
    ? totalCycle1 + blink.doubleGap + blink.doubleDuration
    : totalCycle1;

  const tElapsed = now - blink.startTime;
  if (tElapsed < 0) return { scaleLeft: 1.0, scaleRight: 1.0, isDone: false };
  if (tElapsed >= totalBlink + Math.max(blink.leftOffset, blink.rightOffset)) {
    return { scaleLeft: 1.0, scaleRight: 1.0, isDone: true };
  }

  const sampleCycle = (t: number) => {
    if (t < 0) return 1.0;
    if (t < totalCycle1) {
      return calculateBlinkScale(t, blink.duration);
    }
    if (!blink.isDouble) return 1.0;
    const tDouble = t - (totalCycle1 + blink.doubleGap);
    if (tDouble < 0) return 1.0;
    if (tDouble < blink.doubleDuration) {
      return calculateBlinkScale(tDouble, blink.doubleDuration);
    }
    return 1.0;
  };

  const scaleLeft = blink.isRightOnly ? 1.0 : sampleCycle(tElapsed - blink.leftOffset);
  const scaleRight = blink.isLeftOnly ? 1.0 : sampleCycle(tElapsed - blink.rightOffset);

  return { scaleLeft, scaleRight, isDone: false };
}

export interface NudgeChoreographyFrame {
  leftVisible: number;
  rightVisible: number;
  leftColor: number;  // 0.0 = cyan/blue, 1.0 = red
  rightColor: number; // 0.0 = cyan/blue, 1.0 = red
  isFinished: boolean;
}

/**
 * Deterministic Nudge Choreography Evaluation (Section 4 Reference Sequence)
 * A. Left screen eye RED double blink while right eye is hidden (0-340ms).
 * B. Right screen eye BLUE double blink while left eye is hidden (340-680ms).
 * C. Both eyes appear: left RED, right BLUE, double blink together (680-1100ms).
 * D. Both briefly disappear (1100-1350ms).
 * E. Bounded 2-cycle repetition (total 2700ms), then safe termination and restoration.
 */
export function evaluateNudgeChoreography(nElapsed: number): NudgeChoreographyFrame {
  const cycleDuration = 1350;
  const totalDuration = cycleDuration * 2;

  if (nElapsed >= totalDuration) {
    return {
      leftVisible: 1.0,
      rightVisible: 1.0,
      leftColor: 0.0,
      rightColor: 0.0,
      isFinished: true,
    };
  }

  const cycleTime = nElapsed % cycleDuration;
  let leftVisible = 0.0;
  let rightVisible = 0.0;
  let leftColor = 1.0;  // Default left color is red
  let rightColor = 0.0; // Default right color is blue

  if (cycleTime < 340) {
    // Stage A: Left screen eye RED double blink while right eye is hidden
    const flash = (cycleTime % 170) < 120 ? 1.0 : 0.0;
    leftVisible = flash;
    rightVisible = 0.0;
    leftColor = 1.0;
    rightColor = 0.0;
  } else if (cycleTime < 680) {
    // Stage B: Right screen eye BLUE double blink while left eye is hidden
    const sub = cycleTime - 340;
    const flash = (sub % 170) < 120 ? 1.0 : 0.0;
    leftVisible = 0.0;
    rightVisible = flash;
    leftColor = 1.0;
    rightColor = 0.0;
  } else if (cycleTime < 1100) {
    // Stage C: Both eyes appear: left RED, right BLUE, double blink together
    const sub = cycleTime - 680;
    const flash = (sub % 210) < 150 ? 1.0 : 0.0;
    leftVisible = flash;
    rightVisible = flash;
    leftColor = 1.0;
    rightColor = 0.0;
  } else {
    // Stage D: Both briefly disappear
    leftVisible = 0.0;
    rightVisible = 0.0;
    leftColor = 1.0;
    rightColor = 0.0;
  }

  return {
    leftVisible,
    rightVisible,
    leftColor,
    rightColor,
    isFinished: false,
  };
}

export interface CuriosityEvent {
  startTime: number;
  targetLeft: { x: number; y: number };
  targetRight: { x: number; y: number };
  delayLeft: number;
  delayRight: number;
  moveDurLeft: number;
  moveDurRight: number;
  holdDur: number;
  returnDurLeft: number;
  returnDurRight: number;
  totalDur: number;
  willBlink: boolean;
  isDoubleBlink?: boolean;
  anticipateLeft?: { x: number; y: number };
  anticipateRight?: { x: number; y: number };
}

export function createCuriosityEvent(now: number, rng: SeededPRNG): CuriosityEvent {
  const isCoordinated = rng.next() > 0.3; // 70% coordinated glance, 30% asymmetric/independent
  const followDelay = rng.range(80, 160);
  const holdDur = rng.range(350, 900);
  const willBlink = rng.next() < 0.65; // ~65% natural blink on recentering
  const isDoubleBlink = willBlink && rng.next() < 0.20; // ~20% of post-curiosity blinks are double

  let targetLeft = { x: 0, y: 0 };
  let targetRight = { x: 0, y: 0 };
  let delayLeft = 0;
  let delayRight = 0;
  const moveDurLeft = rng.range(140, 260);
  const moveDurRight = rng.range(140, 260);
  const returnDurLeft = rng.range(260, 420);
  const returnDurRight = rng.range(260, 420);

  if (isCoordinated) {
    // Both eyes glance in a general direction: Left or Right with subtle elevation/depression
    const dirX = rng.next() > 0.5 ? 1 : -1;
    const magX = rng.range(0.60, 0.95); // High glance magnitude within 8-12% displacement limit
    const magY = rng.range(-0.35, 0.40);
    const baseX = dirX * magX;

    // Asymmetric delay: leading eye starts immediately, following eye follows after followDelay
    if (dirX > 0) {
      delayLeft = followDelay;
      delayRight = 0;
    } else {
      delayLeft = 0;
      delayRight = followDelay;
    }

    // Subtle natural vergence / difference between eyes so they feel organic
    targetLeft = {
      x: Math.max(-1.0, Math.min(1.0, baseX + rng.range(-0.06, 0.06))),
      y: Math.max(-1.0, Math.min(1.0, magY + rng.range(-0.04, 0.04))),
    };
    targetRight = {
      x: Math.max(-1.0, Math.min(1.0, baseX + rng.range(-0.06, 0.06))),
      y: Math.max(-1.0, Math.min(1.0, magY + rng.range(-0.04, 0.04))),
    };
  } else {
    // Asymmetric / independent glance (e.g. slight curiosity vergence or independent focal glance)
    const style = rng.next();
    if (style < 0.5) {
      // Slight upward-inward curious focus
      targetLeft = { x: rng.range(0.20, 0.50), y: rng.range(0.30, 0.60) };
      targetRight = { x: rng.range(-0.50, -0.20), y: rng.range(0.25, 0.55) };
      delayLeft = 0;
      delayRight = followDelay;
    } else {
      // One eye glances up-out while the other glances gently sideways
      const side = rng.next() > 0.5 ? 1 : -1;
      targetLeft = { x: side * rng.range(0.50, 0.85), y: rng.range(0.20, 0.55) };
      targetRight = { x: side * rng.range(0.20, 0.55), y: rng.range(-0.15, 0.25) };
      delayLeft = side < 0 ? 0 : followDelay;
      delayRight = side > 0 ? 0 : followDelay;
    }
  }

  // Small anticipatory counter-shift (Refinement 04)
  const anticipateLeft = { x: -targetLeft.x * 0.06, y: -targetLeft.y * 0.06 };
  const anticipateRight = { x: -targetRight.x * 0.06, y: -targetRight.y * 0.06 };

  const endLeft = delayLeft + moveDurLeft + holdDur + returnDurLeft;
  const endRight = delayRight + moveDurRight + holdDur + returnDurRight;
  const totalDur = Math.max(endLeft, endRight);

  return {
    startTime: now,
    targetLeft,
    targetRight,
    delayLeft,
    delayRight,
    moveDurLeft,
    moveDurRight,
    holdDur,
    returnDurLeft,
    returnDurRight,
    totalDur,
    willBlink,
    isDoubleBlink,
    anticipateLeft,
    anticipateRight,
  };
}

export function sampleEyeGaze(
  now: number,
  startTime: number,
  delay: number,
  moveDur: number,
  holdDur: number,
  returnDur: number,
  target: { x: number; y: number },
  microSaccade: { x: number; y: number },
  anticipate?: { x: number; y: number }
): { x: number; y: number } {
  const t = now - startTime - delay;
  if (t < 0) {
    // Follow delay: eye is waiting to follow, held at baseline micro-saccade
    return microSaccade;
  }
  // Subtle anticipatory micro-counter-shift during the very beginning (first 15% of movement)
  const tAnticipate = moveDur * 0.15;
  if (anticipate && t < tAnticipate) {
    const p = t / tAnticipate;
    const factor = Math.sin(p * Math.PI);
    return {
      x: microSaccade.x + anticipate.x * factor,
      y: microSaccade.y + anticipate.y * factor,
    };
  }
  if (t < moveDur) {
    const progress = Math.min(1.0, t / moveDur);
    const factor = easeOutBack(progress, 1.15);
    return {
      x: microSaccade.x * (1.0 - progress) + target.x * factor,
      y: microSaccade.y * (1.0 - progress) + target.y * factor,
    };
  }
  if (t < moveDur + holdDur) {
    // Intentional hold pose with delicate physical micro-settle
    const holdElapsed = t - moveDur;
    const settleDur = 65;
    if (holdElapsed < settleDur) {
      const p = holdElapsed / settleDur;
      const settleDamp = Math.cos(p * Math.PI * 0.5) * 0.02;
      return {
        x: target.x * (1.0 + settleDamp),
        y: target.y * (1.0 + settleDamp),
      };
    }
    return target;
  }
  if (t < moveDur + holdDur + returnDur) {
    const progress = Math.min(1.0, (t - (moveDur + holdDur)) / returnDur);
    const factor = 1.0 - easeOutCubic(progress);
    return {
      x: target.x * factor + microSaccade.x * (1.0 - factor),
      y: target.y * factor + microSaccade.y * (1.0 - factor),
    };
  }
  // Settled back to rest
  return microSaccade;
}

function createShader(gl: WebGLRenderingContext, type: number, source: string): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error('Shader compile error:', gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

export const EyeCanvas: React.FC<EyeCanvasProps> = ({
  expression = 'idle',
  isBlinking = false,
  isWinkingLeft = false,
  isWinkingRight = false,
  brightness = 1.0,
  className = '',
  isStandalone = false,
  onNudgeComplete,
  materialParams: propMaterialParams,
}) => {
  const storeMaterialParams = useDeviceStore((s) => s.materialParams);
  const materialParamsRef = useRef<MaterialParams>(propMaterialParams ?? storeMaterialParams ?? DEFAULT_MATERIAL_PARAMS);
  materialParamsRef.current = propMaterialParams ?? storeMaterialParams ?? DEFAULT_MATERIAL_PARAMS;

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const glRef = useRef<WebGLRenderingContext | null>(null);
  const programRef = useRef<WebGLProgram | null>(null);
  const animFrameRef = useRef<number | null>(null);

  // Expression transition state (Refinement 04: target-specific curves & interruption handling)
  const prevExprRef = useRef<number>(EXPR_TO_ID[expression] ?? 0);
  const currExprRef = useRef<number>(EXPR_TO_ID[expression] ?? 0);
  const targetExprRef = useRef<number>(EXPR_TO_ID[expression] ?? 0);
  const targetExprNameRef = useRef<BlinkExpressionType>(expression);
  const transitionStartRef = useRef<number>(0);

  // Autonomous and external blinking state (Refinement 04: independent left/right & double-blink)
  const storeBlink = useDeviceStore((s) => s.isBlinking);
  const storeDouble = useDeviceStore((s) => s.isDoubleBlink);
  const storeWinkL = useDeviceStore((s) => s.isWinkingLeft);
  const storeWinkR = useDeviceStore((s) => s.isWinkingRight);

  const activeBlinkRef = useRef<ActiveBlink | null>(null);
  const nextAutoBlinkRef = useRef<number>(Date.now() + 3000);
  const prevIsBlinkingRef = useRef<boolean>(false);
  const prevIsWinkLRef = useRef<boolean>(false);
  const prevIsWinkRRef = useRef<boolean>(false);

  // Idle Curiosity & Independent Gaze State (Refinement 01C / 04)
  const prngRef = useRef<SeededPRNG>(new SeededPRNG(1337));
  const curiosityEventRef = useRef<CuriosityEvent | null>(null);
  const nextCuriosityTimeRef = useRef<number>(Date.now() + 5000);
  const currentGazeLeftRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const currentGazeRightRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const microSaccadeRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const microSaccadeTargetRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const nextMicroSaccadeTimeRef = useRef<number>(Date.now() + 2500);

  // Nudge choreography state (Reference 5)
  const isNudgingRef = useRef<boolean>(expression === 'nudging');
  const nudgeStartRef = useRef<number>(0);
  const onNudgeCompleteRef = useRef(onNudgeComplete);
  onNudgeCompleteRef.current = onNudgeComplete;

  // Handle expression prop updates with seamless priority interruption
  useEffect(() => {
    targetExprNameRef.current = expression;

    if (expression !== 'idle') {
      curiosityEventRef.current = null;
    }

    if (expression === 'nudging') {
      isNudgingRef.current = true;
      nudgeStartRef.current = performance.now();
      return;
    }

    isNudgingRef.current = false;
    const newTarget = EXPR_TO_ID[expression] ?? 0;
    if (newTarget !== targetExprRef.current) {
      prevExprRef.current = currExprRef.current;
      targetExprRef.current = newTarget;
      transitionStartRef.current = performance.now();
    }
  }, [expression]);

  // Handle external blink / wink triggers
  const effectiveBlink = isBlinking || storeBlink;
  const effectiveWinkL = isWinkingLeft || storeWinkL;
  const effectiveWinkR = isWinkingRight || storeWinkR;

  useEffect(() => {
    if (effectiveBlink && !prevIsBlinkingRef.current) {
      activeBlinkRef.current = {
        startTime: performance.now(),
        duration: 175,
        isDouble: storeDouble,
        doubleGap: 85,
        doubleDuration: 130,
        leftOffset: 0,
        rightOffset: 10,
      };
    }
    prevIsBlinkingRef.current = effectiveBlink;
  }, [effectiveBlink, storeDouble]);

  useEffect(() => {
    if (effectiveWinkL && !prevIsWinkLRef.current) {
      activeBlinkRef.current = {
        startTime: performance.now(),
        duration: 180,
        isDouble: false,
        doubleGap: 0,
        doubleDuration: 0,
        leftOffset: 0,
        rightOffset: 0,
        isLeftOnly: true,
      };
    }
    prevIsWinkLRef.current = effectiveWinkL;
  }, [effectiveWinkL]);

  useEffect(() => {
    if (effectiveWinkR && !prevIsWinkRRef.current) {
      activeBlinkRef.current = {
        startTime: performance.now(),
        duration: 180,
        isDouble: false,
        doubleGap: 0,
        doubleDuration: 0,
        leftOffset: 0,
        rightOffset: 0,
        isRightOnly: true,
      };
    }
    prevIsWinkRRef.current = effectiveWinkR;
  }, [effectiveWinkR]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Initialize WebGL context safely (handles JSDOM / headless test runners)
    let gl: WebGLRenderingContext | null = null;
    try {
      gl = (canvas.getContext('webgl', { antialias: true, alpha: false }) ||
        canvas.getContext('experimental-webgl')) as WebGLRenderingContext | null;
    } catch {
      gl = null;
    }

    if (!gl) {
      return;
    }
    glRef.current = gl;

    // Build shader program
    const vs = createShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER_SOURCE);
    const fs = createShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER_SOURCE);
    if (!vs || !fs) return;

    const program = gl.createProgram();
    if (!program) return;
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error('Program link error:', gl.getProgramInfoLog(program));
      return;
    }
    programRef.current = program;
    gl.useProgram(program);

    // Fullscreen quad buffer
    const positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW
    );

    const posAttr = gl.getAttribLocation(program, 'a_position');
    gl.enableVertexAttribArray(posAttr);
    gl.vertexAttribPointer(posAttr, 2, gl.FLOAT, false, 0, 0);

    // Uniform locations
    const uResolution = gl.getUniformLocation(program, 'u_resolution');
    const uTime = gl.getUniformLocation(program, 'u_time');
    const uGazeLeft = gl.getUniformLocation(program, 'u_gazeLeft');
    const uGazeRight = gl.getUniformLocation(program, 'u_gazeRight');
    const uBlinkScaleY = gl.getUniformLocation(program, 'u_blinkScaleY');
    const uBlinkScaleLeftY = gl.getUniformLocation(program, 'u_blinkScaleLeftY');
    const uBlinkScaleRightY = gl.getUniformLocation(program, 'u_blinkScaleRightY');
    const uLeftEyeVisible = gl.getUniformLocation(program, 'u_leftEyeVisible');
    const uRightEyeVisible = gl.getUniformLocation(program, 'u_rightEyeVisible');
    const uLeftEyeColor = gl.getUniformLocation(program, 'u_leftEyeColor');
    const uRightEyeColor = gl.getUniformLocation(program, 'u_rightEyeColor');
    const uCurrExpr = gl.getUniformLocation(program, 'u_currExpr');
    const uTargetExpr = gl.getUniformLocation(program, 'u_targetExpr');
    const uTransition = gl.getUniformLocation(program, 'u_transition');
    const uBrightness = gl.getUniformLocation(program, 'u_brightness');
    const uEyeScale = gl.getUniformLocation(program, 'u_eyeScale');
    const uMatInnerEmission = gl.getUniformLocation(program, 'u_matInnerEmission');
    const uMatRimDiffusion = gl.getUniformLocation(program, 'u_matRimDiffusion');
    const uMatOuterHalo = gl.getUniformLocation(program, 'u_matOuterHalo');
    const uMatTextureContrast = gl.getUniformLocation(program, 'u_matTextureContrast');
    const uMatDepthVariation = gl.getUniformLocation(program, 'u_matDepthVariation');

    // Resize handler
    const updateSize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const width = canvas.clientWidth * dpr;
      const height = canvas.clientHeight * dpr;
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
        gl?.viewport(0, 0, width, height);
      }
    };
    updateSize();
    window.addEventListener('resize', updateSize);

    // Animation Loop
    let startTime = performance.now();
    const render = (now: number) => {
      updateSize();
      const elapsed = (now - startTime) * 0.001;
      const nowMs = Date.now();

      const prefersReducedMotion =
        typeof window !== 'undefined' &&
        window.matchMedia &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches;

      // 1. Manage Expression Morphing with Expression-Specific Choreography
      let transitionProgress = 1.0;
      if (transitionStartRef.current > 0) {
        const tElapsed = now - transitionStartRef.current;
        const motionConfig = EXPRESSION_MOTION[targetExprNameRef.current] ?? EXPRESSION_MOTION.idle;
        const duration = prefersReducedMotion ? 120 : motionConfig.duration;

        if (tElapsed < duration) {
          const rawProgress = Math.min(1.0, tElapsed / duration);
          transitionProgress = motionConfig.ease(rawProgress);
        } else {
          transitionProgress = 1.0;
          currExprRef.current = targetExprRef.current;
          prevExprRef.current = targetExprRef.current;
          transitionStartRef.current = 0;
        }
      }

      // 2. Manage Eyelid Closure Dynamics with Deterministic Ownership (Step 06)
      // Priority 1: Nudge Choreography (Reference 5 - highest priority)
      // Priority 2: Real-time Camera Eye Mirroring (Step 06)
      // Priority 3: Autonomous & Triggered Blinks (Refinement 04)
      const mirrorSample = eyeTrackingBridge.sample(now);
      let blinkScaleLeftY = 1.0;
      let blinkScaleRightY = 1.0;

      if (mirrorSample.isMirroringActive && !isNudgingRef.current) {
        // Direct, continuous camera eyelid mirroring
        blinkScaleLeftY = mirrorSample.scaleLeft;
        blinkScaleRightY = mirrorSample.scaleRight;
        // Suppress autonomous random blinking while mirroring active
        activeBlinkRef.current = null;
      } else {
        const nowMs = Date.now();
        if (!activeBlinkRef.current && nowMs >= nextAutoBlinkRef.current && !isNudgingRef.current) {
          const rng = prngRef.current;
          const isDouble = rng.next() < 0.15; // 15% restrained double blink
          const duration = rng.range(155, 195);
          const microOffset = rng.range(6, 12);
          const leftLead = rng.next() > 0.5;

          activeBlinkRef.current = {
            startTime: now,
            duration,
            isDouble,
            doubleGap: rng.range(80, 110),
            doubleDuration: rng.range(120, 145),
            leftOffset: leftLead ? 0 : microOffset,
            rightOffset: leftLead ? microOffset : 0,
          };
          nextAutoBlinkRef.current = nowMs + rng.range(3200, 6200);
        }

        const evaluated = evaluateActiveBlink(now, activeBlinkRef.current);
        blinkScaleLeftY = evaluated.scaleLeft;
        blinkScaleRightY = evaluated.scaleRight;

        if (evaluated.isDone && activeBlinkRef.current) {
          activeBlinkRef.current = null;
        }
      }

      // 3. Manage Idle Curiosity & Independent Gaze (Priority 4, respects reduced motion)
      const isNeutralIdle =
        targetExprRef.current === 0 &&
        currExprRef.current === 0 &&
        !isNudgingRef.current &&
        targetExprNameRef.current === 'idle' &&
        !prefersReducedMotion &&
        !mirrorSample.isMirroringActive;

      if (!isNeutralIdle) {
        // State Priority: Curiosity immediately cancels on non-idle expressions or nudges
        curiosityEventRef.current = null;
        if (targetExprRef.current === 3 || currExprRef.current === 3) {
          // Thinking: contemplative upward-right thoughtful gaze shift
          const thinkX = 0.28;
          const thinkY = 0.32;
          currentGazeLeftRef.current.x += (thinkX - currentGazeLeftRef.current.x) * 0.12;
          currentGazeLeftRef.current.y += (thinkY - currentGazeLeftRef.current.y) * 0.12;
          currentGazeRightRef.current.x += (thinkX - currentGazeRightRef.current.x) * 0.12;
          currentGazeRightRef.current.y += (thinkY - currentGazeRightRef.current.y) * 0.12;
        } else {
          // Other non-idle expressions: smoothly damp gaze back to center (0, 0)
          currentGazeLeftRef.current.x += (0 - currentGazeLeftRef.current.x) * 0.18;
          currentGazeLeftRef.current.y += (0 - currentGazeLeftRef.current.y) * 0.18;
          currentGazeRightRef.current.x += (0 - currentGazeRightRef.current.x) * 0.18;
          currentGazeRightRef.current.y += (0 - currentGazeRightRef.current.y) * 0.18;
        }
        nextCuriosityTimeRef.current = nowMs + 7000;
      } else {
        // Micro-saccades during rest
        if (nowMs >= nextMicroSaccadeTimeRef.current) {
          const rng = prngRef.current;
          microSaccadeTargetRef.current = {
            x: (rng.next() - 0.5) * 0.14,
            y: (rng.next() - 0.5) * 0.10,
          };
          nextMicroSaccadeTimeRef.current = nowMs + rng.range(2600, 4500);
        }
        microSaccadeRef.current.x += (microSaccadeTargetRef.current.x - microSaccadeRef.current.x) * 0.05;
        microSaccadeRef.current.y += (microSaccadeTargetRef.current.y - microSaccadeRef.current.y) * 0.05;

        // Trigger new curiosity glance event if idle interval elapsed
        if (!curiosityEventRef.current && nowMs >= nextCuriosityTimeRef.current) {
          curiosityEventRef.current = createCuriosityEvent(now, prngRef.current);
        }

        // Evaluate active curiosity glance or rest
        if (curiosityEventRef.current) {
          const ev = curiosityEventRef.current;
          const targetL = sampleEyeGaze(
            now,
            ev.startTime,
            ev.delayLeft,
            ev.moveDurLeft,
            ev.holdDur,
            ev.returnDurLeft,
            ev.targetLeft,
            microSaccadeRef.current,
            ev.anticipateLeft
          );
          const targetR = sampleEyeGaze(
            now,
            ev.startTime,
            ev.delayRight,
            ev.moveDurRight,
            ev.holdDur,
            ev.returnDurRight,
            ev.targetRight,
            microSaccadeRef.current,
            ev.anticipateRight
          );

          currentGazeLeftRef.current.x = targetL.x;
          currentGazeLeftRef.current.y = targetL.y;
          currentGazeRightRef.current.x = targetR.x;
          currentGazeRightRef.current.y = targetR.y;

          // Check event completion
          if (now >= ev.startTime + ev.totalDur) {
            const rng = prngRef.current;
            if (ev.willBlink && !activeBlinkRef.current) {
              // Natural blink after recentering
              const isDouble = !!ev.isDoubleBlink;
              const duration = rng.range(155, 185);
              const microOffset = rng.range(6, 12);
              const leftLead = rng.next() > 0.5;

              activeBlinkRef.current = {
                startTime: now,
                duration,
                isDouble,
                doubleGap: rng.range(80, 110),
                doubleDuration: rng.range(120, 140),
                leftOffset: leftLead ? 0 : microOffset,
                rightOffset: leftLead ? microOffset : 0,
              };
            }
            curiosityEventRef.current = null;
            nextCuriosityTimeRef.current = nowMs + rng.range(6000, 14000);
          }
        } else {
          // Resting at micro-saccade position
          currentGazeLeftRef.current.x += (microSaccadeRef.current.x - currentGazeLeftRef.current.x) * 0.08;
          currentGazeLeftRef.current.y += (microSaccadeRef.current.y - currentGazeLeftRef.current.y) * 0.08;
          currentGazeRightRef.current.x += (microSaccadeRef.current.x - currentGazeRightRef.current.x) * 0.08;
          currentGazeRightRef.current.y += (microSaccadeRef.current.y - currentGazeRightRef.current.y) * 0.08;
        }
      }

      // 4. Default Eye Visibility & Colors with smooth lockstep color morphing
      let leftVisible = 1.0;
      let rightVisible = 1.0;
      const prevRed = prevExprRef.current === 4 ? 1.0 : 0.0;
      const targetRed = targetExprRef.current === 4 ? 1.0 : 0.0;
      const activeColor = prevRed + (targetRed - prevRed) * transitionProgress;
      let leftColor = activeColor;
      let rightColor = activeColor;

      // 5. Nudge Choreography (Reference 5 Sequence - Priority 3)
      if (isNudgingRef.current) {
        const nElapsed = now - nudgeStartRef.current;
        const nudgeFrame = evaluateNudgeChoreography(nElapsed);
        if (!nudgeFrame.isFinished) {
          leftVisible = nudgeFrame.leftVisible;
          rightVisible = nudgeFrame.rightVisible;
          leftColor = nudgeFrame.leftColor;
          rightColor = nudgeFrame.rightColor;
        } else {
          isNudgingRef.current = false;
          if (onNudgeCompleteRef.current) {
            onNudgeCompleteRef.current();
          }
        }
      }

      // Eye scale: 1.0 for integrated demo mode (exact match to 1024x1024 source reference)
      // 1.8 for standalone landscape mode (comfortable full phone landscape presentation)
      const eyeScaleValue = isStandalone ? 1.8 : 1.0;

      // Upload uniforms
      gl.uniform2f(uResolution, canvas.width, canvas.height);
      gl.uniform1f(uTime, elapsed);
      gl.uniform2f(uGazeLeft, currentGazeLeftRef.current.x, currentGazeLeftRef.current.y);
      gl.uniform2f(uGazeRight, currentGazeRightRef.current.x, currentGazeRightRef.current.y);
      gl.uniform1f(uBlinkScaleY, (blinkScaleLeftY + blinkScaleRightY) * 0.5);
      if (uBlinkScaleLeftY) gl.uniform1f(uBlinkScaleLeftY, blinkScaleLeftY);
      if (uBlinkScaleRightY) gl.uniform1f(uBlinkScaleRightY, blinkScaleRightY);
      gl.uniform1f(uLeftEyeVisible, leftVisible);
      gl.uniform1f(uRightEyeVisible, rightVisible);
      gl.uniform1f(uLeftEyeColor, leftColor);
      gl.uniform1f(uRightEyeColor, rightColor);
      gl.uniform1i(uCurrExpr, prevExprRef.current);
      gl.uniform1i(uTargetExpr, targetExprRef.current);
      gl.uniform1f(uTransition, transitionProgress);
      gl.uniform1f(uBrightness, brightness);
      gl.uniform1f(uEyeScale, eyeScaleValue);

      // Upload material tuning parameters (Refinement 03)
      const mat = materialParamsRef.current;
      if (uMatInnerEmission) gl.uniform1f(uMatInnerEmission, mat.innerEmission);
      if (uMatRimDiffusion) gl.uniform1f(uMatRimDiffusion, mat.rimDiffusion);
      if (uMatOuterHalo) gl.uniform1f(uMatOuterHalo, mat.outerHalo);
      if (uMatTextureContrast) gl.uniform1f(uMatTextureContrast, mat.textureContrast);
      if (uMatDepthVariation) gl.uniform1f(uMatDepthVariation, mat.depthVariation);

      // Draw full screen quad
      gl.drawArrays(gl.TRIANGLES, 0, 6);

      animFrameRef.current = requestAnimationFrame(render);
    };

    animFrameRef.current = requestAnimationFrame(render);

    return () => {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
      window.removeEventListener('resize', updateSize);
    };
  }, [brightness, isStandalone]);

  return (
    <div
      className={`relative w-full h-full bg-black select-none overflow-hidden ${className}`}
      data-testid="eye-canvas-placeholder"
    >
      <canvas
        ref={canvasRef}
        className="w-full h-full block"
        data-testid="eye-webgl-canvas"
      />
      {/* Visual accessibility & state verification badge */}
      <div className="sr-only" aria-live="polite">
        Current Eye State: {expression}
      </div>
    </div>
  );
};
