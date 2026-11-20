import { Auth, connectAuthEmulator } from 'firebase/auth';
import { Database, connectDatabaseEmulator } from 'firebase/database';
import { Firestore, connectFirestoreEmulator } from 'firebase/firestore';
import { env } from '@/config/env';

export const EMULATOR_HOST = '127.0.0.1';
export const EMULATOR_PORTS = {
  auth: 9099,
  rtdb: 9000,
  firestore: 8080,
  ui: 4000,
  hosting: 5000,
} as const;

let emulatorsConnected = false;

export function setupEmulatorsIfEnabled(
  auth: Auth,
  rtdb: Database,
  firestore: Firestore,
  force?: boolean
): boolean {
  if ((!env.useEmulators && !force) || emulatorsConnected) {
    return emulatorsConnected;
  }

  try {
    connectAuthEmulator(auth, `http://${EMULATOR_HOST}:${EMULATOR_PORTS.auth}`, { disableWarnings: true });
    connectDatabaseEmulator(rtdb, EMULATOR_HOST, EMULATOR_PORTS.rtdb);
    connectFirestoreEmulator(firestore, EMULATOR_HOST, EMULATOR_PORTS.firestore);
    emulatorsConnected = true;
    console.info(
      `[Firebase] Connected to local Firebase Emulators (Auth:${EMULATOR_PORTS.auth}, RTDB:${EMULATOR_PORTS.rtdb}, Firestore:${EMULATOR_PORTS.firestore})`
    );
    return true;
  } catch (err) {
    console.warn('[Firebase] Emulators setup skipped or already connected:', err);
    return false;
  }
}

export function isEmulatorsConnected(): boolean {
  return emulatorsConnected;
}

export function resetEmulatorsStateForTesting(): void {
  emulatorsConnected = false;
}
