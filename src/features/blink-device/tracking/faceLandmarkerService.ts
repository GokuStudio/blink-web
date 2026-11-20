/**
 * MediaPipe Face Landmarker Service
 * 
 * Evaluates and manages real-time facial landmark and blendshape inference
 * using @mediapipe/tasks-vision.
 * 
 * Model Loading Strategy:
 * - Versioned Google MediaPipe Cloud Storage model bundle (float16 task, 3.75 MB).
 * - CDN-hosted WebAssembly binary assets matching @mediapipe/tasks-vision@1.2.3.
 * - Non-blocking frame dropping pipeline preventing queue latency.
 * - Decoupled from WebGL render loop (60 FPS rendering remains smooth).
 * 
 * Anatomical Mapping Note:
 * - MediaPipe's `eyeBlinkLeft` corresponds to the subject's anatomical left eye.
 * - On a standard mirrored user-facing webcam, the subject's anatomical left eye
 *   is on the right-hand side of the camera feed.
 */

import { FaceLandmarker, FilesetResolver, FaceLandmarkerResult } from '@mediapipe/tasks-vision';
import { TrackingFrameResult } from './types';
import { eyeTrackingBridge } from './eyeTrackingBridge';

export const MEDIAPIPE_WASM_CDN = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.3/wasm';
export const DEFAULT_MODEL_ASSET_PATH = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

export interface FaceLandmarkerServiceCallbacks {
  onFrame?: (frame: TrackingFrameResult) => void;
  onError?: (error: Error) => void;
  onModelLoaded?: () => void;
  onFpsUpdate?: (fps: number, avgLatencyMs: number) => void;
}

export class FaceLandmarkerService {
  private landmarker: FaceLandmarker | null = null;
  private isModelLoading = false;
  private isProcessing = false;
  private isRunning = false;
  private videoElement: HTMLVideoElement | null = null;
  private animFrameId: number | null = null;
  private videoFrameCallbackId: number | null = null;
  private callbacks: FaceLandmarkerServiceCallbacks;

  // Performance metrics
  private lastFrameTime = 0;
  private frameCount = 0;
  private fpsWindowStart = 0;
  private currentFps = 0;
  private avgLatencyMs = 0;

  constructor(callbacks: FaceLandmarkerServiceCallbacks = {}) {
    this.callbacks = callbacks;
  }

  public isReady(): boolean {
    return this.landmarker !== null;
  }

  public isLoading(): boolean {
    return this.isModelLoading;
  }

  /**
   * Initializes FilesetResolver and FaceLandmarker.
   */
  public async initialize(modelPath: string = DEFAULT_MODEL_ASSET_PATH): Promise<void> {
    if (this.landmarker || this.isModelLoading) return;

    this.isModelLoading = true;
    try {
      const vision = await FilesetResolver.forVisionTasks(MEDIAPIPE_WASM_CDN);
      this.landmarker = await FaceLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: modelPath,
          delegate: 'GPU',
        },
        runningMode: 'VIDEO',
        numFaces: 1,
        outputFaceBlendshapes: true,
        outputFacialTransformationMatrixes: false,
      });

      this.isModelLoading = false;
      this.callbacks.onModelLoaded?.();
    } catch (err: unknown) {
      this.isModelLoading = false;
      const error = err instanceof Error ? err : new Error(String(err));
      this.callbacks.onError?.(error);
      throw error;
    }
  }

  /**
   * Starts inference loop on the provided MediaStream.
   */
  public start(stream: MediaStream): void {
    if (!this.landmarker) {
      throw new Error('FaceLandmarker must be initialized before starting tracking.');
    }

    this.stop();
    this.isRunning = true;

    // Create a detached, non-rendered video element for frame ingestion
    const video = document.createElement('video');
    video.srcObject = stream;
    video.playsInline = true;
    video.muted = true;
    video.autoplay = true;

    this.videoElement = video;

    video.onloadeddata = () => {
      video.play().then(() => {
        this.fpsWindowStart = performance.now();
        this.frameCount = 0;
        this.scheduleNextFrame();
      }).catch((err) => {
        this.callbacks.onError?.(err);
      });
    };
  }

  /**
   * Non-blocking inference loop with frame dropping.
   * If an inference pass is currently running, subsequent video frames are dropped.
   */
  private scheduleNextFrame(): void {
    if (!this.isRunning || !this.videoElement) return;

    // Use requestVideoFrameCallback when supported for exact video frame alignment
    const v = this.videoElement as HTMLVideoElement & {
      requestVideoFrameCallback?: (cb: (now: number, metadata: unknown) => void) => number;
      cancelVideoFrameCallback?: (id: number) => void;
    };

    if (typeof v.requestVideoFrameCallback === 'function') {
      this.videoFrameCallbackId = v.requestVideoFrameCallback(() => {
        this.processCurrentVideoFrame();
        this.scheduleNextFrame();
      });
    } else {
      this.animFrameId = requestAnimationFrame(() => {
        this.processCurrentVideoFrame();
        this.scheduleNextFrame();
      });
    }
  }

  private processCurrentVideoFrame(): void {
    if (!this.isRunning || !this.videoElement || !this.landmarker) return;

    // Frame dropping: skip frame if inference is currently busy
    if (this.isProcessing) {
      eyeTrackingBridge.recordDroppedFrame();
      return;
    }

    if (this.videoElement.readyState < 2) {
      return;
    }

    const now = performance.now();
    // Enforce strictly monotonic timestamp for MediaPipe Video running mode
    if (now <= this.lastFrameTime) {
      return;
    }

    this.isProcessing = true;
    const startTime = performance.now();

    try {
      const results: FaceLandmarkerResult = this.landmarker.detectForVideo(this.videoElement, now);
      const latency = performance.now() - startTime;
      this.lastFrameTime = now;

      // Update moving average latency
      this.avgLatencyMs = this.avgLatencyMs === 0 ? latency : this.avgLatencyMs * 0.9 + latency * 0.1;

      // FPS calculation
      this.frameCount++;
      const elapsed = now - this.fpsWindowStart;
      if (elapsed >= 1000) {
        this.currentFps = Math.round((this.frameCount * 1000) / elapsed);
        this.frameCount = 0;
        this.fpsWindowStart = now;
        this.callbacks.onFpsUpdate?.(this.currentFps, this.avgLatencyMs);
      }

      // Extract blendshapes
      let closureLeft = 0;
      let closureRight = 0;
      const isFaceDetected = results.faceLandmarks.length > 0;

      if (isFaceDetected && results.faceBlendshapes && results.faceBlendshapes.length > 0) {
        const categories = results.faceBlendshapes[0].categories;
        for (let i = 0; i < categories.length; i++) {
          const cat = categories[i];
          if (cat.categoryName === 'eyeBlinkLeft') {
            closureLeft = cat.score;
          } else if (cat.categoryName === 'eyeBlinkRight') {
            closureRight = cat.score;
          }
        }
      }

      const frameResult: TrackingFrameResult = {
        timestamp: now,
        closureLeft,
        closureRight,
        isFaceDetected,
        trackingConfidence: isFaceDetected ? 1.0 : 0.0,
        inferenceDurationMs: latency,
      };

      eyeTrackingBridge.updateFromTracking(frameResult);
      this.callbacks.onFrame?.(frameResult);
    } catch (err: unknown) {
      // Non-fatal inference glitch
      console.warn('MediaPipe tracking frame warning:', err);
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Stops inference loop and tears down video element.
   */
  public stop(): void {
    this.isRunning = false;
    this.isProcessing = false;
    eyeTrackingBridge.setTrackingActive(false);

    if (this.videoFrameCallbackId !== null && this.videoElement) {
      const v = this.videoElement as HTMLVideoElement & {
        cancelVideoFrameCallback?: (id: number) => void;
      };
      v.cancelVideoFrameCallback?.(this.videoFrameCallbackId);
      this.videoFrameCallbackId = null;
    }

    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }

    if (this.videoElement) {
      this.videoElement.pause();
      this.videoElement.srcObject = null;
      this.videoElement = null;
    }
  }

  /**
   * Releases FaceLandmarker instance memory.
   */
  public destroy(): void {
    this.stop();
    if (this.landmarker) {
      try {
        this.landmarker.close();
      } catch {
        // Ignore close error during teardown
      }
      this.landmarker = null;
    }
  }
}
