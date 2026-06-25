import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, MessageCircle, Clipboard, Phone, FileText } from 'lucide-react';
import { db, type Job, type LineItem, type Customer, type Profile } from '../../lib/db';
import { generateQuotePDF } from '../../lib/pdfGenerator';
import { capturePDFGenerated, capturePDFShared } from '../../lib/analytics';
import PDFPreview from './PDFPreview';
import { fillTemplate } from '../../lib/templateEngine';
import type { MessageTemplate } from '../../lib/db';
import { useAppStore } from '../../store/useAppStore';
import { ensureJobNumber } from '../../lib/jobNumbers';
import { QuotePreviewCard } from '../../components/QuotePreviewCard';
import { Button } from '../../components/Button';
import { StickyFooter } from '../../components/StickyFooter';
import { BottomSheet } from '../../components/BottomSheet';
import BrandedLoader from '../../components/BrandedLoader';

/* ─── helpers ─── */

/* ─── types ─── */

interface QuotePreviewProps {
  jobId: string;
  onSend: (method: 'whatsapp' | 'sms' | 'copy', messageContent?: string) => void;
  onSaveDraft: () => void;
  onBack: () => void;
}

/* ─── component ─── */

export default function QuotePreview({ jobId, onSend, onSaveDraft, onBack }: QuotePreviewProps) {
  const navigate = useNavigate();
  const userId = useAppStore((s) => s.userId);
  const [job, setJob] = useState<Job | null>(null);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [items, setItems] = useState<LineItem[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [showSendSheet, setShowSendSheet] = useState(false);
  const [pdfBlob, setPdfBlob] = useState<Blob | null>(null);
  const [showTemplates, setShowTemplates] = useState(false);
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [messageText, setMessageText] = useState('');
  const [editingMessage, setEditingMessage] = useState(false);

  /* Load data */
  useEffect(() => {
    if (!userId) return;
    const load = async () => {
      const j = await db.jobs.get(jobId);
      if (!j) { setLoading(false); return; }
      setJob(j);
      const c = await db.customers.get(j.customer_id);
      setCustomer(c || null);
      const li = await db.line_items.where('job_id').equals(jobId).sortBy('sort_order');
      setItems(li);
      const p = await db.profiles.get(userId);
      setProfile(p || null);

      // Ensure a single canonical job number exists for this quote/job
      if (!j.job_number) {
        const updated = await ensureJobNumber(j, userId);
        setJob(updated);
      } else {
        setJob(j);
      }

      setLoading(false);
    };
    load();
  }, [jobId, userId]);

  /* ─── derived ─── */
  const total = items.reduce((sum, i) => sum + i.amount, 0);
  const businessName = profile?.business_name || profile?.full_name || 'Your business';
  const hasBusinessName = !!(profile?.business_name?.trim() || profile?.full_name?.trim());
  const isUsingFallbackName = !profile?.business_name && !!profile?.full_name;
  const jobNumber = job?.job_number || '';
  const quoteValidDays = profile?.quote_valid_days ?? 30;
  const customerName = customer?.name || '';
  const customerFirstName = customerName.split(' ')[0] || 'there';

  const termsLabel =
    job?.payment_terms === 'on_completion' ? 'On completion'
    : job?.payment_terms === 'deposit' ? 'Deposit + balance on completion'
    : 'Invoice after work';

  const depositPct = job?.deposit_pct || 0;
  const depositAmount = total * (depositPct / 100);

  /* ─── message text generation ─── */
  const defaultMessage = useMemo(() => {
    if (!job || !customer) return '';

    let lines = [
      `Hi ${customerFirstName}, here's your quote for ${job.title}:`,
      '',
    ];

    items.forEach((item) => {
      lines.push(`• ${item.description} — £${item.amount.toFixed(2)}`);
      if (item.detail && item.detail.trim()) {
        lines.push(`  ${item.detail.trim()}`);
      }
    });

    if (job.notes) {
      lines.push('');
      lines.push(`Includes: ${job.notes}`);
    }

    lines.push('');
    lines.push(`Total: £${total.toFixed(2)}`);

    if (job.payment_terms === 'deposit' && depositPct > 0) {
      lines.push(`Deposit: £${depositAmount.toFixed(2)}`);
      lines.push(`Balance on completion: £${(total - depositAmount).toFixed(2)}`);
    }

    lines.push(`Payment: ${termsLabel}`);
    lines.push(`Quote valid for ${quoteValidDays} days.`);
    lines.push('');
    if (businessName) {
      lines.push(businessName);
    }

    return lines.join('\n');
  }, [job, customer, customerFirstName, items, total, termsLabel, depositPct, depositAmount, quoteValidDays, businessName]);

  // BUG FIX: Always regenerate message when data changes, unless user is actively editing
  useEffect(() => {
    if (!editingMessage) {
      setMessageText(defaultMessage);
    }
  }, [defaultMessage, editingMessage]);

  /* ─── handlers ─── */
  const handleOpenSend = () => {
    if (!messageText) setMessageText(defaultMessage);
    setShowSendSheet(true);
  };

  const handleGeneratePDF = async () => {
    if (!job || !customer) return;
    const prof = await db.profiles.get(job.user_id);
    if (!prof) return;
    const items = await db.line_items.where('job_id').equals(jobId).toArray();
    const validUntil = new Date();
    validUntil.setDate(validUntil.getDate() + (prof.quote_valid_days || 30));
    const blob = generateQuotePDF({ profile: prof, customer, job, lineItems: items, total, validUntil: validUntil.toISOString() });
    setPdfBlob(blob);
    capturePDFGenerated({ jobId, type: 'quote', hasLogo: !!prof.logo_data_url, isVat: !!prof.vat_registered });
  };

  const loadTemplates = async () => {
    if (!job) return;
    const all = await db.message_templates.where('user_id').equals(job.user_id).sortBy('sort_order');
    setTemplates(all);
    setShowTemplates(!showTemplates);
  };

  const applyTemplate = (tmpl: MessageTemplate) => {
    if (!job || !customer) return;
    const prof = profile;
    if (!prof) return;
    const filled = fillTemplate(tmpl.body, job, customer, prof, total);
    setMessageText(filled);
    setEditingMessage(true);
    setShowTemplates(false);
  };

  const handleSend = async (method: 'whatsapp' | 'sms' | 'copy') => {
    if (!job || !customer) return;

    const phone = customer.phone.replace(/\D/g, '');
    const encoded = encodeURIComponent(messageText);

    if (method === 'whatsapp') {
      window.open(`https://wa.me/${phone}?text=${encoded}`, '_blank');
    } else if (method === 'sms') {
      window.open(`sms:${customer.phone}?body=${encoded}`, '_self');
    } else if (method === 'copy') {
      try { await navigator.clipboard.writeText(messageText); } catch (e) { console.error(e); }
    }

    setShowSendSheet(false);
    onSend(method, messageText);
  };

  const handleSaveDraft = () => {
    onSaveDraft();
  };

  const handleSheetDraft = () => {
    setShowSendSheet(false);
    onSaveDraft();
  };

  const handleGoSettings = () => {
    localStorage.setItem('buildlogg_redirected_from_quote', 'true');
    navigate('/settings');
  };

  if (loading) {
    return (
      <div className="flex flex-col min-h-[100dvh]">
        <div className="flex-1 flex items-center justify-center">
          <BrandedLoader size={48} fullscreen={false} />
        </div>
      </div>
    );
  }

  if (!job || !customer) {
    return (
      <div className="flex flex-col min-h-[100dvh] items-center justify-center px-4">
        <p className="text-md text-brand-muted">Quote not found</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-[100dvh]">
      {/* Header */}
      <div className="sticky top-0 z-40 bg-[var(--app-shell-bg)] px-4 py-2 border-b border-brand-borderLight shrink-0 grid grid-cols-3 items-center">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-1 min-h-11 pr-4 text-sm font-medium text-brand-mid cursor-pointer justify-self-start"
        >
          <ChevronLeft size={22} className="-mt-px text-brand-muted" />
          Back
        </button>
        <span className="text-base font-bold text-brand-black text-center">Preview</span>
        <button
          onClick={onBack}
          className="min-h-11 flex items-center text-sm text-brand-mid cursor-pointer underline underline-offset-2 justify-self-end"
        >
          Edit
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 px-4 md:px-6 pt-4 md:pt-6 pb-6">
        {/* Business name nudge */}
        {isUsingFallbackName && (
          <div className="bg-status-blueBg border border-blue-200 rounded-lg px-3.5 py-2.5 mb-4 flex items-center gap-2">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-status-blue">
                Using your name on the quote. Add a business name in Settings for a more professional look.
              </p>
            </div>
            <button
              onClick={handleGoSettings}
              className="text-sm font-medium text-status-blue underline underline-offset-2 cursor-pointer shrink-0"
            >
              Settings →
            </button>
          </div>
        )}

        {/* Quote preview card */}
        <div className="mb-4">
          <QuotePreviewCard
            businessName={businessName || 'Your business'}
            customerName={customer.name || 'Customer'}
            customerPhone={customer.phone}
            jobNumber={jobNumber}
            jobTitle={job.title}
            lineItems={items}
            paymentTerms={job.payment_terms}
            depositPct={depositPct}
            quoteValidDays={quoteValidDays}
            scheduledStart={job.scheduled_start}
            scheduledEnd={job.scheduled_end}
          />
        </div>
      </div>

      {/* Footer */}
      <StickyFooter>
        <Button
          variant="primary"
          onClick={handleOpenSend}
          disabled={!hasBusinessName}
        >
          Send quote →
        </Button>
        <button
          onClick={handleSaveDraft}
          className="w-full text-sm text-brand-mid font-medium underline underline-offset-2 cursor-pointer min-h-11"
        >
          Save as draft
        </button>
      </StickyFooter>

      {/* Send BottomSheet */}
      <BottomSheet
        isOpen={showSendSheet}
        onClose={() => setShowSendSheet(false)}
        title={`Send to ${customerFirstName}?`}
      >
        {/* Template picker toggle */}
        <button
          onClick={loadTemplates}
          className="text-xs font-semibold text-brand-dark mb-2 cursor-pointer"
        >
          {showTemplates ? 'Hide templates' : 'Use a template ↑'}
        </button>

        {/* Template list */}
        {showTemplates && templates.length > 0 && (
          <div className="flex flex-col gap-1.5 mb-3 max-h-40 overflow-y-auto">
            {templates.map((t) => (
              <button
                key={t.id}
                onClick={() => applyTemplate(t)}
                className="text-left px-3 py-2 bg-brand-surface border border-brand-border rounded-lg cursor-pointer active:opacity-70"
              >
                <span className="text-xs font-semibold text-brand-black">{t.name}</span>
                <p className="text-xs text-brand-muted truncate mt-0.5">{t.body.substring(0, 60)}...</p>
              </button>
            ))}
          </div>
        )}

        {/* Message preview — editable */}
        <div className="mb-4">
          {editingMessage ? (
            <textarea
              value={messageText}
              onChange={(e) => setMessageText(e.target.value)}
              onBlur={() => setEditingMessage(false)}
              autoFocus
              className="w-full min-h-[120px] p-3 bg-brand-surface border border-brand-border rounded-lg text-sm text-brand-dark font-normal leading-relaxed outline-none focus:border-brand-black"
            />
          ) : (
            <div
              onClick={() => setEditingMessage(true)}
              className="bg-brand-surface border border-brand-border rounded-lg p-3 cursor-text"
            >
              <p className="text-sm text-brand-dark leading-relaxed whitespace-pre-line">
                {messageText}
              </p>
              <p className="text-label text-brand-dark mt-1 italic">
                Tap to edit before sending
              </p>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <Button
            variant="primary"
            onClick={() => handleSend('whatsapp')}
            fullWidth
          >
            <MessageCircle size={18} className="mr-2" />
            Send via WhatsApp
          </Button>
          <Button
            variant="secondary"
            onClick={() => handleSend('sms')}
            fullWidth
          >
            <Phone size={18} className="mr-2" />
            Send via SMS
          </Button>
          <Button
            variant="secondary"
            onClick={handleGeneratePDF}
            fullWidth
          >
            <FileText size={18} className="mr-2" />
            Share as PDF
          </Button>
          <button
            onClick={() => handleSend('copy')}
            className="flex items-center justify-center gap-2 w-full min-h-11 text-sm font-medium text-brand-mid cursor-pointer underline underline-offset-2"
          >
            <Clipboard size={16} />
            Copy message
          </button>
          <button
            onClick={handleSheetDraft}
            className="flex items-center justify-center gap-2 w-full min-h-11 text-sm font-medium text-brand-muted cursor-pointer"
          >
            Save as draft
          </button>
        </div>
      </BottomSheet>

      {pdfBlob && (
        <PDFPreview
          blob={pdfBlob}
          fileName={`quote-${job?.job_number || jobId}.pdf`}
          onBack={() => setPdfBlob(null)}
          onShared={(method: 'whatsapp' | 'download' | 'share') => capturePDFShared({ jobId, type: 'quote', method })}
        />
      )}
    </div>
  );
}
