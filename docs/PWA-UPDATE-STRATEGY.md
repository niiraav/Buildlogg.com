# PWA Update Strategy for Buildlogg

## Problem

Users who added Buildlogg to their Home Screen don't receive updates. The service worker precaches assets, but iOS Safari doesn't reliably check for SW updates when launching from the Home Screen icon.

## Root Causes

1. **iOS Safari doesn't check for SW updates on Home Screen launch** — unlike Android Chrome, iOS only checks when the PWA is opened inside Safari
2. **The `reg.update()` 60s interval only runs while the app is foregrounded** — iOS suspends JS when backgrounded
3. **No user-facing update prompt** — the app silently reloads on `controllerchange`, but that event may never fire on iOS
4. **Cloudflare Pages serves the same `sw.js` URL** — even with `no-cache` headers, iOS may serve a cached version

## Solution: Version Hash Polling + Update Prompt

### How it works

1. **Build step:** Vite generates a `version.json` file with a build timestamp/hash
2. **App startup:** The app fetches `version.json` from the network (bypassing SW cache)
3. **Periodic check:** Every 60 seconds while the app is open, the app re-fetches `version.json`
4. **On focus:** When the app returns to foreground (visibilitychange event), check immediately
5. **Update detected:** If the version hash differs from the current build, show a toast/banner: "Update available — tap to refresh"
6. **User taps update:** Unregister the SW, clear caches, and reload the page
7. **SW still handles offline:** The SW continues to precache assets for offline use, but the version check is the primary update mechanism

### Implementation

#### 1. Vite plugin to generate version.json

Add to `vite.config.ts`:
```typescript
{
  name: 'generate-version-json',
  closeBundle() {
    const fs = require('fs');
    const hash = Date.now().toString();
    fs.writeFileSync('dist/version.json', JSON.stringify({ hash, builtAt: new Date().toISOString() }));
  }
}
```

#### 2. Cloudflare _headers for version.json

```
/version.json
  Cache-Control: no-cache, no-store, must-revalidate
```

#### 3. Update checker hook in the app

```typescript
// src/hooks/useUpdateCheck.ts
import { useEffect, useState } from 'react';

export function useUpdateCheck() {
  const [updateAvailable, setUpdateAvailable] = useState(false);

  useEffect(() => {
    let currentHash: string | null = null;
    let interval: ReturnType<typeof setInterval>;

    async function check() {
      try {
        // Cache-bust to ensure we get the latest version
        const resp = await fetch(`/version.json?t=${Date.now()}`);
        if (!resp.ok) return;
        const data = await resp.json();
        
        if (currentHash === null) {
          currentHash = data.hash;
        } else if (data.hash !== currentHash) {
          setUpdateAvailable(true);
        }
      } catch {
        // Network error — ignore, will retry
      }
    }

    // Check on mount
    check();

    // Check every 60 seconds
    interval = setInterval(check, 60000);

    // Check when app returns to foreground (critical for iOS)
    const onVisible = () => {
      if (document.visibilityState === 'visible') check();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  return updateAvailable;
}

export async function applyUpdate() {
  // Unregister all service workers
  if ('serviceWorker' in navigator) {
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.all(regs.map(r => r.unregister()));
  }
  // Clear all caches
  if ('caches' in window) {
    const names = await caches.keys();
    await Promise.all(names.map(n => caches.delete(n)));
  }
  // Reload to get fresh assets
  window.location.reload();
}
```

#### 4. Update banner in the app

```tsx
// In App.tsx or a layout component
import { useUpdateCheck, applyUpdate } from './hooks/useUpdateCheck';

function UpdateBanner() {
  const updateAvailable = useUpdateCheck();
  if (!updateAvailable) return null;
  
  return (
    <div className="fixed bottom-20 left-4 right-4 z-50 bg-brand-black text-white rounded-xl p-4 shadow-lg flex items-center justify-between">
      <span className="text-sm font-medium">Update available</span>
      <button onClick={applyUpdate} className="text-sm font-bold underline">
        Refresh
      </button>
    </div>
  );
}
```

#### 5. Keep the existing SW mechanism as a fallback

The SW `skipWaiting()` + `controllerchange` → reload still works on Android Chrome and desktop browsers. The version.json polling is the primary mechanism for iOS.

### Why this works on iOS

- `fetch('/version.json?t=...')` with a cache-busting query param bypasses both the SW cache and the browser HTTP cache
- The `visibilitychange` event fires when the user opens the PWA from the Home Screen — this is the most reliable trigger on iOS
- The update banner gives the user control — they tap "Refresh" and the app clears the SW + caches and reloads with fresh assets
- No reliance on the browser's SW update check mechanism (which is broken on iOS)

### Alternative: Workbox window auto-update

If you want a more standard approach, use `workbox-window`:

```typescript
import { Workbox } from 'workbox-window';

const wb = new Workbox('/sw.js');
wb.addEventListener('waiting', () => {
  // Show update prompt
  setUpdateAvailable(true);
});
wb.register();
```

But this still relies on the browser checking for SW updates, which is unreliable on iOS. The version.json approach is more robust.
