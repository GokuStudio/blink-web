import {
  User,
  signInAnonymously as fbSignInAnonymously,
  signOut as fbSignOut,
  onAuthStateChanged as fbOnAuthStateChanged,
  Unsubscribe,
} from 'firebase/auth';
import { getFirebaseServices } from './client';

export interface AuthUser {
  uid: string;
  isAnonymous: boolean;
  displayName?: string | null;
}

let mockCurrentUser: AuthUser | null = null;
const mockListeners = new Set<(user: AuthUser | null) => void>();

function mapFirebaseUser(user: User | null): AuthUser | null {
  if (!user) return null;
  return {
    uid: user.uid,
    isAnonymous: user.isAnonymous,
    displayName: user.displayName || (user.isAnonymous ? 'Guest' : null),
  };
}

/**
 * Sign in anonymously with Firebase Auth (or fallback mock user if offline/unconfigured).
 */
export async function signInAnonymous(options?: { useEmulators?: boolean }): Promise<AuthUser> {
  const services = getFirebaseServices(options);

  if (services.isReady && services.auth) {
    try {
      const userCredential = await fbSignInAnonymously(services.auth);
      const authUser = mapFirebaseUser(userCredential.user)!;
      return authUser;
    } catch (error) {
      console.warn('[Auth] Firebase anonymous sign-in error, falling back to mock session:', error);
    }
  }

  // Offline / Mock mode fallback
  if (!mockCurrentUser) {
    mockCurrentUser = {
      uid: `mock-anon-${Math.random().toString(36).substring(2, 9)}`,
      isAnonymous: true,
      displayName: 'Blink Guest (Offline)',
    };
  }
  notifyMockListeners();
  return mockCurrentUser;
}

/**
 * Sign out the current user.
 */
export async function signOutUser(options?: { useEmulators?: boolean }): Promise<void> {
  const services = getFirebaseServices(options);

  if (services.isReady && services.auth) {
    try {
      await fbSignOut(services.auth);
    } catch (error) {
      console.warn('[Auth] Firebase sign-out error:', error);
    }
  }

  mockCurrentUser = null;
  notifyMockListeners();
}

/**
 * Get currently authenticated user synchronously.
 */
export function getCurrentAuthUser(options?: { useEmulators?: boolean }): AuthUser | null {
  const services = getFirebaseServices(options);
  if (services.isReady && services.auth) {
    return mapFirebaseUser(services.auth.currentUser);
  }
  return mockCurrentUser;
}

/**
 * Subscribe to auth state changes.
 */
export function onAuthUserChanged(
  callback: (user: AuthUser | null) => void,
  options?: { useEmulators?: boolean }
): Unsubscribe {
  const services = getFirebaseServices(options);

  if (services.isReady && services.auth) {
    return fbOnAuthStateChanged(services.auth, (fbUser) => {
      callback(mapFirebaseUser(fbUser));
    });
  }

  // Offline / Mock listener
  mockListeners.add(callback);
  callback(mockCurrentUser);
  return () => {
    mockListeners.delete(callback);
  };
}

function notifyMockListeners() {
  mockListeners.forEach((listener) => listener(mockCurrentUser));
}

/**
 * Reset mock auth state (primarily for tests)
 */
export function resetMockAuthStateForTesting(): void {
  mockCurrentUser = null;
  mockListeners.clear();
}
