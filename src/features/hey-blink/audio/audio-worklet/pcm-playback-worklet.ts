/**
 * Hey Blink — AudioWorklet Streaming PCM Playback Processor (Phase H2)
 *
 * Runs off the main thread in AudioWorkletGlobalScope:
 * - Maintains a bounded Float32 ring buffer (~6 seconds at DAC sample rate)
 * - Uses a small jitter prebuffer (~45 ms) to absorb WebSocket arrival variance
 *   while keeping playback latency ultra-low
 * - Filters incoming chunks by `generationId` so stale chunks from an interrupted
 *   turn are deterministically discarded
 * - Supports instant `flush(newGenerationId)` with a tiny clickless 2 ms fade-out
 * - Reports real audible DAC RMS energy at ~60 Hz so the H1 speaking visualizer
 *   tracks what is actually heard from the speaker (never microphone input)
 * - Tracks buffer underruns and playback drain completion accurately
 */

export const PCM_PLAYBACK_PROCESSOR_NAME = 'blink-pcm-playback-processor';

const PCM_PLAYBACK_WORKLET_SOURCE = `
class BlinkPcmPlaybackProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const opts = (options && options.processorOptions) || {};
    const bufferSeconds = opts.bufferSeconds || 6;
    const prebufferMs = opts.prebufferMs || 45;

    this.capacity = Math.max(8192, Math.floor(sampleRate * bufferSeconds));
    this.ring = new Float32Array(this.capacity);
    this.readIndex = 0;
    this.writeIndex = 0;
    this.available = 0;

    this.prebufferSamples = Math.max(128, Math.floor((sampleRate * prebufferMs) / 1000));
    this.isPlaying = false;
    this.generationId = 0;
    this.turnCompleteForGen = false;
    this.underruns = 0;
    this.droppedSamples = 0;

    // 2 ms micro-fade on flush to eliminate speaker clicks on instant barge-in
    this.fadeOutSamplesRemaining = 0;
    this.fadeOutTotal = Math.max(16, Math.floor(sampleRate * 0.002));
    this.lastOutputSample = 0;

    // Metering throttle (~60 Hz regardless of 128-sample quantum rate)
    this.meterSumSq = 0;
    this.meterCount = 0;
    this.meterIntervalSamples = Math.max(256, Math.floor(sampleRate / 60));

    this.port.onmessage = (event) => {
      const msg = event.data;
      if (!msg || typeof msg !== 'object') return;

      if (msg.type === 'enqueue') {
        const gen = typeof msg.generationId === 'number' ? msg.generationId : this.generationId;
        if (gen < this.generationId) {
          // Discard stale audio from a cancelled/interrupted turn
          return;
        }
        if (gen > this.generationId) {
          this.generationId = gen;
          this.turnCompleteForGen = false;
        }
        const samples = new Float32Array(msg.samplesBuffer);
        this.pushSamples(samples);
      } else if (msg.type === 'turn-complete') {
        if (msg.generationId === this.generationId) {
          this.turnCompleteForGen = true;
          if (!this.isPlaying && this.available === 0) {
            this.port.postMessage({
              type: 'drained',
              generationId: this.generationId,
              underruns: this.underruns,
            });
          }
        }
      } else if (msg.type === 'flush') {
        const nextGen = typeof msg.generationId === 'number'
          ? msg.generationId
          : this.generationId + 1;
        this.generationId = nextGen;
        this.readIndex = 0;
        this.writeIndex = 0;
        this.available = 0;
        this.turnCompleteForGen = false;
        if (this.isPlaying) {
          this.fadeOutSamplesRemaining = this.fadeOutTotal;
        }
        this.isPlaying = false;
        this.meterSumSq = 0;
        this.meterCount = 0;
        this.port.postMessage({
          type: 'flushed',
          generationId: this.generationId,
          rms: 0,
        });
      }
    };
  }

  pushSamples(samples) {
    const len = samples.length;
    if (len === 0) return;

    const free = this.capacity - this.available;
    if (len > free) {
      // Drop oldest unplayed samples rather than crashing or unboundedly delaying
      const overflow = len - free;
      this.readIndex = (this.readIndex + overflow) % this.capacity;
      this.available -= overflow;
      this.droppedSamples += overflow;
    }

    const firstPart = Math.min(len, this.capacity - this.writeIndex);
    this.ring.set(samples.subarray(0, firstPart), this.writeIndex);
    if (firstPart < len) {
      this.ring.set(samples.subarray(firstPart), 0);
    }
    this.writeIndex = (this.writeIndex + len) % this.capacity;
    this.available += len;
  }

  process(_inputs, outputs) {
    const output = outputs && outputs[0];
    if (!output || !output[0]) {
      return true;
    }

    const channel0 = output[0];
    const blockLen = channel0.length;

    // Wait for small jitter prebuffer before starting playback (unless turn already finished)
    if (!this.isPlaying) {
      if (this.available >= this.prebufferSamples || (this.turnCompleteForGen && this.available > 0)) {
        this.isPlaying = true;
        this.port.postMessage({
          type: 'playback-started',
          generationId: this.generationId,
          bufferedMs: (this.available / sampleRate) * 1000,
        });
      }
    }

    if (!this.isPlaying) {
      // Output silence (or 2 ms micro-fade tail right after barge-in flush)
      for (let i = 0; i < blockLen; i += 1) {
        if (this.fadeOutSamplesRemaining > 0) {
          const gain = this.fadeOutSamplesRemaining / this.fadeOutTotal;
          channel0[i] = this.lastOutputSample * gain;
          this.fadeOutSamplesRemaining -= 1;
        } else {
          channel0[i] = 0;
        }
      }
      if (this.fadeOutSamplesRemaining === 0) {
        this.lastOutputSample = 0;
      }
    } else {
      let playedCount = 0;
      for (let i = 0; i < blockLen; i += 1) {
        if (this.available > 0) {
          const sample = this.ring[this.readIndex];
          this.readIndex = (this.readIndex + 1) % this.capacity;
          this.available -= 1;
          channel0[i] = sample;
          this.lastOutputSample = sample;
          this.meterSumSq += sample * sample;
          playedCount += 1;
        } else {
          channel0[i] = 0;
        }
        this.meterCount += 1;
      }

      if (playedCount < blockLen) {
        if (this.turnCompleteForGen) {
          this.isPlaying = false;
          this.port.postMessage({
            type: 'drained',
            generationId: this.generationId,
            underruns: this.underruns,
          });
        } else {
          // Temporary network jitter underrun while turn is still streaming
          this.underruns += 1;
          this.isPlaying = false;
          this.port.postMessage({
            type: 'underrun',
            generationId: this.generationId,
            underruns: this.underruns,
          });
        }
      }
    }

    // Mirror mono output to additional speaker channels if present
    for (let ch = 1; ch < output.length; ch += 1) {
      output[ch].set(channel0);
    }

    // Emit audible output RMS at ~60 Hz
    if (!this.isPlaying && this.meterCount === 0) {
      return true;
    }

    if (this.meterCount >= this.meterIntervalSamples || !this.isPlaying) {
      const rms = this.meterCount > 0
        ? Math.min(1, Math.sqrt(this.meterSumSq / this.meterCount) * 2.6)
        : 0;
      this.port.postMessage({
        type: 'level',
        rms: this.isPlaying ? rms : 0,
        bufferedMs: (this.available / sampleRate) * 1000,
        isPlaying: this.isPlaying,
        underruns: this.underruns,
        droppedSamples: this.droppedSamples,
      });
      this.meterSumSq = 0;
      this.meterCount = 0;
    }

    return true;
  }
}

registerProcessor('${PCM_PLAYBACK_PROCESSOR_NAME}', BlinkPcmPlaybackProcessor);
`;

/**
 * Registers the streaming playback AudioWorklet module on the given AudioContext.
 */
export async function registerPcmPlaybackWorklet(audioContext: AudioContext): Promise<void> {
  const blob = new Blob([PCM_PLAYBACK_WORKLET_SOURCE], { type: 'application/javascript' });
  const moduleUrl = URL.createObjectURL(blob);
  try {
    await audioContext.audioWorklet.addModule(moduleUrl);
  } finally {
    URL.revokeObjectURL(moduleUrl);
  }
}
