import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, MessageCircle, Clipboard, AlertTriangle, Phone } from 'lucide-react';
import { db, type Job, type LineItem, type Customer, type Profile } from '../../lib/db';
import { useAppStore } from '../../store/useAppStore';
import { QuotePreviewCard } from '../../components/QuotePreviewCard';
import { Button } from '../../components/Button';
import { StickyFooter } from '../../components/StickyFooter';
import { BottomSheet } from '../../components/BottomSheet';

/* ─── helpers ─── */

const now = () => new Date().toISOString();

/* ─── types ─── */

interface QuotePreviewProps {
  jobId: string;
  onSend: (method: 'whatsapp' | 'sms' | 'copy') => void;
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

      // Generate quote number if not set
      if (!j.quote_number) {
        const count = await db.jobs.where('user_id').equals(userId).and(j => !!j.quote_number).count();
        const quoteNum = `Q-${String(count + 1001).padStart(4, '0')}`;
        const n = now();
        await db.jobs.update(jobId, { quote_number: quoteNum, updated_at: n, _sync_status: 'pending' });
        await db.sync_queue.add({
          operation: 'update',
          table_name: 'jobs',
          record_id: jobId,
          payload: { quote_number: quoteNum, updated_at: n },
          created_at: n,
          retry_count: 0,
        });
        setJob({ ...j, quote_number: quoteNum });
      }

      setLoading(false);
    };
    load();
  }, [jobId, userId]);

  /* ─── derived ─── */
  const total = items.reduce((sum, i) => sum + i.amount, 0);
  const businessName = profile?.business_name || '';
  const hasBusinessName = businessName.trim().length > 0;
  const quoteNumber = job?.quote_number || '';
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

  useEffect(() => {
    if (!messageText && defaultMessage) {
      setMessageText(defaultMessage);
    }
  }, [defaultMessage]);

  /* ─── handlers ─── */
  const handleOpenSend = () => {
    if (!messageText) setMessageText(defaultMessage);
    setShowSendSheet(true);
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
    onSend(method);
  };

  const handleSaveDraft = () => {
    onSaveDraft();
  };

  const handleSheetDraft = () => {
    setShowSendSheet(false);
    onSaveDraft();
  };

  const handleGoSettings = () => {
    navigate('/settings');
  };

  if (loading) {
    return (
      <div className="flex flex-col min-h-[100svh]">
        <div className="flex-1 flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-[#E5E7EB] border-t-[#111827] rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  if (!job || !customer) {
    return (
      <div className="flex flex-col min-h-[100svh] items-center justify-center px-4">
        <p className="text-[15px] text-[#9CA3AF]">Quote not found</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-[100svh]">
      {/* Header */}
      <div className="px-4 pt-2 pb-3 border-b border-[#F3F4F6] shrink-0 flex items-center justify-between">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-1 min-h-[44px] pr-4 text-[14px] font-medium text-[#6B7280] cursor-pointer"
        >
          <ChevronLeft size={22} color="#9CA3AF" className="-mt-px" />
          Back
        </button>
        <span className="text-[16px] font-bold text-[#111827]">Preview</span>
        <button
          onClick={onBack}
          className="min-h-[44px] flex items-center text-[14px] text-[#6B7280] cursor-pointer underline underline-offset-2"
        >
          Edit
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-4 pt-4 pb-2">
        {/* Business name nudge */}
        {!hasBusinessName && (
          <div className="bg-[#FEF3C7] border border-[#FDE68A] rounded-[10px] px-3.5 py-2.5 mb-4 flex items-center gap-2">
            <AlertTriangle size={16} color="#92400E" className="shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-medium text-[#92400E]">
                Add your business name before sending
              </p>
            </div>
            <button
              onClick={handleGoSettings}
              className="text-[13px] font-medium text-[#92400E] underline underline-offset-2 cursor-pointer shrink-0"
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
            quoteNumber={quoteNumber}
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
          className="w-full text-[13px] text-[#6B7280] font-medium underline underline-offset-2 cursor-pointer min-h-[44px]"
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
        {/* Message preview — editable */}
        <div className="mb-4">
          {editingMessage ? (
            <textarea
              value={messageText}
              onChange={(e) => setMessageText(e.target.value)}
              onBlur={() => setEditingMessage(false)}
              autoFocus
              className="w-full min-h-[120px] p-3 bg-[#F9FAFB] border border-[#E5E7EB] rounded-[10px] text-[13px] text-[#374151] font-normal leading-relaxed outline-none focus:border-[#111827]"
            />
          ) : (
            <div
              onClick={() => setEditingMessage(true)}
              className="bg-[#F9FAFB] border border-[#E5E7EB] rounded-[10px] p-3 cursor-text"
            >
              <p className="text-[13px] text-[#374151] leading-relaxed whitespace-pre-line">
                {messageText}
              </p>
              <p className="text-[11px] text-[#9CA3AF] mt-1 italic">
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
          <button
            onClick={() => handleSend('copy')}
            className="flex items-center justify-center gap-2 w-full min-h-[44px] text-[13px] font-medium text-[#6B7280] cursor-pointer underline underline-offset-2"
          >
            <Clipboard size={16} />
            Copy message
          </button>
          <button
            onClick={handleSheetDraft}
            className="flex items-center justify-center gap-2 w-full min-h-[44px] text-[13px] font-medium text-[#9CA3AF] cursor-pointer"
          >
            Save as draft
          </button>
        </div>
      </BottomSheet>
    </div>
  );
}
