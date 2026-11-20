import { create } from 'zustand';
import { ConnectionStatus } from '@/shared/contracts';

export interface InsightsStore {
  status: ConnectionStatus;
  blinkRate: number;
  healthScore: number;
  activeAlert: string | null;
  setStatus: (status: ConnectionStatus) => void;
  setBlinkRate: (rate: number) => void;
  setHealthScore: (score: number) => void;
  triggerNudgeAlert: (message: string) => void;
  clearAlert: () => void;
}

export const useInsightsStore = create<InsightsStore>((set) => ({
  status: 'connected',
  blinkRate: 16,
  healthScore: 92,
  activeAlert: null,
  setStatus: (status) => set({ status }),
  setBlinkRate: (blinkRate) => set({ blinkRate }),
  setHealthScore: (healthScore) => set({ healthScore }),
  triggerNudgeAlert: (activeAlert) => {
    set({ activeAlert });
    setTimeout(() => {
      set({ activeAlert: null });
    }, 4000);
  },
  clearAlert: () => set({ activeAlert: null }),
}));
