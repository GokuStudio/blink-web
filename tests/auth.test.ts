import { describe, it, expect, beforeEach } from 'vitest';
import {
  signInAnonymous,
  signOutUser,
  getCurrentAuthUser,
  onAuthUserChanged,
  resetMockAuthStateForTesting,
} from '@/shared/firebase/auth';
import { resetFirebaseServicesForTesting, getFirebaseServices } from '@/shared/firebase/client';

describe('Firebase Authentication Service (F1B)', () => {
  beforeEach(() => {
    resetMockAuthStateForTesting();
    resetFirebaseServicesForTesting();
  });

  describe('Offline / Mock Auth Fallback', () => {
    it('signs in anonymously and generates mock user when Firebase is offline', async () => {
      // In default environment without emulators or production keys
      const user = await signInAnonymous({ useEmulators: false });
      expect(user).toBeDefined();
      expect(user.uid).toMatch(/^mock-anon-/);
      expect(user.isAnonymous).toBe(true);

      const currentUser = getCurrentAuthUser({ useEmulators: false });
      expect(currentUser?.uid).toBe(user.uid);
    });

    it('notifies subscribers via onAuthUserChanged in mock mode', async () => {
      let notifiedUser: any = null;
      const unsubscribe = onAuthUserChanged((u) => {
        notifiedUser = u;
      }, { useEmulators: false });

      const user = await signInAnonymous({ useEmulators: false });
      expect(notifiedUser?.uid).toBe(user.uid);

      await signOutUser({ useEmulators: false });
      expect(notifiedUser).toBeNull();
      unsubscribe();
    });

    it('signs out cleanly in mock mode', async () => {
      await signInAnonymous({ useEmulators: false });
      expect(getCurrentAuthUser({ useEmulators: false })).not.toBeNull();

      await signOutUser({ useEmulators: false });
      expect(getCurrentAuthUser({ useEmulators: false })).toBeNull();
    });
  });

  describe('Live Auth Emulator Integration (127.0.0.1:9099)', () => {
    it('successfully connects to the live Auth emulator and signs in anonymously', async () => {
      const services = getFirebaseServices({ useEmulators: true });
      expect(services.isReady).toBe(true);
      expect(services.isEmulated).toBe(true);
      expect(services.auth).not.toBeNull();

      // Perform real anonymous sign-in against the running Auth emulator
      const authUser = await signInAnonymous({ useEmulators: true });
      expect(authUser).toBeDefined();
      expect(typeof authUser.uid).toBe('string');
      expect(authUser.uid.length).toBeGreaterThan(5);
      expect(authUser.isAnonymous).toBe(true);

      // Verify synchronous getter reflects emulator state
      const current = getCurrentAuthUser({ useEmulators: true });
      expect(current?.uid).toBe(authUser.uid);

      // Verify sign out against the running Auth emulator
      await signOutUser({ useEmulators: true });
      const signedOutCurrent = getCurrentAuthUser({ useEmulators: true });
      expect(signedOutCurrent).toBeNull();
    });
  });
});
