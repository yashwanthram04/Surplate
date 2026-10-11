import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';

// The API runs separately in development; /api calls are proxied so the browser sees one origin.
const apiTarget = process.env.VITE_API_PROXY || 'http://localhost:3000';

export default defineConfig({
  plugins: [vue()],
  server: { port: Number(process.env.VITE_PORT) || 5173, proxy: { '/api': apiTarget } },
});
