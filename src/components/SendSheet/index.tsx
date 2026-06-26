import { useState, useEffect, useRef } from 'react';
import { MessageCircle, FileText, Share2, X, Clipboard } from 'lucide-react';
import { BottomSheet } from '../BottomSheet';
import { Button } from '../Button';
import { haptic } from '../../lib/haptics';
import { showToast } from '../Toast/store';
import PDFPreview from '../../screens/Quote/PDFPreview';

export type SendMethod = 'whatsapp' | 'whatsapp_pdf' | 'sms' | 'text_pdf';

export interface SendSheetPdfOptions {
  label: string;
  generatePdf: () => Blob;
  fileName: string;
  onPdfGenerated?: () => void;
}

export interface SendSheetProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  customerPhone: string;
  messageText: string;
  onMessageChange: (text: string) => void;
  onSend: (method: SendMethod, pdfShared: boolean) => void;
  onSaveDraft?: () => void;
  pdfOptions?: SendSheetPdfOptions;
  fullMessage?: string;
  compactMessage?: string;
}

export function SendSheet({
  isOpen,
  onClose,
  title,
  customerPhone,
  messageText,
  onMessageChange,
  onSend,
  onSaveDraft,
  pdfOptions,
  fullMessage,
  compactMessage,
}: SendSheetProps) {
  const [attachPDF, setAttachPDF] = useState(false);
  const [pdfBlob, setPdfBlob] = useState<Blob | null>(null);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [editingMessage, setEditingMessage] = useState(false);
  const [showPdfPreview, setShowPdfPreview] = useState(false);
  const [showSharePdfToast, setShowSharePdfToast] = useState(false);
  const [lastAutoVariant, setLastAutoVariant] = useState<'full' | 'compact' | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset state when sheet closes
  useEffect(() => {
    if (!isOpen) {
      setAttachPDF(false);
      setPdfBlob(null);
      setGeneratingPdf(false);
      setEditingMessage(false);
      setShowPdfPreview(false);
      setShowSharePdfToast(false);
      setLastAutoVariant(null);
      if (toastTimerRef.current) {
        clearTimeout(toastTimerRef.current);
        toastTimerRef.current = null;
      }
    }
  }, [isOpen]);

  // Track which auto-variant the current text matches
  useEffect(() => {
    if (fullMessage && messageText === fullMessage) setLastAutoVariant('full');
    else if (compactMessage && messageText === compactMessage) setLastAutoVariant('compact');
    else if (messageText !== '' && messageText !== fullMessage && messageText !== compactMessage) setLastAutoVariant(null);
  }, [messageText, fullMessage, compactMessage]);

  const canShareFiles = typeof navigator !== 'undefined' && !!navigator.canShare;

  const handleTogglePDF = () => {
    if (attachPDF) {
      // Turning OFF
      setAttachPDF(false);
      setPdfBlob(null);
      setShowSharePdfToast(false);
      // Swap message back to full if we were on compact
      if (lastAutoVariant === 'compact' && fullMessage) {
        onMessageChange(fullMessage);
      }
    } else {
      // Turning ON
      haptic('light');
      setGeneratingPdf(true);
      try {
        const blob = pdfOptions!.generatePdf();
        setPdfBlob(blob);
        setAttachPDF(true);
        pdfOptions?.onPdfGenerated?.();
        // Swap to compact message if currently on full
        if (lastAutoVariant === 'full' && compactMessage) {
          onMessageChange(compactMessage);
        }
      } catch {
        showToast('Could not generate PDF');
        setAttachPDF(false);
      } finally {
        setGeneratingPdf(false);
      }
    }
  };

  const handleWhatsApp = () => {
    if (!customerPhone) return;
    haptic('light');
    const phone = customerPhone.replace(/\D/g, '');
    const encoded = encodeURIComponent(messageText);
    // Use window.location.href so iOS PWA doesn't leave a blank Safari tab.
    // The OS intercepts the wa.me universal link and opens WhatsApp directly.
    // Call onSend before navigation so work_log is recorded.
    if (attachPDF && pdfBlob) {
      if (canShareFiles) {
        setShowSharePdfToast(true);
        toastTimerRef.current = setTimeout(() => setShowSharePdfToast(false), 15000);
        onSend('whatsapp_pdf', false);
      } else {
        setShowPdfPreview(true);
        onSend('whatsapp_pdf', false);
      }
    } else {
      onSend('whatsapp', false);
    }
    window.location.href = `https://wa.me/${phone}?text=${encoded}`;
  };

  const handleSharePdfFromToast = async () => {
    if (!pdfBlob) return;
    haptic('light');
    setShowSharePdfToast(false);
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
      toastTimerRef.current = null;
    }
    try {
      const file = new File([pdfBlob], pdfOptions?.fileName || 'document.pdf', { type: 'application/pdf' });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file] });
      }
    } catch {
      // User cancelled — no action needed
    }
  };

  const handleText = async () => {
    if (!customerPhone) return;
    haptic('light');

    if (attachPDF && pdfBlob) {
      if (canShareFiles) {
        // Single step: navigator.share with files + text
        try {
          const file = new File([pdfBlob], pdfOptions?.fileName || 'document.pdf', { type: 'application/pdf' });
          if (navigator.canShare?.({ files: [file] })) {
            await navigator.share({ files: [file], text: messageText });
            onSend('text_pdf', true);
          } else {
            setShowPdfPreview(true);
            onSend('text_pdf', false);
          }
        } catch {
          // User cancelled
          onSend('text_pdf', false);
        }
      } else {
        // Desktop fallback
        setShowPdfPreview(true);
        onSend('text_pdf', false);
      }
    } else {
      // Text only — direct sms: link
      window.location.href = `sms:${customerPhone}?body=${encodeURIComponent(messageText)}`;
      onSend('sms', false);
    }
  };

  const handleCopyMessage = async () => {
    haptic('light');
    try {
      await navigator.clipboard.writeText(messageText);
      showToast('Message copied');
    } catch {
      showToast('Could not copy — try selecting the text manually');
    }
  };

  const handleSaveDraft = () => {
    onSaveDraft?.();
    onClose();
  };

  const hasPhone = !!customerPhone?.trim();

  return (
    <>
      <BottomSheet
        isOpen={isOpen && !showPdfPreview}
        onClose={onClose}
        title={title}
      >
        {/* Message preview — editable, text selectable */}
        <div className="mb-4">
          {editingMessage ? (
            <textarea
              value={messageText}
              onChange={(e) => onMessageChange(e.target.value)}
              onBlur={() => setEditingMessage(false)}
              autoFocus
              className="w-full min-h-[120px] p-3 bg-brand-surface border border-brand-border rounded-lg text-sm text-brand-dark font-normal leading-relaxed outline-none focus:border-brand-black"
            />
          ) : (
            <div
              onClick={() => setEditingMessage(true)}
              className="bg-brand-surface border border-brand-border rounded-lg p-3 cursor-text"
            >
              <p className="text-sm text-brand-dark leading-relaxed whitespace-pre-line select-text">
                {messageText}
              </p>
              <p className="text-label text-brand-dark mt-1 italic">
                Tap to edit
              </p>
            </div>
          )}
        </div>

        {/* PDF toggle — only when pdfOptions provided */}
        {pdfOptions && (
          <div className="flex items-center justify-between mb-6 px-1">
            <div className="flex items-center gap-2">
              <FileText size={16} className="text-brand-mid" />
              <span className="text-sm font-medium text-brand-dark">
                {generatingPdf ? 'Generating…' : pdfOptions.label}
              </span>
            </div>
            <button
              onClick={handleTogglePDF}
              disabled={generatingPdf}
              className={`w-11 h-6 rounded-full transition-colors cursor-pointer relative shrink-0 ${
                attachPDF ? 'bg-brand-black' : 'bg-brand-border'
              } ${generatingPdf ? 'opacity-50' : ''}`}
            >
              <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full transition-transform ${
                attachPDF ? 'left-[22px]' : 'left-0.5'
              }`} />
            </button>
          </div>
        )}

        {/* Thin divider between toggle and send actions */}
        {pdfOptions && (
          <div className="h-px bg-brand-border mb-4 -mt-2" />
        )}

        {/* Send buttons */}
        <div className="flex flex-col gap-2">
          <Button
            variant="primary"
            onClick={handleWhatsApp}
            disabled={!hasPhone}
            fullWidth
          >
            <MessageCircle size={18} className="mr-2" />
            Send via WhatsApp
          </Button>
          <Button
            variant="secondary"
            onClick={handleText}
            disabled={!hasPhone}
            fullWidth
          >
            {attachPDF ? 'Send via text' : 'Send via SMS'}
          </Button>
          <button
            onClick={handleCopyMessage}
            className="flex items-center justify-center gap-2 w-full min-h-11 text-sm font-medium text-brand-mid cursor-pointer"
          >
            <Clipboard size={16} />
            Copy message
          </button>
          {onSaveDraft && (
            <button
              onClick={handleSaveDraft}
              className="flex items-center justify-center w-full min-h-11 text-sm font-medium text-brand-muted cursor-pointer"
            >
              Save as draft
            </button>
          )}
        </div>
      </BottomSheet>

      {/* "Share PDF" toast — appears after WhatsApp text send when PDF is attached */}
      {showSharePdfToast && (
        <div className="fixed bottom-0 left-0 right-0 z-[65] px-4 py-3 pb-[calc(8px+env(safe-area-inset-bottom))] bg-brand-black">
          <div className="flex items-center justify-between gap-3 max-w-[430px] mx-auto">
            <span className="text-sm font-medium text-white">PDF ready to share</span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowSharePdfToast(false)}
                className="text-xs text-white/60 cursor-pointer"
              >
                <X size={16} />
              </button>
              <button
                onClick={handleSharePdfFromToast}
                className="flex items-center gap-1.5 text-sm font-semibold text-brand-black bg-white px-3 py-1.5 rounded-lg cursor-pointer active:opacity-70"
              >
                <Share2 size={14} />
                Share PDF
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PDFPreview — desktop fallback when navigator.canShare unavailable */}
      {showPdfPreview && pdfBlob && (
        <PDFPreview
          blob={pdfBlob}
          fileName={pdfOptions?.fileName || 'document.pdf'}
          onBack={() => setShowPdfPreview(false)}
        />
      )}
    </>
  );
}

export default SendSheet;
