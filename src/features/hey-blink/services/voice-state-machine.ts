import { VoiceSessionState } from './voice-session.interface';

/**
 * Legal state transition table for Hey Blink voice session lifecycle.
 * Any transition not listed here is explicitly rejected to make invalid
 * session states impossible.
 */
export const ALLOWED_VOICE_TRANSITIONS: Readonly<
  Record<VoiceSessionState, readonly VoiceSessionState[]>
> = {
  idle: ['entering', 'error'],
  entering: ['listening', 'error', 'ending'],
  listening: ['thinking', 'speaking', 'error', 'ending'],
  thinking: ['speaking', 'interrupted', 'listening', 'error', 'ending'],
  speaking: ['listening', 'interrupted', 'thinking', 'error', 'ending'],
  interrupted: ['listening', 'error', 'ending'],
  error: ['entering', 'ending', 'idle'],
  ending: ['idle'],
} as const;

export const ALL_VOICE_STATES: readonly VoiceSessionState[] = [
  'idle',
  'entering',
  'listening',
  'thinking',
  'speaking',
  'interrupted',
  'error',
  'ending',
] as const;

export class IllegalVoiceTransitionError extends Error {
  public readonly from: VoiceSessionState;
  public readonly to: VoiceSessionState;

  constructor(from: VoiceSessionState, to: VoiceSessionState, context?: string) {
    const suffix = context ? ` (${context})` : '';
    super(`Illegal voice session transition: "${from}" -> "${to}"${suffix}`);
    this.name = 'IllegalVoiceTransitionError';
    this.from = from;
    this.to = to;
  }
}

export function canTransitionVoiceState(
  from: VoiceSessionState,
  to: VoiceSessionState
): boolean {
  if (from === to) return false;
  return ALLOWED_VOICE_TRANSITIONS[from].includes(to);
}

export function assertValidVoiceTransition(
  from: VoiceSessionState,
  to: VoiceSessionState,
  context?: string
): void {
  if (!canTransitionVoiceState(from, to)) {
    throw new IllegalVoiceTransitionError(from, to, context);
  }
}

/**
 * True when a conversation session is currently active (neither resting idle nor error).
 */
export function isActiveVoiceState(state: VoiceSessionState): boolean {
  return (
    state === 'entering' ||
    state === 'listening' ||
    state === 'thinking' ||
    state === 'speaking' ||
    state === 'interrupted'
  );
}

/**
 * True when user barge-in / interruption is meaningful.
 */
export function canInterruptVoiceState(state: VoiceSessionState): boolean {
  return state === 'speaking' || state === 'thinking';
}

/**
 * Deterministic finite state machine guard wrapping a voice session's state.
 */
export class VoiceStateMachine {
  private current: VoiceSessionState;
  private previous: VoiceSessionState | null = null;
  private transitionCount = 0;
  private lastTransitionAt: number;

  constructor(initialState: VoiceSessionState = 'idle') {
    this.current = initialState;
    this.lastTransitionAt = Date.now();
  }

  public getState(): VoiceSessionState {
    return this.current;
  }

  public getPreviousState(): VoiceSessionState | null {
    return this.previous;
  }

  public getTransitionCount(): number {
    return this.transitionCount;
  }

  public getLastTransitionAt(): number {
    return this.lastTransitionAt;
  }

  public canTransitionTo(next: VoiceSessionState): boolean {
    return canTransitionVoiceState(this.current, next);
  }

  /**
   * Transitions to `next`, throwing `IllegalVoiceTransitionError` if forbidden.
   */
  public transition(next: VoiceSessionState, context?: string): VoiceSessionState {
    assertValidVoiceTransition(this.current, next, context);
    this.previous = this.current;
    this.current = next;
    this.transitionCount += 1;
    this.lastTransitionAt = Date.now();
    return this.current;
  }

  /**
   * Attempts a transition without throwing. Returns `true` if transitioned.
   */
  public tryTransition(next: VoiceSessionState): boolean {
    if (!this.canTransitionTo(next)) {
      return false;
    }
    this.previous = this.current;
    this.current = next;
    this.transitionCount += 1;
    this.lastTransitionAt = Date.now();
    return true;
  }
}
