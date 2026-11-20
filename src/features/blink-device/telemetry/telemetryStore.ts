/**
 * Telemetry Publisher Zustand Store
 * Bridges the DeviceTelemetryPublisher with React UI components and dev tools.
 */

import { create } from 'zustand';
import { DeviceTelemetryPublisher } from './deviceTelemetryPublisher';
import {
  PublisherDiagnostics,
  DevicePublisherConfig,
  DEFAULT_PUBLISHER_CONFIG,
  INITIAL_PUBLISHER_DIAGNOSTICS,
} from './types';

export interface TelemetryStoreState {
  diagnostics: PublisherDiagnostics;
  config: DevicePublisherConfig;
  isConnecting: boolean;

  // Actions
  connect: (roomCode?: string) => Promise<boolean>;
  disconnect: () => Promise<void>;
  publishNow: () => Promise<void>;
  updateConfig: (partial: Partial<DevicePublisherConfig>) => void;
}

export const deviceTelemetryPublisherInstance = new DeviceTelemetryPublisher();

export const useTelemetryPublisherStore = create<TelemetryStoreState>((set) => {
  // Subscribe to publisher diagnostic updates
  deviceTelemetryPublisherInstance.onDiagnosticsChange((diag) => {
    set({ diagnostics: diag });
  });

  return {
    diagnostics: { ...INITIAL_PUBLISHER_DIAGNOSTICS },
    config: { ...DEFAULT_PUBLISHER_CONFIG },
    isConnecting: false,

    connect: async (roomCode?: string) => {
      set({ isConnecting: true });
      try {
        const success = await deviceTelemetryPublisherInstance.connect(roomCode);
        return success;
      } finally {
        set({ isConnecting: false });
      }
    },

    disconnect: async () => {
      await deviceTelemetryPublisherInstance.disconnect();
    },

    publishNow: async () => {
      await deviceTelemetryPublisherInstance.publishTick();
    },

    updateConfig: (partial) => {
      deviceTelemetryPublisherInstance.setConfig(partial);
      set({ config: deviceTelemetryPublisherInstance.getConfig() });
    },
  };
});
