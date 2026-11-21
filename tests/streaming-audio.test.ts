import { describe, it, expect } from 'vitest';
import {
  base64ToInt16,
  computeFloat32Rms,
  DualChannelAudioMeter,
  float32ToInt16Pcm,
  int16PcmToFloat32,
  int16ToBase64,
  parsePcmMimeType,
  PlaybackRingBuffer,
  resampleLinear,
  StreamingLinearResampler,
} from '@/features/hey-blink';

describe('Phase H2 — PCM Encoding, Decoding & MIME Parsing', () => {
  it('encodes Float32 PCM to Int16 LE with proper clamping and round-trips through Base64', () => {
    const input = new Float32Array([-1.5, -1.0, -0.5, 0, 0.5, 1.0, 1.5]);
    const int16 = float32ToInt16Pcm(input);

    expect(int16[0]).toBe(-32768);
    expect(int16[1]).toBe(-32768);
    expect(int16[3]).toBe(0);
    expect(int16[5]).toBe(32767);
    expect(int16[6]).toBe(32767);

    const b64 = int16ToBase64(int16);
    const decoded = base64ToInt16(b64);
    expect(Array.from(decoded)).toEqual(Array.from(int16));

    const floatBack = int16PcmToFloat32(decoded);
    expect(floatBack[1]).toBeCloseTo(-1, 3);
    expect(floatBack[3]).toBe(0);
    expect(floatBack[5]).toBeCloseTo(1, 3);
  });

  it('parses Gemini output audio MIME metadata dynamically', () => {
    expect(parsePcmMimeType('audio/pcm;rate=24000')).toEqual({
      sampleRate: 24000,
      channels: 1,
      bitDepth: 16,
      isPcm: true,
    });

    expect(parsePcmMimeType('audio/pcm; rate=16000; channels=2')).toEqual({
      sampleRate: 16000,
      channels: 2,
      bitDepth: 16,
      isPcm: true,
    });

    expect(parsePcmMimeType('audio/mpeg').isPcm).toBe(false);
    expect(parsePcmMimeType(undefined).sampleRate).toBe(24000);
  });

  it('computes accurate Float32 RMS energy', () => {
    const silence = new Float32Array(128).fill(0);
    expect(computeFloat32Rms(silence)).toBe(0);

    const tone = new Float32Array(128).fill(0.25);
    expect(computeFloat32Rms(tone)).toBeCloseTo(0.25 * 2.8, 3);
  });
});

describe('Phase H2 — Sample-Rate Conversion', () => {
  it('downsamples 48 kHz -> 16 kHz and 44.1 kHz -> 16 kHz accurately', () => {
    const src48 = new Float32Array(480); // 10 ms @ 48 kHz
    for (let i = 0; i < src48.length; i += 1) {
      src48[i] = Math.sin((2 * Math.PI * 440 * i) / 48000);
    }
    const dst16 = resampleLinear(src48, 48000, 16000);
    expect(dst16.length).toBe(160); // 10 ms @ 16 kHz

    const src441 = new Float32Array(441); // 10 ms @ 44.1 kHz
    for (let i = 0; i < src441.length; i += 1) {
      src441[i] = Math.sin((2 * Math.PI * 440 * i) / 44100);
    }
    const dstFrom441 = resampleLinear(src441, 44100, 16000);
    expect(dstFrom441.length).toBe(160);
  });

  it('maintains fractional phase continuity across consecutive streaming blocks', () => {
    const resampler = new StreamingLinearResampler(44100, 16000);
    // Feed 10 consecutive 128-sample Web Audio quanta (1280 samples @ 44.1 kHz ~= 464.4 samples @ 16 kHz)
    let totalOut = 0;
    for (let block = 0; block < 10; block += 1) {
      const quantum = new Float32Array(128);
      for (let i = 0; i < 128; i += 1) {
        const globalIdx = block * 128 + i;
        quantum[i] = Math.sin((2 * Math.PI * 300 * globalIdx) / 44100);
      }
      const out = resampler.process(quantum);
      totalOut += out.length;
    }
    expect(totalOut).toBeGreaterThanOrEqual(463);
    expect(totalOut).toBeLessThanOrEqual(466);
  });
});

describe('Phase H2 — PlaybackRingBuffer Ordering, Prebuffer, Underrun & Barge-In Flush', () => {
  it('preserves strict FIFO chunk ordering and respects prebuffer threshold', () => {
    // 24 kHz, 2s buffer, 10 ms prebuffer = 240 samples
    const ring = new PlaybackRingBuffer(24000, 2, 10);

    // Enqueue 120 samples (< 240 prebuffer): should not start playing yet
    const chunkA = new Float32Array(120).map((_, i) => (i + 1) / 1000);
    expect(ring.enqueue(chunkA, 0)).toBe(true);
    const beforePrebuffer = ring.read(128);
    expect(ring.getIsPlaying()).toBe(false);
    expect(beforePrebuffer.samples[0]).toBe(0);

    // Enqueue 200 more samples (total 320 >= 240): playback starts in exact FIFO order
    const chunkB = new Float32Array(200).map((_, i) => (121 + i) / 1000);
    expect(ring.enqueue(chunkB, 0)).toBe(true);

    const read1 = ring.read(128);
    expect(ring.getIsPlaying()).toBe(true);
    expect(read1.samples[0]).toBeCloseTo(0.001, 5);
    expect(read1.samples[119]).toBeCloseTo(0.120, 5);
    expect(read1.samples[120]).toBeCloseTo(0.121, 5);
  });

  it('flushes immediately on barge-in and rejects stale generation chunks', () => {
    const ring = new PlaybackRingBuffer(24000, 2, 10);
    const samples = new Float32Array(512).fill(0.5);
    ring.enqueue(samples, 0);
    ring.read(128);
    expect(ring.getIsPlaying()).toBe(true);
    expect(ring.getAvailableSamples()).toBe(384);

    // Barge-in flush bumps generation ID from 0 -> 1 and empties queue immediately
    const newGen = ring.flush();
    expect(newGen).toBe(1);
    expect(ring.getIsPlaying()).toBe(false);
    expect(ring.getAvailableSamples()).toBe(0);

    // Stale chunk from interrupted generation 0 is rejected
    expect(ring.enqueue(new Float32Array(256).fill(0.9), 0)).toBe(false);
    expect(ring.getAvailableSamples()).toBe(0);

    // Fresh chunk from new generation 1 is accepted
    expect(ring.enqueue(new Float32Array(256).fill(0.25), 1)).toBe(true);
    expect(ring.getAvailableSamples()).toBe(256);
  });

  it('tracks underruns mid-turn and drains cleanly when turnComplete is set', () => {
    const ring = new PlaybackRingBuffer(24000, 2, 5); // 120 samples prebuffer
    ring.enqueue(new Float32Array(150).fill(0.4), 0);

    const r1 = ring.read(128);
    expect(r1.underrun).toBe(false);

    // Remaining 22 samples < 128 without turnComplete -> underrun counted
    const r2 = ring.read(128);
    expect(r2.underrun).toBe(true);
    expect(ring.getUnderruns()).toBe(1);

    // Now enqueue final samples and mark turnComplete -> clean drain, no extra underrun
    ring.enqueue(new Float32Array(64).fill(0.2), 0);
    ring.markTurnComplete(0);
    const r3 = ring.read(128);
    expect(r3.drained).toBe(true);
    expect(r3.underrun).toBe(false);
    expect(ring.getUnderruns()).toBe(1);
  });

  it('keeps input and output metering independent during simultaneous audio activity', () => {
    const meter = new DualChannelAudioMeter();
    const s1 = meter.step(0.75, 0.1, 100);
    const s2 = meter.step(0.75, 0.85, 132);
    expect(s2.input).toBeGreaterThan(s1.input);
    expect(s2.output).toBeGreaterThan(s1.output);

    meter.suppressOutput();
    expect(meter.getLevels().output).toBe(0);
    expect(meter.getLevels().input).toBeGreaterThan(0.3);
  });
});
