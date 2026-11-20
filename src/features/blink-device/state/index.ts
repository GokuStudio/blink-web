import { create } from 'zustand';
import { BlinkExpressionType } from '@/shared/contracts';

export interface DeviceStore {
  expression: BlinkExpressionType;
  brightness: number;
  isBlinking: boolean;
  setExpression: (expr: BlinkExpressionType) => void;
  setBrightness: (val: number) => void;
  triggerBlink: () => void;
}

export const useDeviceStore = create<DeviceStore>((set) => ({
  expression: 'idle',
  brightness: 1.0,
  isBlinking: false,
  setExpression: (expression) => set({ expression }),
  setBrightness: (brightness) => set({ brightness }),
  triggerBlink: () => {
    set({ isBlinking: true });
    setTimeout(() => set({ isBlinking: false }), 200);
  },
}));
