import { useQuery } from '@tanstack/react-query';
import { createContext, useCallback, useEffect, useMemo, useState } from 'react';
import * as authApi from '../api/auth.api.js';
import { setForbiddenHandler, setUnauthorizedHandler } from '../api/axiosClient.js';
import queryClient from '../api/queryClient.js';
import tokenStorage, { REFRESH_KEY } from '../utils/tokenStorage.js';

export const AuthContext = createContext(null);

const ME_QUERY_KEY = ['auth', 'me'];

export function AuthProvider({ children }) {
  // "A session may exist" - true when a refresh token is stored. The user record
  // itself always comes from the API, never from storage.
  const [hasSession, setHasSession] = useState(() => Boolean(tokenStorage.getRefreshToken()));

  const meQuery = useQuery({
    queryKey: ME_QUERY_KEY,
    queryFn: ({ signal }) => authApi.getMe({ signal }),
    select: (response) => response.data.user,
    enabled: hasSession,
    staleTime: 60 * 1000,
    // Picks up role and permission changes made elsewhere when the user returns.
    refetchOnWindowFocus: true,
  });

  const clearSession = useCallback(() => {
    tokenStorage.clear();
    setHasSession(false);
    queryClient.clear();
  }, []);

  // Called by the API client when the server rejects the session (401).
  useEffect(() => {
    setUnauthorizedHandler(clearSession);
    return () => setUnauthorizedHandler(null);
  }, [clearSession]);

  // A 403 means the permissions on screen are out of date (a role was edited):
  // reload them so navigation and buttons match what the API allows.
  useEffect(() => {
    setForbiddenHandler(() => queryClient.invalidateQueries({ queryKey: ME_QUERY_KEY }));
    return () => setForbiddenHandler(null);
  }, []);

  // Keep tabs in sync: signing out (or in) elsewhere is reflected here.
  useEffect(() => {
    function onStorage(event) {
      if (event.key !== REFRESH_KEY && event.key !== null) return;
      if (tokenStorage.getRefreshToken()) {
        setHasSession(true);
      } else {
        tokenStorage.clearAccessToken();
        setHasSession(false);
        queryClient.clear();
      }
    }
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const login = useCallback(async (credentials) => {
    const response = await authApi.login(credentials);
    const { user, accessToken, refreshToken } = response.data;
    tokenStorage.setTokens({ accessToken, refreshToken });
    queryClient.setQueryData(ME_QUERY_KEY, { data: { user } });
    setHasSession(true);
    return user;
  }, []);

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } catch {
      // The local session is cleared regardless of whether the server was reachable.
    } finally {
      clearSession();
    }
  }, [clearSession]);

  const user = hasSession ? (meQuery.data ?? null) : null;

  const value = useMemo(
    () => ({
      user,
      isAuthenticated: Boolean(user),
      // True while a stored session is being verified on page load.
      isLoading: hasSession && meQuery.isPending,
      // Set when a session exists but the user could not be loaded (e.g. API offline).
      error: hasSession && !user && meQuery.isError ? meQuery.error : null,
      retry: meQuery.refetch,
      login,
      logout,
    }),
    [user, hasSession, meQuery.isPending, meQuery.isError, meQuery.error, meQuery.refetch, login, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
