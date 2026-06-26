export async function onRequest(context) {
  const url = new URL(context.request.url);
  const path = url.pathname;

  // Let static assets pass through directly
  if (path.startsWith('/assets/') || path.startsWith('/icons/') || path.startsWith('/manifest')) {
    return context.next();
  }

  // PWA routes serve the app shell
  if (path === '/app' || path.startsWith('/app/')) {
    url.pathname = '/pwa/index.html';
    return context.env.ASSETS.fetch(url);
  }

  // /api/* and /book/* are handled by Functions — pass through
  if (path.startsWith('/api/') || path.startsWith('/book')) {
    return context.next();
  }

  // Root and other paths — serve the landing page (index.html)
  // This replaces the SPA fallback that was in not_found_handling
  if (path === '/' || path === '/index.html') {
    return context.next();
  }

  // For any other path, try serving the static asset, fall back to landing page
  try {
    const resp = await context.env.ASSETS.fetch(context.request);
    if (resp.status !== 404) return resp;
  } catch {}

  // Fallback to landing page for unknown routes (but NOT for /api/* or /book/*)
  url.pathname = '/index.html';
  return context.env.ASSETS.fetch(url);
}
