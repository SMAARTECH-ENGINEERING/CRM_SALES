// The access token lives in memory only, so it is gone when the tab closes and is
// never written to disk. Only the refresh token is persisted; it is rotated on
// every use and is used on page load to obtain a fresh access token.
export const REFRESH_KEY = 'crm.refreshToken';

let accessToken = null;

// Storage can be unavailable (private mode, blocked site data), so every call is guarded.
function read(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key, value) {
  try {
    if (value) localStorage.setItem(key, value);
    else localStorage.removeItem(key);
  } catch {
    // ignore - the session simply will not persist across reloads
  }
}

const tokenStorage = {
  getAccessToken: () => accessToken,
  getRefreshToken: () => read(REFRESH_KEY),
  setTokens(tokens) {
    accessToken = tokens.accessToken ?? null;
    write(REFRESH_KEY, tokens.refreshToken);
  },
  clearAccessToken() {
    accessToken = null;
  },
  clear() {
    accessToken = null;
    write(REFRESH_KEY, null);
  },
};

export default tokenStorage;
