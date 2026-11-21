/**
 * Hey Blink — AudioWorklet PCM Capture Processor (Phase H2)
 *
 * Runs off the main thread in AudioWorkletGlobalScope:
 * - Captures mono microphone audio at the device's native sample rate (44.1 / 48 kHz, etc.)
 * - Continuously resamples to 16 kHz with phase continuity across render quanta
 * - Packs bounded low-latency 16-bit LE PCM chunks (default 32 ms = 512 samples @ 16 kHz)
 * - Computes accurate per-chunk RMS energy for the H1 input visualizer
 * - Honors instant worklet-level mute (stops emitting PCM chunks & reports 0 RMS)
 * - Transfers PCM ArrayBuffers zero-copy via postMessage transferables
 */

export const PCM_CAPTURE_PROCESSOR_NAME = 'blink-pcm-capture-processor';

const PCM_CAPTURE_WORKLET_SOURCE = `
class BlinkPcmCaptureProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const opts = (options && options.processorOptions) || {};
    this.targetSampleRate = opts.targetSampleRate || 16000;
    this.chunkSamples = opts.chunkSamples || 512; // 32 ms @ 16 kHz
    this.muted = Boolean(opts.muted);
    this.ratio = sampleRate / this.targetSampleRate;
    this.phase = 0;
    this.prevSample = 0;
    this.hasPrev = false;
    this.outBuffer = new Int16Array(this.chunkSamples);
    this.outIndex = 0;
    this.energySumSq = 0;
    this.energyCount = 0;
    this.seq = 0;

    this.port.onmessage = (event) => {
      const msg = event.data;
      if (!msg || typeof msg !== 'object') return;
      if (msg.type === 'set-muted') {
        this.muted = Boolean(msg.muted);
        if (this.muted) {
          this.outIndex = 0;
          this.energySumSq = 0;
          this.energyCount = 0;
          this.port.postMessage({ type: 'level', rms: 0 });
        }
      }
    };
  }

  process(inputs) {
    const input = inputs && inputs[0];
    if (!input || !input[0] || input[0].length === 0) {
      return true;
    }

    const channel0 = input[0];
    if (this.muted) {
      this.prevSample = channel0[channel0.length - 1];
      this.hasPrev = true;
      return true;
    }

    const len = channel0.length;
    let pos = this.phase;

    while (pos < len) {
      const idx = Math.floor(pos);
      const frac = pos - idx;
      const s0 = idx < 0 ? (this.hasPrev ? this.prevSample : channel0[0]) : channel0[idx];
      const s1 = idx + 1 < len ? channel0[idx + 1] : channel0[len - 1];
      const sample = s0 + (s1 - s0) * frac;

      const clamped = sample < -1 ? -1 : sample > 1 ? 1 : sample;
      this.outBuffer[this.outIndex] = clamped < 0
        ? Math.round(clamped * 0x8000)
        : Math.round(clamped * 0x7fff);
      this.outIndex += 1;

      this.energySumSq += clamped * clamped;
      this.energyCount += 1;

      if (this.outIndex >= this.chunkSamples) {
        const rms = this.energyCount > 0
          ? Math.min(1, Math.sqrt(this.energySumSq / this.energyCount) * 2.8)
          : 0;
        const payload = this.outBuffer.slice(0, this.chunkSamples);
        const seq = this.seq++;
        this.port.postMessage(
          {
            type: 'chunk',
            pcmBuffer: payload.buffer,
            rms,
            seq,
            sampleRate: this.targetSampleRate,
          },
          [payload.buffer]
        );
        this.outIndex = 0;
        this.energySumSq = 0;
        this.energyCount = 0;
      }

      pos += this.ratio;
    }

    this.phase = pos - len;
    this.prevSample = channel0[len - 1];
    this.hasPrev = true;
    return true;
  }
}

registerProcessor('${PCM_CAPTURE_PROCESSOR_NAME}', BlinkPcmCaptureProcessor);
`;

/**
 * Registers the capture AudioWorklet module on the given AudioContext using a
 * self-contained Blob URL (revoked immediately after loading).
 */
export async function registerPcmCaptureWorklet(audioContext: AudioContext): Promise<void> {
  const blob = new Blob([PCM_CAPTURE_WORKLET_SOURCE], { type: 'application/javascript' });
  const moduleUrl = URL.createObjectURL(blob);
  try {
    await audioContext.audioWorklet.addModule(moduleUrl);
  } finally {
    URL.revokeObjectURL(moduleUrl);
  }
}
