# iOS Resilience Verification Plan — Buildlogg PWA

**Goal:** Verify Buildlogg PWA survives the real conditions a tradesperson hits on-site: no signal, app killed, backgrounded for hours, low iOS memory, and repeated launches from the home screen.

**Anchor:** Buildlogg PWA served at `https://buildlogg.com/app/` via `/pwa/index.html` + Cloudflare Pages Function.

**Compounding skill:** PWA production deployment & offline resilience (current monthly focus).

---

## 1. iOS-specific risks to verify

| Risk | Why it matters for Dave | What to check |
|---|---|---|
| **No `beforeinstallprompt`** | iOS Safari never fires the Android install banner; the user must use Safari → Share → Add to Home Screen. | Install instructions on landing page are accurate and visible. |
| **7-day storage purging** | iOS historically wipes localStorage / IndexedDB for sites not opened in 7 days. A home-screen PWA counts as a separate origin, but the rule is stricter than Android. | Data persists after 7 days of inactivity (or at least is recoverable after sign-in). |
| **WKWebView memory reload** | iOS aggressively kills background web apps on memory pressure. On relaunch, the app must restore from disk, not memory. | No data loss after backgrounding + heavy multitasking. |
| **White flash on launch** | Default white background flashes before React renders dark theme. | Background set early in inline script; no flash. |
| **Tab transition flash** | Swapping views can briefly render white before new tab content paints. | Tabs switch without flash. |
| **Offline app shell** | iOS caches aggressively but can fail to serve the PWA shell from the SW after a kill. | Airplane-mode launch shows the app, not Safari offline error. |
| **Service-worker lifecycle** | iOS Safari has stricter SW update rules than Android. | New deployments eventually activate and the app refreshes. |
| **Storage quota** | Photos as base64 in IndexedDB can grow fast. | App still works after capturing a dozen photos. |

---

## 2. Environment setup

1. **Device:** physical iPhone (preferred) or iOS Simulator.
2. **Test target:** `https://buildlogg.com/app/` (or a cloudflared tunnel to the local dev build for faster iteration).
3. **Tools:**
   - Safari → Develop menu → Web Inspector on the device.
   - Network Link Conditioner (poor signal / 100% loss).
   - Airplane mode for full offline.
   - Dev build: `npm run build && npm run preview` with cloudflared if needed.
4. **Test account:** create a fresh profile with a sample job, customer, quote, line items, and 2–3 photos.

---

## 3. Test scenarios & acceptance criteria

### A. Add to Home Screen
- [ ] Safari → Share → Add to Home Screen creates an icon.
- [ ] Icon uses the 192px apple-touch-icon (no default Safari icon).
- [ ] Launch from icon opens in standalone mode (no Safari chrome, no URL bar).
- [ ] Status bar is readable with `black-translucent` and the chosen theme color.

### B. Cold start / kill
- [ ] Kill the app from the app switcher and reopen it.
- [ ] User stays signed in (Supabase session / localStorage).
- [ ] Dark/light theme matches the previous choice (`localStorage.buildlogg_dark_mode`).
- [ ] No white flash before the first paint.
- [ ] App lands on the expected screen (e.g., jobs list).

### C. Offline launch
- [ ] Put the phone in airplane mode.
- [ ] Kill the app.
- [ ] Launch from the home screen.
- [ ] App shell loads (no Safari "You are not connected" error).
- [ ] Jobs, quotes, and customers list render from Dexie.
- [ ] Existing photos render from IndexedDB.

### D. Offline create & sync
- [ ] Create a new job + quote while offline.
- [ ] Save it; verify it appears in the list immediately.
- [ ] Verify `sync_queue` has a pending record.
- [ ] Turn airplane mode off.
- [ ] Wait / pull-to-refresh / reopen the app and confirm the job syncs to Supabase.
- [ ] Check the `_sync_status` field flips from `pending` to `synced`.

### E. Form persistence mid-flow
- [ ] Start creating a quote/job and enter some fields.
- [ ] Kill the app (or background it for 30 minutes).
- [ ] Reopen and verify whether the draft is restored.
- [ ] If no auto-save is implemented, document it as a gap; do not claim it passes.

### F. Memory pressure / background
- [ ] Background the app, open the camera and 4–5 heavy apps, then return to Buildlogg.
- [ ] Verify the app reloads without losing the current job or unsaved state.
- [ ] If the app reloads to the landing/auth screen, flag it as a state-restoration bug.

### G. Tab transitions
- [ ] Repeatedly switch between Jobs, Quotes, Schedule, and Settings.
- [ ] No white flash between tabs.
- [ ] Scroll position is preserved (or at least does not jump to top unexpectedly).
- [ ] Active tab indicator stays in sync.

### H. Photos offline
- [ ] Capture a photo while offline.
- [ ] Kill the app and reopen offline.
- [ ] Photo still displays in the job gallery.
- [ ] Sync the photo when the network returns.

### I. Update & service worker
- [ ] Deploy a small visible change (e.g., a text change).
- [ ] Open the app and wait 30–60 seconds.
- [ ] Confirm the service worker sees the update and a refresh loads the new build.
- [ ] Verify the `SKIP_WAITING` message flow works on iOS.

### J. 7-day storage survival (optional / simulated)
- [ ] Ideally: leave the app untouched for 7 days and reopen.
- [ ] Shortcut: Safari → Settings → Advanced → Website Data → Keep Buildlogg data (no deletion), then reopen.
- [ ] If data is wiped, verify the user can re-authenticate and re-sync from Supabase without data loss.

---

## 4. Test matrix

| Device / OS | Offline launch | Cold-start flash | Offline create | SW update | Memory pressure | Notes |
|---|---|---|---|---|---|---|
| iPhone 15 / iOS 18 | | | | | | |
| iPhone 13 / iOS 17 | | | | | | |
| iPhone SE / iOS 16 | | | | | | |
| iOS Simulator / iOS 18 | | | | | | |

---

## 5. Failure escalation

- **Blocker (fix before GTM):** data loss, cannot launch offline, white flash on every launch, sign-out on kill.
- **High (fix this week):** sync never retries, photos lost on background, SW update requires manual Safari cache clear.
- **Medium (track):** minor tab flash, scroll position lost, 7-day storage warning needed.
- **Low (document):** UI polish in standalone mode, splash screen improvements.

---

## 6. Deliverables

1. Fill out the test matrix with pass/fail/gap notes.
2. Open GitHub issues for every blocker and high-priority item.
3. Update the Friction Log in `~/Documents/productivity-orchestrator/logs.md` with any new iOS-specific friction.
4. If all acceptance criteria pass, update `logs.md` and move on to the cold-email batch.

---

## 7. Next steps after verification

- If pass: proceed to first batch of cold emails via Resend.
- If fail: create ranked fixes, re-verify, then proceed.
