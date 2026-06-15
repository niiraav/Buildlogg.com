/// <reference lib="webworker" />
import { precacheAndRoute, cleanupOutdatedCaches, createHandlerBoundToURL } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { clientsClaim } from 'workbox-core';

declare const self: ServiceWorkerGlobalScope;

// Only skip waiting when explicitly told to (via message from app)
// This prevents aggressive page reloads on mobile when app returns from background
self.addEventListener('install', () => {
  // Don't auto-skip-waiting — let the app control when to update
  // self.skipWaiting();
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

// Notification click handler — navigate to Jobs unpaid filter
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.openWindow('/app/jobs?filter=unpaid')
  );
});
