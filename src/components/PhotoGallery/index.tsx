import React, { useState } from 'react';
import { Camera, Image as ImageIcon, X, ChevronLeft, ChevronRight } from 'lucide-react';
import { haptic } from '../../lib/haptics';
import { capturePhoto, pickPhotoFromLibrary } from '../../lib/photoCapture';
import { BottomSheet, SheetRow } from '../../components/BottomSheet';
import { db, type JobPhoto } from '../../lib/db';

interface PhotoGalleryProps {
  jobId: string;
  userId: string;
  photos: JobPhoto[];
  onPhotosChange: () => void;
  onCapture?: () => void;
  editable?: boolean;
}

export const PhotoGallery: React.FC<PhotoGalleryProps> = ({
  jobId, userId, photos, onPhotosChange, onCapture, editable = true,
}) => {
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerIndex, setViewerIndex] = useState(0);
  const [sourceSheetOpen, setSourceSheetOpen] = useState(false);

  const savePhoto = async (dataUrl: string) => {
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
    await db.sync_queue.add({
      operation: 'insert',
      table_name: 'job_photos',
      record_id: photo.id,
      payload: { ...photo },
      created_at: photo.created_at,
      retry_count: 0,
    });
    onPhotosChange();
    onCapture?.();
  };

  const handleCapture = () => {
    if (photos.length >= 10) return;
    haptic('medium');
    setSourceSheetOpen(true);
  };

  const handleTakePhoto = async () => {
    setSourceSheetOpen(false);
    const dataUrl = await capturePhoto();
    if (!dataUrl) return;
    await savePhoto(dataUrl);
  };

  const handlePickFromLibrary = async () => {
    setSourceSheetOpen(false);
    const dataUrl = await pickPhotoFromLibrary();
    if (!dataUrl) return;
    await savePhoto(dataUrl);
  };

  const handleDelete = async (photoId: string) => {
    haptic('light');
    await db.job_photos.delete(photoId);
    await db.sync_queue.add({
      operation: 'delete',
      table_name: 'job_photos',
      record_id: photoId,
      payload: {},
      created_at: new Date().toISOString(),
      retry_count: 0,
    });
    onPhotosChange();
  };

  return (
    <div>
      {/* Photo thumbnails */}
      {photos.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-2 -mx-4 px-4 mb-2">
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
                  className="absolute -top-1 -right-1 w-5 h-5 bg-white rounded-full shadow flex items-center justify-center cursor-pointer"
                >
                  <X size={12} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Capture button */}
      {editable && photos.length < 10 && (
        <button
          onClick={handleCapture}
          className="flex items-center gap-2 h-10 px-4 rounded-full bg-brand-borderLight text-sm font-medium text-brand-dark border border-brand-border cursor-pointer hover:bg-brand-border active:bg-brand-borderLight transition-colors"
        >
          <Camera size={16} />
          {photos.length === 0 ? 'Add photo' : 'Add another'}
        </button>
      )}
      {photos.length >= 10 && (
        <p className="text-sm text-brand-muted">Max 10 photos reached</p>
      )}

      {/* Photo source picker */}
      <BottomSheet
        isOpen={sourceSheetOpen}
        onClose={() => setSourceSheetOpen(false)}
        title="Add photo"
      >
        <div className="flex flex-col">
          <SheetRow
            icon={<Camera size={18} className="text-brand-dark" />}
            label="Take photo"
            onTap={handleTakePhoto}
          />
          <SheetRow
            icon={<ImageIcon size={18} className="text-brand-dark" />}
            label="Choose from library"
            onTap={handlePickFromLibrary}
            isLast
          />
        </div>
      </BottomSheet>

      {/* Full-screen viewer */}
      {viewerOpen && (
        <div className="fixed inset-0 z-[60] bg-black flex items-center justify-center">
          <button
            onClick={() => setViewerOpen(false)}
            className="absolute top-4 right-4 text-white cursor-pointer"
          >
            <X size={24} />
          </button>
          <img src={photos[viewerIndex].data_url} className="max-w-full max-h-full" alt="Full view" />
          {photos.length > 1 && (
            <>
              <button
                onClick={() => setViewerIndex((i) => Math.max(0, i - 1))}
                className="absolute left-4 text-white cursor-pointer"
                disabled={viewerIndex === 0}
              >
                <ChevronLeft size={32} />
              </button>
              <button
                onClick={() => setViewerIndex((i) => Math.min(photos.length - 1, i + 1))}
                className="absolute right-4 text-white cursor-pointer"
                disabled={viewerIndex === photos.length - 1}
              >
                <ChevronRight size={32} />
              </button>
            </>
          )}
          <div className="absolute bottom-4 left-0 right-0 text-center text-white text-sm">
            {viewerIndex + 1} / {photos.length}
          </div>
        </div>
      )}
    </div>
  );
};
