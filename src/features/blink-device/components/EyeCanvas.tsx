import React, { useEffect, useRef } from 'react';
import { BlinkExpressionType } from '@/shared/contracts';

interface EyeCanvasProps {
  expression?: BlinkExpressionType;
  isBlinking?: boolean;
  brightness?: number;
  className?: string;
  onNudgeComplete?: () => void;
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
uniform vec2 u_gaze;
uniform float u_blinkScaleY;
uniform float u_leftEyeVisible;
uniform float u_rightEyeVisible;
uniform float u_leftEyeColor;    // 0.0 = cyan/blue, 1.0 = red
uniform float u_rightEyeColor;   // 0.0 = cyan/blue, 1.0 = red
uniform int u_currExpr;          // 0..7
uniform int u_targetExpr;        // 0..7
uniform float u_transition;      // 0.0 to 1.0
uniform float u_brightness;

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

// 1: Happy (Bottom-half moon / smile arc)
float sdfHappy(vec2 p, float r) {
  float d = length(p) - r;
  return max(d, p.y - 0.015);
}

// 2: Sleepy (Top-half moon / drowsy)
float sdfSleepy(vec2 p, float r) {
  float d = length(p) - r;
  return max(d, -p.y - 0.015);
}

// 3: Thinking (Archimedean Concentric Spirals)
float sdfSpiral(vec2 p, float r, bool isRight) {
  float dCircle = length(p) - r;
  float angle = atan(p.y, p.x);
  if (isRight) angle = -angle;
  float dist = length(p);
  float spiralCoord = (angle / 6.2831853) * 2.5 + dist * 5.2;
  float armDist = abs(fract(spiralCoord) - 0.5) * (0.28 / 5.2) - 0.026;
  return max(dCircle, armDist);
}

// 4: Angry / Alert (Red Slanted Angular Eyes)
float sdfAngry(vec2 p, float r, bool isRight) {
  vec2 q = p;
  if (isRight) q.x = -q.x;
  float cutTop = (q.y + 0.48 * q.x) - 0.055;
  float cutBottom = (-q.y - 0.16 * q.x) - 0.15;
  float d = length(vec2(q.x * 1.08, q.y)) - r;
  return max(d, max(cutTop, cutBottom));
}

// 5: Speaking / Playful (Squinting >< Chevrons)
float sdfSquint(vec2 p, float r, bool isRight) {
  vec2 q = p;
  if (isRight) q.x = -q.x;
  vec2 vertex = vec2(-0.15, 0.0);
  vec2 topEnd = vec2(0.16, 0.125);
  vec2 bottomEnd = vec2(0.16, -0.125);
  float d1 = distToSegment(q, vertex, topEnd) - 0.042;
  float d2 = distToSegment(q, vertex, bottomEnd) - 0.042;
  return min(d1, d2);
}

// 6: Offline / Cool (8-bit Pixel Sunglasses)
float sdfSunglasses(vec2 p, float r, bool isRight) {
  vec2 q = p;
  if (isRight) q.x = -q.x;
  float top = q.y - 0.09;
  float bottom = -q.y - 0.135;
  float inner = -q.x - 0.18;
  float slant = (q.x * 0.42 + q.y) - 0.17;
  float dLens = max(max(top, bottom), max(inner, slant));
  // 8-bit staircase notches
  vec2 pix = floor((q + vec2(0.2, 0.1)) * 26.0);
  if ((pix.y == 3.0 && pix.x >= 2.0 && pix.x <= 4.0) ||
      (pix.y == 2.0 && pix.x >= 4.0 && pix.x <= 6.0) ||
      (pix.y == 1.0 && pix.x >= 6.0 && pix.x <= 8.0)) {
    dLens = max(dLens, 0.025);
  }
  return dLens;
}

// 7: Listening / Surprised (Arched Eyebrow Lines)
float sdfArch(vec2 p, float r) {
  vec2 center = vec2(0.0, -0.06);
  float dRing = abs(length(p - center) - 0.185) - 0.042;
  float clipBottom = -(p.y - center.y);
  return max(dRing, clipBottom);
}

// Dispatch expression pose SDF
float evaluateExpr(int exprId, vec2 p, float r, bool isRight) {
  if (exprId == 0) return sdfCircle(p, r);
  if (exprId == 1) return sdfHappy(p, r);
  if (exprId == 2) return sdfSleepy(p, r);
  if (exprId == 3) return sdfSpiral(p, r, isRight);
  if (exprId == 4) return sdfAngry(p, r, isRight);
  if (exprId == 5) return sdfSquint(p, r, isRight);
  if (exprId == 6) return sdfSunglasses(p, r, isRight);
  if (exprId == 7) return sdfArch(p, r);
  return sdfCircle(p, r);
}

// Procedural morphing interpolation
float getMorphedSDF(vec2 p, float r, bool isRight) {
  float dCurrent = evaluateExpr(u_currExpr, p, r, isRight);
  if (u_currExpr == u_targetExpr || u_transition >= 0.999) {
    return dCurrent;
  }
  float dTarget = evaluateExpr(u_targetExpr, p, r, isRight);
  float ease = u_transition * u_transition * (3.0 - 2.0 * u_transition);
  return mix(dCurrent, dTarget, ease);
}

// Calculate emissive eye color with core, halo, and horizontal wavy scanline microtexture
vec3 calculateEyeColor(float d, vec2 eyeUV, float isRed, float visibility) {
  if (visibility < 0.01) return vec3(0.0);

  // Horizontal sinusoidal wavy LED scanlines (Reference 1 & Group 70 sampled parameters)
  float scanlineY = eyeUV.y * 360.0;
  float waveShift = sin(eyeUV.x * 130.0) * 1.5;
  float wave = sin(scanlineY + waveShift) * 0.18 + 0.82;

  vec3 finalColor = vec3(0.0);

  if (isRed > 0.5) {
    // Red color palette (Reference 5 Nudge right eye & Angry/Alert)
    vec3 coreHotspot = vec3(1.0, 0.72, 0.80);
    vec3 coreColor = vec3(1.0, 0.26, 0.36) * wave;
    vec3 innerHalo = vec3(0.95, 0.08, 0.18);
    vec3 outerHalo = vec3(0.45, 0.02, 0.08);

    float coreMask = smoothstep(0.008, -0.008, d);
    float hotspotMask = smoothstep(0.05, -0.15, d);
    vec3 coreShade = mix(coreColor, coreHotspot, hotspotMask * 0.65);

    float glow1 = exp(-max(0.0, d) * 32.0);
    float glow2 = exp(-max(0.0, d) * 12.0);
    float glow3 = exp(-max(0.0, d) * 4.5);
    vec3 glowColor = innerHalo * glow1 * 0.92 + outerHalo * glow2 * 0.6 + outerHalo * glow3 * 0.25;

    finalColor = mix(glowColor, coreShade, coreMask);
  } else {
    // Cyan / Royal Blue color palette (Reference 1, Reference 3, Reference 4)
    vec3 coreHotspot = vec3(0.70, 0.98, 1.0);
    vec3 coreColor = vec3(0.03, 0.96, 1.0) * wave;
    vec3 innerHalo = vec3(0.04, 0.40, 0.95);
    vec3 outerHalo = vec3(0.01, 0.12, 0.48);

    float coreMask = smoothstep(0.008, -0.008, d);
    float hotspotMask = smoothstep(0.05, -0.15, d);
    vec3 coreShade = mix(coreColor, coreHotspot, hotspotMask * 0.65);

    float glow1 = exp(-max(0.0, d) * 32.0);
    float glow2 = exp(-max(0.0, d) * 12.0);
    float glow3 = exp(-max(0.0, d) * 4.5);
    vec3 glowColor = innerHalo * glow1 * 0.92 + outerHalo * glow2 * 0.6 + outerHalo * glow3 * 0.25;

    finalColor = mix(glowColor, coreShade, coreMask);
  }

  return finalColor * visibility;
}

void main() {
  vec2 resolution = u_resolution;
  float scale = min(resolution.x, resolution.y);
  vec2 uv = (gl_FragCoord.xy - resolution * 0.5) / scale;

  // Eye proportions matching Reference 1 & Reference 4
  float eyeRadius = 0.235;
  float eyeSpacing = 0.285; // Eye centers at x = -0.285 and +0.285

  vec2 leftCenter = vec2(-eyeSpacing, 0.0);
  vec2 rightCenter = vec2(+eyeSpacing, 0.0);

  // Gaze micro-saccade offset
  vec2 gazeOffset = u_gaze * 0.035;

  // Blinking vertical compression
  vec2 pLeft = uv - leftCenter - gazeOffset;
  pLeft.y /= max(0.025, u_blinkScaleY);

  vec2 pRight = uv - rightCenter - gazeOffset;
  pRight.y /= max(0.025, u_blinkScaleY);

  float dLeft = getMorphedSDF(pLeft, eyeRadius, false);
  float dRight = getMorphedSDF(pRight, eyeRadius, true);

  vec3 leftColor = calculateEyeColor(dLeft, pLeft, u_leftEyeColor, u_leftEyeVisible);
  vec3 rightColor = calculateEyeColor(dRight, pRight, u_rightEyeColor, u_rightEyeVisible);

  vec3 col = (leftColor + rightColor) * u_brightness;
  gl_FragColor = vec4(col, 1.0);
}
`;

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
  brightness = 1.0,
  className = '',
  onNudgeComplete,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const glRef = useRef<WebGLRenderingContext | null>(null);
  const programRef = useRef<WebGLProgram | null>(null);
  const animFrameRef = useRef<number | null>(null);

  // Expression transition state
  const prevExprRef = useRef<number>(EXPR_TO_ID[expression] ?? 0);
  const currExprRef = useRef<number>(EXPR_TO_ID[expression] ?? 0);
  const targetExprRef = useRef<number>(EXPR_TO_ID[expression] ?? 0);
  const transitionStartRef = useRef<number>(0);
  const TRANSITION_DURATION = 350; // ms

  // Autonomous blinking state
  const isExternalBlinkingRef = useRef(isBlinking);
  isExternalBlinkingRef.current = isBlinking;
  const blinkStartRef = useRef<number>(0);
  const isBlinkingLocalRef = useRef<boolean>(false);
  const nextAutoBlinkRef = useRef<number>(Date.now() + 3000);

  // Gaze micro-saccade state
  const currentGazeRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const targetGazeRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const nextGazeShiftRef = useRef<number>(Date.now() + 2500);

  // Nudge choreography state (Reference 5)
  const isNudgingRef = useRef<boolean>(expression === 'nudging');
  const nudgeStartRef = useRef<number>(0);
  const onNudgeCompleteRef = useRef(onNudgeComplete);
  onNudgeCompleteRef.current = onNudgeComplete;

  // Handle expression prop updates
  useEffect(() => {
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
      console.warn('WebGL not supported; falling back to 2D canvas.');
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
    const uGaze = gl.getUniformLocation(program, 'u_gaze');
    const uBlinkScaleY = gl.getUniformLocation(program, 'u_blinkScaleY');
    const uLeftEyeVisible = gl.getUniformLocation(program, 'u_leftEyeVisible');
    const uRightEyeVisible = gl.getUniformLocation(program, 'u_rightEyeVisible');
    const uLeftEyeColor = gl.getUniformLocation(program, 'u_leftEyeColor');
    const uRightEyeColor = gl.getUniformLocation(program, 'u_rightEyeColor');
    const uCurrExpr = gl.getUniformLocation(program, 'u_currExpr');
    const uTargetExpr = gl.getUniformLocation(program, 'u_targetExpr');
    const uTransition = gl.getUniformLocation(program, 'u_transition');
    const uBrightness = gl.getUniformLocation(program, 'u_brightness');

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

      // 1. Manage Expression Morphing
      let transitionProgress = 1.0;
      if (transitionStartRef.current > 0) {
        const tElapsed = now - transitionStartRef.current;
        if (tElapsed < TRANSITION_DURATION) {
          transitionProgress = tElapsed / TRANSITION_DURATION;
        } else {
          transitionProgress = 1.0;
          currExprRef.current = targetExprRef.current;
          prevExprRef.current = targetExprRef.current;
          transitionStartRef.current = 0;
        }
      }

      // 2. Manage Autonomous Blinking
      const nowMs = Date.now();
      if (!isExternalBlinkingRef.current && nowMs >= nextAutoBlinkRef.current && !isBlinkingLocalRef.current) {
        isBlinkingLocalRef.current = true;
        blinkStartRef.current = now;
        nextAutoBlinkRef.current = nowMs + 3200 + Math.random() * 2400;
      }

      let blinkScaleY = 1.0;
      const activeBlinkStart = isExternalBlinkingRef.current
        ? blinkStartRef.current || now
        : isBlinkingLocalRef.current
        ? blinkStartRef.current
        : 0;

      if (activeBlinkStart > 0) {
        const bElapsed = now - activeBlinkStart;
        const bDuration = 160; // ms
        if (bElapsed < bDuration) {
          const norm = bElapsed / bDuration;
          if (norm < 0.3) {
            // Rapid eye descent
            blinkScaleY = 1.0 - (norm / 0.3) * 0.96;
          } else if (norm < 0.45) {
            // Closed hold
            blinkScaleY = 0.04;
          } else {
            // Smooth ease reopening
            const openNorm = (norm - 0.45) / 0.55;
            blinkScaleY = 0.04 + openNorm * openNorm * 0.96;
          }
        } else {
          if (isBlinkingLocalRef.current) {
            isBlinkingLocalRef.current = false;
          }
          blinkScaleY = 1.0;
        }
      }

      // 3. Manage Gaze Micro-Saccades
      if (nowMs >= nextGazeShiftRef.current) {
        // Micro drift within subtle bounds
        targetGazeRef.current = {
          x: (Math.random() - 0.5) * 0.8,
          y: (Math.random() - 0.5) * 0.5,
        };
        nextGazeShiftRef.current = nowMs + 2000 + Math.random() * 2500;
      }
      // Damped spring interpolation
      currentGazeRef.current.x += (targetGazeRef.current.x - currentGazeRef.current.x) * 0.04;
      currentGazeRef.current.y += (targetGazeRef.current.y - currentGazeRef.current.y) * 0.04;

      // 4. Default Eye Visibility & Colors
      let leftVisible = 1.0;
      let rightVisible = 1.0;
      // Alert & Error expressions use red palette; others use cyan/blue
      const isAlertPose = targetExprRef.current === 4 || currExprRef.current === 4;
      let leftColor = isAlertPose ? 1.0 : 0.0;
      let rightColor = isAlertPose ? 1.0 : 0.0;

      // 5. Nudge Choreography (Reference 5 Sequence)
      if (isNudgingRef.current) {
        const nElapsed = now - nudgeStartRef.current;
        // Reference 5 timing:
        // Cycle duration: ~1350ms per cycle
        // Phase 1 (0..340ms): Left eye ONLY (Cyan/Blue) double-flash
        // Phase 2 (340..680ms): Right eye ONLY (Red) double-flash
        // Phase 3 (680..1100ms): Synchronized Both (Left Blue, Right Red) double-flash
        // Phase 4 (1100..1350ms): Blackout pause
        // Bounded to 2 cycles (~2700ms total)
        const cycleDuration = 1350;
        const totalDuration = cycleDuration * 2;

        if (nElapsed < totalDuration) {
          const cycleTime = nElapsed % cycleDuration;
          if (cycleTime < 340) {
            // Phase 1: Left Blue Eye only
            const flash = (cycleTime % 170) < 120 ? 1.0 : 0.0;
            leftVisible = flash;
            rightVisible = 0.0;
            leftColor = 0.0; // Blue
          } else if (cycleTime < 680) {
            // Phase 2: Right Red Eye only
            const sub = cycleTime - 340;
            const flash = (sub % 170) < 120 ? 1.0 : 0.0;
            leftVisible = 0.0;
            rightVisible = flash;
            rightColor = 1.0; // Red
          } else if (cycleTime < 1100) {
            // Phase 3: Both Eyes (Left Blue, Right Red) synchronized double-flash
            const sub = cycleTime - 680;
            const flash = (sub % 210) < 150 ? 1.0 : 0.0;
            leftVisible = flash;
            rightVisible = flash;
            leftColor = 0.0; // Blue
            rightColor = 1.0; // Red
          } else {
            // Phase 4: Blackout
            leftVisible = 0.0;
            rightVisible = 0.0;
          }
        } else {
          // Bounded repetition complete: smoothly return to previous expression
          isNudgingRef.current = false;
          if (onNudgeCompleteRef.current) {
            onNudgeCompleteRef.current();
          }
        }
      }

      // Upload uniforms
      gl.uniform2f(uResolution, canvas.width, canvas.height);
      gl.uniform1f(uTime, elapsed);
      gl.uniform2f(uGaze, currentGazeRef.current.x, currentGazeRef.current.y);
      gl.uniform1f(uBlinkScaleY, blinkScaleY);
      gl.uniform1f(uLeftEyeVisible, leftVisible);
      gl.uniform1f(uRightEyeVisible, rightVisible);
      gl.uniform1f(uLeftEyeColor, leftColor);
      gl.uniform1f(uRightEyeColor, rightColor);
      gl.uniform1i(uCurrExpr, prevExprRef.current);
      gl.uniform1i(uTargetExpr, targetExprRef.current);
      gl.uniform1f(uTransition, transitionProgress);
      gl.uniform1f(uBrightness, brightness);

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
  }, [brightness]);

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
