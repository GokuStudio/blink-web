import {
  GEMINI_INPUT_SAMPLE_RATE,
  int16ToBase64,
} from './pcm-encoder';
import {
  PCM_CAPTURE_PROCESSOR_NAME,
  registerPcmCaptureWorklet,
} from './audio-worklet/pcm-capture-worklet';
import type { VoiceSessionErrorCode } from '../services/voice-session.interface';

export interface AudioInputDeviceInfo {
  deviceId: string;
  label: string;
  isDefault: boolean;
}

export interface CapturedAudioChunk {
  /** Mono 16-bit signed LE PCM @ 16 kHz */
  pcm: Int16Array;
  /** Pre-encoded Base64 PCM ready for Gemini Live sendRealtimeInput */
  base64: string;
  /** Normalized RMS amplitude (0..1) of this chunk */
  rms: number;
  /** Monotonic chunk sequence number */
  seq: number;
  /** Target sample rate (16000) */
  sampleRate: number;
  /** Monotonic capture timestamp (performance.now()) */
  capturedAtMs: number;
}

export interface MicrophoneCaptureCallbacks {
  onChunk: (chunk: CapturedAudioChunk) => void;
  onLevel?: (rms: number) => void;
  onDeviceDisconnected?: (reason: string) => void;
  onAudioContextStateChange?: (state: AudioContextState) => void;
}

export interface MicrophoneCaptureOptions {
  /** Target sample rate for Gemini Live input (default 16000 Hz) */
  targetSampleRate?: number;
  /** Target chunk duration in milliseconds (recommended 20-40 ms; default 32 ms) */
  chunkDurationMs?: number;
  /** Specific audio input deviceId (e.g. USB microphone) */
  deviceId?: string;
  /** Start muted without transmitting audio */
  muted?: boolean;
  /** Max queued outbound chunks before applying backpressure drop */
  maxPendingChunks?: number;
}

export class MicrophoneCaptureError extends Error {
  public readonly code: VoiceSessionErrorCode;

  constructor(code: VoiceSessionErrorCode, message: string, cause?: unknown) {
    super(message);
    this.name = 'MicrophoneCaptureError';
    this.code = code;
    if (cause !== undefined) {
      (this as Error & { cause?: unknown }).cause = cause;
    }
  }
}

/**
 * Checks whether browser microphone capture + Web Audio AudioWorklet are supported.
 */
export function isMicrophoneCaptureSupported(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  const hasMedia = Boolean(navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === 'function');
  const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  return hasMedia && Boolean(AudioCtx);
}

/**
 * Enumerates available audio input devices (e.g. USB microphones, headset mics).
 * Device labels are populated once microphone permission has been granted.
 */
export async function listAudioInputDevices(): Promise<AudioInputDeviceInfo[]> {
  if (
    typeof navigator === 'undefined' ||
    !navigator.mediaDevices ||
    typeof navigator.mediaDevices.enumerateDevices !== 'function'
  ) {
    return [];
  }

  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const audioInputs = devices.filter((d) => d.kind === 'audioinput');
    return audioInputs.map((device, index) => ({
      deviceId: device.deviceId,
      label: device.label || (device.deviceId === 'default' ? 'System Default Microphone' : `Microphone ${index + 1}`),
      isDefault: device.deviceId === 'default' || index === 0,
    }));
  } catch {
    return [];
  }
}

function mapMediaError(err: unknown): MicrophoneCaptureError {
  const name = err instanceof Error ? err.name : '';
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError' || name === 'SecurityError') {
    return new MicrophoneCaptureError(
      'MICROPHONE_PERMISSION_DENIED',
      'Microphone access was denied. Allow microphone permission in your browser settings and try again.',
      err
    );
  }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError' || name === 'OverconstrainedError') {
    return new MicrophoneCaptureError(
      'AUDIO_DEVICE_ERROR',
      'No compatible microphone was found. Connect your microphone or choose a different input device.',
      err
    );
  }
  if (name === 'NotReadableError' || name === 'AbortError') {
    return new MicrophoneCaptureError(
      'AUDIO_DEVICE_ERROR',
      'Your microphone is currently unavailable or in use by another application.',
      err
    );
  }
  return new MicrophoneCaptureError(
    'AUDIO_DEVICE_ERROR',
    err instanceof Error ? err.message : 'Unable to start microphone capture.',
    err
  );
}

/**
 * Real-time Web Audio microphone capture pipeline using AudioWorklet.
 * Avoids deprecated ScriptProcessorNode and guarantees clean track & AudioContext teardown.
 */
export class MicrophoneCapture {
  private readonly callbacks: MicrophoneCaptureCallbacks;
  private audioContext: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private silentGainNode: GainNode | null = null;

  private isRunning = false;
  private isMuted = false;
  private activeDeviceId: string | undefined;
  private startupLatencyMs: number | null = null;
  private droppedChunks = 0;
  private lastChunkSeq = -1;
  private trackEndedHandlers: Array<() => void> = [];

  constructor(callbacks: MicrophoneCaptureCallbacks) {
    this.callbacks = callbacks;
  }

  public getStartupLatencyMs(): number | null {
    return this.startupLatencyMs;
  }

  public getDroppedChunks(): number {
    return this.droppedChunks;
  }

  public getActiveDeviceId(): string | undefined {
    return this.activeDeviceId;
  }

  public getIsRunning(): boolean {
    return this.isRunning;
  }

  public getIsMuted(): boolean {
    return this.isMuted;
  }

  /**
   * Starts capturing from the selected microphone. Must be invoked from a user gesture
   * so browsers grant permission and unlock AudioContext.
   */
  public async start(options: MicrophoneCaptureOptions = {}): Promise<void> {
    if (this.isRunning) {
      return;
    }

    if (!isMicrophoneCaptureSupported()) {
      throw new MicrophoneCaptureError(
        'AUDIO_DEVICE_ERROR',
        'This browser does not support Web Audio microphone capture.'
      );
    }

    const startTime = performance.now();
    const targetSampleRate = options.targetSampleRate ?? GEMINI_INPUT_SAMPLE_RATE;
    const chunkDurationMs = Math.max(20, Math.min(40, options.chunkDurationMs ?? 32));
    const chunkSamples = Math.round((targetSampleRate * chunkDurationMs) / 1000);
    this.isMuted = Boolean(options.muted);
    this.droppedChunks = 0;
    this.lastChunkSeq = -1;

    // 1. Acquire microphone with hardware/browser AEC + NS + AGC to prevent speaker self-interruption
    const audioConstraints: MediaTrackConstraints = {
      channelCount: { ideal: 1 },
      echoCancellation: { ideal: true },
      noiseSuppression: { ideal: true },
      autoGainControl: { ideal: true },
      ...(options.deviceId && options.deviceId !== 'default'
        ? { deviceId: { exact: options.deviceId } }
        : {}),
    };

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: audioConstraints,
        video: false,
      });
    } catch (err) {
      // If a previously selected USB deviceId was unplugged, fall back once to default mic
      if (
        options.deviceId &&
        options.deviceId !== 'default' &&
        err instanceof Error &&
        (err.name === 'OverconstrainedError' || err.name === 'NotFoundError')
      ) {
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            audio: {
              channelCount: { ideal: 1 },
              echoCancellation: { ideal: true },
              noiseSuppression: { ideal: true },
              autoGainControl: { ideal: true },
            },
            video: false,
          });
        } catch (fallbackErr) {
          throw mapMediaError(fallbackErr);
        }
      } else {
        throw mapMediaError(err);
      }
    }

    this.mediaStream = stream;
    const primaryTrack = stream.getAudioTracks()[0];
    if (!primaryTrack) {
      this.stop();
      throw new MicrophoneCaptureError('AUDIO_DEVICE_ERROR', 'Microphone stream contains no audio tracks.');
    }

    this.activeDeviceId = primaryTrack.getSettings?.().deviceId ?? options.deviceId;
    primaryTrack.enabled = !this.isMuted;

    const onEnded = () => {
      if (this.isRunning) {
        this.callbacks.onDeviceDisconnected?.('Your microphone was disconnected.');
      }
    };
    primaryTrack.addEventListener('ended', onEnded);
    this.trackEndedHandlers.push(() => primaryTrack.removeEventListener('ended', onEnded));

    // 2. Create AudioContext and register off-main-thread AudioWorklet processor
    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;

      // Let the browser run at the hardware's native sample rate (e.g. 48 kHz)
      // while our AudioWorklet performs continuous phase-accurate resampling to 16 kHz.
      const ctx = new AudioCtx({ latencyHint: 'interactive' });
      this.audioContext = ctx;

      ctx.onstatechange = () => {
        this.callbacks.onAudioContextStateChange?.(ctx.state);
      };

      if (ctx.state === 'suspended') {
        await ctx.resume();
      }

      if (!ctx.audioWorklet) {
        throw new MicrophoneCaptureError(
          'AUDIO_DEVICE_ERROR',
          'AudioWorklet is unavailable in this browser context. Use HTTPS or localhost.'
        );
      }

      await registerPcmCaptureWorklet(ctx);

      const source = ctx.createMediaStreamSource(stream);
      const worklet = new AudioWorkletNode(ctx, PCM_CAPTURE_PROCESSOR_NAME, {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        channelCount: 1,
        processorOptions: {
          targetSampleRate,
          chunkSamples,
          muted: this.isMuted,
        },
      });

      // Keep the Web Audio pull graph alive without routing mic audio to speakers
      const silentGain = ctx.createGain();
      silentGain.gain.value = 0;

      worklet.port.onmessage = (event: MessageEvent) => {
        if (!this.isRunning) return;
        const msg = event.data;
        if (!msg || typeof msg !== 'object') return;

        if (msg.type === 'level') {
          this.callbacks.onLevel?.(typeof msg.rms === 'number' ? msg.rms : 0);
          return;
        }

        if (msg.type === 'chunk' && msg.pcmBuffer instanceof ArrayBuffer) {
          if (this.isMuted) {
            this.callbacks.onLevel?.(0);
            return;
          }
          const seq = typeof msg.seq === 'number' ? msg.seq : this.lastChunkSeq + 1;
          if (this.lastChunkSeq >= 0 && seq > this.lastChunkSeq + 1) {
            this.droppedChunks += seq - this.lastChunkSeq - 1;
          }
          this.lastChunkSeq = seq;

          const pcm = new Int16Array(msg.pcmBuffer);
          const rms = typeof msg.rms === 'number' ? msg.rms : 0;
          this.callbacks.onLevel?.(rms);
          this.callbacks.onChunk({
            pcm,
            base64: int16ToBase64(pcm),
            rms,
            seq,
            sampleRate: targetSampleRate,
            capturedAtMs: performance.now(),
          });
        }
      };

      source.connect(worklet);
      worklet.connect(silentGain);
      silentGain.connect(ctx.destination);

      this.sourceNode = source;
      this.workletNode = worklet;
      this.silentGainNode = silentGain;
      this.isRunning = true;
      this.startupLatencyMs = Math.round((performance.now() - startTime) * 10) / 10;
    } catch (err) {
      this.stop();
      if (err instanceof MicrophoneCaptureError) throw err;
      throw mapMediaError(err);
    }
  }

  /**
   * Enforces an actual muted input state: disables hardware track capture and halts
   * AudioWorklet PCM chunk emission immediately.
   */
  public setMuted(muted: boolean): void {
    this.isMuted = muted;
    if (this.mediaStream) {
      for (const track of this.mediaStream.getAudioTracks()) {
        track.enabled = !muted;
      }
    }
    if (this.workletNode) {
      this.workletNode.port.postMessage({ type: 'set-muted', muted });
    }
    if (muted) {
      this.callbacks.onLevel?.(0);
    }
  }

  /**
   * Resumes a suspended AudioContext (e.g. after background tab return or iOS interruption).
   */
  public async resumeIfSuspended(): Promise<void> {
    if (this.audioContext && this.audioContext.state === 'suspended') {
      try {
        await this.audioContext.resume();
      } catch {
        // Handled via AudioContext state listener
      }
    }
  }

  /**
   * Stops microphone tracks immediately and releases all Web Audio resources.
   */
  public stop(): void {
    this.isRunning = false;

    for (const cleanup of this.trackEndedHandlers) {
      cleanup();
    }
    this.trackEndedHandlers = [];

    if (this.workletNode) {
      this.workletNode.port.onmessage = null;
      try {
        this.workletNode.disconnect();
      } catch {
        // Ignore already disconnected node
      }
      this.workletNode = null;
    }

    if (this.sourceNode) {
      try {
        this.sourceNode.disconnect();
      } catch {
        // Ignore
      }
      this.sourceNode = null;
    }

    if (this.silentGainNode) {
      try {
        this.silentGainNode.disconnect();
      } catch {
        // Ignore
      }
      this.silentGainNode = null;
    }

    if (this.mediaStream) {
      for (const track of this.mediaStream.getTracks()) {
        try {
          track.stop();
        } catch {
          // Ignore
        }
      }
      this.mediaStream = null;
    }

    if (this.audioContext) {
      const ctx = this.audioContext;
      this.audioContext = null;
      ctx.onstatechange = null;
      if (ctx.state !== 'closed') {
        void ctx.close().catch(() => {});
      }
    }

    this.callbacks.onLevel?.(0);
  }
}
