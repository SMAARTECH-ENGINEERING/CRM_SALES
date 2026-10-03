import axios from 'axios';
import env from '../utils/env.js';
import tokenStorage from '../utils/tokenStorage.js';

// Every failed request is rejected with this shape, mirroring the API error format.
export class ApiError extends Error {
  constructor({ message, status = 0, errors = [] }) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.errors = errors;
  }
}

function toApiError(error) {
  if (error instanceof ApiError) return error;

  if (error.response) {
    const { status, data } = error.response;
    return new ApiError({
      status,
      message: data?.message || `Request failed with status ${status}`,
      errors: Array.isArray(data?.errors) ? data.errors : [],
    });
  }

  return new ApiError({
    message:
      error.code === 'ECONNABORTED'
        ? 'The server took too long to respond'
        : 'Unable to reach the server',
  });
}

let onUnauthorized = null;

// Lets the auth layer react to a dead session without this module importing React state.
export function setUnauthorizedHandler(handler) {
  onUnauthorized = handler;
}

let onForbidden = null;

// Called when the API answers 403, so the auth layer can reload the user's permissions.
export function setForbiddenHandler(handler) {
  onForbidden = handler;
}

function endSession() {
  tokenStorage.clear();
  onUnauthorized?.();
}

const axiosClient = axios.create({
  baseURL: env.apiBaseUrl,
  timeout: env.apiTimeoutMs,
  headers: { Accept: 'application/json' },
});

const REFRESH_LOCK = 'crm.auth.refresh';
let refreshPromise = null;

async function runRefresh() {
  // Read inside the lock: another tab may have rotated the token while we waited.
  const refreshToken = tokenStorage.getRefreshToken();
  if (!refreshToken) throw new ApiError({ status: 401, message: 'Your session has expired' });

  // Bare axios: the refresh call must not pass through the interceptors below.
  const { data } = await axios.post(
    `${env.apiBaseUrl}/auth/refresh-token`,
    { refreshToken },
    { timeout: env.apiTimeoutMs }
  );
  tokenStorage.setTokens(data.data);
  return data.data.accessToken;
}

// Refresh tokens are single-use, so refreshes must never overlap: one shared
// promise within this tab, and a Web Lock across tabs.
export function refreshSession() {
  if (!refreshPromise) {
    const task = navigator.locks
      ? navigator.locks.request(REFRESH_LOCK, runRefresh)
      : runRefresh();

    refreshPromise = task
      .catch((error) => {
        const apiError = toApiError(error);
        // Only a definitive rejection ends the session; a network blip does not.
        if (apiError.status === 401 || apiError.status === 403) endSession();
        throw apiError;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

// Requests made with { skipAuth: true } (login) carry no token and never trigger a refresh.
axiosClient.interceptors.request.use(async (config) => {
  if (config.skipAuth) return config;

  let token = tokenStorage.getAccessToken();
  // After a page reload only the refresh token survives: trade it for an access token.
  if (!token && tokenStorage.getRefreshToken()) {
    token = await refreshSession().catch(() => null);
  }
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

axiosClient.interceptors.response.use(
  // Unwrap to the API envelope: { success, message, data }
  (response) => response.data,
  async (error) => {
    if (axios.isCancel(error)) throw error;

    const config = error.config;

    // A file download that failed: the error arrives as a Blob holding the
    // usual JSON envelope. Unpack it so the message is the real one.
    if (typeof Blob !== 'undefined' && error.response?.data instanceof Blob) {
      error.response.data = await error.response.data
        .text()
        .then(JSON.parse)
        .catch(() => null);
    }
    const isAuth401 = error.response?.status === 401 && config && !config.skipAuth;

    if (isAuth401 && !config._retried && tokenStorage.getRefreshToken()) {
      // Access token expired: refresh once, then replay the original request.
      config._retried = true;
      try {
        await refreshSession();
      } catch {
        throw toApiError(error);
      }
      return axiosClient(config);
    }

    if (isAuth401) endSession();
    // The user's permissions may have changed since they were loaded.
    if (error.response?.status === 403) onForbidden?.();
    throw toApiError(error);
  }
);

export default axiosClient;
