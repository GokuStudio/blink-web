import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { getAuth, Auth } from 'firebase/auth';
import { getDatabase, Database } from 'firebase/database';
import { getFirestore, Firestore } from 'firebase/firestore';
import { firebaseConfig } from './config';
import { setupEmulatorsIfEnabled } from './emulators';

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let rtdb: Database | null = null;
let firestore: Firestore | null = null;
let isInitialized = false;

export function getFirebaseServices() {
  if (isInitialized && app && auth && rtdb && firestore) {
    return { app, auth, rtdb, firestore, isReady: true };
  }

  try {
    app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
    auth = getAuth(app);
    rtdb = getDatabase(app);
    firestore = getFirestore(app);

    setupEmulatorsIfEnabled(auth, rtdb, firestore);
    isInitialized = true;

    return { app, auth, rtdb, firestore, isReady: true };
  } catch (error) {
    console.warn('[Firebase] Initialization skipped or running in mock mode:', error);
    return { app: null, auth: null, rtdb: null, firestore: null, isReady: false };
  }
}
