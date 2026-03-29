import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

const localApiProxyTarget = process.env.VITE_LOCAL_API_PROXY_TARGET || 'http://127.0.0.1:4000';

export default defineConfig({
  base: "./",
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  server: {
    hmr: process.env.DISABLE_HMR !== 'true',
    proxy: {
      '/auth': localApiProxyTarget,
      '/admin': localApiProxyTarget,
      '/games': localApiProxyTarget,
      '/reports': localApiProxyTarget,
    },
  },
});
