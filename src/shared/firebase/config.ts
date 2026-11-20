import { FirebaseOptions } from 'firebase/app';
import { env } from '@/config/env';
import { EMULATOR_HOST, EMULATOR_PORTS } from './emulators';

export const firebaseConfig: FirebaseOptions = {
  apiKey: env.firebase.apiKey,
  authDomain: env.firebase.authDomain,
  projectId: env.firebase.projectId,
  storageBucket: env.firebase.storageBucket,
  messagingSenderId: env.firebase.messagingSenderId,
  appId: env.firebase.appId,
  databaseURL: env.useEmulators
    ? `http://${EMULATOR_HOST}:${EMULATOR_PORTS.rtdb}?ns=${env.firebase.projectId}-default-rtdb`
    : env.firebase.databaseURL,
};
