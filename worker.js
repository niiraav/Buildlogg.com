// Buildlogg Worker — routes requests between Functions, PWA shell, and static assets
// In the Workers + Pages Functions model, this fetch handler is the "origin worker."
// Functions in /functions/ run as middleware BEFORE this handler.
// The _middleware.js routes /app/* to the PWA shell and lets other paths pass through.
// This worker handles the final fallback for static assets and SPA routing.

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    // Static assets — serve directly
    if (path.startsWith('/assets/') || path.startsWith('/icons/') || path.startsWith('/manifest')) {
      return env.ASSETS.fetch(request);
    }

    // PWA routes — serve the app shell
    if (path === '/app' || path.startsWith('/app/')) {
      url.pathname = '/pwa/index.html';
      return env.ASSETS.fetch(url);
    }

    // For /api/* and /book/* — these should have been handled by Functions
    // If we get here, the Function didn't handle it (shouldn't happen)
    // Return 404 rather than serving the landing page
    if (path.startsWith('/api/') || path.startsWith('/book')) {
      return new Response('Not found', { status: 404 });
    }

    // Everything else — try static asset, fall back to SPA index.html
    try {
      const resp = await env.ASSETS.fetch(request);
      if (resp.status !== 404) return resp;
    } catch {}

    // SPA fallback for client-side routing
    url.pathname = '/index.html';
    return env.ASSETS.fetch(url);
  },
};
