import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, X } from 'lucide-react';
import { db } from '../../lib/db';
import { useAppStore } from '../../store/useAppStore';
import { Button } from '../../components/Button';

/* ─── helpers ─── */

function now() { return new Date().toISOString(); }

const UK_PHONE_RE = /^(\+44|0)7\d{9}$/;

function isValidUkPhone(phone: string): boolean {
  const cleaned = phone.replace(/\s/g, '');
  return UK_PHONE_RE.test(cleaned);
}

function normalisePhone(phone: string): string {
  const cleaned = phone.replace(/\s/g, '');
  if (cleaned.startsWith('0')) return '+44' + cleaned.slice(1);
  return cleaned;
}

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
    const cleaned = phone.replace(/\s/g, '');
    if (!isValidUkPhone(cleaned)) {
      setPhoneError(true);
      return;
    }
    setPhoneError(false);
    setSaving(true);

    const n = now();
    const normalised = normalisePhone(cleaned);
    const customerId = crypto.randomUUID();
    const jobId = crypto.randomUUID();

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
      status: 'enquiry',
      payment_terms: 'on_completion',
      is_multi_day: false,
      created_at: n,
      updated_at: n,
      _sync_status: 'pending',
    });

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
      payload: { id: jobId, user_id: userId, customer_id: customerId, title: 'Missed call', status: 'enquiry', payment_terms: 'on_completion', is_multi_day: false, created_at: n, updated_at: n },
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

  const phoneValid = phone.replace(/\s/g, '').length >= 10;
  const canSave = phoneValid && !saving;

  return (
    <div className="flex flex-col min-h-[100svh]">
      {/* Header */}
      <div className="px-4 pt-2 pb-3 border-b border-[#F3F4F6] shrink-0 flex items-center justify-between">
        <button
          onClick={() => navigate('/')}
          className="inline-flex items-center gap-1 min-h-[44px] pr-4 text-[14px] font-medium text-[#6B7280] cursor-pointer"
        >
          <ChevronLeft size={22} color="#9CA3AF" className="-mt-px" />
          Home
        </button>
        <span className="text-[16px] font-bold text-[#111827]">Log missed call</span>
        <button
          onClick={handleCancel}
          className="min-h-[44px] flex items-center text-[14px] text-[#9CA3AF] cursor-pointer"
        >
          <X size={18} />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-4 pt-4 pb-2">
        <div className="mb-5">
          <div className="mb-2.5">
            <label className="block text-[11px] font-semibold text-[#9CA3AF] uppercase tracking-[0.3px] mb-1">
              Phone number
            </label>
            <input
              type="tel"
              inputMode="tel"
              value={phone}
              onChange={(e) => { setPhone(e.target.value); setPhoneError(false); }}
              placeholder="e.g. 07700 900123"
              className={`w-full h-[48px] px-3.5 border-[1.5px] rounded-[10px] text-[16px] font-medium text-[#111827] placeholder:text-[#D1D5DB] outline-none ${
                phoneError ? 'border-[#EF4444]' : 'border-[#D1D5DB] focus:border-[#111827]'
              }`}
            />
            {phoneError && (
              <p className="text-[12px] text-[#EF4444] mt-1">Enter a valid UK mobile number</p>
            )}
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-[#9CA3AF] uppercase tracking-[0.3px] mb-1">
              Name <span className="text-[11px] text-[#9CA3AF] font-normal normal-case tracking-0 ml-1">(optional)</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Richards"
              className="w-full h-[48px] px-3.5 border-[1.5px] border-[#D1D5DB] rounded-[10px] text-[16px] font-medium text-[#111827] placeholder:text-[#D1D5DB] placeholder:italic outline-none focus:border-[#111827]"
            />
          </div>
        </div>

        <div className="bg-[#F9FAFB] border border-[#E5E7EB] rounded-lg p-3.5 text-[12px] text-[#9CA3AF] leading-relaxed">
          Saved to <strong className="text-[#374151]">Tasks</strong>. Call back first — once confirmed as a lead, tap <strong className="text-[#374151]">Create quote</strong> on the task card.
        </div>
      </div>

      {/* Footer */}
      <div className="sticky bottom-0 z-30 bg-white border-t border-[#F3F4F6] shadow-sheet">
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
