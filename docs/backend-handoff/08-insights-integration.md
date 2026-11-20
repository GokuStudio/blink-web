# 08 — Developer 2 Integration Architecture & React Hooks

This document provides ready-to-use, type-safe React integration hooks designed specifically for Developer 2 building `src/features/insights/`.

---

## 1. Clean Abstraction Architecture

Insights UI components should **never import Firebase SDK packages directly** (`firebase/database`, `firebase/auth`). All interactions must flow through:
1. `useAuth()` (`@/shared/hooks/useAuth`)
2. `FirebaseRoomService` / `MockRoomService` (`@/shared/realtime`)
3. `FirebaseRealtimeService` / `MockRealtimeService` (`@/shared/realtime`)

```
┌────────────────────────────────────────────────────────┐
│           INSIGHTS UI COMPONENTS & SCREENS             │
│    TodayScreen  •  InsightsScreen  •  DeviceScreen     │
└───────────────────────────▲────────────────────────────┘
                            │ Consumes Clean Hooks
┌───────────────────────────┴────────────────────────────┐
│          RECOMMENDED INSIGHTS CUSTOM HOOKS             │
│  useBlinkConnection  •  useBlinkTelemetry              │
│  useBlinkDeviceState •  useBlinkCommands               │
│  useBlinkPresence                                      │
└───────────────────────────▲────────────────────────────┘
                            │ Wraps Existing Services
┌───────────────────────────┴────────────────────────────┐
│            EXISTING IMPLEMENTED REALTIME LAYER         │
│   FirebaseRealtimeService   •   FirebaseRoomService    │
│   MockRealtimeService       •   MockRoomService        │
│   AuthContext / useAuth                                │
└────────────────────────────────────────────────────────┘
```

---

## 2. Recommended Integration Hooks

You can place these hooks in `src/features/insights/hooks/` to manage subscriptions with automatic cleanup.

### A. Connection & Pairing Hook: `useBlinkConnection`

```typescript
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '@/shared/hooks/useAuth';
import { FirebaseRoomService, FirebaseRealtimeService, ConnectionStatus } from '@/shared/realtime';

export function useBlinkConnection(roomCode: string | null) {
  const { isAuthenticated, signInAnonymous, userId } = useAuth();
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected');
  const [error, setError] = useState<string | null>(null);

  const roomService = useMemo(() => new FirebaseRoomService(), []);
  const realtimeService = useMemo(() => new FirebaseRealtimeService(), []);

  // Listen to status changes
  useEffect(() => {
    return realtimeService.onConnectionStatusChange((status) => {
      setConnectionStatus(status);
    });
  }, [realtimeService]);

  // Connect to room when roomCode is set
  useEffect(() => {
    if (!roomCode || !isAuthenticated) return;

    let isMounted = true;
    realtimeService
      .connect(roomCode)
      .catch((err) => {
        if (isMounted) setError(err instanceof Error ? err.message : 'Connection failed');
      });

    return () => {
      isMounted = false;
      realtimeService.disconnect().catch(() => {});
    };
  }, [roomCode, isAuthenticated, realtimeService]);

  // Join room using 4-digit pairing invite
  const joinWithInvite = useCallback(
    async (targetRoom: string, inviteCode: string) => {
      setError(null);
      if (!isAuthenticated) {
        await signInAnonymous();
      }
      return roomService.joinRoomWithInvite({ roomCode: targetRoom, inviteCode });
    },
    [isAuthenticated, signInAnonymous, roomService]
  );

  return {
    connectionStatus,
    isConnected: connectionStatus === 'connected',
    userId,
    error,
    joinWithInvite,
    realtimeService,
    roomService,
  };
}
```

---

### B. Live Telemetry Subscription Hook: `useBlinkTelemetry`

```typescript
import { useState, useEffect } from 'react';
import { DeviceTelemetry, DEFAULT_TELEMETRY } from '@/shared/contracts';
import { FirebaseRealtimeService } from '@/shared/realtime';

export function useBlinkTelemetry(realtimeService: FirebaseRealtimeService, isConnected: boolean) {
  const [telemetry, setTelemetry] = useState<DeviceTelemetry>(DEFAULT_TELEMETRY);
  const [history, setHistory] = useState<DeviceTelemetry[]>([]);

  useEffect(() => {
    if (!isConnected) return;

    const unsubscribe = realtimeService.subscribeToTelemetry((newTelemetry) => {
      setTelemetry(newTelemetry);
      setHistory((prev) => [...prev.slice(-59), newTelemetry]); // Keep 60-sample sliding window
    });

    return unsubscribe;
  }, [realtimeService, isConnected]);

  return {
    telemetry,
    history,
    currentBlinkRate: telemetry.currentBlinkRatePerMinute,
    averageBlinkRate: telemetry.averageBlinkRatePerMinute,
    eyeFatigueScore: telemetry.eyeFatigueScore,
    eyeHealthScore: telemetry.eyeHealthScore,
    isSimulated: telemetry.isSimulated,
  };
}
```

---

### C. Device State Subscription Hook: `useBlinkDeviceState`

```typescript
import { useState, useEffect } from 'react';
import { DeviceState, INITIAL_DEVICE_STATE } from '@/shared/contracts';
import { FirebaseRealtimeService } from '@/shared/realtime';

export function useBlinkDeviceState(realtimeService: FirebaseRealtimeService, isConnected: boolean) {
  const [deviceState, setDeviceState] = useState<DeviceState>(INITIAL_DEVICE_STATE);

  useEffect(() => {
    if (!isConnected) return;

    const unsubscribe = realtimeService.subscribeToDeviceState((state) => {
      setDeviceState(state);
    });

    return unsubscribe;
  }, [realtimeService, isConnected]);

  return {
    deviceState,
    currentExpression: deviceState.expression.current,
    monitoringMode: deviceState.monitoring.mode,
    nudgeConfig: deviceState.nudgeConfig,
    brightness: deviceState.brightness,
    revision: deviceState.revision,
  };
}
```

---

### D. Command Dispatch Hook: `useBlinkCommands`

```typescript
import { useState, useCallback } from 'react';
import { DeviceCommand, BlinkExpressionType, CommandAcknowledgment } from '@/shared/contracts';
import { FirebaseRealtimeService } from '@/shared/realtime';

export function useBlinkCommands(realtimeService: FirebaseRealtimeService, deviceUid: string | null) {
  const [isSending, setIsSending] = useState(false);
  const [lastAck, setLastAck] = useState<CommandAcknowledgment | null>(null);

  const setExpression = useCallback(
    async (expression: BlinkExpressionType, durationSeconds = 5): Promise<CommandAcknowledgment> => {
      if (!deviceUid) throw new Error('Device UID not identified');
      setIsSending(true);

      const commandId = `cmd-${Date.now()}`;
      const command: DeviceCommand = {
        id: commandId,
        schemaVersion: 1,
        targetDeviceId: deviceUid,
        senderId: '', // Filled automatically by service
        type: 'SET_EXPRESSION',
        payload: { expression, durationSeconds },
        createdAt: Date.now(),
        expiresAt: Date.now() + 10000,
        status: 'pending',
      };

      return new Promise((resolve, reject) => {
        const cleanup = realtimeService.subscribeToCommandStatus(
          commandId,
          (ack) => {
            setLastAck(ack);
            setIsSending(false);
            cleanup();
            if (ack.status === 'executed') resolve(ack);
            else reject(new Error(`Command ${ack.status}: ${ack.resultMessage || ''}`));
          },
          8000 // 8s timeout
        );

        realtimeService.sendCommand(command, { timeoutMs: 8000 }).catch((err) => {
          setIsSending(false);
          cleanup();
          reject(err);
        });
      });
    },
    [realtimeService, deviceUid]
  );

  return {
    setExpression,
    isSending,
    lastAck,
  };
}
```

---

### E. Presence Tracker Hook: `useBlinkPresence`

```typescript
import { useState, useEffect } from 'react';
import { UserPresence } from '@/shared/contracts';
import { FirebaseRealtimeService } from '@/shared/realtime';

export function useBlinkPresence(realtimeService: FirebaseRealtimeService, isConnected: boolean) {
  const [presenceMap, setPresenceMap] = useState<Record<string, UserPresence>>({});
  const [isDeviceOnline, setIsDeviceOnline] = useState(false);

  useEffect(() => {
    if (!isConnected) return;

    const unsubscribe = realtimeService.subscribeToPresence((map) => {
      setPresenceMap(map);
      
      // Find if any member with role 'blink-device' has an active connection
      const deviceOnline = Object.values(map).some(
        (user) =>
          (user.role === 'blink-device' || user.role === 'integrated-demo') &&
          user.connections &&
          Object.keys(user.connections).length > 0
      );
      setIsDeviceOnline(deviceOnline);
    });

    return unsubscribe;
  }, [realtimeService, isConnected]);

  return {
    presenceMap,
    isDeviceOnline,
  };
}
```

---

## 3. Switching Between Mock and Cloud Sources

To allow rapid UI development without internet access or Firebase credentials, you can instantiate either the real or mock service:

```typescript
import { FirebaseRealtimeService, MockRealtimeService, IRealtimeService } from '@/shared/realtime';
import { env } from '@/config/env';

export function createRealtimeService(forceMock = false): IRealtimeService {
  if (forceMock || (!env.useEmulators && !env.isProductionFirebaseEnabled)) {
    return new MockRealtimeService();
  }
  return new FirebaseRealtimeService();
}
```
Both classes implement `IRealtimeService` identically, guaranteeing that your UI components behave identically whether running against live cloud Firebase, local emulators, or offline mocks.
