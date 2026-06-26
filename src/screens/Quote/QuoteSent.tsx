import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check } from 'lucide-react';
import { db, type Job, type Customer } from '../../lib/db';
import { Button } from '../../components/Button';
import { StickyFooter } from '../../components/StickyFooter';
import AddToHomeScreen from '../../components/AddToHomeScreen';
import BrandedLoader from '../../components/BrandedLoader';

/* ─── helpers ─── */

function formatAmount(n: number): string {
  return n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/* ─── types ─── */

interface QuoteSentProps {
  jobId: string;
  sendMethod: 'whatsapp' | 'sms' | 'copy';
  onViewJob: () => void;
  onHome: () => void;
}

/* ─── component ─── */

export default function QuoteSent({ jobId, sendMethod, onViewJob, onHome }: QuoteSentProps) {
  const navigate = useNavigate();
  const [job, setJob] = useState<Job | null>(null);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const j = await db.jobs.get(jobId);
      if (j) {
        setJob(j);
        const c = await db.customers.get(j.customer_id);
        setCustomer(c || null);
        const items = await db.line_items.where('job_id').equals(jobId).toArray();
        setTotal(items.reduce((sum, i) => sum + i.amount, 0));
      }
      setLoading(false);
    };
    load();
  }, [jobId]);

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

  const methodLabel =
    sendMethod === 'whatsapp' ? 'Via WhatsApp'
    : sendMethod === 'sms' ? 'Via SMS'
    : 'Copied to clipboard';

  const screenTitle =
    sendMethod === 'copy'
      ? 'Quote copied'
      : 'Quote sent';

  const customerFirstName = customer.name.split(' ')[0] || 'there';

  return (
    <div className="flex flex-col min-h-[100dvh]">
      {/* Empty header spacer for alignment */}
      <div className="px-4 py-2 border-b border-brand-borderLight shrink-0 flex items-center justify-between opacity-0">
        <div className="min-h-11 pr-4 text-sm font-medium">&nbsp;</div>
        <div className="text-base font-bold">&nbsp;</div>
        <div className="min-h-11 text-sm">&nbsp;</div>
      </div>

      {/* Body — centered */}
      <div className="flex-1 flex flex-col items-center justify-center px-4 md:px-6 pb-6 text-center">
        {/* Green check circle */}
        <div className="w-16 h-16 rounded-full bg-status-greenBg flex items-center justify-center mb-5">
          <Check size={28} strokeWidth={3} className="text-status-green" />
        </div>

        {/* Title */}
        <h2 className="text-xl font-extrabold text-brand-black mb-2">
          {screenTitle}
        </h2>

        {/* Details */}
        <p className="text-md text-brand-mid leading-relaxed mb-7">
          {customerFirstName} · {job.title}<br />
          £{formatAmount(total)} · {methodLabel}
        </p>

        {/* What happens next card */}
        <div className="w-full bg-brand-surface border border-brand-border rounded-lg p-4 mb-7 text-left">
          <div className="text-micro font-bold text-brand-mid tracking-[0.5px] mb-2">
            What happens next
          </div>
          <div className="text-sm text-brand-dark leading-relaxed">
            Job saved under <strong className="text-brand-black">Quoted</strong> in your Jobs list.
            <br /><br />
            When {customerFirstName} confirms, open the job and tap <strong className="text-brand-black">Mark as Booked</strong> to move it forward.
          </div>
        </div>

        {/* Add to Home Screen — peak moment: user just sent a quote */}
        <div className="w-full mb-6">
          <AddToHomeScreen variant="minimal" />
        </div>
      </div>

      {/* Sticky Footer */}
      <StickyFooter>
        <Button variant="primary" onClick={onViewJob}>
          View job
        </Button>
        <Button variant="secondary" onClick={onHome}>
          Back to home
        </Button>
        <button
          onClick={() => navigate('/quote', { state: { jobId, entryPoint: 'revise' } })}
          className="w-full text-sm font-medium text-brand-mid underline underline-offset-2 cursor-pointer min-h-11 mt-1"
        >
          Resend quote
        </button>
      </StickyFooter>
    </div>
  );
}
