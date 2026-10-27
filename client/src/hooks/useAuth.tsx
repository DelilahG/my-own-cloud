import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo, type ReactNode } from 'react';
import { api, setUnauthorizedHandler } from '../lib/api';
import type { User } from '../lib/types';

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<User>;
  register: (input: { email: string; password: string; displayName: string }) => Promise<User>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);
const ME_KEY = ['me'];

/**
 * The session itself lives in an HttpOnly cookie that JavaScript cannot
 * read. The app learns who is signed in by asking the server (/api/auth/me).
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  // Drops every cached query except ['me'] and then sets it. (Calling
  // queryClient.clear() would also remove the ['me'] query this provider is
  // subscribed to, and the new user would never reach the UI.)
  const resetCacheFor = useCallback(
    (user: User | null) => {
      queryClient.removeQueries({ predicate: (q) => q.queryKey[0] !== ME_KEY[0] });
      queryClient.setQueryData(ME_KEY, user);
    },
    [queryClient],
  );
  const me = useQuery({
    queryKey: ME_KEY,
    queryFn: async () => (await api.me()).user,
    staleTime: 5 * 60_000,
    retry: 1,
  });

  // If any request reports 401 (session expired), drop cached data and sign out locally.
  useEffect(() => {
    setUnauthorizedHandler(() => resetCacheFor(null));
    return () => setUnauthorizedHandler(null);
  }, [resetCacheFor]);

  const login = useCallback(
    async (email: string, password: string) => {
      const { user } = await api.login(email, password);
      resetCacheFor(user);
      return user;
    },
    [resetCacheFor],
  );

  const register = useCallback(
    async (input: { email: string; password: string; displayName: string }) => {
      const { user } = await api.register(input);
      resetCacheFor(user);
      return user;
    },
    [resetCacheFor],
  );

  const logout = useCallback(async () => {
    try {
      await api.logout();
    } finally {
      resetCacheFor(null);
    }
  }, [resetCacheFor]);

  const value = useMemo<AuthContextValue>(
    () => ({ user: me.data ?? null, loading: me.isPending, login, register, logout }),
    [me.data, me.isPending, login, register, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
