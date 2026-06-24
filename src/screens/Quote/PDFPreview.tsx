import { useState, useEffect, useRef } from 'react';
import { ChevronLeft, Download, Share2 } from 'lucide-react';
import { Button } from '../../components/Button';
import { showToast } from '../../components/Toast/store';
import { haptic } from '../../lib/haptics';

interface PDFPreviewProps {
  blob: Blob;
  fileName: string;
  onBack: () => void;
  onShared?: (method: 'whatsapp' | 'download' | 'share') => void;
}

export default function PDFPreview({ blob, fileName, onBack, onShared }: PDFPreviewProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [url, setUrl] = useState<string>('');

  useEffect(() => {
    const objUrl = URL.createObjectURL(blob);
    setUrl(objUrl);
    return () => URL.revokeObjectURL(objUrl);
  }, [blob]);

  const handleDownload = () => {
    haptic('light');
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    onShared?.('download');
    showToast('PDF downloaded');
  };

  const handleShare = async () => {
    haptic('light');
    const file = new File([blob], fileName, { type: 'application/pdf' });

    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({
          files: [file],
          title: fileName,
        });
        onShared?.('share');
      } catch {
        // User cancelled share
      }
    } else {
      // Fallback: download
      handleDownload();
    }
  };

  return (
    <div className="bg-[var(--app-shell-bg)] flex flex-col min-h-[100dvh]">
      <div className="sticky top-0 z-40 px-4 pt-4 pb-3 bg-[var(--app-shell-bg)] border-b border-brand-borderLight">
        <div className="flex items-center justify-between">
          <button onClick={onBack} className="flex items-center gap-1 text-brand-dark cursor-pointer">
            <ChevronLeft size={20} />
            <span className="text-sm font-medium">Back</span>
          </button>
          <span className="text-sm font-semibold text-brand-black">PDF Preview</span>
          <button onClick={handleDownload} className="w-8 h-8 flex items-center justify-center text-brand-black cursor-pointer">
            <Download size={18} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-hidden">
        <iframe
          ref={iframeRef}
          src={url}
          className="w-full h-full border-none"
          title="PDF Preview"
        />
      </div>

      <div className="sticky bottom-0 z-40 bg-[var(--app-shell-bg)] border-t border-brand-borderLight px-4 py-3 pb-[calc(8px+env(safe-area-inset-bottom))]">
        <Button variant="primary" onClick={handleShare} fullWidth>
          <Share2 size={18} className="mr-2" />
          Share PDF
        </Button>
      </div>
    </div>
  );
}
