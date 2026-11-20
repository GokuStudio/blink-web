import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BlinkClassifier } from '../src/features/blink-device/tracking/blinkClassifier';
import { CameraService } from '../src/features/blink-device/tracking/cameraService';
import { TrackingFrameResult } from '../src/features/blink-device/tracking/types';

describe('BlinkClassifier Deterministic Engine', () => {
  let classifier: BlinkClassifier;

  beforeEach(() => {
    classifier = new BlinkClassifier();
  });

  const makeFrame = (
    timestamp: number,
    closureLeft: number,
    closureRight: number,
    isFaceDetected = true
  ): TrackingFrameResult => ({
    timestamp,
    closureLeft,
    closureRight,
    isFaceDetected,
    trackingConfidence: isFaceDetected ? 1.0 : 0.0,
    inferenceDurationMs: 15,
  });

  it('detects a clean bilateral blink and increments blink count by exactly 1', () => {
    // Resting open eyes
    expect(classifier.processFrame(makeFrame(0, 0.1, 0.1))).toBeNull();

    // Eyes close simultaneously
    classifier.processFrame(makeFrame(50, 0.75, 0.75));
    // Mid-blink hold
    classifier.processFrame(makeFrame(120, 0.85, 0.85));

    // Eyes reopen simultaneously (duration = 150ms, within [50ms, 450ms])
    const event = classifier.processFrame(makeFrame(200, 0.2, 0.2));

    expect(event).not.toBeNull();
    expect(event?.type).toBe('BilateralBlink');
    expect(event?.durationMs).toBe(150);

    const counters = classifier.getCounters();
    expect(counters.blinkCount).toBe(1);
    expect(counters.leftWinkCount).toBe(0);
    expect(counters.rightWinkCount).toBe(0);
  });

  it('guarantees bilateral blinks are not double-counted when eyes reopen with slight micro-timing asymmetry', () => {
    // Frame 0: Open
    classifier.processFrame(makeFrame(0, 0.1, 0.1));

    // Frame 1: Both eyes close
    classifier.processFrame(makeFrame(50, 0.72, 0.72));

    // Frame 2: Left eye reopens first at t=180 (duration = 130ms)
    const eventLeft = classifier.processFrame(makeFrame(180, 0.25, 0.72));
    expect(eventLeft).not.toBeNull();
    expect(eventLeft?.type).toBe('BilateralBlink');

    // Frame 3: Right eye reopens 30ms later at t=210 (within coincidence window)
    const eventRight = classifier.processFrame(makeFrame(210, 0.25, 0.25));
    // Crucial: Right eye reopen must NOT produce a second blink event!
    expect(eventRight).toBeNull();

    const counters = classifier.getCounters();
    expect(counters.blinkCount).toBe(1);
    expect(counters.leftWinkCount).toBe(0);
    expect(counters.rightWinkCount).toBe(0);
  });

  it('detects an independent left wink while right eye remains open', () => {
    classifier.processFrame(makeFrame(0, 0.1, 0.1));

    // Left closes, right stays open (0.12)
    classifier.processFrame(makeFrame(50, 0.80, 0.12));
    classifier.processFrame(makeFrame(120, 0.85, 0.10));

    // Left reopens at t=200
    const event = classifier.processFrame(makeFrame(200, 0.20, 0.10));

    expect(event).not.toBeNull();
    expect(event?.type).toBe('LeftWink');
    expect(event?.durationMs).toBe(150);

    const counters = classifier.getCounters();
    expect(counters.blinkCount).toBe(0);
    expect(counters.leftWinkCount).toBe(1);
    expect(counters.rightWinkCount).toBe(0);
  });

  it('detects an independent right wink while left eye remains open', () => {
    classifier.processFrame(makeFrame(0, 0.1, 0.1));

    // Right closes, left stays open (0.15)
    classifier.processFrame(makeFrame(50, 0.15, 0.80));
    classifier.processFrame(makeFrame(120, 0.12, 0.85));

    // Right reopens at t=200
    const event = classifier.processFrame(makeFrame(200, 0.12, 0.20));

    expect(event).not.toBeNull();
    expect(event?.type).toBe('RightWink');
    expect(event?.durationMs).toBe(150);

    const counters = classifier.getCounters();
    expect(counters.blinkCount).toBe(0);
    expect(counters.leftWinkCount).toBe(0);
    expect(counters.rightWinkCount).toBe(1);
  });

  it('maintains hysteresis stability against noisy chatter near thresholds', () => {
    classifier.processFrame(makeFrame(0, 0.1, 0.1));

    // Fluctuate just below closeThreshold (0.58 < 0.60)
    classifier.processFrame(makeFrame(30, 0.58, 0.58));
    expect(classifier.getEyeStates().left.status).toBe('OPEN');

    // Cross close threshold (0.62 >= 0.60) -> CLOSED
    classifier.processFrame(makeFrame(60, 0.62, 0.62));
    expect(classifier.getEyeStates().left.status).toBe('CLOSED');

    // Fluctuate between openThreshold (0.35) and closeThreshold (0.60): 0.48, 0.42
    classifier.processFrame(makeFrame(100, 0.48, 0.48));
    expect(classifier.getEyeStates().left.status).toBe('CLOSED'); // Must stay CLOSED due to hysteresis

    classifier.processFrame(makeFrame(140, 0.40, 0.40));
    expect(classifier.getEyeStates().left.status).toBe('CLOSED'); // Still CLOSED

    // Finally drop below openThreshold (0.30 <= 0.35) -> REOPENED
    const event = classifier.processFrame(makeFrame(190, 0.30, 0.30));
    expect(classifier.getEyeStates().left.status).toBe('OPEN');
    expect(event?.type).toBe('BilateralBlink');
  });

  it('rejects short noise glitches (<50ms)', () => {
    classifier.processFrame(makeFrame(0, 0.1, 0.1));

    // Sudden 1-frame tracking artifact at t=50
    classifier.processFrame(makeFrame(50, 0.85, 0.85));

    // Reopen at t=80 (duration = 30ms < 50ms minimum duration)
    const event = classifier.processFrame(makeFrame(80, 0.20, 0.20));

    expect(event).toBeNull();
    expect(classifier.getCounters().blinkCount).toBe(0);
  });

  it('rejects prolonged closures (>450ms) as involuntary blinks', () => {
    classifier.processFrame(makeFrame(0, 0.1, 0.1));

    // Close eyes at t=50
    classifier.processFrame(makeFrame(50, 0.85, 0.85));

    // Held closed for 600ms
    classifier.processFrame(makeFrame(350, 0.85, 0.85));
    classifier.processFrame(makeFrame(650, 0.85, 0.85));

    // Reopen at t=700 (duration = 650ms > 450ms)
    const event = classifier.processFrame(makeFrame(700, 0.20, 0.20));

    expect(event).toBeNull();
    expect(classifier.getCounters().blinkCount).toBe(0);
  });

  it('handles face tracking loss mid-blink by resetting safely without false emissions', () => {
    classifier.processFrame(makeFrame(0, 0.1, 0.1));

    // Eyes close at t=50
    classifier.processFrame(makeFrame(50, 0.80, 0.80));
    expect(classifier.getEyeStates().left.status).toBe('CLOSED');

    // Face is lost at t=100 (e.g. user turned away or occlusion)
    const lostEvent = classifier.processFrame(makeFrame(100, 0, 0, false));
    expect(lostEvent).toBeNull();
    expect(classifier.getEyeStates().left.status).toBe('OPEN');
    expect(classifier.getCounters().lastEvent?.type).toBe('FaceLost');

    // Face returns at t=200 with open eyes
    const returnEvent = classifier.processFrame(makeFrame(200, 0.15, 0.15, true));
    expect(returnEvent).toBeNull();
    expect(classifier.getCounters().blinkCount).toBe(0);
  });

  it('gracefully handles duplicate and non-advancing frame timestamps', () => {
    classifier.processFrame(makeFrame(100, 0.1, 0.1));

    // Duplicate timestamp frame
    const dupEvent = classifier.processFrame(makeFrame(100, 0.8, 0.8));
    expect(dupEvent).toBeNull();

    // Backwards timestamp frame
    const backwardsEvent = classifier.processFrame(makeFrame(90, 0.8, 0.8));
    expect(backwardsEvent).toBeNull();
  });

  it('resets all counters and internal states on reset()', () => {
    // Generate 1 blink and 1 wink
    classifier.processFrame(makeFrame(0, 0.1, 0.1));
    classifier.processFrame(makeFrame(50, 0.8, 0.8));
    classifier.processFrame(makeFrame(200, 0.2, 0.2));

    classifier.processFrame(makeFrame(350, 0.8, 0.1));
    classifier.processFrame(makeFrame(500, 0.2, 0.1));

    expect(classifier.getCounters().blinkCount).toBe(1);
    expect(classifier.getCounters().leftWinkCount).toBe(1);

    classifier.reset();

    const cleared = classifier.getCounters();
    expect(cleared.blinkCount).toBe(0);
    expect(cleared.leftWinkCount).toBe(0);
    expect(cleared.rightWinkCount).toBe(0);
    expect(cleared.lastEvent).toBeNull();
  });
});

describe('CameraService Hardware & Permission Lifecycle', () => {
  it('handles permission denial (NotAllowedError)', async () => {
    const permSpy = vi.fn();
    const errSpy = vi.fn();

    const service = new CameraService({
      onPermissionChange: permSpy,
      onError: errSpy,
    });

    // Mock navigator.mediaDevices.getUserMedia rejecting with NotAllowedError
    const originalMediaDevices = navigator.mediaDevices;
    Object.defineProperty(navigator, 'mediaDevices', {
      writable: true,
      value: {
        getUserMedia: vi.fn().mockRejectedValue(new DOMException('Permission denied', 'NotAllowedError')),
      },
    });

    await expect(service.start()).rejects.toThrow();
    expect(service.getPermissionState()).toBe('denied');
    expect(permSpy).toHaveBeenCalledWith('denied');

    // Restore
    Object.defineProperty(navigator, 'mediaDevices', {
      writable: true,
      value: originalMediaDevices,
    });
  });

  it('handles unsupported or missing camera (NotFoundError)', async () => {
    const permSpy = vi.fn();
    const errSpy = vi.fn();

    const service = new CameraService({
      onPermissionChange: permSpy,
      onError: errSpy,
    });

    // Mock navigator.mediaDevices.getUserMedia rejecting with NotFoundError
    const originalMediaDevices = navigator.mediaDevices;
    Object.defineProperty(navigator, 'mediaDevices', {
      writable: true,
      value: {
        getUserMedia: vi.fn().mockRejectedValue(new DOMException('No camera found', 'NotFoundError')),
      },
    });

    await expect(service.start()).rejects.toThrow();
    expect(service.getPermissionState()).toBe('unsupported');
    expect(permSpy).toHaveBeenCalledWith('unsupported');

    // Restore
    Object.defineProperty(navigator, 'mediaDevices', {
      writable: true,
      value: originalMediaDevices,
    });
  });

  it('stops media stream tracks cleanly on stop()', async () => {
    const mockTrack = {
      stop: vi.fn(),
      onended: null,
      onmute: null,
      onunmute: null,
    };
    const mockStream = {
      getTracks: () => [mockTrack],
      getVideoTracks: () => [mockTrack],
    } as unknown as MediaStream;

    const originalMediaDevices = navigator.mediaDevices;
    Object.defineProperty(navigator, 'mediaDevices', {
      writable: true,
      value: {
        getUserMedia: vi.fn().mockResolvedValue(mockStream),
      },
    });

    const service = new CameraService();
    await service.start();
    expect(service.getPermissionState()).toBe('granted');

    service.stop();
    expect(mockTrack.stop).toHaveBeenCalled();
    expect(service.getStream()).toBeNull();
    expect(service.getPermissionState()).toBe('idle');

    // Restore
    Object.defineProperty(navigator, 'mediaDevices', {
      writable: true,
      value: originalMediaDevices,
    });
  });
});
