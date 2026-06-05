import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAppStore } from '../../store/useAppStore';
import { db } from '../../lib/db';
import LogMissedCall from './LogMissedCall';
import CustomerDetails from './CustomerDetails';

/* ─── helpers ─── */

function now() { return new Date().toISOString(); }

/* ─── types ─── */

type EntryPoint = 'missed_call' | 'new_quote' | 'task';

type QuoteStep = 'missed_call' | 'customer_details' | 'builder' | 'preview' | 'send' | 'sent';

interface LocationState {
  entryPoint?: EntryPoint;
  customerId?: string;
}

/* ─── component ─── */

export default function Quote() {
  const navigate = useNavigate();
  const location = useLocation();
  const userId = useAppStore((s) => s.userId);

  const state = (location.state as LocationState | null) || {};
  const entryPoint: EntryPoint = state.entryPoint || 'new_quote';
  const initialCustomerId = state.customerId;

  const [step] = useState<QuoteStep>(
    entryPoint === 'missed_call' ? 'missed_call' : 'customer_details'
  );
  const [customerId, setCustomerId] = useState<string | undefined>(initialCustomerId);

  /* Save customer data to Dexie (new or update) */
  const saveCustomer = async (data: { id: string; name: string; phone: string; address?: string }) => {
    if (!userId) return;
    const n = now();
    const existing = await db.customers.get(data.id);

    if (existing) {
      await db.customers.update(data.id, {
        name: data.name,
        phone: data.phone,
        address: data.address,
        updated_at: n,
        _sync_status: 'pending',
      });
      await db.sync_queue.add({
        operation: 'update',
        table_name: 'customers',
        record_id: data.id,
        payload: { name: data.name, phone: data.phone, address: data.address, updated_at: n },
        created_at: n,
        retry_count: 0,
      });
    } else {
      await db.customers.add({
        id: data.id,
        user_id: userId,
        name: data.name,
        phone: data.phone,
        address: data.address,
        created_at: n,
        updated_at: n,
        _sync_status: 'pending',
      });
      await db.sync_queue.add({
        operation: 'insert',
        table_name: 'customers',
        record_id: data.id,
        payload: { id: data.id, user_id: userId, name: data.name, phone: data.phone, address: data.address, created_at: n, updated_at: n },
        created_at: n,
        retry_count: 0,
      });
    }
  };

  /* ─── handlers ─── */

  const handleMissedCallDone = () => {
    navigate('/', { replace: true });
  };

  const handleCustomerDetailsComplete = async (data: { id: string; name: string; phone: string; address?: string }) => {
    await saveCustomer(data);
    setCustomerId(data.id);
    // M13 will transition to 'builder' step here
    // For M12, navigate to Home since builder is not yet implemented
    navigate('/', { replace: true });
  };

  const handleCancel = () => {
    navigate(-1);
  };

  /* ─── render ─── */

  switch (step) {
    case 'missed_call':
      return <LogMissedCall onDone={handleMissedCallDone} />;

    case 'customer_details':
      return (
        <CustomerDetails
          customerId={customerId}
          onComplete={handleCustomerDetailsComplete}
          onCancel={handleCancel}
        />
      );

    case 'builder':
      // Placeholder — M13 will replace this
      return (
        <div className="flex flex-col min-h-[100svh] items-center justify-center px-4">
          <p className="text-[15px] text-[#9CA3AF]">Quote builder coming in M13…</p>
        </div>
      );

    case 'preview':
    case 'send':
    case 'sent':
      // Placeholders — M13 will replace these
      return (
        <div className="flex flex-col min-h-[100svh] items-center justify-center px-4">
          <p className="text-[15px] text-[#9CA3AF]">Quote flow step coming in M13…</p>
        </div>
      );

    default:
      return null;
  }
}
