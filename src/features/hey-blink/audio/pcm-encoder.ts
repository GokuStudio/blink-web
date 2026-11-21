/**
 * Hey Blink — Realtime PCM Encoding, Decoding & Sample-Rate Conversion (Phase H2)
 *
 * Gemini Live audio format specifications:
 * - Input (Client -> Gemini):  Mono 16-bit signed little-endian PCM @ 16,000 Hz (`audio/pcm;rate=16000`)
 * - Output (Gemini -> Client): Mono 16-bit signed little-endian PCM @ 24,000 Hz (parsed from MIME metadata)
 */

export const GEMINI_INPUT_SAMPLE_RATE = 16000;
export const GEMINI_DEFAULT_OUTPUT_SAMPLE_RATE = 24000;
export const GEMINI_INPUT_MIME_TYPE = `audio/pcm;rate=${GEMINI_INPUT_SAMPLE_RATE}`;

export interface ParsedPcmFormat {
  sampleRate: number;
  channels: number;
  bitDepth: number;
  isPcm: boolean;
}

/**
 * Inspects MIME type metadata from Gemini Live audio chunks (e.g. `audio/pcm;rate=24000`)
 * instead of assuming the output format can never change.
 */
export function parsePcmMimeType(mimeType?: string | null): ParsedPcmFormat {
  if (!mimeType) {
    return {
      sampleRate: GEMINI_DEFAULT_OUTPUT_SAMPLE_RATE,
      channels: 1,
      bitDepth: 16,
      isPcm: true,
    };
  }

  const normalized = mimeType.toLowerCase().trim();
  const isPcm = normalized.startsWith('audio/pcm') || normalized.startsWith('audio/l16');

  const rateMatch = normalized.match(/(?:^|;\s*)rate=(\d+)/);
  const parsedRate = rateMatch ? Number.parseInt(rateMatch[1], 10) : GEMINI_DEFAULT_OUTPUT_SAMPLE_RATE;
  const sampleRate =
    Number.isFinite(parsedRate) && parsedRate >= 8000 && parsedRate <= 96000
      ? parsedRate
      : GEMINI_DEFAULT_OUTPUT_SAMPLE_RATE;

  const channelsMatch = normalized.match(/(?:^|;\s*)channels=(\d+)/);
  const parsedChannels = channelsMatch ? Number.parseInt(channelsMatch[1], 10) : 1;
  const channels = Number.isFinite(parsedChannels) && parsedChannels >= 1 && parsedChannels <= 2 ? parsedChannels : 1;

  return {
    sampleRate,
    channels,
    bitDepth: 16,
    isPcm,
  };
}

/**
 * Computes normalized RMS amplitude (0..1) from mono Float32 PCM samples.
 */
export function computeFloat32Rms(samples: Float32Array): number {
  if (samples.length === 0) return 0;
  let sumSq = 0;
  for (let i = 0; i < samples.length; i += 1) {
    const s = samples[i];
    sumSq += s * s;
  }
  const rms = Math.sqrt(sumSq / samples.length);
  // Speech normalization multiplier mapped to 0..1 visual energy
  return Math.min(1, rms * 2.8);
}

/**
 * Converts mono Float32 PCM [-1.0, 1.0] into 16-bit signed little-endian PCM.
 */
export function float32ToInt16Pcm(input: Float32Array): Int16Array {
  const output = new Int16Array(input.length);
  for (let i = 0; i < input.length; i += 1) {
    const clamped = Math.max(-1, Math.min(1, input[i]));
    output[i] = clamped < 0 ? Math.round(clamped * 0x8000) : Math.round(clamped * 0x7fff);
  }
  return output;
}

/**
 * Converts 16-bit signed little-endian PCM into mono Float32 PCM [-1.0, 1.0].
 */
export function int16PcmToFloat32(input: Int16Array): Float32Array {
  const output = new Float32Array(input.length);
  for (let i = 0; i < input.length; i += 1) {
    output[i] = input[i] / 0x8000;
  }
  return output;
}

/**
 * Stateless linear resampler for single-buffer conversion (e.g., 48kHz -> 16kHz or 24kHz -> 48kHz).
 */
export function resampleLinear(
  input: Float32Array,
  sourceRate: number,
  targetRate: number
): Float32Array {
  if (input.length === 0 || sourceRate <= 0 || targetRate <= 0) {
    return new Float32Array(0);
  }
  if (sourceRate === targetRate) {
    return input.slice();
  }

  const ratio = sourceRate / targetRate;
  const outputLength = Math.max(1, Math.floor(input.length / ratio));
  const output = new Float32Array(outputLength);

  for (let i = 0; i < outputLength; i += 1) {
    const srcPos = i * ratio;
    const idx = Math.floor(srcPos);
    const frac = srcPos - idx;
    const s0 = input[idx] ?? 0;
    const s1 = input[Math.min(idx + 1, input.length - 1)] ?? s0;
    output[i] = s0 + (s1 - s0) * frac;
  }

  return output;
}

/**
 * Stateful streaming linear resampler that maintains fractional phase and previous
 * boundary sample across consecutive audio blocks, preventing discontinuities or clicks
 * when streaming 44.1 kHz / 48 kHz microphone audio down to 16 kHz.
 */
export class StreamingLinearResampler {
  private readonly ratio: number;
  private phase = 0;
  private prevSample = 0;
  private hasPrev = false;

  constructor(
    public readonly sourceRate: number,
    public readonly targetRate: number
  ) {
    if (sourceRate <= 0 || targetRate <= 0) {
      throw new RangeError(`Invalid sample rates: ${sourceRate} -> ${targetRate}`);
    }
    this.ratio = sourceRate / targetRate;
  }

  public process(input: Float32Array): Float32Array {
    if (input.length === 0) return new Float32Array(0);
    if (this.sourceRate === this.targetRate) {
      this.prevSample = input[input.length - 1];
      this.hasPrev = true;
      return input.slice();
    }

    // Upper bound on output samples for this block
    const maxOut = Math.ceil((input.length + 2) / this.ratio);
    const temp = new Float32Array(maxOut);
    let outIdx = 0;

    let pos = this.phase;
    while (pos < input.length) {
      const idx = Math.floor(pos);
      const frac = pos - idx;
      const s0 = idx < 0 ? (this.hasPrev ? this.prevSample : input[0]) : input[idx];
      const s1 =
        idx + 1 < input.length
          ? input[idx + 1]
          : input[input.length - 1];
      temp[outIdx] = s0 + (s1 - s0) * frac;
      outIdx += 1;
      pos += this.ratio;
    }

    this.phase = pos - input.length;
    this.prevSample = input[input.length - 1];
    this.hasPrev = true;

    return temp.subarray(0, outIdx);
  }

  public reset(): void {
    this.phase = 0;
    this.prevSample = 0;
    this.hasPrev = false;
  }
}

/**
 * Encodes an Int16Array (little-endian PCM) to Base64 without blowing the call stack.
 */
export function int16ToBase64(pcm: Int16Array): string {
  const bytes = new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength);
  return uint8ToBase64(bytes);
}

/**
 * Encodes a Uint8Array to Base64 in safe 8 KB slices.
 */
export function uint8ToBase64(bytes: Uint8Array): string {
  if (bytes.byteLength === 0) return '';
  const CHUNK_SIZE = 0x2000;
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i += CHUNK_SIZE) {
    const slice = bytes.subarray(i, Math.min(i + CHUNK_SIZE, bytes.byteLength));
    binary += String.fromCharCode(...slice);
  }
  return btoa(binary);
}

/**
 * Decodes a Base64-encoded 16-bit little-endian PCM payload into an Int16Array.
 */
export function base64ToInt16(base64: string): Int16Array {
  if (!base64) return new Int16Array(0);
  const binary = atob(base64);
  const byteLength = binary.length;
  // Ensure even byte length for Int16 alignment
  const alignedLength = byteLength - (byteLength % 2);
  const buffer = new ArrayBuffer(alignedLength);
  const view = new Uint8Array(buffer);
  for (let i = 0; i < alignedLength; i += 1) {
    view[i] = binary.charCodeAt(i);
  }
  return new Int16Array(buffer);
}
