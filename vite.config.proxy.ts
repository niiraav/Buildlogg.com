import { defineConfig } from 'vite';
import baseConfig from './vite.config';

export default defineConfig({
  ...baseConfig,
  server: {
    ...baseConfig.server,
    port: 5180,
    strictPort: true,
  },
  plugins: [
    ...(baseConfig.plugins || []),
    {
      name: 'app-rewrite',
      configureServer(server) {
        server.middlewares.use((req, _res, next) => {
          if (req.url && (req.url === '/app' || req.url.startsWith('/app/'))) {
            req.url = '/pwa/index.html';
          }
          next();
        });
      },
    },
  ],
});
