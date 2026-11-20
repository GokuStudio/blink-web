import { Auth, connectAuthEmulator } from 'firebase/auth';
import { Database, connectDatabaseEmulator } from 'firebase/database';
import { Firestore, connectFirestoreEmulator } from 'firebase/firestore';
import { env } from '@/config/env';

let emulatorsConnected = false;

export function setupEmulatorsIfEnabled(auth: Auth, rtdb: Database, firestore: Firestore) {
  if (!env.useEmulators || emulatorsConnected) {
    return;
  }

  try {
    connectAuthEmulator(auth, 'http://localhost:9099', { disableWarnings: true });
    connectDatabaseEmulator(rtdb, 'localhost', 9000);
    connectFirestoreEmulator(firestore, 'localhost', 8080);
    emulatorsConnected = true;
    console.info('[Firebase] Connected to local Firebase Emulators (Auth:9099, RTDB:9000, Firestore:8080)');
  } catch (err) {
    console.warn('[Firebase] Emulators setup skipped or already connected:', err);
  }
}
