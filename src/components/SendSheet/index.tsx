import { useState, useEffect } from 'react';
import { MessageCircle, FileText, Clipboard, Download } from 'lucide-react';
import { BottomSheet } from '../BottomSheet';
import { Button } from '../Button';
import { haptic } from '../../lib/haptics';
import { showToast } from '../Toast/store';
import PDFPreview from '../../screens/Quote/PDFPreview';
import { useEntitlements } from '../../hooks/useEntitlements';
import { ProBadge } from '../ProBadge';
import { phoneForWhatsApp, normalizePhone } from '../../lib/phone';

export type SendMethod = 'whatsapp' | 'whatsapp_pdf' | 'sms' | 'text_pdf';

const SIGNATURE = '— Sent via Buildlogg.com';

export interface SendSheetPdfOptions {
  label: string;
  generatePdf: () => Promise<Blob>;
  fileName: string;
  onPdfGenerated?: () => void;
  onPdfDownloaded?: () => void;
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
  onCopySend?: () => void;
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
  onCopySend,
  pdfOptions,
  fullMessage,
  compactMessage,
}: SendSheetProps) {
  const { can, upgradeUrl } = useEntitlements();
  const canRemoveSignature = can('remove_signature');
  const canSendPdf = can('pdf_send');

  const [attachPDF, setAttachPDF] = useState(false);
  const [pdfBlob, setPdfBlob] = useState<Blob | null>(null);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [editingMessage, setEditingMessage] = useState(false);
  const [showPdfPreview, setShowPdfPreview] = useState(false);
  const [lastAutoVariant, setLastAutoVariant] = useState<'full' | 'compact' | null>(null);

  // The full message that gets sent (messageText + signature if not Pro)
  const fullSendText = canRemoveSignature
    ? messageText
    : messageText + '\n' + SIGNATURE;

  // Reset state when sheet closes
  useEffect(() => {
    if (!isOpen) {
      setAttachPDF(false);
      setPdfBlob(null);
      setGeneratingPdf(false);
      setEditingMessage(false);
      setShowPdfPreview(false);
      setLastAutoVariant(null);
    }
  }, [isOpen]);

  // Track which auto-variant the current text matches
  useEffect(() => {
    if (fullMessage && messageText === fullMessage) setLastAutoVariant('full');
    else if (compactMessage && messageText === compactMessage) setLastAutoVariant('compact');
    else if (messageText !== '' && messageText !== fullMessage && messageText !== compactMessage) setLastAutoVariant(null);
  }, [messageText, fullMessage, compactMessage]);

  const handleTogglePDF = async () => {
    if (attachPDF) {
      setAttachPDF(false);
      setPdfBlob(null);
      if (lastAutoVariant === 'compact' && fullMessage) {
        onMessageChange(fullMessage);
      }
    } else {
      haptic('light');
      setGeneratingPdf(true);
      try {
        const blob = await pdfOptions!.generatePdf();
        setPdfBlob(blob);
        setAttachPDF(true);
        pdfOptions?.onPdfGenerated?.();
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

  const handleDownloadPdf = async () => {
    haptic('light');
    if (pdfBlob) {
      const url = URL.createObjectURL(pdfBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = pdfOptions?.fileName || 'document.pdf';
      a.click();
      URL.revokeObjectURL(url);
      pdfOptions?.onPdfDownloaded?.();
      showToast('PDF downloaded');
      return;
    }
    setGeneratingPdf(true);
    try {
      const blob = await pdfOptions!.generatePdf();
      setPdfBlob(blob);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = pdfOptions?.fileName || 'document.pdf';
      a.click();
      URL.revokeObjectURL(url);
      pdfOptions?.onPdfGenerated?.();
      pdfOptions?.onPdfDownloaded?.();
      showToast('PDF downloaded');
    } catch {
      showToast('Could not generate PDF');
    } finally {
      setGeneratingPdf(false);
    }
  };

  const handleWhatsApp = () => {
    if (!customerPhone) return;
    haptic('light');
    const phone = phoneForWhatsApp(customerPhone);
    const encoded = encodeURIComponent(fullSendText);
    const waUrl = `https://wa.me/${phone}?text=${encoded}`;

    if (attachPDF && pdfBlob) {
      const file = new File([pdfBlob], pdfOptions?.fileName || 'document.pdf', { type: 'application/pdf' });

      if (navigator.canShare?.({ files: [file] })) {
        navigator.share({ files: [file], text: fullSendText })
          .then(() => { onSend('whatsapp_pdf', true); })
          .catch(() => {
            // User cancelled share sheet — don't open WhatsApp text-only
            onSend('whatsapp', false);
          });
      } else {
        // Browser can't share files — show PDF preview, don't auto-navigate to wa.me
        setShowPdfPreview(true);
        onSend('whatsapp_pdf', false);
      }
    } else {
      onSend('whatsapp', false);
      window.location.href = waUrl;
    }
  };

  const handleText = async () => {
    if (!customerPhone) return;
    haptic('light');

    if (attachPDF && pdfBlob) {
      try {
        const file = new File([pdfBlob], pdfOptions?.fileName || 'document.pdf', { type: 'application/pdf' });
        if (navigator.canShare?.({ files: [file] })) {
          await navigator.share({ files: [file], text: fullSendText });
          onSend('text_pdf', true);
        } else {
          setShowPdfPreview(true);
          onSend('text_pdf', false);
        }
      } catch {
        onSend('text_pdf', false);
      }
    } else {
      window.location.href = `sms:${normalizePhone(customerPhone)}?body=${encodeURIComponent(fullSendText)}`;
      onSend('sms', false);
    }
  };

  const handleCopyMessage = async () => {
    haptic('light');
    try {
      await navigator.clipboard.writeText(fullSendText);
      showToast('Message copied — paste it wherever you need', 'info', 3000);
    } catch {
      showToast('Could not copy — try selecting the text manually');
    }
    onCopySend?.();
    onClose();
  };

  const handleSaveDraft = () => {
    onSaveDraft?.();
    onClose();
  };

  const hasPhone = !!customerPhone?.trim();

  // Determine if PDF toggle should be shown
  // pdfOptions must be provided AND user must have pdf_send entitlement
  const showPdfToggle = pdfOptions && canSendPdf;
  // If pdfOptions provided but user can't send PDF, show locked state
  const pdfLocked = pdfOptions && !canSendPdf;

  return (
    <>
      <BottomSheet
        isOpen={isOpen && !showPdfPreview}
        onClose={onClose}
        title={title}
        footer={
          <>
            <div className="flex gap-2">
              <Button
                variant="primary"
                onClick={handleWhatsApp}
                disabled={!hasPhone}
                fullWidth
              >
                <MessageCircle size={18} className="mr-2" />
                WhatsApp
              </Button>
              <Button
                variant="secondary"
                onClick={handleText}
                disabled={!hasPhone}
                fullWidth
              >
                {attachPDF ? 'Text' : 'SMS'}
              </Button>
            </div>

            {/* Copy + Save draft stacked, tertiary style with padding */}
            <div className="mt-3 flex flex-col gap-2">
              <button
                onClick={handleCopyMessage}
                className="flex items-center justify-center gap-2 h-11 rounded-xl text-sm font-medium text-brand-mid border border-brand-borderLight bg-brand-surface/50 px-4 cursor-pointer active:bg-brand-border/40 active:scale-[0.98] transition-all duration-150"
              >
                <Clipboard size={16} />
                Copy
              </button>
              {onSaveDraft && (
                <button
                  onClick={handleSaveDraft}
                  className="flex items-center justify-center gap-2 h-11 rounded-xl text-sm font-medium text-brand-mid border border-brand-borderLight bg-brand-surface/50 px-4 cursor-pointer active:bg-brand-border/40 active:scale-[0.98] transition-all duration-150"
                >
                  Save draft
                </button>
              )}
            </div>
          </>
        }
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
              <p className="text-sm text-brand-dark leading-relaxed whitespace-pre-line select-text break-all">
                {messageText}
              </p>
              {/* Non-editable signature line — only for free tier */}
              {!canRemoveSignature && (
                <p className="text-xs text-brand-muted mt-1.5 pt-1.5 border-t border-brand-border select-text">
                  {SIGNATURE}
                </p>
              )}
              <p className="text-label text-brand-dark mt-1 italic">
                Tap to edit
              </p>
            </div>
          )}
        </div>

        {/* Signature upgrade nudge — only for free tier, only in non-editing mode */}
        {!canRemoveSignature && !editingMessage && (
          <div className="flex items-center justify-between mb-4 px-1">
            <span className="text-xs text-brand-muted">Remove "Sent via" signature</span>
            <ProBadge upgradeUrl={upgradeUrl} />
          </div>
        )}

        {/* PDF toggle — only when pdfOptions provided AND user has pdf_send entitlement */}
        {showPdfToggle && (
          <div className="flex items-center justify-between mb-6 px-1">
            <div className="flex items-center gap-2 min-w-0">
              <FileText size={16} className="text-brand-mid shrink-0" />
              <span className="text-sm font-medium text-brand-dark truncate">
                {generatingPdf ? 'Generating…' : pdfOptions!.label}
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={handleDownloadPdf}
                disabled={generatingPdf}
                aria-label="Download PDF"
                className="w-8 h-8 flex items-center justify-center text-brand-mid cursor-pointer disabled:opacity-50"
              >
                <Download size={16} />
              </button>
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
          </div>
        )}

        {/* PDF locked — pdfOptions provided but user doesn't have pdf_send */}
        {pdfLocked && (
          <div className="flex items-center justify-between mb-6 px-1">
            <div className="flex items-center gap-2">
              <FileText size={16} className="text-brand-mid" />
              <span className="text-sm font-medium text-brand-mid">Attach PDF</span>
            </div>
            <ProBadge upgradeUrl={upgradeUrl} />
          </div>
        )}

        {/* Thin divider between toggle and send actions */}
        {(showPdfToggle || pdfLocked) && (
          <div className="h-px bg-brand-border mb-4 -mt-2" />
        )}
      </BottomSheet>

      {/* PDFPreview — desktop fallback */}
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
