export async function onRequest(context) {
  const url = new URL(context.request.url);
  // Public PWA routes are /app/; serve the PWA shell from /pwa/index.html.
  if (url.pathname.startsWith('/app/')) {
    url.pathname = '/pwa/index.html';
    return context.env.ASSETS.fetch(url);
  }
  return context.next();
}
