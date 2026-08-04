import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { config } from '@/lib/config';
import {
  clearSession,
  loadCloudBaseUrl,
  loadSession,
  saveCloudBaseUrl,
  saveSession,
} from '@/lib/storage';
import type { AuthSession } from '@/types';

type AuthContextValue = {
  session: AuthSession | null;
  cloudBaseUrl: string;
  isLoading: boolean;
  isLoggedIn: boolean;
  setCloudBaseUrl: (url: string) => Promise<void>;
  /** Persist a session after Google OAuth. */
  signIn: (session: AuthSession) => Promise<void>;
  signOut: () => Promise<void>;
  refreshMe: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [cloudBaseUrl, setCloudBaseUrlState] = useState(config.cloudBaseUrl);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const [storedSession, storedUrl] = await Promise.all([
          loadSession(),
          loadCloudBaseUrl(),
        ]);
        if (cancelled) return;
        if (storedUrl) setCloudBaseUrlState(storedUrl);
        if (storedSession) setSession(storedSession);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const setCloudBaseUrl = useCallback(async (url: string) => {
    const trimmed = url.trim().replace(/\/$/, '');
    setCloudBaseUrlState(trimmed);
    await saveCloudBaseUrl(trimmed);
  }, []);

  const signIn = useCallback(async (next: AuthSession) => {
    setSession(next);
    await saveSession(next);
  }, []);

  const signOut = useCallback(async () => {
    setSession(null);
    await clearSession();
  }, []);

  const refreshMe = useCallback(async () => {
    // Optional later: refresh Google access token / userinfo.
    // Email + refreshToken are set at Google sign-in.
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      cloudBaseUrl,
      isLoading,
      isLoggedIn: Boolean(session?.token && session?.refreshToken),
      setCloudBaseUrl,
      signIn,
      signOut,
      refreshMe,
    }),
    [session, cloudBaseUrl, isLoading, setCloudBaseUrl, signIn, signOut, refreshMe]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
}
