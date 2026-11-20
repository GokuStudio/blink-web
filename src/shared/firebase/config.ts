import { FirebaseOptions } from 'firebase/app';
import { env } from '@/config/env';

export const firebaseConfig: FirebaseOptions = {
  apiKey: env.firebase.apiKey,
  authDomain: env.firebase.authDomain,
  projectId: env.useEmulators ? 'blink-web-demo' : env.firebase.projectId,
  storageBucket: env.firebase.storageBucket,
  messagingSenderId: env.firebase.messagingSenderId,
  appId: env.firebase.appId,
  databaseURL: env.useEmulators
    ? 'https://blink-web-demo-default-rtdb.firebaseio.com'
    : env.firebase.databaseURL,
};
