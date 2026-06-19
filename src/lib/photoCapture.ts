/**
 * Capture photo from device camera.
 * Returns base64 data URL (JPEG, max 800px width).
 */
export async function capturePhoto(): Promise<string | null> {
  return openPhotoPicker({ source: 'camera' });
}

/**
 * Pick a photo from the device library.
 * Returns base64 data URL (JPEG, max 800px width).
 */
export async function pickPhotoFromLibrary(): Promise<string | null> {
  return openPhotoPicker({ source: 'library' });
}

function openPhotoPicker(options: { source: 'camera' | 'library' }): Promise<string | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    if (options.source === 'camera') {
      input.capture = 'environment';
    }

    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) { resolve(null); return; }

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

/* ─── Shared photo save helper ─── */

import { db } from './db';

/**
 * Save a photo (data URL) to the job_photos table and sync queue.
 * Used by PhotoGallery, mark_done sheet in Home, and mark_done sheet in JobDetail.
 */
export async function saveJobPhoto(jobId: string, userId: string, dataUrl: string): Promise<void> {
  const photo = {
    id: crypto.randomUUID(),
    job_id: jobId,
    user_id: userId,
    data_url: dataUrl,
    taken_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    _sync_status: 'pending' as const,
  };

  await db.job_photos.add(photo);
  await db.sync_queue.add({
    operation: 'insert',
    table_name: 'job_photos',
    record_id: photo.id,
    payload: { ...photo },
    created_at: photo.created_at,
    retry_count: 0,
  });
}
