import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '@/shared/context/AuthContext';
import { getFirebaseServices } from '@/shared/firebase/client';
import { env } from '@/config/env';
import type { IRealtimeService } from '@/shared/realtime/interfaces/realtime-service.interface';
import { FirebaseRealtimeService } from '@/shared/realtime/services/firebase-realtime.service';
import { FirebaseRoomService } from '@/shared/realtime/services/firebase-room.service';
import { MockRealtimeService } from '@/shared/realtime/services/mock-realtime.service';
import { MockRoomService } from '@/shared/realtime/services/mock-room.service';
import type { ConnectionStatus } from '@/shared/contracts';
import { DeviceTelemetryPublisher } from '@/features/blink-device/telemetry/deviceTelemetryPublisher';
import { useTrackingStore } from '@/features/blink-device/state/trackingStore';
import { useWellnessStore } from '@/features/blink-device/wellness/wellnessStore';
import { usePersonalityStore } from '@/features/blink-device/personality';
import type { ElevatedLiveTelemetryState } from '@/features/insights/elevated/hooks/useElevatedLiveTelemetry';
import {
  classifyCameraError,
  useDiagnosticStore,
  type DiagnosticActionType,
} from './diagnostics/diagnosticStore';

export type IntegratedStageState =
  | 'INITIALIZING'
  | 'READY'
  | 'CAMERA_REQUIRED'
  | 'CONNECTING'
  | 'LIVE'
  | 'DEMO'
  | 'TRACKING_LOST'
  | 'OFFLINE'
  | 'ERROR';

export interface IntegratedDemoSession {
  roomCode: string;
  transportKind: 'firebase' | 'local';
  realtimeService: IRealtimeService;
  connectionStatus: ConnectionStatus;
  stageState: IntegratedStageState;
  isCameraBusy: boolean;
  isManuallyDisconnected: boolean;
  rendererKey: number;
  elevatedLive: ElevatedLiveTelemetryState | null;

  // Actions
  enableCamera: () => Promise<boolean>;
  disableCamera: () => void;
  toggleCamera: () => Promise<void>;
  reconnectSession: () => Promise<void>;
  disconnectSession: () => Promise<void>;
  switchRoom: (nextRoomCode: string) => Promise<void>;
  reloadRenderer: () => void;
  handleDiagnosticAction: (action: DiagnosticActionType) => void;
  handleElevatedLiveChange: (state: ElevatedLiveTelemetryState) => void;
  handleWebGLStatusChange: (status: 'ready' | 'unavailable' | 'context_lost' | 'restored') => void;
  handleSustainedLowFps: (fps: number | null) => void;
  handleBezelError: () => void;
}

const ROOM_CODE_REGEX = /^[A-Z0-9_-]{3,32}$/;

function normalizeRoomCode(raw: string | null): string {
  const candidate = (raw || env.defaultRoom || 'BLINK-DEMO').trim().toUpperCase();
  if (ROOM_CODE_REGEX.test(candidate)) {
    return candidate;
  }
  return 'BLINK-DEMO';
}

function getOrCreateFirebaseSessionRoom(uid: string): string {
  const cleanUid = uid.replace(/[^A-Za-z0-9]/g, '').slice(0, 4).toUpperCase() || 'USER';
  const storageKey = `blink-demo-room-${cleanUid}`;
  try {
    const existing = window.sessionStorage.getItem(storageKey);
    if (existing && ROOM_CODE_REGEX.test(existing)) {
      return existing;
    }
    const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
    const generated = `BLINK-${cleanUid}-${suffix}`;
    window.sessionStorage.setItem(storageKey, generated);
    return generated;
  } catch {
    return `BLINK-${cleanUid}-${Date.now().toString(36).slice(-4).toUpperCase()}`;
  }
}

export function useIntegratedDemoSession(options?: {
  injectedService?: IRealtimeService;
}): IntegratedDemoSession {
  const [searchParams, setSearchParams] = useSearchParams();
  const auth = useAuth();

  const rawRoomParam = searchParams.get('room');

  // Determine whether Firebase cloud realtime is genuinely ready + authenticated
  const fbServices = getFirebaseServices();
  const isRealFirebaseUser = Boolean(
    fbServices.isReady &&
      fbServices.rtdb &&
      fbServices.auth &&
      auth.user &&
      auth.user.uid &&
      !auth.user.uid.startsWith('mock-')
  );
  const transportKind: 'firebase' | 'local' =
    options?.injectedService
      ? 'local'
      : isRealFirebaseUser
        ? 'firebase'
        : 'local';

  // Use explicit ?room= when provided; on live cloud Firebase without an explicit room,
  // isolate each visitor into a per-session room so concurrent demo users never collide on RTDB rules.
  const roomCode = useMemo(() => {
    if (rawRoomParam) return normalizeRoomCode(rawRoomParam);
    if (transportKind === 'firebase' && auth.user?.uid) {
      return getOrCreateFirebaseSessionRoom(auth.user.uid);
    }
    return normalizeRoomCode(null);
  }, [rawRoomParam, transportKind, auth.user?.uid]);

  // Granular tracking selectors (never subscribe to 30fps closureLeft/closureRight!)
  const isCameraActive = useTrackingStore((s) => s.isCameraActive);
  const permissionState = useTrackingStore((s) => s.permissionState);
  const isModelLoading = useTrackingStore((s) => s.isModelLoading);
  const isModelLoaded = useTrackingStore((s) => s.isModelLoaded);
  const isFaceDetected = useTrackingStore((s) => s.isFaceDetected);
  const cameraError = useTrackingStore((s) => s.cameraError);
  const modelError = useTrackingStore((s) => s.modelError);

  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('connecting');
  const [isCameraBusy, setIsCameraBusy] = useState(false);
  const [isManuallyDisconnected, setIsManuallyDisconnected] = useState(false);
  const [rendererKey, setRendererKey] = useState(0);
  const [webglError, setWebglError] = useState<'unavailable' | 'context_lost' | null>(null);
  const [elevatedLive, setElevatedLive] = useState<ElevatedLiveTelemetryState | null>(null);

  const cameraInFlightRef = useRef(false);
  const prevCameraActiveRef = useRef(isCameraActive);
  const userDisabledCameraRef = useRef(false);
  const publisherRef = useRef<DeviceTelemetryPublisher | null>(null);
  const lastImmediatePublishRef = useRef<number>(0);

  // Single shared IRealtimeService instance for both DeviceTelemetryPublisher and Elevated InsightsApp
  const serviceBundle = useMemo(() => {
    if (options?.injectedService) {
      return {
        realtimeService: options.injectedService,
        roomService: new MockRoomService(),
        kind: 'local' as const,
      };
    }

    if (isRealFirebaseUser && fbServices.rtdb && fbServices.auth) {
      try {
        return {
          realtimeService: new FirebaseRealtimeService(fbServices.rtdb, fbServices.auth),
          roomService: new FirebaseRoomService(fbServices.rtdb, fbServices.auth),
          kind: 'firebase' as const,
        };
      } catch {
        // Safe fallback to local integrated transport
      }
    }

    const localService = new MockRealtimeService();
    localService.setMockUid(auth.user?.uid || 'integrated-demo-local');
    return {
      realtimeService: localService,
      roomService: new MockRoomService(),
      kind: 'local' as const,
    };
  }, [options?.injectedService, isRealFirebaseUser, fbServices.rtdb, fbServices.auth, auth.user?.uid]);

  // 1. Validate explicit ?room= param if user passed malformed code
  useEffect(() => {
    const { reportIssue, resolveIssue } = useDiagnosticStore.getState();
    if (rawRoomParam && !ROOM_CODE_REGEX.test(rawRoomParam.trim().toUpperCase())) {
      reportIssue('FIREBASE_ROOM_INVALID');
    } else {
      resolveIssue('FIREBASE_ROOM_INVALID');
    }
  }, [rawRoomParam]);

  // 2. Startup Choreography: start autonomous eye personality engine on /demo mount
  useEffect(() => {
    const personality = usePersonalityStore.getState();
    personality.startEngine();
    return () => {
      usePersonalityStore.getState().stopEngine();
    };
  }, []);

  // 3. Central Room & Single DeviceTelemetryPublisher Lifecycle
  useEffect(() => {
    if (auth.isLoading && !options?.injectedService) {
      return;
    }

    let isCancelled = false;
    const { reportIssue, resolveIssue } = useDiagnosticStore.getState();

    if (serviceBundle.kind === 'local' && !options?.injectedService) {
      reportIssue('FIREBASE_UNCONFIGURED');
    } else {
      resolveIssue('FIREBASE_UNCONFIGURED');
    }

    const publisher = new DeviceTelemetryPublisher(
      {
        roomCode,
        deviceId: 'blink-integrated-01',
        role: 'integrated-demo',
        publishIntervalMs: 1000,
        autoPublish: true,
      },
      serviceBundle.realtimeService,
      serviceBundle.roomService
    );
    publisherRef.current = publisher;

    const unsubDiag = publisher.onDiagnosticsChange((diag) => {
      if (isCancelled) return;
      setConnectionStatus(diag.connectionStatus);

      if (diag.lastPublishError) {
        const lower = diag.lastPublishError.toLowerCase();
        if (lower.includes('permission')) {
          reportIssue('FIREBASE_PERMISSION_DENIED');
        } else if (lower.includes('auth')) {
          reportIssue('FIREBASE_AUTH_FAILED');
        } else {
          reportIssue('FIREBASE_DISCONNECTED', { explanation: diag.lastPublishError });
        }
      } else if (diag.connectionStatus === 'connected') {
        resolveIssue('FIREBASE_DISCONNECTED');
        resolveIssue('FIREBASE_PAIRING_FAILED');
        resolveIssue('FIREBASE_AUTH_FAILED');
        resolveIssue('FIREBASE_PERMISSION_DENIED');
      }
    });

    setConnectionStatus('connecting');
    setIsManuallyDisconnected(false);

    publisher
      .connect(roomCode)
      .then((ok) => {
        if (isCancelled) return;
        if (ok) {
          resolveIssue('FIREBASE_PAIRING_FAILED');
          resolveIssue('FIREBASE_DISCONNECTED');
          // Publish immediate baseline telemetry tick so Elevated initializes promptly
          publisher.publishTick().catch(() => {});
        } else {
          reportIssue('FIREBASE_PAIRING_FAILED');
        }
      })
      .catch(() => {
        if (!isCancelled) {
          reportIssue('FIREBASE_PAIRING_FAILED');
        }
      });

    // Immediate coalesced telemetry publish when a confirmed bilateral blink increments blinkCount
    let prevBlinkCount = useTrackingStore.getState().blinkCount;
    const unsubBlinkCount = useTrackingStore.subscribe((state) => {
      if (state.blinkCount !== prevBlinkCount) {
        prevBlinkCount = state.blinkCount;
        const now = Date.now();
        if (now - lastImmediatePublishRef.current >= 250) {
          lastImmediatePublishRef.current = now;
          publisher.publishTick().catch(() => {});
        }
      }
    });

    return () => {
      isCancelled = true;
      unsubBlinkCount();
      unsubDiag();
      publisherRef.current = null;
      publisher.disconnect().catch(() => {});
    };
  }, [auth.isLoading, roomCode, serviceBundle, options?.injectedService]);

  // 4. Sync Firebase auth error & Elevated live staleness/presence into Issue Center
  useEffect(() => {
    const { reportIssue, resolveIssue } = useDiagnosticStore.getState();

    if (auth.error) {
      reportIssue('FIREBASE_AUTH_FAILED', { explanation: auth.error });
    } else if (auth.user) {
      resolveIssue('FIREBASE_AUTH_FAILED');
    }
  }, [auth.error, auth.user]);

  useEffect(() => {
    if (!elevatedLive) return;
    const { reportIssue, resolveIssue } = useDiagnosticStore.getState();

    if (elevatedLive.isStale && !isManuallyDisconnected) {
      reportIssue('TELEMETRY_STALE');
    } else {
      resolveIssue('TELEMETRY_STALE');
    }

    if (
      elevatedLive.connectionStatus === 'connected' &&
      !elevatedLive.deviceConnected &&
      !isManuallyDisconnected
    ) {
      reportIssue('DEVICE_PRESENCE_MISSING');
    } else if (elevatedLive.deviceConnected) {
      resolveIssue('DEVICE_PRESENCE_MISSING');
    }

    if (elevatedLive.error) {
      reportIssue('FIREBASE_DISCONNECTED', { explanation: elevatedLive.error });
    }
  }, [
    elevatedLive?.isStale,
    elevatedLive?.connectionStatus,
    elevatedLive?.deviceConnected,
    elevatedLive?.error,
    isManuallyDisconnected,
  ]);

  // 5. Sync Camera, Face-Loss, and MediaPipe States into Issue Center
  useEffect(() => {
    const { reportIssue, resolveIssue } = useDiagnosticStore.getState();

    if (isCameraActive) {
      userDisabledCameraRef.current = false;
      resolveIssue('CAMERA_PERMISSION_REQUIRED');
      resolveIssue('CAMERA_PERMISSION_DENIED');
      resolveIssue('CAMERA_NOT_FOUND');
      resolveIssue('CAMERA_IN_USE');
      resolveIssue('CAMERA_STREAM_INTERRUPTED');
      resolveIssue('BROWSER_UNSUPPORTED');

      if (isModelLoaded && !isFaceDetected) {
        reportIssue('FACE_OUT_OF_FRAME');
      } else {
        resolveIssue('FACE_OUT_OF_FRAME');
      }
    } else {
      resolveIssue('FACE_OUT_OF_FRAME');
      if (prevCameraActiveRef.current && !userDisabledCameraRef.current && !cameraError) {
        // Active camera track stopped unexpectedly (e.g. webcam unplugged)
        reportIssue('CAMERA_STREAM_INTERRUPTED');
      } else if (permissionState === 'idle' && !cameraError) {
        reportIssue('CAMERA_PERMISSION_REQUIRED');
      } else if (permissionState === 'denied') {
        resolveIssue('CAMERA_PERMISSION_REQUIRED');
        reportIssue('CAMERA_PERMISSION_DENIED');
      } else if (permissionState === 'unsupported') {
        resolveIssue('CAMERA_PERMISSION_REQUIRED');
        if (cameraError && cameraError.toLowerCase().includes('secure')) {
          reportIssue('BROWSER_UNSUPPORTED');
        } else {
          reportIssue('CAMERA_NOT_FOUND');
        }
      }
    }

    prevCameraActiveRef.current = isCameraActive;

    if (modelError) {
      reportIssue('MEDIAPIPE_INIT_FAILED', { explanation: modelError });
    } else if (isModelLoaded) {
      resolveIssue('MEDIAPIPE_INIT_FAILED');
    }
  }, [isCameraActive, permissionState, isModelLoaded, isFaceDetected, cameraError, modelError]);

  // 6. Camera Actions (idempotent against rapid clicks)
  const enableCamera = useCallback(async (): Promise<boolean> => {
    if (cameraInFlightRef.current) return false;
    if (useTrackingStore.getState().isCameraActive) return true;

    cameraInFlightRef.current = true;
    setIsCameraBusy(true);
    const { reportIssue, resolveIssue } = useDiagnosticStore.getState();

    try {
      await useTrackingStore.getState().startTracking();
      useWellnessStore.getState().startMonitoring();
      resolveIssue('CAMERA_PERMISSION_REQUIRED');
      resolveIssue('CAMERA_PERMISSION_DENIED');
      resolveIssue('CAMERA_NOT_FOUND');
      resolveIssue('CAMERA_IN_USE');
      resolveIssue('CAMERA_STREAM_INTERRUPTED');
      resolveIssue('MEDIAPIPE_INIT_FAILED');
      publisherRef.current?.publishTick().catch(() => {});
      return true;
    } catch (err) {
      const code = classifyCameraError(err);
      reportIssue(code);
      return false;
    } finally {
      cameraInFlightRef.current = false;
      setIsCameraBusy(false);
    }
  }, []);

  const disableCamera = useCallback(() => {
    userDisabledCameraRef.current = true;
    useTrackingStore.getState().stopTracking();
    useWellnessStore.getState().stopMonitoring();
    publisherRef.current?.publishTick().catch(() => {});
  }, []);

  const toggleCamera = useCallback(async () => {
    if (useTrackingStore.getState().isCameraActive) {
      disableCamera();
    } else {
      await enableCamera();
    }
  }, [disableCamera, enableCamera]);

  // 7. Room Disconnect / Reconnect / Switch
  const disconnectSession = useCallback(async () => {
    setIsManuallyDisconnected(true);
    const { reportIssue } = useDiagnosticStore.getState();
    if (publisherRef.current) {
      await publisherRef.current.disconnect();
    }
    reportIssue('FIREBASE_DISCONNECTED', {
      explanation: 'Session was manually disconnected for offline verification.',
    });
  }, []);

  const reconnectSession = useCallback(async () => {
    setIsManuallyDisconnected(false);
    const { resolveIssue, reportIssue } = useDiagnosticStore.getState();
    if (publisherRef.current) {
      const ok = await publisherRef.current.connect(roomCode);
      if (ok) {
        resolveIssue('FIREBASE_DISCONNECTED');
        resolveIssue('TELEMETRY_STALE');
        resolveIssue('DEVICE_PRESENCE_MISSING');
        resolveIssue('FIREBASE_PAIRING_FAILED');
        await publisherRef.current.publishTick().catch(() => {});
      } else {
        reportIssue('FIREBASE_PAIRING_FAILED');
      }
    }
  }, [roomCode]);

  const switchRoom = useCallback(
    async (nextRoomCode: string) => {
      const cleaned = nextRoomCode.trim().toUpperCase();
      if (!ROOM_CODE_REGEX.test(cleaned)) {
        useDiagnosticStore.getState().reportIssue('FIREBASE_ROOM_INVALID');
        return;
      }
      useDiagnosticStore.getState().resolveIssue('FIREBASE_ROOM_INVALID');
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.set('room', cleaned);
          return next;
        },
        { replace: true }
      );
    },
    [setSearchParams]
  );

  // 8. Rendering & Asset Health Callbacks
  const reloadRenderer = useCallback(() => {
    setWebglError(null);
    const { resolveIssue } = useDiagnosticStore.getState();
    resolveIssue('WEBGL_CONTEXT_LOST');
    resolveIssue('WEBGL_UNAVAILABLE');
    resolveIssue('ASSET_LOAD_FAILED');
    setRendererKey((k) => k + 1);
  }, []);

  const handleWebGLStatusChange = useCallback(
    (status: 'ready' | 'unavailable' | 'context_lost' | 'restored') => {
      const { reportIssue, resolveIssue } = useDiagnosticStore.getState();
      if (status === 'unavailable') {
        setWebglError('unavailable');
        reportIssue('WEBGL_UNAVAILABLE');
      } else if (status === 'context_lost') {
        setWebglError('context_lost');
        reportIssue('WEBGL_CONTEXT_LOST');
      } else {
        setWebglError(null);
        resolveIssue('WEBGL_UNAVAILABLE');
        resolveIssue('WEBGL_CONTEXT_LOST');
      }
    },
    []
  );

  const handleSustainedLowFps = useCallback((fps: number | null) => {
    const { reportIssue, resolveIssue } = useDiagnosticStore.getState();
    if (fps !== null) {
      reportIssue('SUSTAINED_LOW_FPS', {
        explanation: `Sustained rendering frame rate dropped to ~${fps} FPS while tab was visible.`,
      });
    } else {
      resolveIssue('SUSTAINED_LOW_FPS');
    }
  }, []);

  const handleBezelError = useCallback(() => {
    useDiagnosticStore.getState().reportIssue('ASSET_LOAD_FAILED');
  }, []);

  const handleDiagnosticAction = useCallback(
    (action: DiagnosticActionType) => {
      switch (action) {
        case 'enable_camera':
        case 'check_permissions':
          void enableCamera();
          break;
        case 'retry_connection':
          void reconnectSession();
          break;
        case 'rejoin_room':
          void switchRoom(env.defaultRoom || 'BLINK-DEMO');
          void reconnectSession();
          break;
        case 'reload_rendering':
          reloadRenderer();
          break;
      }
    },
    [enableCamera, reconnectSession, switchRoom, reloadRenderer]
  );

  const handleElevatedLiveChange = useCallback((state: ElevatedLiveTelemetryState) => {
    setElevatedLive(state);
  }, []);

  // 9. Derive accurate presentational stageState while preserving LIVE/DEMO/OFFLINE authenticity
  const stageState: IntegratedStageState = useMemo(() => {
    if (
      webglError !== null ||
      permissionState === 'denied' ||
      Boolean(modelError) ||
      Boolean(auth.error)
    ) {
      return 'ERROR';
    }
    if (auth.isLoading && !options?.injectedService) {
      return 'INITIALIZING';
    }
    if (connectionStatus === 'connecting' || connectionStatus === 'reconnecting') {
      return 'CONNECTING';
    }
    const isConfirmedElevatedOffline =
      elevatedLive?.mode === 'OFFLINE' &&
      (elevatedLive.isStale || elevatedLive.lastSyncTimestamp !== null);

    if (
      isManuallyDisconnected ||
      connectionStatus === 'disconnected' ||
      connectionStatus === 'failed' ||
      isConfirmedElevatedOffline
    ) {
      return 'OFFLINE';
    }
    if (isCameraActive) {
      if (isModelLoading || !isModelLoaded) {
        return 'READY';
      }
      if (!isFaceDetected) {
        return 'TRACKING_LOST';
      }
      if (elevatedLive?.mode === 'LIVE') {
        return 'LIVE';
      }
      return 'READY';
    }
    if (permissionState === 'requesting' || isCameraBusy) {
      return 'READY';
    }
    if (permissionState === 'idle') {
      return 'CAMERA_REQUIRED';
    }
    return elevatedLive?.mode === 'DEMO' ? 'DEMO' : 'READY';
  }, [
    webglError,
    permissionState,
    modelError,
    auth.error,
    auth.isLoading,
    options?.injectedService,
    connectionStatus,
    isManuallyDisconnected,
    elevatedLive?.mode,
    isCameraActive,
    isModelLoading,
    isModelLoaded,
    isFaceDetected,
    isCameraBusy,
  ]);

  // Cleanup camera tracks when leaving /demo
  useEffect(() => {
    return () => {
      if (useTrackingStore.getState().isCameraActive) {
        useTrackingStore.getState().stopTracking();
        useWellnessStore.getState().stopMonitoring();
      }
    };
  }, []);

  return {
    roomCode,
    transportKind,
    realtimeService: serviceBundle.realtimeService,
    connectionStatus,
    stageState,
    isCameraBusy,
    isManuallyDisconnected,
    rendererKey,
    elevatedLive,
    enableCamera,
    disableCamera,
    toggleCamera,
    reconnectSession,
    disconnectSession,
    switchRoom,
    reloadRenderer,
    handleDiagnosticAction,
    handleElevatedLiveChange,
    handleWebGLStatusChange,
    handleSustainedLowFps,
    handleBezelError,
  };
}
