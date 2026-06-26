import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { db, type Job, type LineItem, type Customer, type Profile } from '../../lib/db';
import { generateQuotePDF } from '../../lib/pdfGenerator';
import { capturePDFGenerated } from '../../lib/analytics';
import { SendSheet, type SendMethod } from '../../components/SendSheet';
import { useEntitlements } from '../../hooks/useEntitlements';
import { useAppStore } from '../../store/useAppStore';
import { ensureJobNumber } from '../../lib/jobNumbers';
import { QuotePreviewCard } from '../../components/QuotePreviewCard';
import { Button } from '../../components/Button';
import { StickyFooter } from '../../components/StickyFooter';
import BrandedLoader from '../../components/BrandedLoader';

/* ─── helpers ─── */

/* ─── types ─── */

interface QuotePreviewProps {
  jobId: string;
  onSend: (method: 'whatsapp' | 'sms', messageContent?: string) => void;
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

  // Sync messageText with the default template when data changes, unless the
  // user has manually edited the message in the SendSheet (editingMessage=true).
  // editingMessage is reset to false when the SendSheet closes.
  useEffect(() => {
    if (!editingMessage) {
      setMessageText(defaultMessage);
    }
  }, [defaultMessage, editingMessage]);

  // Compact message for when PDF is attached (no line items, just total)
  const compactMessage = useMemo(() => {
    if (!job || !customer) return '';
    const lines = [
      `Hi ${customerFirstName}, here's your quote for ${job.title}.`,
      `Total: £${total.toFixed(2)}.`,
      'Details attached.'
    ];
    if (businessName) lines.push(businessName);
    return lines.join('\n');
  }, [job, customer, customerFirstName, total, businessName]);

  /* ─── handlers ─── */
  const handleOpenSend = () => {
    // Always ensure the message is populated — fall back to defaultMessage
    // if messageText is empty or stale
    if (!messageText || messageText.trim() === '') {
      setMessageText(defaultMessage);
    }
    setShowSendSheet(true);
  };
  const handleSend = (method: SendMethod, _pdfShared: boolean) => {
    setShowSendSheet(false);
    const parentMethod = method === 'whatsapp' || method === 'whatsapp_pdf' ? 'whatsapp' : 'sms';
    onSend(parentMethod, messageText);
  };

  const { can } = useEntitlements();
  const pdfOptions = can('pdf_quotes') && job && customer && profile ? {
    label: 'Attach PDF quote',
    generatePdf: () => {
      const validUntil = new Date();
      validUntil.setDate(validUntil.getDate() + (profile.quote_valid_days || 30));
      const blob = generateQuotePDF({ profile, customer, job, lineItems: items, total, validUntil: validUntil.toISOString() });
      capturePDFGenerated({ jobId, type: 'quote', hasLogo: !!profile.logo_data_url, isVat: !!profile.vat_registered });
      return blob;
    },
    fileName: `quote-${job.job_number || jobId}.pdf`,
  } : undefined;

  const handleSaveDraft = () => {
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
          <ChevronLeft size={24} className="-mt-px text-brand-muted" />
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

      {/* Send Sheet */}
      <SendSheet
        isOpen={showSendSheet}
        onClose={() => { setShowSendSheet(false); setEditingMessage(false); }}
        title={`Send to ${customerFirstName}?`}
        customerPhone={customer?.phone || ''}
        messageText={messageText}
        onMessageChange={(text) => { setEditingMessage(true); setMessageText(text); }}
        onSend={handleSend}
        onSaveDraft={handleSaveDraft}
        pdfOptions={pdfOptions}
        fullMessage={defaultMessage}
        compactMessage={compactMessage}
      />
    </div>
  );
}