import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'path';
import fs from 'fs';

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'app-route-rewrite',
      apply: 'serve',
      configureServer(server) {
        server.middlewares.use((req, _res, next) => {
          if (req.url?.startsWith('/app/')) {
            req.url = '/pwa/index.html';
          }
          // Clean URLs for static legal pages (/privacy → /privacy.html)
          if (req.url === '/privacy' || req.url === '/privacy/') req.url = '/privacy.html';
          if (req.url === '/terms' || req.url === '/terms/') req.url = '/terms.html';
          next();
        });
      },
      configurePreviewServer(server) {
        server.middlewares.use((req, _res, next) => {
          if (req.url?.startsWith('/app/')) {
            req.url = '/pwa/index.html';
          }
          if (req.url === '/privacy' || req.url === '/privacy/') req.url = '/privacy.html';
          if (req.url === '/terms' || req.url === '/terms/') req.url = '/terms.html';
          next();
        });
      },
    },
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      injectRegister: false, // manually injected in app/index.html so landing page stays untouched
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
      },
      manifest: false,
      devOptions: {
        enabled: false,
      },
    }),
    {
      name: 'generate-version-json',
      writeBundle() {
        const hash = Date.now().toString();
        fs.writeFileSync(
          path.resolve(__dirname, 'dist/version.json'),
          JSON.stringify({ hash, builtAt: new Date().toISOString() })
        );
        // Ensure _headers includes version.json cache-control
        const headersPath = path.resolve(__dirname, 'dist/_headers');
        let headers = '';
        try { headers = fs.readFileSync(headersPath, 'utf8'); } catch {}
        if (!headers.includes('/version.json')) {
          headers += '\n/version.json\n  Cache-Control: no-cache, no-store, must-revalidate\n';
          fs.writeFileSync(headersPath, headers);
        }
      },
    },
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'index.html'),
        app: path.resolve(__dirname, 'pwa/index.html'),
      },
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    host: '0.0.0.0',
    allowedHosts: ['.trycloudflare.com', 'localhost', '127.0.0.1'],
  },
});
