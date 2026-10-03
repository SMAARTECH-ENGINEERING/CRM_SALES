// Single access point for build-time configuration.
const { VITE_API_BASE_URL, VITE_APP_NAME, VITE_API_TIMEOUT_MS } = import.meta.env;

if (!VITE_API_BASE_URL) {
  throw new Error('VITE_API_BASE_URL is not set. Copy client/.env.example to client/.env.');
}

const env = Object.freeze({
  apiBaseUrl: VITE_API_BASE_URL.replace(/\/+$/, ''),
  appName: VITE_APP_NAME || 'CRM',
  apiTimeoutMs: Number(VITE_API_TIMEOUT_MS) || 15000,
});

export default env;
