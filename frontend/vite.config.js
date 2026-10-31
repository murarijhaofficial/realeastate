import { defineConfig } from 'vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const frontendDirectory = path.dirname(fileURLToPath(import.meta.url));
const backendOrigin = process.env.VITE_DEV_API_URL ?? 'http://127.0.0.1:3000';
const apiBaseUrl = process.env.VITE_API_BASE_URL?.trim() ?? '';

if (process.env.VERCEL) {
  let productionApiUrl;
  try {
    productionApiUrl = new URL(apiBaseUrl);
  } catch {
    throw new Error('Set VITE_API_BASE_URL to the deployed backend HTTPS origin in Vercel.');
  }
  if (
    productionApiUrl.protocol !== 'https:'
    || productionApiUrl.pathname !== '/'
    || productionApiUrl.search
    || productionApiUrl.hash
    || productionApiUrl.username
    || productionApiUrl.password
  ) {
    throw new Error('VITE_API_BASE_URL must be an HTTPS origin without credentials, path, query, or fragment.');
  }
}

export default defineConfig({
  publicDir: 'public',
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': {
        target: backendOrigin,
        changeOrigin: true,
      },
      '/uploads': {
        target: backendOrigin,
        changeOrigin: true,
      },
    },
  },
  plugins: [{
    name: 'live-booking-page-aliases',
    transformIndexHtml(html) {
      return html.replaceAll('__ESTATEDESK_API_BASE_URL__', JSON.stringify(apiBaseUrl));
    },
    configureServer(server) {
      server.middlewares.use((request, _response, next) => {
        if (request.url === '/booking' || request.url === '/live-booking-status') {
          request.url = '/live-booking-status.html';
        }
        next();
      });
    },
  }],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'esnext',
    rollupOptions: {
      input: {
        crm: path.join(frontendDirectory, 'index.html'),
        booking: path.join(frontendDirectory, 'public/live-booking-status.html'),
      },
    },
  },
});
