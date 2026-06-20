export async function onRequest(context) {
  const url = new URL(context.request.url);

  // Let static assets pass through directly (images, fonts, icons, etc.)
  if (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/icons/')) {
    return context.next();
  }

  // Public PWA routes are /app/*; serve the PWA shell from /pwa/index.html.
  // Also handle /app without trailing slash so refreshes stay in the PWA.
  if (url.pathname === '/app' || url.pathname.startsWith('/app/')) {
    url.pathname = '/pwa/index.html';
    return context.env.ASSETS.fetch(url);
  }
  return context.next();
}
