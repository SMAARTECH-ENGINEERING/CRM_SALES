import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const port = Number(env.VITE_DEV_PORT) || 5173;

  return {
    plugins: [react()],
    server: { port, strictPort: true },
    preview: { port },
    test: {
      environment: 'jsdom',
      // Tests never reach a real API; this only satisfies src/utils/env.js.
      env: { VITE_API_BASE_URL: 'http://localhost/api/v1', VITE_APP_NAME: 'CRM' },
      restoreMocks: true,
      setupFiles: ['./src/test/setup.js'],
      testTimeout: 20000,
      // Each worker loads the whole UI library. One per core starves them all on a
      // machine that is also running the app, and tests then time out.
      maxWorkers: 4,
    },
  };
});
