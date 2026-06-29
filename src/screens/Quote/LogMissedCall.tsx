import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, X } from 'lucide-react';
import { db } from '../../lib/db';
import { useAppStore } from '../../store/useAppStore';
import { captureJobCreated } from '../../lib/analytics';
import { nextJobNumber } from '../../lib/jobNumbers';
import { Button } from '../../components/Button';
import { validatePhone, normalizePhone, formatPhoneInput } from '../../lib/phone';

/* ─── helpers ─── */

function now() { return new Date().toISOString(); }

interface LogMissedCallProps {
  onDone: () => void;
}

export default function LogMissedCall({ onDone }: LogMissedCallProps) {
  const navigate = useNavigate();
  const userId = useAppStore((s) => s.userId);

  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [phoneError, setPhoneError] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleCancel = () => {
    navigate('/');
  };

  const saveAndCreate = useCallback(async (shouldDial: boolean) => {
    if (!userId) return;
    const err = validatePhone(phone);
    if (err !== null) {
      setPhoneError(true);
      return;
    }
    setPhoneError(false);
    setSaving(true);

    const n = now();
    const normalised = normalizePhone(phone);
    const customerId = crypto.randomUUID();
    const jobId = crypto.randomUUID();
    const jobNumber = await nextJobNumber(userId);

    await db.customers.add({
      id: customerId,
      user_id: userId,
      name: name.trim() || 'Unknown',
      phone: normalised,
      created_at: n,
      updated_at: n,
      _sync_status: 'pending',
    });

    await db.jobs.add({
      id: jobId,
      user_id: userId,
      customer_id: customerId,
      title: 'Missed call',
      job_number: jobNumber,
      status: 'enquiry',
      payment_terms: 'on_completion',
      is_multi_day: false,
      created_at: n,
      updated_at: n,
      _sync_status: 'pending',
    });
    captureJobCreated('missed_call');

    const workLogId = crypto.randomUUID();
    await db.work_log.add({
      id: workLogId,
      job_id: jobId,
      type: 'status_change',
      description: 'Missed call logged',
      created_at: n,
      _sync_status: 'pending',
    });

    await db.sync_queue.add({
      operation: 'insert',
      table_name: 'customers',
      record_id: customerId,
      payload: { id: customerId, user_id: userId, name: name.trim() || 'Unknown', phone: normalised, created_at: n },
      created_at: n,
      retry_count: 0,
    });

    await db.sync_queue.add({
      operation: 'insert',
      table_name: 'jobs',
      record_id: jobId,
      payload: { id: jobId, user_id: userId, customer_id: customerId, title: 'Missed call', job_number: jobNumber, status: 'enquiry', payment_terms: 'on_completion', is_multi_day: false, created_at: n, updated_at: n },
      created_at: n,
      retry_count: 0,
    });

    await db.sync_queue.add({
      operation: 'insert',
      table_name: 'work_log',
      record_id: workLogId,
      payload: { job_id: jobId, type: 'status_change', description: 'Missed call logged', created_at: n },
      created_at: n,
      retry_count: 0,
    });

    if (shouldDial) {
      window.open(`tel:${normalised}`, '_self');
    }

    setSaving(false);
    onDone();
  }, [phone, name, userId, onDone]);

  const phoneValid = validatePhone(phone) === null;
  const canSave = phoneValid && !saving;

  return (
    <div className="flex flex-col min-h-[100dvh]">
      {/* Header */}
      <div className="sticky top-0 z-40 bg-[var(--app-shell-bg)] px-4 py-2 border-b border-brand-borderLight shrink-0 grid grid-cols-3 items-center">
        <button
          onClick={() => navigate('/')}
          className="inline-flex items-center gap-1 min-h-11 pr-4 text-sm font-medium text-brand-mid cursor-pointer justify-self-start"
        >
          <ChevronLeft size={22} className="-mt-px text-brand-muted" />
          Home
        </button>
        <span className="text-base font-bold text-brand-black text-center">Log missed call</span>
        <button
          onClick={handleCancel}
          className="min-h-11 flex items-center text-sm text-brand-muted cursor-pointer justify-self-end"
        >
          <X size={18} />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 px-4 md:px-6 pt-4 md:pt-6 pb-6">
        <div className="mb-5">
          <div className="mb-2.5">
            <label className="block text-label font-semibold text-brand-dark tracking-[0.3px] mb-1">
              Phone number
            </label>
            <input
              type="tel"
              inputMode="tel"
              value={phone}
              onChange={(e) => { setPhone(formatPhoneInput(e.target.value)); setPhoneError(false); }}
              placeholder="e.g. 07700 900123 or +353 86 123 4567"
              autoFocus
              className={`w-full h-12 px-3.5 border-2 rounded-lg text-base font-medium text-brand-black placeholder:text-brand-muted outline-none ${
                phoneError ? 'border-status-error' : 'border-brand-border focus:border-brand-black'
              }`}
            />
            {phoneError && (
              <p className="text-sm text-status-error mt-1">{validatePhone(phone) || 'Enter a valid phone number'}</p>
            )}
          </div>
          <div>
            <label className="block text-label font-semibold text-brand-dark tracking-[0.3px] mb-1">
              Name <span className="text-label text-brand-dark font-normal normal-case tracking-0 ml-1">(optional)</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Richards"
              className="w-full h-12 px-3.5 border-2 border-brand-border rounded-lg text-base font-medium text-brand-black placeholder:text-brand-muted placeholder:italic outline-none focus:border-brand-black"
            />
          </div>
        </div>

        <div className="bg-brand-surface border border-brand-border rounded-lg p-3.5 text-sm text-brand-muted leading-relaxed">
          Saved to <strong className="text-brand-dark">Tasks</strong>. Call back first — once confirmed as a lead, tap <strong className="text-brand-dark">Create quote</strong> on the task card.
        </div>
      </div>

      {/* Footer */}
      <div className="sticky bottom-0 z-30 bg-[var(--app-shell-bg)] border-t border-brand-borderLight shadow-sheet">
        <div className="flex flex-col gap-2 px-4 py-3 pb-[calc(32px_+_env(safe-area-inset-bottom))]">
          <Button
            variant="primary"
            onClick={() => saveAndCreate(true)}
            disabled={!canSave}
          >
            Save & call back
          </Button>
          <Button
            variant="secondary"
            onClick={() => saveAndCreate(false)}
            disabled={!canSave}
          >
            Save only
          </Button>
        </div>
      </div>
    </div>
  );
}
