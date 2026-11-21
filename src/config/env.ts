/**
 * Application environment configuration with type safety.
 */

export interface AppEnv {
  isDev: boolean;
  isProd: boolean;
  useEmulators: boolean;
  isProductionFirebaseEnabled: boolean;
  defaultRoom: string;
  autoStartSimulator: boolean;
  heyBlink: {
    /** Explicit provider override in dev ('mock' | 'gemini-live' | '') */
    provider: 'mock' | 'gemini-live' | '';
    /** Trusted backend endpoint that mints short-lived Gemini Live ephemeral tokens */
    tokenEndpoint: string;
  };
  firebase: {
    apiKey: string;
    authDomain: string;
    projectId: string;
    storageBucket: string;
    messagingSenderId: string;
    appId: string;
    databaseURL: string;
  };
}

const rawApiKey = import.meta.env.VITE_FIREBASE_API_KEY || 'mock-api-key';
const isMockApiKey = !rawApiKey || rawApiKey.startsWith('mock-');
const isExplicitProductionEnabled = import.meta.env.VITE_ENABLE_PRODUCTION_FIREBASE === 'true';
const rawVoiceProvider = (import.meta.env.VITE_HEY_BLINK_PROVIDER || '').trim();
const normalizedVoiceProvider: 'mock' | 'gemini-live' | '' =
  rawVoiceProvider === 'mock' || rawVoiceProvider === 'gemini-live' ? rawVoiceProvider : '';

export const env: AppEnv = {
  isDev: import.meta.env.DEV,
  isProd: import.meta.env.PROD,
  useEmulators: import.meta.env.VITE_USE_FIREBASE_EMULATORS === 'true',
  isProductionFirebaseEnabled: !isMockApiKey && isExplicitProductionEnabled,
  defaultRoom: import.meta.env.VITE_DEMO_DEFAULT_ROOM || 'BLINK-DEMO',
  autoStartSimulator: import.meta.env.VITE_SIMULATOR_AUTO_START === 'true',
  heyBlink: {
    provider: normalizedVoiceProvider,
    tokenEndpoint: (import.meta.env.VITE_HEY_BLINK_TOKEN_ENDPOINT || '').trim(),
  },
  firebase: {
    apiKey: rawApiKey,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'blink-web-demo.firebaseapp.com',
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'blink-web-demo',
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || 'blink-web-demo.appspot.com',
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '000000000000',
    appId: import.meta.env.VITE_FIREBASE_APP_ID || '1:000000000000:web:0000000000000000000000',
    databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL || 'https://blink-web-demo-default-rtdb.firebaseio.com',
  },
};
