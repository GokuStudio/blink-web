/**
 * Camera Acquisition Service
 * Manages webcam/front-facing mobile video streams via navigator.mediaDevices.getUserMedia.
 * 
 * Strict privacy rule: Frames are processed strictly in browser memory.
 * No video data is ever stored, recorded, or transmitted to any remote service.
 */

import { CameraPermissionState } from './types';

export interface CameraServiceCallbacks {
  onPermissionChange?: (state: CameraPermissionState) => void;
  onError?: (error: Error) => void;
  onStreamInterrupted?: () => void;
}

export class CameraService {
  private mediaStream: MediaStream | null = null;
  private permissionState: CameraPermissionState = 'idle';
  private callbacks: CameraServiceCallbacks = {};

  constructor(callbacks: CameraServiceCallbacks = {}) {
    this.callbacks = callbacks;
    this.checkInitialSupport();
  }

  public getStream(): MediaStream | null {
    return this.mediaStream;
  }

  public getPermissionState(): CameraPermissionState {
    return this.permissionState;
  }

  public isSupported(): boolean {
    if (typeof window === 'undefined') return false;
    const isSecure = window.isSecureContext || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    return isSecure && !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
  }

  private setPermission(state: CameraPermissionState): void {
    this.permissionState = state;
    this.callbacks.onPermissionChange?.(state);
  }

  private checkInitialSupport(): void {
    if (!this.isSupported()) {
      this.setPermission('unsupported');
    }
  }

  /**
   * Requests camera access through an explicit user action.
   * Prefers mobile front-facing camera ('user') with graceful fallback.
   */
  public async start(): Promise<MediaStream> {
    if (!this.isSupported()) {
      const err = new Error('Camera access requires a secure context (HTTPS or localhost) and supported browser mediaDevices API.');
      this.setPermission('unsupported');
      this.callbacks.onError?.(err);
      throw err;
    }

    // Stop any existing stream before starting a new one
    this.stop();
    this.setPermission('requesting');

    // Progressive constraint tiers
    const primaryConstraints: MediaStreamConstraints = {
      video: {
        facingMode: { ideal: 'user' },
        width: { ideal: 640 },
        height: { ideal: 480 },
        frameRate: { ideal: 30, max: 60 }
      },
      audio: false
    };

    const fallbackConstraints: MediaStreamConstraints = {
      video: true,
      audio: false
    };

    try {
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia(primaryConstraints);
      } catch (err: unknown) {
        // Fallback for desktop webcams or devices that reject facingMode constraints
        const domError = err as DOMException;
        if (domError.name === 'OverconstrainedError' || domError.name === 'ConstraintNotSatisfiedError') {
          stream = await navigator.mediaDevices.getUserMedia(fallbackConstraints);
        } else {
          throw err;
        }
      }

      this.mediaStream = stream;
      this.setPermission('granted');

      // Setup track lifecycle monitoring
      stream.getVideoTracks().forEach((track) => {
        track.onended = () => {
          this.handleInterruption();
        };
        track.onmute = () => {
          this.handleInterruption();
        };
        track.onunmute = () => {
          if (this.permissionState === 'idle') {
            this.setPermission('granted');
          }
        };
      });

      return stream;
    } catch (err: unknown) {
      const domError = err as DOMException;
      let mappedState: CameraPermissionState = 'error';

      if (domError.name === 'NotAllowedError' || domError.name === 'PermissionDeniedError') {
        mappedState = 'denied';
      } else if (domError.name === 'NotFoundError' || domError.name === 'DevicesNotFoundError') {
        mappedState = 'unsupported';
      } else if (domError.name === 'NotReadableError' || domError.name === 'TrackStartError') {
        mappedState = 'error';
      }

      this.setPermission(mappedState);
      const standardError = err instanceof Error ? err : new Error(String(err));
      this.callbacks.onError?.(standardError);
      throw standardError;
    }
  }

  private handleInterruption(): void {
    this.callbacks.onStreamInterrupted?.();
  }

  /**
   * Releases all media stream tracks cleanly on cleanup.
   */
  public stop(): void {
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => {
        try {
          track.stop();
          track.onended = null;
          track.onmute = null;
          track.onunmute = null;
        } catch {
          // Ignore track stop exceptions during teardown
        }
      });
      this.mediaStream = null;
    }

    if (this.permissionState === 'granted' || this.permissionState === 'requesting') {
      this.setPermission('idle');
    }
  }
}
