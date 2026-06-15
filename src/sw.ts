/// <reference lib="webworker" />
import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching';
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
