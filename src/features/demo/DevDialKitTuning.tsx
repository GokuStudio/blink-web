/**
 * Development-only DialKit live tuning harness for Blink Stage 2A.1.
 *
 * Tunes WebGL eye optical material parameters and eyelid mirroring bridge
 * attack/release dynamics in real time during development.
 *
 * Strictly gated behind `import.meta.env.DEV` at mount site and
 * `productionEnabled={false}` on `<DialRoot />` so the floating developer
 * overlay is never exposed in the public production build.
 */

import React, { useEffect } from 'react';
import { DialRoot, useDialKit } from 'dialkit';
import 'dialkit/styles.css';
import { useDeviceStore } from '@/features/blink-device/state';
import { eyeTrackingBridge } from '@/features/blink-device/tracking/eyeTrackingBridge';

export const DevDialKitTuning: React.FC = () => {
  const values = useDialKit('Blink Stage', {
    eyeOptics: {
      innerEmission: [1.0, 0.5, 1.5, 0.05],
      rimDiffusion: [1.0, 0.5, 1.5, 0.05],
      outerHalo: [1.0, 0.4, 1.6, 0.05],
      textureContrast: [1.0, 0.5, 1.5, 0.05],
      depthVariation: [1.0, 0.5, 1.5, 0.05],
    },
    eyelidBridge: {
      attackFactor: [0.92, 0.4, 1.0, 0.02],
      releaseFactor: [0.52, 0.2, 0.9, 0.02],
      noiseDeadband: [0.015, 0.005, 0.05, 0.005],
    },
  });

  useEffect(() => {
    const store = useDeviceStore.getState();
    store.setMaterialParam('innerEmission', values.eyeOptics.innerEmission);
    store.setMaterialParam('rimDiffusion', values.eyeOptics.rimDiffusion);
    store.setMaterialParam('outerHalo', values.eyeOptics.outerHalo);
    store.setMaterialParam('textureContrast', values.eyeOptics.textureContrast);
    store.setMaterialParam('depthVariation', values.eyeOptics.depthVariation);
  }, [
    values.eyeOptics.innerEmission,
    values.eyeOptics.rimDiffusion,
    values.eyeOptics.outerHalo,
    values.eyeOptics.textureContrast,
    values.eyeOptics.depthVariation,
  ]);

  useEffect(() => {
    eyeTrackingBridge.setConfig({
      attackFactor: values.eyelidBridge.attackFactor,
      releaseFactor: values.eyelidBridge.releaseFactor,
      noiseDeadband: values.eyelidBridge.noiseDeadband,
    });
  }, [
    values.eyelidBridge.attackFactor,
    values.eyelidBridge.releaseFactor,
    values.eyelidBridge.noiseDeadband,
  ]);

  return (
    <DialRoot
      position="top-right"
      defaultOpen={false}
      theme="dark"
      productionEnabled={false}
    />
  );
};

export default DevDialKitTuning;
