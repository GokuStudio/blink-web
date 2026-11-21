import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '@/shared/context/AuthContext';
import type { IRealtimeService } from '@/shared/realtime/interfaces/realtime-service.interface';
import { FirebaseRealtimeService } from '@/shared/realtime/services/firebase-realtime.service';
import { MockRealtimeService } from '@/shared/realtime/services/mock-realtime.service';
import type {
  DeviceTelemetry,
  DeviceState,
  ConnectionStatus,
  MonitoringMode,
  UserPresence,
} from '@/shared/contracts';
import { getFirebaseServices } from '@/shared/firebase/client';

export type AuthenticityMode = 'LIVE' | 'DEMO' | 'OFFLINE';

export interface UseElevatedLiveTelemetryOptions {
  service?: IRealtimeService;
  roomCode?: string;
  staleTimeoutMs?: number;
}

export interface ElevatedLiveTelemetryState {
  // Connection and Room Lifecycle
  roomCode: string;
  connectionStatus: ConnectionStatus;
  mode: AuthenticityMode;
  deviceConnected: boolean;
  isStale: boolean;
  lastSyncTimestamp: number | null;
  error: string | null;

  // Live Metrics
  blinkRate: number;
  rawBlinkRate: number | null;
  totalBlinks: number;
  avgRate: number;
  sessionSeconds: number;
  eyeFatigueScore: number;
  eyeHealthScore: number;

  // Face Tracking Status
  isFaceDetected: boolean;
  isValidZero: boolean;
  eyeAspectRatio?: { left: number; right: number };
  isSimulated: boolean;

  // Device & Monitoring State
  isMonitoring: boolean;
  monitoringMode: MonitoringMode;
  expression: string;
  brightness: number;

  // Actions
  reconnect: () => Promise<void>;
  switchRoom: (newRoomCode: string) => Promise<void>;
  setSimulatedBlinkRate: (rate: number) => void;
}

export function useElevatedLiveTelemetry(
  options?: UseElevatedLiveTelemetryOptions
): ElevatedLiveTelemetryState {
  const [searchParams, setSearchParams] = useSearchParams();
  const auth = useAuth();

  const roomCode =
    options?.roomCode || searchParams.get('room') || 'BLINK-DEMO';
  const staleTimeoutMs = options?.staleTimeoutMs ?? 3500;

  const [connectionStatus, setConnectionStatus] =
    useState<ConnectionStatus>('disconnected');
  const [deviceConnected, setDeviceConnected] = useState<boolean>(false);
  const [isStale, setIsStale] = useState<boolean>(false);
  const [lastSyncTimestamp, setLastSyncTimestamp] = useState<number | null>(
    null
  );
  const [error, setError] = useState<string | null>(null);

  // Live Telemetry fields
  const [telemetry, setTelemetry] = useState<DeviceTelemetry | null>(null);
  const [simulatedRateOverride, setSimulatedRateOverride] = useState<number | null>(
    null
  );

  // Device State fields
  const [deviceState, setDeviceState] = useState<DeviceState | null>(null);

  const lastTelemetryTimeRef = useRef<number | null>(null);
  const activeServiceRef = useRef<IRealtimeService | null>(null);

  // Connect & subscribe lifecycle
  useEffect(() => {
    let isCancelled = false;
    let unsubTelemetry: (() => void) | null = null;
    let unsubState: (() => void) | null = null;
    let unsubPresence: (() => void) | null = null;
    let unsubStatus: (() => void) | null = null;

    setError(null);
    setConnectionStatus('connecting');

    // 1. Resolve or instantiate Realtime Service
    let service: IRealtimeService;
    if (options?.service) {
      service = options.service;
    } else {
      const fbServices = getFirebaseServices();
      const user = auth.user;
      const isRealUser = user && user.uid && !user.uid.startsWith('mock-');

      if (fbServices.isReady && fbServices.rtdb && fbServices.auth && isRealUser) {
        try {
          service = new FirebaseRealtimeService(fbServices.rtdb, fbServices.auth);
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Firebase initialization error');
          service = new MockRealtimeService();
        }
      } else {
        // Fallback to Mock service when offline or unconfigured
        service = new MockRealtimeService();
      }
    }

    activeServiceRef.current = service;

    // 2. Track connection status
    unsubStatus = service.onConnectionStatusChange((status) => {
      if (!isCancelled) {
        setConnectionStatus(status);
      }
    });

    // 3. Connect to room
    service
      .connect(roomCode)
      .then((connected) => {
        if (isCancelled || !connected) return;

        // 4. Subscribe to presence
        unsubPresence = service.subscribeToPresence((presenceMap: Record<string, UserPresence>) => {
          if (isCancelled) return;
          let isDeviceOnline = false;
          if (presenceMap) {
            for (const uid of Object.keys(presenceMap)) {
              const member = presenceMap[uid];
              if (
                member.role === 'blink-device' ||
                member.role === 'integrated-demo'
              ) {
                const conns = member.connections || {};
                if (Object.keys(conns).length > 0) {
                  isDeviceOnline = true;
                  break;
                }
              }
            }
          }
          setDeviceConnected(isDeviceOnline);
        });

        // 5. Subscribe to telemetry
        unsubTelemetry = service.subscribeToTelemetry((telem: DeviceTelemetry) => {
          if (isCancelled || !telem) return;
          const now = Date.now();
          const isFresh = now - telem.timestamp <= staleTimeoutMs;

          lastTelemetryTimeRef.current = telem.timestamp;
          setLastSyncTimestamp(telem.timestamp);
          setIsStale(!isFresh);
          setTelemetry(telem);
        });

        // 6. Subscribe to device state
        unsubState = service.subscribeToDeviceState((state: DeviceState) => {
          if (isCancelled || !state) return;
          setDeviceState(state);
        });
      })
      .catch((err) => {
        if (!isCancelled) {
          setError(err instanceof Error ? err.message : 'Room connection failed');
          setConnectionStatus('failed');
          setDeviceConnected(false);
          setIsStale(true);
        }
      });

    // Cleanup on unmount or roomCode change
    return () => {
      isCancelled = true;
      if (unsubTelemetry) unsubTelemetry();
      if (unsubState) unsubState();
      if (unsubPresence) unsubPresence();
      if (unsubStatus) unsubStatus();
      service.disconnect().catch(() => {});
      activeServiceRef.current = null;
    };
  }, [roomCode, auth.user, options?.service, staleTimeoutMs]);

  // Staleness periodic check (every 500ms)
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (lastTelemetryTimeRef.current !== null) {
        const now = Date.now();
        const diff = now - lastTelemetryTimeRef.current;
        setIsStale(diff > staleTimeoutMs);
      }
    }, 500);

    return () => window.clearInterval(timer);
  }, [staleTimeoutMs]);

  // Derive explicit Authenticity Mode (Section 5)
  // LIVE: Connected, device online, fresh, isSimulated === false
  // DEMO: Connected, device online, fresh, isSimulated === true
  // OFFLINE: Disconnected, stale, device offline, or error
  const isSimulated = telemetry?.isSimulated ?? true;
  const isHealthyConnection =
    connectionStatus === 'connected' && deviceConnected && !isStale && !error;

  let mode: AuthenticityMode = 'OFFLINE';
  if (isHealthyConnection) {
    mode = isSimulated ? 'DEMO' : 'LIVE';
  } else {
    mode = 'OFFLINE';
  }

  // Face Tracking and Valid Measured Zero conditions (Handoff doc Section 3)
  const isFaceDetected = Boolean(telemetry?.eyeAspectRatio !== undefined);
  const rawBlinkRate = telemetry ? telemetry.currentBlinkRatePerMinute : null;
  const sessionSeconds = telemetry?.sessionDurationSeconds ?? 0;
  const eyeFatigueScore = telemetry?.eyeFatigueScore ?? 0;
  const eyeHealthScore = telemetry?.eyeHealthScore ?? 0;

  // Condition A (True 30s Stare): face detected, session >= 30s, measured 0 BPM, high fatigue score (>= 78)
  const isValidZero =
    mode === 'LIVE' &&
    isFaceDetected &&
    sessionSeconds >= 30 &&
    rawBlinkRate === 0 &&
    eyeFatigueScore >= 78;

  // Effective blink rate for UI gauges
  let effectiveBlinkRate = 0;
  if (mode === 'LIVE') {
    if (!isFaceDetected) {
      effectiveBlinkRate = 0; // face lost -> tracking suspended
    } else {
      effectiveBlinkRate = rawBlinkRate ?? 0;
    }
  } else if (mode === 'DEMO') {
    if (simulatedRateOverride !== null) {
      effectiveBlinkRate = simulatedRateOverride;
    } else {
      effectiveBlinkRate = rawBlinkRate ?? 16;
    }
  } else {
    // OFFLINE: unmeasurable
    effectiveBlinkRate = 0;
  }

  const totalBlinks = telemetry?.blinkCount ?? (mode === 'DEMO' ? 642 : 0);
  const avgRate = telemetry?.averageBlinkRatePerMinute ?? 0;

  const isMonitoring = deviceState?.monitoring?.mode === 'active';
  const monitoringMode = deviceState?.monitoring?.mode ?? 'idle';
  const expression = deviceState?.expression?.current ?? 'idle';
  const brightness = deviceState?.brightness ?? 1.0;

  const reconnect = useCallback(async () => {
    if (activeServiceRef.current) {
      setError(null);
      setConnectionStatus('connecting');
      try {
        await activeServiceRef.current.connect(roomCode);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Reconnect failed');
        setConnectionStatus('failed');
      }
    }
  }, [roomCode]);

  const switchRoom = useCallback(
    async (newRoomCode: string) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.set('room', newRoomCode.toUpperCase().trim());
          return next;
        },
        { replace: true }
      );
    },
    [setSearchParams]
  );

  const setSimulatedBlinkRate = useCallback((rate: number) => {
    setSimulatedRateOverride(rate);
  }, []);

  return {
    roomCode,
    connectionStatus,
    mode,
    deviceConnected,
    isStale,
    lastSyncTimestamp,
    error,
    blinkRate: effectiveBlinkRate,
    rawBlinkRate,
    totalBlinks,
    avgRate,
    sessionSeconds,
    eyeFatigueScore,
    eyeHealthScore,
    isFaceDetected,
    isValidZero,
    eyeAspectRatio: telemetry?.eyeAspectRatio,
    isSimulated,
    isMonitoring,
    monitoringMode,
    expression,
    brightness,
    reconnect,
    switchRoom,
    setSimulatedBlinkRate,
  };
}
