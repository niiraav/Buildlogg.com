/// <reference lib="webworker" />
import { precacheAndRoute, cleanupOutdatedCaches, createHandlerBoundToURL } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { clientsClaim } from 'workbox-core';

declare const self: ServiceWorkerGlobalScope;

// Only skip waiting when explicitly told to (via message from app)
// This prevents aggressive page reloads on mobile when app returns from background
self.addEventListener('install', () => {
  // Auto-skip-waiting so new deployments activate immediately.
  // Without this, the PWA serves stale cached assets when opened from
  // the home screen — the user would never get updates without manually
  // closing and reopening the app.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Handle update messages from the app
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// Precache all assets injected by VitePWA build
precacheAndRoute(self.__WB_MANIFEST);

// SPA fallback: any navigation under /app/* should serve the PWA shell
// from the precache. This keeps refreshes and direct links inside the app
// even if the network or the Pages middleware is slow/unavailable.
const appHandler = createHandlerBoundToURL('/pwa/index.html');
registerRoute(new NavigationRoute(appHandler, { allowlist: [/^\/app(\/|$)/] }));

// Clean up old caches
cleanupOutdatedCaches();

// Take control immediately (but only after activation, which is now manual)
clientsClaim();

// Push event handler — show notification from server-side push messages
self.addEventListener('push', (event) => {
  const data = event.data?.json() || {};
  event.waitUntil(
    self.registration.showNotification(data.title || 'Buildlogg', {
      body: data.body || '',
      icon: '/icons/apple-touch-icon-180.png',
      data: { url: data.url || '/app/' },
    })
  );
});

// Notification click handler — deep-link to the job if notification data has a URL,
// otherwise fall back to the Jobs unpaid filter.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/app/jobs?filter=unpaid';
  event.waitUntil(self.clients.openWindow(url));
});
