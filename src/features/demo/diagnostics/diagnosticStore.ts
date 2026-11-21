/**
 * Blink Integrated Demo Diagnostics & Issue Center Store
 *
 * Centralizes camera, Firebase, rendering, browser, and sustained-performance
 * issues with strict deduplication, cooldown throttling, credential/stack-trace
 * sanitization, automatic resolution, and session-scoped resolved history.
 */

import { create } from 'zustand';

export type DiagnosticSeverity = 'INFO' | 'WARNING' | 'ERROR';
export type DiagnosticCategory = 'camera' | 'firebase' | 'voice' | 'app' | 'performance';

export type DiagnosticActionType =
  | 'enable_camera'
  | 'retry_connection'
  | 'rejoin_room'
  | 'check_permissions'
  | 'reload_rendering'
  | 'retry_voice'
  | 'end_voice'
  | 'enable_voice_preview';

export type DiagnosticCode =
  // CAMERA
  | 'CAMERA_PERMISSION_REQUIRED'
  | 'CAMERA_PERMISSION_DENIED'
  | 'CAMERA_NOT_FOUND'
  | 'CAMERA_IN_USE'
  | 'CAMERA_STREAM_INTERRUPTED'
  | 'MEDIAPIPE_INIT_FAILED'
  | 'FACE_OUT_OF_FRAME'
  // FIREBASE
  | 'FIREBASE_AUTH_FAILED'
  | 'FIREBASE_UNCONFIGURED'
  | 'FIREBASE_ROOM_INVALID'
  | 'FIREBASE_PAIRING_FAILED'
  | 'FIREBASE_PERMISSION_DENIED'
  | 'FIREBASE_DISCONNECTED'
  | 'DEVICE_PRESENCE_MISSING'
  | 'TELEMETRY_STALE'
  // VOICE
  | 'VOICE_MIC_PERMISSION_DENIED'
  | 'VOICE_MIC_NOT_FOUND'
  | 'VOICE_MIC_INTERRUPTED'
  | 'VOICE_BACKEND_UNREACHABLE'
  | 'VOICE_AUTH_FAILED'
  | 'VOICE_QUOTA_EXCEEDED'
  | 'VOICE_TRANSPORT_DISCONNECTED'
  | 'VOICE_AUDIO_PLAYBACK_FAILED'
  | 'VOICE_BROWSER_UNSUPPORTED'
  | 'VOICE_SESSION_TERMINATED'
  // APP
  | 'WEBGL_UNAVAILABLE'
  | 'WEBGL_CONTEXT_LOST'
  | 'ASSET_LOAD_FAILED'
  | 'BROWSER_UNSUPPORTED'
  | 'COMMAND_REJECTED'
  // PERFORMANCE
  | 'SUSTAINED_LOW_FPS';

export interface DiagnosticIssue {
  id: string;
  code: DiagnosticCode;
  category: DiagnosticCategory;
  severity: DiagnosticSeverity;
  title: string;
  explanation: string;
  recommendedAction: string;
  actionType?: DiagnosticActionType;
  actionLabel?: string;
  firstSeenAt: number;
  lastSeenAt: number;
  occurrenceCount: number;
  resolvedAt?: number;
}

export interface DiagnosticTemplate {
  code: DiagnosticCode;
  category: DiagnosticCategory;
  severity: DiagnosticSeverity;
  title: string;
  explanation: string;
  recommendedAction: string;
  actionType?: DiagnosticActionType;
  actionLabel?: string;
}

export const DIAGNOSTIC_CATALOG: Record<DiagnosticCode, DiagnosticTemplate> = {
  // CAMERA
  CAMERA_PERMISSION_REQUIRED: {
    code: 'CAMERA_PERMISSION_REQUIRED',
    category: 'camera',
    severity: 'INFO',
    title: 'Camera access needed for live mirroring',
    explanation:
      'Blink is running in standby with autonomous eyes. Grant camera access to mirror your eyelids and stream live blink telemetry.',
    recommendedAction: 'Enable your webcam when ready. Video stays strictly in browser memory.',
    actionType: 'enable_camera',
    actionLabel: 'Enable camera',
  },
  CAMERA_PERMISSION_DENIED: {
    code: 'CAMERA_PERMISSION_DENIED',
    category: 'camera',
    severity: 'ERROR',
    title: 'Camera permission denied',
    explanation:
      'Your browser blocked camera access, so Blink cannot mirror your eyes or measure live blinks.',
    recommendedAction:
      'Allow camera access for this site in your browser address bar, then retry.',
    actionType: 'check_permissions',
    actionLabel: 'Check permissions',
  },
  CAMERA_NOT_FOUND: {
    code: 'CAMERA_NOT_FOUND',
    category: 'camera',
    severity: 'ERROR',
    title: 'No webcam detected',
    explanation:
      'No compatible camera device was found on this system.',
    recommendedAction:
      'Connect or enable a webcam, then try activating the camera again.',
    actionType: 'enable_camera',
    actionLabel: 'Retry camera',
  },
  CAMERA_IN_USE: {
    code: 'CAMERA_IN_USE',
    category: 'camera',
    severity: 'ERROR',
    title: 'Camera unavailable or in use',
    explanation:
      'Another application or browser tab appears to be holding exclusive access to your camera.',
    recommendedAction:
      'Close other video apps or tabs using the camera, then retry.',
    actionType: 'enable_camera',
    actionLabel: 'Retry camera',
  },
  CAMERA_STREAM_INTERRUPTED: {
    code: 'CAMERA_STREAM_INTERRUPTED',
    category: 'camera',
    severity: 'WARNING',
    title: 'Camera stream interrupted',
    explanation:
      'The active video track ended unexpectedly or your camera was disconnected.',
    recommendedAction: 'Reconnect your camera or click below to restart live tracking.',
    actionType: 'enable_camera',
    actionLabel: 'Restart camera',
  },
  MEDIAPIPE_INIT_FAILED: {
    code: 'MEDIAPIPE_INIT_FAILED',
    category: 'camera',
    severity: 'ERROR',
    title: 'Face tracking model unavailable',
    explanation:
      'Blink could not initialize the on-device facial landmark model.',
    recommendedAction:
      'Verify network connectivity for model assets and retry camera initialization.',
    actionType: 'enable_camera',
    actionLabel: 'Retry tracking',
  },
  FACE_OUT_OF_FRAME: {
    code: 'FACE_OUT_OF_FRAME',
    category: 'camera',
    severity: 'INFO',
    title: 'Face temporarily outside frame',
    explanation:
      'Blink paused blink-rate observation while your face is out of camera view.',
    recommendedAction:
      'Center your face in good lighting; tracking resumes automatically without refreshing.',
  },

  // FIREBASE
  FIREBASE_AUTH_FAILED: {
    code: 'FIREBASE_AUTH_FAILED',
    category: 'firebase',
    severity: 'ERROR',
    title: 'Authentication unavailable',
    explanation:
      'Blink could not establish an authenticated session for realtime cloud rooms.',
    recommendedAction: 'Retry connecting to restore authenticated realtime synchronization.',
    actionType: 'retry_connection',
    actionLabel: 'Retry connection',
  },
  FIREBASE_UNCONFIGURED: {
    code: 'FIREBASE_UNCONFIGURED',
    category: 'firebase',
    severity: 'INFO',
    title: 'Local integrated session active',
    explanation:
      'Cloud Firebase credentials are not configured in this build, so Blink is synchronizing Device and Elevated directly in this browser.',
    recommendedAction:
      'Enable your camera to stream real local blink telemetry, or configure Firebase env vars for cross-device pairing.',
  },
  FIREBASE_ROOM_INVALID: {
    code: 'FIREBASE_ROOM_INVALID',
    category: 'firebase',
    severity: 'WARNING',
    title: 'Invalid room code',
    explanation: 'The requested room code is empty or does not match the expected room format.',
    recommendedAction: 'Rejoin the default integrated room or enter a valid room code.',
    actionType: 'rejoin_room',
    actionLabel: 'Rejoin room',
  },
  FIREBASE_PAIRING_FAILED: {
    code: 'FIREBASE_PAIRING_FAILED',
    category: 'firebase',
    severity: 'ERROR',
    title: 'Room pairing failed',
    explanation:
      'Blink could not create or join the shared realtime room.',
    recommendedAction: 'Retry joining the room to re-establish synchronization.',
    actionType: 'rejoin_room',
    actionLabel: 'Rejoin room',
  },
  FIREBASE_PERMISSION_DENIED: {
    code: 'FIREBASE_PERMISSION_DENIED',
    category: 'firebase',
    severity: 'ERROR',
    title: 'Room access restricted',
    explanation:
      'This account does not have permission to access the selected room.',
    recommendedAction: 'Start a fresh integrated session room or use a valid pairing invitation.',
    actionType: 'rejoin_room',
    actionLabel: 'Create fresh room',
  },
  FIREBASE_DISCONNECTED: {
    code: 'FIREBASE_DISCONNECTED',
    category: 'firebase',
    severity: 'WARNING',
    title: 'Realtime connection interrupted',
    explanation:
      'The connection between Blink Device and Elevated was interrupted.',
    recommendedAction: 'Retry connection to restore live updates.',
    actionType: 'retry_connection',
    actionLabel: 'Retry connection',
  },
  DEVICE_PRESENCE_MISSING: {
    code: 'DEVICE_PRESENCE_MISSING',
    category: 'firebase',
    severity: 'WARNING',
    title: 'Device presence missing',
    explanation:
      'Elevated is connected to the room, but no active Blink Device presence is detected yet.',
    recommendedAction: 'Reconnect the integrated session to publish device presence.',
    actionType: 'retry_connection',
    actionLabel: 'Reconnect device',
  },
  TELEMETRY_STALE: {
    code: 'TELEMETRY_STALE',
    category: 'firebase',
    severity: 'WARNING',
    title: 'Telemetry stream stale',
    explanation:
      'No fresh telemetry payload has arrived within the last 3.5 seconds.',
    recommendedAction: 'Reconnect the session to resume fresh realtime updates.',
    actionType: 'retry_connection',
    actionLabel: 'Retry connection',
  },

  // VOICE
  VOICE_MIC_PERMISSION_DENIED: {
    code: 'VOICE_MIC_PERMISSION_DENIED',
    category: 'voice',
    severity: 'ERROR',
    title: 'Microphone permission denied',
    explanation:
      'Browser microphone access is blocked, so Blink cannot listen to your voice.',
    recommendedAction:
      'Allow microphone access for this site in your browser address bar, then retry.',
    actionType: 'retry_voice',
    actionLabel: 'Retry voice',
  },
  VOICE_MIC_NOT_FOUND: {
    code: 'VOICE_MIC_NOT_FOUND',
    category: 'voice',
    severity: 'ERROR',
    title: 'No microphone detected',
    explanation: 'No compatible audio input device was found on this system.',
    recommendedAction: 'Connect or enable a microphone, then try talking to Blink again.',
    actionType: 'retry_voice',
    actionLabel: 'Retry voice',
  },
  VOICE_MIC_INTERRUPTED: {
    code: 'VOICE_MIC_INTERRUPTED',
    category: 'voice',
    severity: 'WARNING',
    title: 'Microphone capture interrupted',
    explanation: 'The active microphone stream ended or your audio device was disconnected.',
    recommendedAction: 'Check your microphone connection and restart voice mode.',
    actionType: 'retry_voice',
    actionLabel: 'Retry voice',
  },
  VOICE_BACKEND_UNREACHABLE: {
    code: 'VOICE_BACKEND_UNREACHABLE',
    category: 'voice',
    severity: 'ERROR',
    title: 'Voice service unreachable',
    explanation:
      'The live Gemini voice token backend is not configured or could not be reached.',
    recommendedAction:
      'Verify the voice token endpoint or launch clearly labeled simulated preview mode.',
    actionType: 'enable_voice_preview',
    actionLabel: 'Try preview mode',
  },
  VOICE_AUTH_FAILED: {
    code: 'VOICE_AUTH_FAILED',
    category: 'voice',
    severity: 'ERROR',
    title: 'Voice authorization unavailable',
    explanation:
      'Blink could not obtain a short-lived ephemeral voice token for this session.',
    recommendedAction: 'Sign in with a verified session or retry voice initialization.',
    actionType: 'retry_voice',
    actionLabel: 'Retry voice',
  },
  VOICE_QUOTA_EXCEEDED: {
    code: 'VOICE_QUOTA_EXCEEDED',
    category: 'voice',
    severity: 'WARNING',
    title: 'Voice billing or rate limit reached',
    explanation:
      'Gemini Live rejected the session due to depleted billing credits or rate limits on the API key project.',
    recommendedAction:
      'Check billing/credits in AI Studio for the API key project, or use Preview mode.',
    actionType: 'enable_voice_preview',
    actionLabel: 'Try preview mode',
  },
  VOICE_TRANSPORT_DISCONNECTED: {
    code: 'VOICE_TRANSPORT_DISCONNECTED',
    category: 'voice',
    severity: 'WARNING',
    title: 'Voice connection lost',
    explanation: 'The realtime voice transport closed unexpectedly.',
    recommendedAction: 'Retry to establish a new voice session or return to Eye Mode.',
    actionType: 'retry_voice',
    actionLabel: 'Reconnect voice',
  },
  VOICE_AUDIO_PLAYBACK_FAILED: {
    code: 'VOICE_AUDIO_PLAYBACK_FAILED',
    category: 'voice',
    severity: 'WARNING',
    title: 'Audio playback unavailable',
    explanation: 'The browser blocked or could not initialize speaker audio output.',
    recommendedAction: 'Ensure audio output is unmuted and retry from a click gesture.',
    actionType: 'retry_voice',
    actionLabel: 'Retry voice',
  },
  VOICE_BROWSER_UNSUPPORTED: {
    code: 'VOICE_BROWSER_UNSUPPORTED',
    category: 'voice',
    severity: 'ERROR',
    title: 'Browser voice API unsupported',
    explanation:
      'Live voice requires HTTPS (or localhost) with Web Audio and MediaDevices support.',
    recommendedAction: 'Open Blink in a modern browser over HTTPS or localhost.',
  },
  VOICE_SESSION_TERMINATED: {
    code: 'VOICE_SESSION_TERMINATED',
    category: 'voice',
    severity: 'WARNING',
    title: 'Voice session ended unexpectedly',
    explanation: 'The active voice conversation terminated before completion.',
    recommendedAction: 'Start a fresh conversation when ready.',
    actionType: 'retry_voice',
    actionLabel: 'Retry voice',
  },

  // APP
  WEBGL_UNAVAILABLE: {
    code: 'WEBGL_UNAVAILABLE',
    category: 'app',
    severity: 'ERROR',
    title: 'WebGL rendering unavailable',
    explanation:
      'This browser could not create a hardware-accelerated WebGL context for Blink eyes.',
    recommendedAction: 'Enable hardware acceleration in your browser or reload the renderer.',
    actionType: 'reload_rendering',
    actionLabel: 'Reload rendering',
  },
  WEBGL_CONTEXT_LOST: {
    code: 'WEBGL_CONTEXT_LOST',
    category: 'app',
    severity: 'ERROR',
    title: 'Graphics context interrupted',
    explanation: 'The WebGL eye renderer lost its GPU context.',
    recommendedAction: 'Reload the rendering canvas to restore smooth eye animation.',
    actionType: 'reload_rendering',
    actionLabel: 'Reload rendering',
  },
  ASSET_LOAD_FAILED: {
    code: 'ASSET_LOAD_FAILED',
    category: 'app',
    severity: 'WARNING',
    title: 'Device bezel asset failed to load',
    explanation: 'The static physical bezel overlay could not be loaded; WebGL eyes remain active.',
    recommendedAction: 'Reload the renderer to retry loading visual assets.',
    actionType: 'reload_rendering',
    actionLabel: 'Reload rendering',
  },
  BROWSER_UNSUPPORTED: {
    code: 'BROWSER_UNSUPPORTED',
    category: 'app',
    severity: 'ERROR',
    title: 'Browser camera API unsupported',
    explanation:
      'Live eye tracking requires HTTPS (or localhost) and a modern browser supporting MediaDevices.',
    recommendedAction: 'Open Blink in Chrome, Edge, or Safari over HTTPS or localhost.',
  },
  COMMAND_REJECTED: {
    code: 'COMMAND_REJECTED',
    category: 'app',
    severity: 'WARNING',
    title: 'Device command was not applied',
    explanation:
      'A remote device command was rejected by the active room or device state.',
    recommendedAction: 'Verify the device is connected and retry the action.',
    actionType: 'retry_connection',
    actionLabel: 'Check connection',
  },

  // PERFORMANCE
  SUSTAINED_LOW_FPS: {
    code: 'SUSTAINED_LOW_FPS',
    category: 'performance',
    severity: 'WARNING',
    title: 'Reduced rendering frame rate',
    explanation:
      'The eye canvas sustained a low frame rate for several seconds. Motion intensity has been kept lightweight.',
    recommendedAction:
      'Close heavy background tabs or enable reduced motion if running on low power.',
  },
};

/**
 * Strips stack traces, API keys, auth tokens, and Firebase URLs/credentials
 * so raw technical internals are never exposed in user-facing diagnostics.
 */
export function sanitizeDiagnosticText(input: string): string {
  if (!input) return '';
  return input
    .split('\n')[0]
    .replace(/AIza[0-9A-Za-z\-_]{20,}/g, '[redacted]')
    .replace(/https?:\/\/[^\s)]+/gi, '[redacted-url]')
    .replace(/(apiKey|token|secret|password|credential)\s*[:=]\s*\S+/gi, '$1=[redacted]')
    .replace(/\sat\s+\S+\s+\([^)]+\)/g, '')
    .trim()
    .slice(0, 180);
}

/**
 * Maps browser MediaDevices / camera errors into semantic DiagnosticCodes.
 */
export function classifyCameraError(error: unknown): DiagnosticCode {
  const err = error as { name?: string; message?: string } | null;
  const name = err?.name || '';
  const msg = (err?.message || '').toLowerCase();

  if (name === 'NotAllowedError' || name === 'PermissionDeniedError' || msg.includes('denied') || msg.includes('permission')) {
    return 'CAMERA_PERMISSION_DENIED';
  }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError' || msg.includes('not found') || msg.includes('no camera')) {
    return 'CAMERA_NOT_FOUND';
  }
  if (name === 'NotReadableError' || name === 'TrackStartError' || msg.includes('in use') || msg.includes('could not start video')) {
    return 'CAMERA_IN_USE';
  }
  if (msg.includes('secure context') || msg.includes('unsupported') || msg.includes('mediadevices')) {
    return 'BROWSER_UNSUPPORTED';
  }
  return 'CAMERA_STREAM_INTERRUPTED';
}

const MAX_RESOLVED_HISTORY = 20;
const REOPEN_COOLDOWN_MS = 1500;

export interface DiagnosticStoreState {
  activeIssues: DiagnosticIssue[];
  resolvedHistory: DiagnosticIssue[];
  /** Most recent newly raised WARNING/ERROR announcement for aria-live regions */
  liveAnnouncement: { id: string; text: string } | null;
  lastResolvedAtByCode: Record<string, number>;

  reportIssue: (
    code: DiagnosticCode,
    overrides?: { explanation?: string; severity?: DiagnosticSeverity }
  ) => void;
  resolveIssue: (code: DiagnosticCode) => void;
  clearAllActive: () => void;
  clearHistory: () => void;
  resetStore: () => void;
}

const SEVERITY_RANK: Record<DiagnosticSeverity, number> = {
  ERROR: 3,
  WARNING: 2,
  INFO: 1,
};

function sortIssues(issues: DiagnosticIssue[]): DiagnosticIssue[] {
  return [...issues].sort((a, b) => {
    const rankDiff = SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity];
    if (rankDiff !== 0) return rankDiff;
    return b.lastSeenAt - a.lastSeenAt;
  });
}

export const useDiagnosticStore = create<DiagnosticStoreState>((set, get) => ({
  activeIssues: [],
  resolvedHistory: [],
  liveAnnouncement: null,
  lastResolvedAtByCode: {},

  reportIssue: (code, overrides) => {
    const now = Date.now();
    const template = DIAGNOSTIC_CATALOG[code];
    if (!template) return;

    const state = get();
    const existingIdx = state.activeIssues.findIndex((item) => item.code === code);

    // Deduplicate: update occurrence count and timestamp without duplicating or re-announcing
    if (existingIdx >= 0) {
      const existing = state.activeIssues[existingIdx];
      // Prevent rapid update churn within 400ms
      if (now - existing.lastSeenAt < 400) return;

      const updated: DiagnosticIssue = {
        ...existing,
        lastSeenAt: now,
        occurrenceCount: existing.occurrenceCount + 1,
      };
      const next = [...state.activeIssues];
      next[existingIdx] = updated;
      set({ activeIssues: sortIssues(next) });
      return;
    }

    // Cooldown against rapid resolve->report oscillation for non-ERROR issues
    const lastResolvedAt = state.lastResolvedAtByCode[code] ?? 0;
    const effectiveSeverity = overrides?.severity ?? template.severity;
    if (effectiveSeverity !== 'ERROR' && now - lastResolvedAt < REOPEN_COOLDOWN_MS) {
      return;
    }

    const explanation = overrides?.explanation
      ? sanitizeDiagnosticText(overrides.explanation) || template.explanation
      : template.explanation;

    const newIssue: DiagnosticIssue = {
      id: `${code}-${now}`,
      code: template.code,
      category: template.category,
      severity: effectiveSeverity,
      title: template.title,
      explanation,
      recommendedAction: template.recommendedAction,
      actionType: template.actionType,
      actionLabel: template.actionLabel,
      firstSeenAt: now,
      lastSeenAt: now,
      occurrenceCount: 1,
    };

    const shouldAnnounce = effectiveSeverity === 'ERROR' || effectiveSeverity === 'WARNING';

    set({
      activeIssues: sortIssues([newIssue, ...state.activeIssues]),
      ...(shouldAnnounce
        ? {
            liveAnnouncement: {
              id: newIssue.id,
              text: `${effectiveSeverity}: ${newIssue.title}. ${newIssue.explanation}`,
            },
          }
        : {}),
    });
  },

  resolveIssue: (code) => {
    const state = get();
    const target = state.activeIssues.find((item) => item.code === code);
    if (!target) return;

    const now = Date.now();
    const resolvedEntry: DiagnosticIssue = { ...target, resolvedAt: now };
    const existingHistIdx = state.resolvedHistory.findIndex((h) => h.code === code);
    let nextHistory: DiagnosticIssue[];
    if (existingHistIdx >= 0) {
      const existingHist = state.resolvedHistory[existingHistIdx];
      const updatedHist: DiagnosticIssue = {
        ...target,
        occurrenceCount: existingHist.occurrenceCount + target.occurrenceCount,
        resolvedAt: now,
      };
      nextHistory = [
        updatedHist,
        ...state.resolvedHistory.filter((_, idx) => idx !== existingHistIdx),
      ].slice(0, MAX_RESOLVED_HISTORY);
    } else {
      nextHistory = [resolvedEntry, ...state.resolvedHistory].slice(0, MAX_RESOLVED_HISTORY);
    }

    set({
      activeIssues: state.activeIssues.filter((item) => item.code !== code),
      resolvedHistory: nextHistory,
      lastResolvedAtByCode: {
        ...state.lastResolvedAtByCode,
        [code]: now,
      },
    });
  },

  clearAllActive: () => {
    const state = get();
    if (state.activeIssues.length === 0) return;
    const now = Date.now();
    const newlyResolved = state.activeIssues.map((item) => ({ ...item, resolvedAt: now }));
    set({
      activeIssues: [],
      resolvedHistory: [...newlyResolved, ...state.resolvedHistory].slice(0, MAX_RESOLVED_HISTORY),
    });
  },

  clearHistory: () => set({ resolvedHistory: [] }),

  resetStore: () =>
    set({
      activeIssues: [],
      resolvedHistory: [],
      liveAnnouncement: null,
      lastResolvedAtByCode: {},
    }),
}));
