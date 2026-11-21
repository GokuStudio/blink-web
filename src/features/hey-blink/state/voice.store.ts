import { create } from 'zustand';
import {
  VoiceSessionError,
  VoiceSessionSnapshot,
  VoiceSessionState,
} from '../services/voice-session.interface';

/**
 * Low-frequency UI & lifecycle store for Hey Blink.
 *
 * High-frequency audio amplitudes (60 FPS) are deliberately excluded from
 * Zustand state and delivered via subscription/refs to prevent React
 * re-renders on every animation frame.
 */
export interface VoiceStoreState {
  sessionId: string | null;
  providerId: string;
  isSimulated: boolean;
  state: VoiceSessionState;
  previousState: VoiceSessionState | null;
  isMuted: boolean;
  error: VoiceSessionError | null;
  startedAt: number | null;
  lastTransitionAt: number;
  transitionCount: number;
  autoCycleEnabled: boolean;

  applySnapshot: (snapshot: VoiceSessionSnapshot) => void;
  setAutoCycleEnabled: (enabled: boolean) => void;
  resetStore: () => void;
}

const INITIAL_VOICE_STORE = {
  sessionId: null,
  providerId: 'mock-voice-session',
  isSimulated: true,
  state: 'idle' as VoiceSessionState,
  previousState: null as VoiceSessionState | null,
  isMuted: false,
  error: null as VoiceSessionError | null,
  startedAt: null as number | null,
  lastTransitionAt: 0,
  transitionCount: 0,
  autoCycleEnabled: true,
};

export const useVoiceStore = create<VoiceStoreState>((set) => ({
  ...INITIAL_VOICE_STORE,

  applySnapshot: (snapshot) =>
    set({
      sessionId: snapshot.sessionId,
      providerId: snapshot.providerId,
      isSimulated: snapshot.isSimulated,
      state: snapshot.state,
      previousState: snapshot.previousState,
      isMuted: snapshot.isMuted,
      error: snapshot.error,
      startedAt: snapshot.startedAt,
      lastTransitionAt: snapshot.lastTransitionAt,
      transitionCount: snapshot.transitionCount,
    }),

  setAutoCycleEnabled: (autoCycleEnabled) => set({ autoCycleEnabled }),

  resetStore: () => set({ ...INITIAL_VOICE_STORE }),
}));
