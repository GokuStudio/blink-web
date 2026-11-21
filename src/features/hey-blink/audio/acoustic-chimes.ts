/**
 * Hey Blink — Subtle Web Audio Spatial Acoustic Chimes
 *
 * Synthesizes ultra-gentle, harmonic studio cues (pure sine + soft overtone)
 * to acknowledge entering and gracefully leaving a conversation.
 * Zero external audio assets, zero latency, toggleable via DialKit.
 */

let sharedChimeCtx: AudioContext | null = null;

function getChimeContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) return null;

  try {
    if (!sharedChimeCtx || sharedChimeCtx.state === 'closed') {
      sharedChimeCtx = new AudioCtx();
    }
    if (sharedChimeCtx.state === 'suspended') {
      void sharedChimeCtx.resume().catch(() => {});
    }
    return sharedChimeCtx;
  } catch {
    return null;
  }
}

function playSoftTone(
  ctx: AudioContext,
  freqHz: number,
  startOffsetSec: number,
  durationSec: number,
  peakGain: number
): void {
  const now = ctx.currentTime + startOffsetSec;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = 'sine';
  osc.frequency.setValueAtTime(freqHz, now);

  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(peakGain, now + 0.018);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + durationSec);

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start(now);
  osc.stop(now + durationSec + 0.02);
}

/**
 * Ascending crystalline two-note welcome whisper when Blink wakes up (D5 -> A5).
 */
export function playSessionEnterChime(): void {
  const ctx = getChimeContext();
  if (!ctx) return;
  try {
    playSoftTone(ctx, 587.33, 0, 0.22, 0.028); // D5
    playSoftTone(ctx, 880.0, 0.065, 0.34, 0.024); // A5 (pure fifth)
  } catch {
    // Ignore autoplay errors silently
  }
}

/**
 * Descending warm release whisper when conversation ends gracefully (A5 -> E5).
 */
export function playSessionEndChime(): void {
  const ctx = getChimeContext();
  if (!ctx) return;
  try {
    playSoftTone(ctx, 783.99, 0, 0.18, 0.022); // G5
    playSoftTone(ctx, 523.25, 0.06, 0.28, 0.018); // C5
  } catch {
    // Ignore silently
  }
}

/**
 * Feather-light tactile tick for mute / unmute confirmation.
 */
export function playMuteToggleChime(muted: boolean): void {
  const ctx = getChimeContext();
  if (!ctx) return;
  try {
    playSoftTone(ctx, muted ? 392.0 : 523.25, 0, 0.11, 0.016);
  } catch {
    // Ignore silently
  }
}
