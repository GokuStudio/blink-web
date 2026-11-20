import React, { createContext, useContext, useEffect, useState, useMemo } from 'react';
import { AuthUser, onAuthUserChanged, signInAnonymous, signOutUser } from '@/shared/firebase/auth';

export interface AuthContextValue {
  user: AuthUser | null;
  userId: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  signInAnonymous: () => Promise<AuthUser>;
  signOut: () => Promise<void>;
}

const defaultAuthContextValue: AuthContextValue = {
  user: null,
  userId: null,
  isAuthenticated: false,
  isLoading: false,
  error: null,
  signInAnonymous: async () => ({ uid: 'fallback-anon', isAnonymous: true, displayName: 'Blink Guest' }),
  signOut: async () => {},
};

export const AuthContext = createContext<AuthContextValue>(defaultAuthContextValue);

export interface AuthProviderProps {
  children: React.ReactNode;
  autoSignIn?: boolean;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children, autoSignIn = true }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    const unsubscribe = onAuthUserChanged((authUser) => {
      if (!isMounted) return;
      setUser(authUser);
      setIsLoading(false);
    });

    if (autoSignIn) {
      signInAnonymous()
        .then((signedInUser) => {
          if (isMounted) {
            setUser(signedInUser);
            setIsLoading(false);
          }
        })
        .catch((err) => {
          if (isMounted) {
            setError(err instanceof Error ? err.message : 'Authentication failed');
            setIsLoading(false);
          }
        });
    } else {
      setIsLoading(false);
    }

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, [autoSignIn]);

  const handleSignInAnonymous = async (): Promise<AuthUser> => {
    setIsLoading(true);
    setError(null);
    try {
      const authUser = await signInAnonymous();
      setUser(authUser);
      return authUser;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Anonymous sign-in failed';
      setError(msg);
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignOut = async (): Promise<void> => {
    setIsLoading(true);
    setError(null);
    try {
      await signOutUser();
      setUser(null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Sign-out failed';
      setError(msg);
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      userId: user?.uid ?? null,
      isAuthenticated: !!user,
      isLoading,
      error,
      signInAnonymous: handleSignInAnonymous,
      signOut: handleSignOut,
    }),
    [user, isLoading, error]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  return context ?? defaultAuthContextValue;
}
