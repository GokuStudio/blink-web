import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { getAuth, Auth } from 'firebase/auth';
import { getDatabase, Database } from 'firebase/database';
import { getFirestore, Firestore } from 'firebase/firestore';
import { firebaseConfig } from './config';
import { setupEmulatorsIfEnabled } from './emulators';
import { env } from '@/config/env';

export interface FirebaseServices {
  app: FirebaseApp | null;
  auth: Auth | null;
  rtdb: Database | null;
  firestore: Firestore | null;
  isReady: boolean;
  isEmulated: boolean;
}

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let rtdb: Database | null = null;
let firestore: Firestore | null = null;
let isInitialized = false;
let isEmulated = false;

export function getFirebaseServices(options?: { useEmulators?: boolean }): FirebaseServices {
  const shouldUseEmulators = options?.useEmulators !== undefined ? options.useEmulators : env.useEmulators;

  if (isInitialized && app && auth && rtdb && firestore) {
    return { app, auth, rtdb, firestore, isReady: true, isEmulated };
  }

  // Guard: If emulators are NOT enabled and production Firebase is NOT explicitly configured,
  // do not initialize live Firebase connections. Keep production access disabled.
  if (!shouldUseEmulators && !env.isProductionFirebaseEnabled) {
    console.info(
      '[Firebase] Production Firebase access is disabled (unconfigured or mock credentials). Running in offline/mock mode.'
    );
    return { app: null, auth: null, rtdb: null, firestore: null, isReady: false, isEmulated: false };
  }

  try {
    app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
    auth = getAuth(app);
    rtdb = getDatabase(app);
    firestore = getFirestore(app);

    if (shouldUseEmulators) {
      setupEmulatorsIfEnabled(auth, rtdb, firestore, shouldUseEmulators);
      isEmulated = true;
    }

    isInitialized = true;

    return { app, auth, rtdb, firestore, isReady: true, isEmulated };
  } catch (error) {
    console.warn('[Firebase] Initialization error, falling back to mock mode:', error);
    return { app: null, auth: null, rtdb: null, firestore: null, isReady: false, isEmulated: false };
  }
}

/**
 * Reset Firebase client state for testing
 */
export function resetFirebaseServicesForTesting(): void {
  app = null;
  auth = null;
  rtdb = null;
  firestore = null;
  isInitialized = false;
  isEmulated = false;
}
