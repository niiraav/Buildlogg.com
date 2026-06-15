# Buildlogg — MVP Implementation Plan

> **Status**: R2 (Business Name Dead-End) is SOLVED. This plan covers the remaining 8 Must Have features.
> **Target**: Self-employed tradesperson ("Dave") — on-site, gloves, one-handed, poor signal.
> **Goal**: Core loop works — create quote → send → get paid — in under 5 minutes.

---

## Table of Contents

1. [R1 — Activity Feed](#r1--activity-feed)
2. [R3 — Photo Capture](#r3--photo-capture)
3. [R4 — Voice-to-Text Input](#r4--voice-to-text-input)
4. [R5 — Custom Item Library](#r5--custom-item-library)
5. [R6 — One-Tap Job Done → Payment](#r6--one-tap-job-done--payment)
6. [R7 — Smart Payment Chase](#r7--smart-payment-chase)
7. [R14 — Customer History in Quote Builder](#r14--customer-history-in-quote-builder)
8. [R19 — Materials Inventory / Parts Tracking](#r19--materials-inventory--parts-tracking)

---

## R1 — Activity Feed

**Current state**: `/src/screens/Activity/index.tsx` renders a static "coming soon" placeholder.
**Goal**: Show a reverse-chronological feed of business events: quotes sent, jobs status-changed, payments marked, notes added, sync events.

### Files to Modify

1. `src/lib/db.ts` — Add `ActivityLog` table (if not already present via `work_log`)
2. `src/screens/Activity/index.tsx` — Full rewrite
3. `src/components/ActivityCard/index.tsx` — New component (create file)
4. `src/lib/analytics.ts` — Add `captureActivityViewed()` (optional)

### Implementation

**Step 1: Query the existing `work_log` table** (no schema change needed)

The `work_log` table already captures: `status_change`, `note`, `charge`, `customer_notified`, `running_late`. We just need to render it with rich context.

**Step 2: Activity screen component**

```tsx
// src/screens/Activity/index.tsx
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { db, type WorkLogEntry, type Job, type Customer } from '../../lib/db';
import { useAppStore } from '../../store/useAppStore';
import { ActivityCard } from '../../components/ActivityCard';
import { SyncIndicator } from '../../components/SyncIndicator';

interface EnrichedActivity {
  id: string;
  type: WorkLogEntry['type'];
  description: string;
  jobTitle?: string;
  customerName?: string;
  amount?: number;
  timestamp: string;
  jobId?: string;
}

export default function Activity() {
  const navigate = useNavigate();
  const userId = useAppStore((s) => s.userId);
  const [activities, setActivities] = useState<EnrichedActivity[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) return;
    const load = async () => {
      const logs = await db.work_log
        .where('job_id')
        .noneOf([]) // all logs
        .reverse()
        .sortBy('created_at');
      
      // Get unique job IDs
      const jobIds = [...new Set(logs.map((l) => l.job_id))];
      const jobs = await db.jobs.bulkGet(jobIds);
      const jobMap = new Map(jobs.filter(Boolean).map((j) => [j!.id, j!]));
      
      const customerIds = [...new Set(jobs.filter(Boolean).map((j) => j!.customer_id))];
      const customers = await db.customers.bulkGet(customerIds);
      const customerMap = new Map(customers.filter(Boolean).map((c) => [c!.id, c!]));

      const enriched: EnrichedActivity[] = logs.map((log) => {
        const job = jobMap.get(log.job_id);
        const customer = job ? customerMap.get(job.customer_id) : undefined;
        return {
          id: log.id,
          type: log.type,
          description: log.description,
          jobTitle: job?.title,
          customerName: customer?.name,
          amount: log.amount,
          timestamp: log.created_at,
          jobId: log.job_id,
        };
      });

      setActivities(enriched.slice(0, 50)); // limit to 50
      setLoading(false);
    };
    load();
  }, [userId]);

  if (loading) {
    return (
      <div className="flex flex-col h-full bg-brand-surface">
        <div className="px-4 pt-4 pb-3 bg-[var(--app-shell-bg)] border-b border-brand-borderLight flex-shrink-0">
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-extrabold text-brand-black">Activity</h1>
            <SyncIndicator />
          </div>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-brand-border border-t-brand-black rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-brand-surface">
      <div className="px-4 pt-4 pb-3 bg-[var(--app-shell-bg)] border-b border-brand-borderLight flex-shrink-0">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-extrabold text-brand-black">Activity</h1>
          <SyncIndicator />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-4 pt-4 pb-6">
        {activities.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-brand-muted">
            <p className="text-sm">No activity yet</p>
            <p className="text-sm mt-1">Create a quote or log a job to get started</p>
          </div>
        ) : (
          <div className="space-y-3">
            {activities.map((a) => (
              <ActivityCard
                key={a.id}
                activity={a}
                onTap={() => a.jobId && navigate(`/jobs/${a.jobId}`)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
```

**Step 3: ActivityCard component** (new file: `src/components/ActivityCard/index.tsx`)

```tsx
import React from 'react';
import { FileText, CheckCircle, Banknote, MessageSquare, AlertTriangle, Clock } from 'lucide-react';
import type { EnrichedActivity } from '../../screens/Activity';
import { haptic } from '../../lib/haptics';

const TYPE_CONFIG: Record<string, { icon: React.ReactNode; label: string; color: string }> = {
  status_change: { icon: <CheckCircle size={16} />, label: 'Status changed', color: 'text-status-green' },
  note: { icon: <MessageSquare size={16} />, label: 'Note added', color: 'text-brand-mid' },
  charge: { icon: <Banknote size={16} />, label: 'Charge added', color: 'text-status-amber' },
  customer_notified: { icon: <MessageSquare size={16} />, label: 'Customer notified', color: 'text-brand-mid' },
  running_late: { icon: <Clock size={16} />, label: 'Running late', color: 'text-status-amber' },
};

function timeAgo(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const mins = Math.floor((now.getTime() - d.getTime()) / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'Yesterday';
  return `${days} days ago`;
}

export const ActivityCard: React.FC<{ activity: EnrichedActivity; onTap?: () => void }> = ({
  activity,
  onTap,
}) => {
  const config = TYPE_CONFIG[activity.type] || { icon: <AlertTriangle size={16} />, label: activity.type, color: 'text-brand-mid' };

  return (
    <div
      onClick={() => { haptic('light'); onTap?.(); }}
      className="bg-white border border-brand-border rounded-xl p-3.5 cursor-pointer active:scale-[0.98] active:bg-brand-borderLight/50 transition-all duration-150"
    >
      <div className="flex items-start gap-3">
        <div className={`mt-0.5 ${config.color}`}>{config.icon}</div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-brand-black leading-snug">
            {activity.description}
          </p>
          {activity.customerName && (
            <p className="text-sm text-brand-mid mt-0.5">
              {activity.customerName} · {activity.jobTitle}
            </p>
          )}
          <p className="text-xs text-brand-muted mt-1.5">{timeAgo(activity.timestamp)}</p>
        </div>
      </div>
    </div>
  );
};
```

### Acceptance Criteria

- [ ] Activity screen shows up to 50 most recent events from `work_log`
- [ ] Events are sorted reverse-chronologically (newest first)
- [ ] Each card shows: icon, description, customer name + job title, time ago
- [ ] Tapping a card navigates to the associated job detail
- [ ] Empty state shows friendly message instead of "coming soon"
- [ ] Works offline (reads from IndexedDB)
- [ ] Loading state shows spinner (reuses existing pattern)

---

## R3 — Photo Capture

**Current state**: No photo support anywhere in the app.
**Goal**: Add native camera capture to Job Detail and Quote Builder. Store photos in IndexedDB, display thumbnails, allow full-view on tap.

### Files to Modify

1. `src/lib/db.ts` — Add `JobPhoto` interface and table
2. `src/screens/JobDetail/index.tsx` — Add photo section, camera button, gallery
3. `src/screens/Quote/QuoteBuilder.tsx` — Add "Attach photo" button
4. `src/components/PhotoGallery/index.tsx` — New component (create file)
5. `src/lib/sync.ts` — Add `job_photos` to sync (or handle as base64 in work_log)

### Data Model

```typescript
// Add to src/lib/db.ts

export interface JobPhoto {
  id: string;
  job_id: string;
  user_id: string;
  data_url: string; // base64 JPEG, max 800px width, ~200KB each
  caption?: string;
  taken_at: string;
  created_at: string;
  _sync_status: SyncStatus;
}

// In BuildloggDB constructor:
// this.version(2).stores({
//   ...existing stores,
//   job_photos: 'id, job_id, user_id, created_at, _sync_status',
// });
```

> **Note**: Version bump from 1 → 2 requires Dexie migration. If deploying to existing users, use `this.version(2).upgrade()` to handle migration.

### Implementation

**Step 1: Photo capture helper** (new file: `src/lib/photoCapture.ts`)

```typescript
/**
 * Capture photo from device camera.
 * Returns base64 data URL (JPEG, max 800px width).
 */
export async function capturePhoto(): Promise<string | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.capture = 'environment'; // rear camera preferred

    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) { resolve(null); return; }

      // Resize to max 800px width, JPEG quality 0.7
      const resized = await resizeImage(file, 800, 0.7);
      resolve(resized);
    };

    input.click();
  });
}

async function resizeImage(file: File, maxWidth: number, quality: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();
    reader.onload = (e) => { img.src = e.target?.result as string; };
    reader.onerror = reject;
    reader.readAsDataURL(file);

    img.onload = () => {
      const canvas = document.createElement('canvas');
      const scale = Math.min(1, maxWidth / img.width);
      canvas.width = img.width * scale;
      canvas.height = img.height * scale;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = reject;
  });
}
```

**Step 2: PhotoGallery component** (new file: `src/components/PhotoGallery/index.tsx`)

```tsx
import React, { useState } from 'react';
import { Camera, X, ChevronLeft, ChevronRight } from 'lucide-react';
import { haptic } from '../../lib/haptics';
import { capturePhoto } from '../../lib/photoCapture';
import { db, type JobPhoto } from '../../lib/db';

interface PhotoGalleryProps {
  jobId: string;
  userId: string;
  photos: JobPhoto[];
  onPhotosChange: () => void;
  editable?: boolean;
}

export const PhotoGallery: React.FC<PhotoGalleryProps> = ({
  jobId, userId, photos, onPhotosChange, editable = true,
}) => {
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerIndex, setViewerIndex] = useState(0);

  const handleCapture = async () => {
    haptic('medium');
    const dataUrl = await capturePhoto();
    if (!dataUrl) return;

    const photo: JobPhoto = {
      id: crypto.randomUUID(),
      job_id: jobId,
      user_id: userId,
      data_url: dataUrl,
      taken_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      _sync_status: 'pending',
    };

    await db.job_photos.add(photo);
    onPhotosChange();
  };

  const handleDelete = async (photoId: string) => {
    haptic('light');
    await db.job_photos.delete(photoId);
    onPhotosChange();
  };

  return (
    <div>
      {/* Photo thumbnails */}
      {photos.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-2 -mx-4 px-4">
          {photos.map((p, i) => (
            <div key={p.id} className="relative shrink-0">
              <img
                src={p.data_url}
                alt="Job photo"
                className="w-24 h-24 object-cover rounded-xl border border-brand-border cursor-pointer"
                onClick={() => { haptic('light'); setViewerIndex(i); setViewerOpen(true); }}
              />
              {editable && (
                <button
                  onClick={() => handleDelete(p.id)}
                  className="absolute -top-1 -right-1 w-5 h-5 bg-white rounded-full shadow flex items-center justify-center"
                >
                  <X size={12} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Capture button */}
      {editable && (
        <button
          onClick={handleCapture}
          className="flex items-center gap-2 h-10 px-4 rounded-full bg-brand-borderLight text-sm font-medium text-brand-dark border border-brand-border cursor-pointer"
        >
          <Camera size={16} />
          {photos.length === 0 ? 'Add photo' : 'Add another'}
        </button>
      )}

      {/* Full-screen viewer */}
      {viewerOpen && (
        <div className="fixed inset-0 z-[60] bg-black flex items-center justify-center">
          <button
            onClick={() => setViewerOpen(false)}
            className="absolute top-4 right-4 text-white"
          >
            <X size={24} />
          </button>
          <img src={photos[viewerIndex].data_url} className="max-w-full max-h-full" />
          {photos.length > 1 && (
            <>
              <button onClick={() => setViewerIndex((i) => Math.max(0, i - 1))} className="absolute left-4 text-white">
                <ChevronLeft size={32} />
              </button>
              <button onClick={() => setViewerIndex((i) => Math.min(photos.length - 1, i + 1))} className="absolute right-4 text-white">
                <ChevronRight size={32} />
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
};
```

**Step 3: Integrate into JobDetail**

Add a "Photos" section in the Job Detail screen, above the "Notes" or "Work log" section:

```tsx
// In JobDetail/index.tsx, after the job info card and before the work log:

const [photos, setPhotos] = useState<JobPhoto[]>([]);

useEffect(() => {
  if (!jobId) return;
  db.job_photos.where('job_id').equals(jobId).toArray().then(setPhotos);
}, [jobId]);

// In the JSX, add:
<div className="px-4 mb-5">
  <div className="text-micro font-bold tracking-[0.7px] text-brand-muted mb-2 px-0.5">
    Photos
  </div>
  <PhotoGallery
    jobId={jobId!}
    userId={userId!}
    photos={photos}
    onPhotosChange={() => db.job_photos.where('job_id').equals(jobId!).toArray().then(setPhotos)}
  />
</div>
```

**Step 4: Integrate into Quote Builder**

Add an "Attach photo" button in the quote builder. Photos are stored with a temporary job ID and linked to the final job when saved.

### Acceptance Criteria

- [ ] Can capture photo from camera in Job Detail
- [ ] Photos are resized to max 800px, JPEG quality 0.7 (~200KB each)
- [ ] Photos stored in IndexedDB (`job_photos` table)
- [ ] Thumbnails shown in horizontal scrollable gallery
- [ ] Tap thumbnail to open full-screen viewer with swipe navigation
- [ ] Delete button on each thumbnail (with haptic)
- [ ] Works offline (photos stored locally, sync when online)
- [ ] Photos can be attached during quote building (linked to job on save)
- [ ] Max 10 photos per job (prevent storage bloat)

---

## R4 — Voice-to-Text Input

**Current state**: All text inputs require typing. No voice input support.
**Goal**: Add microphone buttons to job notes, quote descriptions, and customer details. Use Web Speech API (`webkitSpeechRecognition`).

### Files to Modify

1. `src/lib/voiceInput.ts` — New utility (create file)
2. `src/components/VoiceInputButton/index.tsx` — New reusable button (create file)
3. `src/screens/Quote/QuoteBuilder.tsx` — Add to item description inputs
4. `src/screens/JobDetail/index.tsx` — Add to note input and charge description
5. `src/screens/Quote/CustomerDetails.tsx` — Add to customer name field (optional)

### Implementation

**Step 1: Voice input utility** (new file: `src/lib/voiceInput.ts`)

```typescript
/**
 * Voice-to-text using Web Speech API.
 * Falls back gracefully if not supported.
 */

export interface VoiceInputOptions {
  onResult: (text: string) => void;
  onError?: (error: string) => void;
  onEnd?: () => void;
  lang?: string;
}

let currentRecognition: SpeechRecognition | null = null;

export function isVoiceSupported(): boolean {
  return typeof window !== 'undefined' && 'SpeechRecognition' in window || 'webkitSpeechRecognition' in window;
}

export function startVoiceInput(options: VoiceInputOptions): () => void {
  if (!isVoiceSupported()) {
    options.onError?.('Voice input not supported on this device');
    return () => {};
  }

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const recognition = new SpeechRecognition();
  currentRecognition = recognition;

  recognition.continuous = false;
  recognition.interimResults = true;
  recognition.lang = options.lang || 'en-GB';

  recognition.onresult = (event: SpeechRecognitionEvent) => {
    const transcript = Array.from(event.results)
      .map((r) => r[0].transcript)
      .join('');
    if (event.results[event.results.length - 1].isFinal) {
      options.onResult(transcript);
    }
  };

  recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
    options.onError?.(event.error);
  };

  recognition.onend = () => {
    options.onEnd?.();
    currentRecognition = null;
  };

  recognition.start();

  // Return cleanup function
  return () => {
    recognition.stop();
    currentRecognition = null;
  };
}

export function stopVoiceInput() {
  if (currentRecognition) {
    currentRecognition.stop();
    currentRecognition = null;
  }
}
```

**Step 2: Voice input button** (new file: `src/components/VoiceInputButton/index.tsx`)

```tsx
import React, { useState } from 'react';
import { Mic, MicOff } from 'lucide-react';
import { haptic } from '../../lib/haptics';
import { isVoiceSupported, startVoiceInput } from '../../lib/voiceInput';

interface VoiceInputButtonProps {
  onResult: (text: string) => void;
  className?: string;
}

export const VoiceInputButton: React.FC<VoiceInputButtonProps> = ({ onResult, className }) => {
  const [isListening, setIsListening] = useState(false);
  const supported = isVoiceSupported();

  if (!supported) return null;

  const handleClick = () => {
    if (isListening) {
      // Stop listening
      setIsListening(false);
      haptic('light');
    } else {
      haptic('medium');
      setIsListening(true);
      startVoiceInput({
        onResult: (text) => {
          onResult(text);
          setIsListening(false);
        },
        onError: () => setIsListening(false),
        onEnd: () => setIsListening(false),
      });
    }
  };

  return (
    <button
      onClick={handleClick}
      className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${
        isListening
          ? 'bg-red-100 text-red-600 animate-pulse'
          : 'bg-brand-borderLight text-brand-mid hover:bg-brand-border'
      } ${className}`}
    >
      {isListening ? <MicOff size={18} /> : <Mic size={18} />}
    </button>
  );
};
```

**Step 3: Integrate into Quote Builder**

In the line item description input, add a microphone button to the right:

```tsx
// In QuoteBuilder.tsx, in the item description input area:

<div className="flex items-center gap-2">
  <input
    type="text"
    value={item.description}
    onChange={(e) => updateItemDesc(item.id, e.target.value)}
    placeholder="Item description"
    className="flex-1 ..."
  />
  <VoiceInputButton
    onResult={(text) => updateItemDesc(item.id, text)}
  />
</div>
```

**Step 4: Integrate into Job Detail notes**

In the "Add note" textarea in JobDetail, add a mic button below the textarea:

```tsx
<div className="flex items-center justify-between mt-2">
  <VoiceInputButton
    onResult={(text) => setNoteText((prev) => prev + ' ' + text)}
  />
  <button onClick={handleAddNote}>Add note</button>
</div>
```

### Acceptance Criteria

- [ ] Microphone button appears on all text inputs in Job Detail and Quote Builder
- [ ] Button hidden on devices without SpeechRecognition support (graceful degradation)
- [ ] Tap button to start listening (red pulsing state)
- [ ] Tap again or auto-stop to end listening
- [ ] Transcribed text is appended to the input field
- [ ] Haptic feedback on start/stop
- [ ] Works offline (SpeechRecognition may need network — show warning if offline)
- [ ] British English accent support (`lang: 'en-GB'`)

---

## R5 — Custom Item Library

**Current state**: Hardcoded quick-add buttons (`Pipes`, `Fittings`, `Boiler`, etc.) based on trade type. Clicking adds a description with £0.00 amount.
**Goal**: User-editable saved items (description + price) that one-tap add to quotes with pre-filled prices.

> **See detailed design in `Buildlogg_MVP_Recommendations.md` Part 2. This is a summary for implementation planning.**

### Files to Modify

1. `src/lib/db.ts` — Add `CustomItem` table
2. `src/screens/Settings/index.tsx` — Add "My Items" section
3. `src/screens/Settings/CustomItems.tsx` — New settings sub-screen (create file)
4. `src/screens/Quote/QuoteBuilder.tsx` — Replace hardcoded chips with user items
5. `src/lib/analytics.ts` — Add `captureCustomItemAdded`, `captureCustomItemUsed`

### Data Model

```typescript
// Add to src/lib/db.ts

export interface CustomItem {
  id: string;
  user_id: string;
  description: string;
  amount: number;
  sort_order: number;
  created_at: string;
  updated_at: string;
  _sync_status: SyncStatus;
}

// In TradePadDB constructor, version bump:
// this.version(2).stores({
//   ...existing stores,
//   custom_items: 'id, user_id, sort_order, [user_id+sort_order]',
// });
```

### Implementation Steps

**Step 1: Add table to Dexie** (with migration from v1 → v2)

**Step 2: Create Settings → My Items screen** (new file: `src/screens/Settings/CustomItems.tsx`)

- List of saved items with inline edit (description + amount)
- Delete button per item
- "Add new item" button at bottom
- Reorder via drag handle (use native HTML5 drag-and-drop or simple up/down arrows in MVP)
- Show "Used in X quotes" count (optional v2)

**Step 3: Replace hardcoded chips in QuoteBuilder**

- Query `db.custom_items.where('user_id').equals(userId).sortBy('sort_order')`
- Render chips with `description + £amount`
- One tap adds item with both description and amount pre-filled
- If no custom items: show 5 hardcoded starter items as "Suggested" with 💾 save button

**Step 4: Add "Save to library" button on line items**

When a line item has both description and amount filled, show a small 💾 button. Tapping saves it to the custom item library.

### Acceptance Criteria

- [ ] User can create, edit, and delete custom items in Settings
- [ ] Custom items appear as quick-add chips in Quote Builder with pre-filled prices
- [ ] One tap adds the full item (description + amount) to the quote
- [ ] If no custom items exist, show starter suggestions with save button
- [ ] Items can be saved inline from the quote builder (💾 button on line items)
- [ ] Data syncs to Supabase when online
- [ ] Works offline (stored in IndexedDB)

---

## R6 — One-Tap Job Done → Payment

**Current state**: Marking a job done and collecting payment requires multiple steps: mark done → open payment sheet → enter amount → select method → save.
**Goal**: Single bottom sheet that shows: "Mark done and collect £[amount]" with payment method buttons (Cash, Bank Transfer, Card). Auto-fills the job total.

### Files to Modify

1. `src/screens/JobDetail/index.tsx` — Replace multi-step payment flow with one-tap sheet
2. `src/components/PaymentSheet/index.tsx` — New bottom sheet (create file, or reuse BottomSheet)

### Implementation

**Step 1: Create QuickPaymentSheet** (new file or inline in JobDetail)

```tsx
// QuickPaymentSheet — shown when tapping "Mark done" on an active job

interface QuickPaymentSheetProps {
  isOpen: boolean;
  onClose: () => void;
  total: number;
  customerName: string;
  onCollect: (method: 'cash' | 'bank_transfer' | 'other') => void;
  onMarkDoneOnly: () => void; // For "I'll collect later"
}
```

**Step 2: Replace existing flow**

In `JobDetail/index.tsx`, when the user taps "Mark done" on an in-progress job:

```tsx
// BEFORE: marks done, then user has to open payment sheet manually
// AFTER: shows QuickPaymentSheet immediately

const handleMarkDone = () => {
  haptic('medium');
  setShowQuickPayment(true);
};

const handleCollect = async (method: 'cash' | 'bank_transfer' | 'other') => {
  const total = jobTotal(lineItems);
  // 1. Mark job as done (awaiting_payment or paid)
  // 2. Record payment
  // 3. Show success toast
  // 4. Close sheet
  await db.jobs.update(job.id, { status: 'paid', actual_end: now(), updated_at: now() });
  await db.payments.add({
    id: crypto.randomUUID(),
    job_id: job.id,
    type: 'full',
    method,
    amount: total,
    recorded_at: now(),
    created_at: now(),
    _sync_status: 'pending',
  });
  showSuccess(`£${total.toFixed(2)} collected via ${methodLabel(method)}`);
  captureJobMarkedPaid();
  setShowQuickPayment(false);
  refresh();
};
```

**Step 3: Sheet UI**

```
┌─────────────────────────────────────┐
│ ───                               │
│                                     │
│  Collect payment                    │
│  Kitchen refit — £2,450.00         │
│                                     │
│  ┌─────────────────────────────────┐│
│  │ 💷 Cash              £2,450.00 ││
│  └─────────────────────────────────┘│
│  ┌─────────────────────────────────┐│
│  │ 🏦 Bank transfer     £2,450.00 ││
│  └─────────────────────────────────┘│
│  ┌─────────────────────────────────┐│
│  │ 💳 Card              £2,450.00 ││
│  └─────────────────────────────────┘│
│                                     │
│  ──────────── or ────────────       │
│                                     │
│  Mark done — collect later          │
│                                     │
└─────────────────────────────────────┘
```

### Acceptance Criteria

- [ ] Tapping "Mark done" on an active job shows the QuickPaymentSheet
- [ ] Sheet shows job title and total amount prominently
- [ ] Three payment method buttons with the full amount pre-filled
- [ ] "Mark done — collect later" option for deferred payment
- [ ] One tap on a method marks job done AND records payment
- [ ] Success toast confirms amount and method
- [ ] Job status changes to `paid` immediately
- [ ] Works offline (queues sync)

---

## R7 — Smart Payment Chase

**Current state**: No payment chasing mechanism. User has to manually open WhatsApp, type a message, and send it.
**Goal**: Auto-generate chase messages for overdue payments with one-tap WhatsApp/SMS send. Message includes customer name, amount, job title, days overdue, and payment details.

### Files to Modify

1. `src/screens/JobDetail/index.tsx` — Add "Chase payment" button for `awaiting_payment` jobs
2. `src/screens/Home/index.tsx` — Add "Chase payment" tasks to the task list
3. `src/lib/paymentChase.ts` — New utility (create file)
4. `src/lib/analytics.ts` — Add `capturePaymentChase(method)`

### Implementation

**Step 1: Chase message generator** (new file: `src/lib/paymentChase.ts`)

```typescript
interface ChaseMessageParams {
  customerName: string;
  jobTitle: string;
  amount: number;
  daysOverdue: number;
  businessName: string;
  sortCode?: string;
  accountNumber?: string;
}

export function generateChaseMessage(params: ChaseMessageParams): string {
  const firstName = params.customerName.split(' ')[0];
  const bankInfo = params.sortCode && params.accountNumber
    ? `Please transfer to: Sort code ${params.sortCode}, Account ${params.accountNumber}.`
    : '';

  return `Hi ${firstName}, just a friendly reminder that the £${params.amount.toFixed(2)} balance for ${params.jobTitle} is now ${params.daysOverdue} days overdue. ${bankInfo} Thanks, ${params.businessName}`;
}

export function generateChaseUrl(params: ChaseMessageParams & { method: 'whatsapp' | 'sms', phone: string }): string {
  const message = generateChaseMessage(params);
  const encoded = encodeURIComponent(message);
  if (params.method === 'whatsapp') {
    return `https://wa.me/${params.phone.replace(/\D/g, '')}?text=${encoded}`;
  }
  return `sms:${params.phone}?body=${encoded}`;
}
```

**Step 2: Add chase button to JobDetail**

For jobs with status `awaiting_payment` or `quoted` (if quote was sent >7 days ago):

```tsx
// In JobDetail, add a "Chase payment" button in the sticky footer or actions section

{job.status === 'awaiting_payment' && (
  <Button
    variant="secondary"
    onClick={() => setShowChaseSheet(true)}
  >
    Chase payment
  </Button>
)}
```

**Step 3: Chase bottom sheet**

Show the generated message with "Send via WhatsApp" and "Send via SMS" buttons. Include a preview of the message text with an "Edit" option.

**Step 4: Add to Home tasks**

In `Home/index.tsx`, generate "chase" tasks for overdue payments:

```tsx
// In the task generation logic, add:
if (job.status === 'awaiting_payment' && daysSinceQuote > 7) {
  tasks.push({
    type: 'chase',
    jobId: job.id,
    customerName: customer.name,
    jobTitle: job.title,
    amount: total,
    daysOverdue: daysSinceQuote - 7,
    // ...
  });
}
```

### Acceptance Criteria

- [ ] Chase button appears on jobs with status `awaiting_payment`
- [ ] Auto-generated message includes: customer first name, amount, job title, days overdue, business name, bank details (if set)
- [ ] One-tap send via WhatsApp or SMS
- [ ] Message preview shown before sending with option to edit
- [ ] Chase tasks appear on Home screen for overdue payments
- [ ] Tapping a chase task opens the job with the chase sheet pre-opened
- [ ] Works offline (message generated locally, link opens native app)
- [ ] Analytics event fired on chase send

---

## R14 — Customer History in Quote Builder

**Current state**: Quote Builder shows only the current customer name. No history of past jobs, quotes, or payments.
**Goal**: When Dave starts a new quote for an existing customer, show a card with: previous jobs count, total quoted, total paid, last quote date, and a "See all jobs" link.

### Files to Modify

1. `src/screens/Quote/CustomerDetails.tsx` or `src/screens/Quote/QuoteBuilder.tsx` — Add customer history card
2. `src/lib/customerHistory.ts` — New utility (create file, or inline)

### Implementation

**Step 1: Customer history query** (inline in component or new utility)

```typescript
async function getCustomerHistory(userId: string, customerId: string): Promise<{
  totalJobs: number;
  totalQuoted: number;
  totalPaid: number;
  lastQuoteDate: string | null;
}> {
  const jobs = await db.jobs.where('customer_id').equals(customerId).toArray();
  const jobIds = jobs.map((j) => j.id);
  const lineItems = await db.line_items.where('job_id').anyOf(jobIds).toArray();
  const payments = await db.payments.where('job_id').anyOf(jobIds).toArray();

  const totalQuoted = lineItems.reduce((sum, li) => sum + li.amount, 0);
  const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);
  const quotedJobs = jobs.filter((j) => j.quote_sent_at);
  const lastQuoteDate = quotedJobs.length > 0
    ? quotedJobs.sort((a, b) => new Date(b.quote_sent_at!).getTime() - new Date(a.quote_sent_at!).getTime())[0].quote_sent_at
    : null;

  return {
    totalJobs: jobs.length,
    totalQuoted,
    totalPaid,
    lastQuoteDate,
  };
}
```

**Step 2: Add history card to CustomerDetails or QuoteBuilder**

After the customer name is confirmed (or in the QuoteBuilder once customer is selected), show a card:

```tsx
{customerHistory && customerHistory.totalJobs > 0 && (
  <div className="bg-blue-50 border border-blue-200 rounded-xl p-3.5 mb-4">
    <div className="flex items-center justify-between mb-2">
      <span className="text-sm font-bold text-blue-800">Customer history</span>
      <span className="text-xs text-blue-600">{customerHistory.totalJobs} jobs</span>
    </div>
    <div className="grid grid-cols-2 gap-2 text-sm">
      <div>
        <span className="text-blue-600">Total quoted</span>
        <p className="font-bold text-blue-800">£{customerHistory.totalQuoted.toFixed(2)}</p>
      </div>
      <div>
        <span className="text-blue-600">Total paid</span>
        <p className="font-bold text-blue-800">£{customerHistory.totalPaid.toFixed(2)}</p>
      </div>
    </div>
    {customerHistory.lastQuoteDate && (
      <p className="text-xs text-blue-600 mt-2">
        Last quote: {formatDate(customerHistory.lastQuoteDate)}
      </p>
    )}
    <button
      onClick={() => navigate(`/jobs?customer=${customerId}`)}
      className="text-xs text-blue-700 font-medium mt-2 underline"
    >
      See all jobs →
    </button>
  </div>
)}
```

### Acceptance Criteria

- [ ] History card appears when creating a quote for an existing customer (2+ jobs)
- [ ] Shows: total jobs, total quoted, total paid, last quote date
- [ ] "See all jobs" link navigates to Jobs list filtered by customer
- [ ] Card is hidden for new customers (0 previous jobs)
- [ ] Works offline (reads from IndexedDB)
- [ ] Data updates in real-time as jobs/payments are added

---

## R19 — Materials Inventory / Parts Tracking

**Current state**: Line items in quotes are the only way to track materials. No way to log actual parts used vs. quoted.
**Goal**: Add a "Materials used" section to Job Detail where Dave logs actual parts (with quantity, cost, markup). Shows a "Materials vs. Quote" comparison to flag overruns.

### Files to Modify

1. `src/lib/db.ts` — Add `MaterialItem` table
2. `src/screens/JobDetail/index.tsx` — Add Materials section
3. `src/components/MaterialsList/index.tsx` — New component (create file)
4. `src/lib/analytics.ts` — Add `captureMaterialAdded()`

### Data Model

```typescript
// Add to src/lib/db.ts

export interface MaterialItem {
  id: string;
  job_id: string;
  user_id: string;
  description: string;      // e.g., "15mm copper pipe"
  quantity: number;         // e.g., 3
  unit_cost: number;        // e.g., 12.50 (cost price)
  markup_pct: number;       // e.g., 20 (20% markup)
  unit_price: number;       // calculated: unit_cost * (1 + markup_pct/100)
  total_cost: number;       // quantity * unit_cost
  total_price: number;      // quantity * unit_price
  added_on_site: boolean;   // true if added during job, false if pre-quoted
  created_at: string;
  _sync_status: SyncStatus;
}

// In BuildloggDB constructor:
// this.version(2).stores({
//   ...existing stores,
//   material_items: 'id, job_id, user_id, created_at, _sync_status',
// });
```

### Implementation

**Step 1: MaterialsList component** (new file: `src/components/MaterialsList/index.tsx`)

- Inline add/edit/delete rows: description, quantity, unit cost, markup %
- Auto-calculates unit price and total
- Shows "Quoted vs. Actual" comparison bar
- Flag in red if actual materials cost > quoted materials

**Step 2: Integrate into JobDetail**

Add a "Materials" section below the invoice/line items and above the work log:

```tsx
<div className="px-4 mb-5">
  <div className="text-micro font-bold tracking-[0.7px] text-brand-muted mb-2 px-0.5">
    Materials
  </div>
  <MaterialsList
    jobId={jobId}
    userId={userId}
    quotedAmount={lineItemsTotal} // from quote line items
  />
</div>
```

**Step 3: Comparison visualization**

```
Quoted: £150.00  ━━━━━━━━━━━━━━━━━━━━━━━━
Actual: £187.50  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 🔴 +25% overrun

Breakdown:
- 15mm copper pipe (3m)   £12.50 × 3 = £37.50
- Compression fittings    £8.00 × 5 = £40.00
- PTFE tape               £2.50 × 1 = £2.50
```

### Acceptance Criteria

- [ ] Can add material items with: description, quantity, unit cost, markup %
- [ ] Auto-calculates unit price and total
- [ ] Shows quoted vs. actual comparison with overrun warning (red if >10%)
- [ ] Can edit and delete material items
- [ ] Works offline (IndexedDB)
- [ ] Syncs to Supabase when online
- [ ] Analytics event on material added

---

## Cross-Cutting Concerns

### Database Version Migration

All features that add new tables (R3, R5, R19) require a Dexie version bump. Use a single migration:

```typescript
// In db.ts constructor
this.version(1).stores({ ... });
this.version(2).stores({
  ...existing stores,
  job_photos: 'id, job_id, user_id, created_at, _sync_status',
  custom_items: 'id, user_id, sort_order, [user_id+sort_order]',
  material_items: 'id, job_id, user_id, created_at, _sync_status',
});
```

### Sync Support

Add new tables to `initialSync.ts` and `sync.ts`:

```typescript
// initialSync.ts: add new fetches
const [jobPhotos, customItems, materialItems] = await Promise.all([
  supabase.from('job_photos').select('*, jobs!inner(user_id)').eq('jobs.user_id', userId),
  supabase.from('custom_items').select('*').eq('user_id', userId),
  supabase.from('material_items').select('*, jobs!inner(user_id)').eq('jobs.user_id', userId),
]);

// sync.ts: add handlers for new tables in syncWorker
```

### Analytics Events

Add to `src/lib/analytics.ts`:

```typescript
export function captureCustomItemAdded() { capture('custom_item_added'); }
export function captureCustomItemUsed() { capture('custom_item_used'); }
export function capturePhotoAdded() { capture('photo_added'); }
export function captureVoiceInputUsed() { capture('voice_input_used'); }
export function capturePaymentChase(method: 'whatsapp' | 'sms') { capture('payment_chase', { method }); }
export function captureMaterialAdded() { capture('material_added'); }
```

---

## Implementation Order (Recommended)

| Order | Feature | Effort | Why First? |
|-------|---------|--------|------------|
| 1 | R5 — Custom Item Library | 2 days | Daily use, massive time savings, affects every quote |
| 2 | R6 — One-Tap Payment | 1 day | Money moment, directly improves cash flow |
| 3 | R7 — Smart Payment Chase | 1 day | Cash flow, weekly use, low effort |
| 4 | R1 — Activity Feed | 1 day | App completeness, trust building |
| 5 | R4 — Voice-to-Text | 4 hours | Gloves-on workflow, accessibility |
| 6 | R3 — Photo Capture | 2 days | Core differentiator, daily use |
| 7 | R14 — Customer History | 1 day | Repeat customer revenue, medium effort |
| 8 | R19 — Materials Inventory | 2 days | Profitability, medium frequency |

**Total: ~10 days** (2 weeks with testing, review, and iteration)
