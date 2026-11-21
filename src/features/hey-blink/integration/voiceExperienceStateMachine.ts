/**
 * Blink Stage 2D — Authoritative Voice Experience State Machine
 *
 * Unifies Eye Mode and Voice Mode under a single deterministic finite state
 * machine so Blink behaves as one physical character with two complementary
 * visual expressions (Eyes <-> Audio-Reactive Voice Bubble).
 */

import type { VoiceSessionError, VoiceSessionErrorCode } from '../services/voice-session.interface';
import type { DiagnosticCode } from '@/features/demo/diagnostics/diagnosticStore';

export type VoiceExperienceState =
  | 'EYE_IDLE'
  | 'VOICE_REQUESTED'
  | 'MIC_PERMISSION_PENDING'
  | 'VOICE_CONNECTING'
  | 'VOICE_LISTENING'
  | 'USER_SPEAKING'
  | 'VOICE_PROCESSING'
  | 'ASSISTANT_SPEAKING'
  | 'VOICE_INTERRUPTED'
  | 'VOICE_ENDING'
  | 'VOICE_ERROR'
  | 'RETURNING_TO_EYES';

export type BlinkVisualMode =
  | 'eyes'
  | 'transitioning-to-voice'
  | 'voice'
  | 'transitioning-to-eyes';

/**
 * Strict legal transition graph — prevents duplicate sessions, out-of-order
 * state leaps, or claiming LISTENING before mic + transport are ready.
 */
export const ALLOWED_EXPERIENCE_TRANSITIONS: Readonly<
  Record<VoiceExperienceState, readonly VoiceExperienceState[]>
> = {
  EYE_IDLE: ['VOICE_REQUESTED', 'VOICE_ERROR'],
  VOICE_REQUESTED: ['MIC_PERMISSION_PENDING', 'VOICE_CONNECTING', 'VOICE_ERROR', 'RETURNING_TO_EYES'],
  MIC_PERMISSION_PENDING: ['VOICE_CONNECTING', 'VOICE_ERROR', 'VOICE_ENDING', 'RETURNING_TO_EYES'],
  VOICE_CONNECTING: ['VOICE_LISTENING', 'VOICE_ERROR', 'VOICE_ENDING', 'RETURNING_TO_EYES'],
  VOICE_LISTENING: [
    'USER_SPEAKING',
    'VOICE_PROCESSING',
    'ASSISTANT_SPEAKING',
    'VOICE_ERROR',
    'VOICE_ENDING',
  ],
  USER_SPEAKING: [
    'VOICE_LISTENING',
    'VOICE_PROCESSING',
    'ASSISTANT_SPEAKING',
    'VOICE_ERROR',
    'VOICE_ENDING',
  ],
  VOICE_PROCESSING: [
    'ASSISTANT_SPEAKING',
    'VOICE_LISTENING',
    'VOICE_INTERRUPTED',
    'VOICE_ERROR',
    'VOICE_ENDING',
  ],
  ASSISTANT_SPEAKING: [
    'VOICE_LISTENING',
    'USER_SPEAKING',
    'VOICE_INTERRUPTED',
    'VOICE_PROCESSING',
    'VOICE_ERROR',
    'VOICE_ENDING',
  ],
  VOICE_INTERRUPTED: ['VOICE_LISTENING', 'USER_SPEAKING', 'VOICE_ERROR', 'VOICE_ENDING'],
  VOICE_ENDING: ['RETURNING_TO_EYES', 'EYE_IDLE'],
  VOICE_ERROR: ['VOICE_REQUESTED', 'VOICE_ENDING', 'RETURNING_TO_EYES', 'EYE_IDLE'],
  RETURNING_TO_EYES: ['EYE_IDLE', 'VOICE_REQUESTED'],
} as const;

export function canTransitionExperienceState(
  from: VoiceExperienceState,
  to: VoiceExperienceState
): boolean {
  if (from === to) return false;
  return ALLOWED_EXPERIENCE_TRANSITIONS[from].includes(to);
}

export class VoiceExperienceStateMachine {
  private current: VoiceExperienceState = 'EYE_IDLE';
  private previous: VoiceExperienceState | null = null;
  private transitionCount = 0;

  public getState(): VoiceExperienceState {
    return this.current;
  }

  public getPreviousState(): VoiceExperienceState | null {
    return this.previous;
  }

  public getTransitionCount(): number {
    return this.transitionCount;
  }

  public canTransitionTo(next: VoiceExperienceState): boolean {
    return canTransitionExperienceState(this.current, next);
  }

  public transition(next: VoiceExperienceState): boolean {
    if (!this.canTransitionTo(next)) {
      return false;
    }
    this.previous = this.current;
    this.current = next;
    this.transitionCount += 1;
    return true;
  }

  public forceReset(): void {
    this.previous = this.current;
    this.current = 'EYE_IDLE';
    this.transitionCount += 1;
  }
}

export function deriveVisualMode(state: VoiceExperienceState): BlinkVisualMode {
  switch (state) {
    case 'EYE_IDLE':
      return 'eyes';
    case 'VOICE_REQUESTED':
    case 'MIC_PERMISSION_PENDING':
    case 'VOICE_CONNECTING':
      return 'transitioning-to-voice';
    case 'VOICE_LISTENING':
    case 'USER_SPEAKING':
    case 'VOICE_PROCESSING':
    case 'ASSISTANT_SPEAKING':
    case 'VOICE_INTERRUPTED':
    case 'VOICE_ERROR':
      return 'voice';
    case 'VOICE_ENDING':
    case 'RETURNING_TO_EYES':
      return 'transitioning-to-eyes';
  }
}

/** True when Blink is actively in or transitioning into a voice conversation. */
export function isVoiceEngaged(state: VoiceExperienceState): boolean {
  return state !== 'EYE_IDLE';
}

/** True when the live voice session is established and accepting turns. */
export function isVoiceConversationLive(state: VoiceExperienceState): boolean {
  return (
    state === 'VOICE_LISTENING' ||
    state === 'USER_SPEAKING' ||
    state === 'VOICE_PROCESSING' ||
    state === 'ASSISTANT_SPEAKING' ||
    state === 'VOICE_INTERRUPTED'
  );
}

/** True when a new Talk to Blink activation click is permitted. */
export function canActivateVoice(state: VoiceExperienceState): boolean {
  return state === 'EYE_IDLE' || state === 'VOICE_ERROR';
}

/** True when Blink can be interrupted (barge-in). */
export function canInterruptExperience(state: VoiceExperienceState): boolean {
  return state === 'ASSISTANT_SPEAKING' || state === 'VOICE_PROCESSING';
}

/** Compact, calm on-screen caption supporting the voice bubble without dominating it. */
export function getVoiceStatusCaption(
  state: VoiceExperienceState,
  options?: { isMuted?: boolean; isSimulated?: boolean }
): string | null {
  switch (state) {
    case 'EYE_IDLE':
      return null;
    case 'VOICE_REQUESTED':
      return 'Waking Blink…';
    case 'MIC_PERMISSION_PENDING':
      return 'Allow microphone…';
    case 'VOICE_CONNECTING':
      return 'Connecting…';
    case 'VOICE_LISTENING':
      return options?.isMuted ? 'Muted' : 'Listening';
    case 'USER_SPEAKING':
      return options?.isMuted ? 'Muted' : 'Listening';
    case 'VOICE_PROCESSING':
      return 'Thinking';
    case 'ASSISTANT_SPEAKING':
      return 'Blink is speaking';
    case 'VOICE_INTERRUPTED':
      return 'Listening';
    case 'VOICE_ENDING':
    case 'RETURNING_TO_EYES':
      return 'Returning to eyes…';
    case 'VOICE_ERROR':
      return 'Connection lost';
  }
}

/**
 * Maps provider VoiceSessionError codes and messages to semantic Issue Center
 * DiagnosticCodes without leaking raw stack traces or credentials.
 */
export function classifyVoiceDiagnosticCode(
  error: VoiceSessionError | { code?: VoiceSessionErrorCode | string; message?: string } | null
): DiagnosticCode {
  if (!error) return 'VOICE_SESSION_TERMINATED';
  const code = error.code || '';
  const msg = (error.message || '').toLowerCase();

  if (
    code === 'MICROPHONE_PERMISSION_DENIED' ||
    msg.includes('permission') ||
    msg.includes('notallowederror') ||
    msg.includes('denied')
  ) {
    return 'VOICE_MIC_PERMISSION_DENIED';
  }
  if (
    msg.includes('no microphone') ||
    msg.includes('notfounderror') ||
    msg.includes('device not found')
  ) {
    return 'VOICE_MIC_NOT_FOUND';
  }
  if (
    code === 'AUDIO_DEVICE_ERROR' &&
    (msg.includes('playback') || msg.includes('audio context') || msg.includes('speaker'))
  ) {
    return 'VOICE_AUDIO_PLAYBACK_FAILED';
  }
  if (code === 'AUDIO_DEVICE_ERROR' || msg.includes('unplugged') || msg.includes('interrupted')) {
    return 'VOICE_MIC_INTERRUPTED';
  }
  if (msg.includes('unsupported') || msg.includes('mediadevices') || msg.includes('audioworklet')) {
    return 'VOICE_BROWSER_UNSUPPORTED';
  }
  if (
    msg.includes('rate limit') ||
    msg.includes('quota') ||
    msg.includes('429') ||
    msg.includes('prepayment') ||
    msg.includes('credits are depleted') ||
    msg.includes('billing')
  ) {
    return 'VOICE_QUOTA_EXCEEDED';
  }
  if (
    msg.includes('not configured') ||
    msg.includes('unreachable') ||
    msg.includes('could not reach') ||
    msg.includes('timed out connecting') ||
    code === 'NETWORK_UNAVAILABLE'
  ) {
    return 'VOICE_BACKEND_UNREACHABLE';
  }
  if (
    msg.includes('authentication') ||
    msg.includes('unauthorized') ||
    msg.includes('401') ||
    msg.includes('403') ||
    msg.includes('credential')
  ) {
    return 'VOICE_AUTH_FAILED';
  }
  if (code === 'PROVIDER_DISCONNECTED' || msg.includes('websocket') || msg.includes('disconnect')) {
    return 'VOICE_TRANSPORT_DISCONNECTED';
  }
  if (code === 'SESSION_INIT_FAILED') {
    return 'VOICE_AUTH_FAILED';
  }
  return 'VOICE_SESSION_TERMINATED';
}
