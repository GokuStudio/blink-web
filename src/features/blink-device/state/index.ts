import { create } from 'zustand';
import { BlinkExpressionType } from '@/shared/contracts';

export interface MaterialParams {
  innerEmission: number;
  rimDiffusion: number;
  outerHalo: number;
  textureContrast: number;
  depthVariation: number;
}

export const DEFAULT_MATERIAL_PARAMS: MaterialParams = {
  innerEmission: 1.0,
  rimDiffusion: 1.0,
  outerHalo: 1.0,
  textureContrast: 1.0,
  depthVariation: 1.0,
};

export interface DeviceStore {
  expression: BlinkExpressionType;
  brightness: number;
  isBlinking: boolean;
  isWinkingLeft: boolean;
  isWinkingRight: boolean;
  isDoubleBlink: boolean;
  materialParams: MaterialParams;
  setExpression: (expr: BlinkExpressionType) => void;
  setBrightness: (val: number) => void;
  triggerBlink: (options?: { isDouble?: boolean }) => void;
  triggerWink: (side: 'left' | 'right') => void;
  triggerNudge: () => void;
  setMaterialParam: (key: keyof MaterialParams, val: number) => void;
  resetMaterialParams: () => void;
}

export const useDeviceStore = create<DeviceStore>((set) => ({
  expression: 'idle',
  brightness: 1.0,
  isBlinking: false,
  isWinkingLeft: false,
  isWinkingRight: false,
  isDoubleBlink: false,
  materialParams: { ...DEFAULT_MATERIAL_PARAMS },
  setExpression: (expression) => set({ expression }),
  setBrightness: (brightness) => set({ brightness }),
  triggerBlink: (options) => {
    const isDouble = !!options?.isDouble;
    set({ isBlinking: true, isDoubleBlink: isDouble });
    const dur = isDouble ? 420 : 220;
    setTimeout(() => set({ isBlinking: false, isDoubleBlink: false }), dur);
  },
  triggerWink: (side) => {
    if (side === 'left') {
      set({ isWinkingLeft: true });
      setTimeout(() => set({ isWinkingLeft: false }), 220);
    } else {
      set({ isWinkingRight: true });
      setTimeout(() => set({ isWinkingRight: false }), 220);
    }
  },
  triggerNudge: () => {
    set({ expression: 'nudging' });
  },
  setMaterialParam: (key, val) =>
    set((state) => ({
      materialParams: {
        ...state.materialParams,
        [key]: val,
      },
    })),
  resetMaterialParams: () =>
    set({
      materialParams: { ...DEFAULT_MATERIAL_PARAMS },
    }),
}));
