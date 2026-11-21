/**
 * Hey Blink — Higher-Level Hands-Free Activation State Machine (Phase H2.5)
 *
 * Strictly separate from H1's `VoiceStateMachine`:
 * - This controller governs WHEN a conversation starts, ends, suspends, or rearms.
 * - H1's `VoiceStateMachine` governs WHAT happens inside an active conversation
 *   (idle, entering, listening, thinking, speaking, interrupted, error, ending).
 */

export type HandsFreeActivationState =
  | 'wake_unavailable'
  | 'wake_initializing'
  | 'wake_ready'
  | 'wake_detected'
  | 'conversation_starting'
  | 'conversation_active'
  | 'conversation_ending'
  | 'wake_rearming'
  | 'suspended'
  | 'error';

export const ALL_ACTIVATION_STATES: readonly HandsFreeActivationState[] = [
  'wake_unavailable',
  'wake_initializing',
  'wake_ready',
  'wake_detected',
  'conversation_starting',
  'conversation_active',
  'conversation_ending',
  'wake_rearming',
  'suspended',
  'error',
] as const;

export const ALLOWED_ACTIVATION_TRANSITIONS: Readonly<
  Record<HandsFreeActivationState, readonly HandsFreeActivationState[]>
> = {
  wake_unavailable: [
    'wake_initializing',
    'wake_detected', // explicit dev trigger when testing hands-free loop before model install
    'conversation_starting', // direct "Talk to Blink" button activation with natural voice ending
    'suspended',
    'error',
  ],
  wake_initializing: [
    'wake_ready',
    'wake_unavailable',
    'suspended',
    'error',
  ],
  wake_ready: [
    'wake_detected',
    'conversation_starting',
    'suspended',
    'wake_unavailable',
    'error',
  ],
  wake_detected: [
    'conversation_starting',
    'wake_rearming',
    'suspended',
    'error',
  ],
  conversation_starting: [
    'conversation_active',
    'conversation_ending',
    'wake_rearming',
    'wake_unavailable',
    'suspended',
    'error',
  ],
  conversation_active: [
    'conversation_ending',
    'suspended',
    'error',
  ],
  conversation_ending: [
    'conversation_active', // user interrupted farewell to continue speaking
    'wake_rearming',
    'wake_unavailable',
    'suspended',
    'error',
  ],
  wake_rearming: [
    'wake_ready',
    'wake_unavailable',
    'suspended',
    'error',
  ],
  suspended: [
    'wake_initializing',
    'wake_rearming',
    'conversation_starting',
    'wake_unavailable',
    'error',
  ],
  error: [
    'wake_initializing',
    'wake_rearming',
    'conversation_starting',
    'wake_unavailable',
    'suspended',
  ],
} as const;

export class IllegalActivationTransitionError extends Error {
  public readonly from: HandsFreeActivationState;
  public readonly to: HandsFreeActivationState;

  constructor(from: HandsFreeActivationState, to: HandsFreeActivationState, reason?: string) {
    const detail = reason ? ` (${reason})` : '';
    super(`Illegal hands-free activation transition: "${from}" -> "${to}"${detail}`);
    this.name = 'IllegalActivationTransitionError';
    this.from = from;
    this.to = to;
  }
}

export function canTransitionActivationState(
  from: HandsFreeActivationState,
  to: HandsFreeActivationState
): boolean {
  if (from === to) return false;
  return ALLOWED_ACTIVATION_TRANSITIONS[from].includes(to);
}

export function isConversationOccupiedState(state: HandsFreeActivationState): boolean {
  return (
    state === 'wake_detected' ||
    state === 'conversation_starting' ||
    state === 'conversation_active' ||
    state === 'conversation_ending'
  );
}

export class HandsFreeActivationStateMachine {
  private current: HandsFreeActivationState;
  private previous: HandsFreeActivationState | null = null;
  private transitionCount = 0;
  private lastTransitionAt: number;

  constructor(initialState: HandsFreeActivationState = 'wake_unavailable') {
    this.current = initialState;
    this.lastTransitionAt = Date.now();
  }

  public getState(): HandsFreeActivationState {
    return this.current;
  }

  public getPreviousState(): HandsFreeActivationState | null {
    return this.previous;
  }

  public getTransitionCount(): number {
    return this.transitionCount;
  }

  public getLastTransitionAt(): number {
    return this.lastTransitionAt;
  }

  public canTransitionTo(next: HandsFreeActivationState): boolean {
    return canTransitionActivationState(this.current, next);
  }

  public transition(next: HandsFreeActivationState, reason?: string): HandsFreeActivationState {
    if (!this.canTransitionTo(next)) {
      throw new IllegalActivationTransitionError(this.current, next, reason);
    }
    this.previous = this.current;
    this.current = next;
    this.transitionCount += 1;
    this.lastTransitionAt = Date.now();
    return this.current;
  }
}
