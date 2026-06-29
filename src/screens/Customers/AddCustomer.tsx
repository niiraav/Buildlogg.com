import { useState } from 'react';
import { ChevronLeft } from 'lucide-react';
import { db, type Customer } from '../../lib/db';
import { useAppStore } from '../../store/useAppStore';
import { Button } from '../../components/Button';
import { showSuccess, showToast } from '../../components/Toast/store';
import { findDuplicateByPhone } from '../../lib/customers';
import { addToSyncQueue } from '../../lib/syncQueue';
import { SkeletonInline } from '../../components/Skeleton';
import { useNavigate } from 'react-router-dom';
import { useUnsavedChanges } from '../../hooks/useUnsavedChanges';

const UK_PHONE_RE = /^(\+44|0)7\d{9}$/;

function normalisePhone(phone: string): string {
  const cleaned = phone.replace(/\s/g, '');
  if (cleaned.startsWith('0')) return '+44' + cleaned.slice(1);
  return cleaned;
}

function isValidUkPhone(phone: string): boolean {
  return UK_PHONE_RE.test(phone.replace(/\s/g, ''));
}

export default function AddCustomer() {
  const navigate = useNavigate();
  const userId = useAppStore((s) => s.userId);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [email, setEmail] = useState('');
  const [saving, setSaving] = useState(false);
  const [phoneError, setPhoneError] = useState(false);
  const [duplicateWarning, setDuplicateWarning] = useState<Customer | null>(null);

  const canSave = name.trim().length > 0 && isValidUkPhone(phone);

  /* Unsaved changes guard — warn when user has entered customer data */
  const formIsDirty = name.trim().length > 0 || phone.trim().length > 0 || address.trim().length > 0 || email.trim().length > 0;
  useUnsavedChanges(formIsDirty, 'You have unsaved customer details. Leave without saving?');

  const handleSave = async () => {
    if (!userId || !canSave) return;
    setSaving(true);
    try {
      // Check for duplicate phone
      const dup = await findDuplicateByPhone(userId, phone);
      if (dup) {
        setDuplicateWarning(dup);
        setSaving(false);
        return;
      }

      const id = crypto.randomUUID();
      const n = new Date().toISOString();
      const customer: Customer = {
        id,
        user_id: userId,
        name: name.trim(),
        phone: normalisePhone(phone),
        address: address.trim() || undefined,
        email: email.trim() || undefined,
        created_at: n,
        updated_at: n,
        _sync_status: 'pending',
      };

      await db.customers.add(customer);
      await addToSyncQueue('customers', id, {
        id, user_id: userId, name: name.trim(), phone: normalisePhone(phone),
        address: address.trim() || null, email: email.trim() || null,
        created_at: n, updated_at: n,
      }, 'insert');

      showSuccess('Customer added');
      navigate(`/customers/${id}`, { replace: true });
    } catch {
      showToast('Could not add customer', 'error', 3000);
    } finally {
      setSaving(false);
    }
  };

  if (saving) {
    return (
      <div className="flex flex-col min-h-[100dvh] bg-[var(--app-shell-bg)]">
        <div className="sticky top-0 z-40 px-4 pt-2 pb-2 bg-[var(--app-shell-bg)] flex items-center gap-3">
          <button onClick={() => navigate('/customers')} className="p-1 -ml-1 text-brand-dark">
            <ChevronLeft size={20} />
          </button>
          <h1 className="text-lg font-extrabold text-brand-black">Add customer</h1>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <SkeletonInline />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-[100dvh] bg-[var(--app-shell-bg)]">
      {/* Header */}
      <div className="sticky top-0 z-40 bg-[var(--app-shell-bg)] px-4 py-2 border-b border-brand-borderLight shrink-0 grid grid-cols-3 items-center">
        <button
          onClick={() => navigate('/customers')}
          className="inline-flex items-center gap-1 min-h-11 pr-4 text-sm font-medium text-brand-mid cursor-pointer justify-self-start"
        >
          <ChevronLeft size={22} className="-mt-px text-brand-muted" />
          Back
        </button>
        <span className="text-base font-bold text-brand-black text-center">Add customer</span>
        <span />
      </div>

      {/* Body */}
      <div className="flex-1 px-4 md:px-6 pt-4 md:pt-6 pb-[calc(96px + env(safe-area-inset-bottom))]">
        <div className="mb-5">
          <div className="text-micro font-bold text-brand-mid tracking-[0.7px] mb-2.5">Customer</div>

          <div className="mb-4">
            <label className="block text-label font-semibold text-brand-dark tracking-[0.3px] mb-1">Name</label>
            <input
              autoFocus
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Richards"
              className="w-full h-12 px-3.5 border-2 border-brand-border rounded-lg text-base font-medium text-brand-black placeholder:text-brand-muted placeholder:italic outline-none focus:border-brand-black"
            />
          </div>

          <div className="mb-4">
            <label className="block text-label font-semibold text-brand-dark tracking-[0.3px] mb-1">Phone number</label>
            <input
              type="tel"
              inputMode="numeric"
              value={phone}
              onChange={(e) => { setPhone(e.target.value); setPhoneError(false); setDuplicateWarning(null); }}
              placeholder="e.g. 07700 900123"
              className={`w-full h-12 px-3.5 border-2 rounded-lg text-base font-medium text-brand-black placeholder:text-brand-muted placeholder:italic outline-none ${
                phoneError ? 'border-status-error' : 'border-brand-border'
              } focus:border-brand-black`}
            />
            {phoneError && <p className="text-sm text-status-error mt-1">Enter a valid UK mobile number</p>}
            {duplicateWarning && (
              <div className="mt-2 p-3 bg-status-amberBg border border-amber-200 rounded-lg flex items-center justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-status-amber">Existing customer found</p>
                  <p className="text-xs text-brand-dark truncate">{duplicateWarning.name}</p>
                </div>
                <button
                  onClick={() => navigate(`/customers/${duplicateWarning.id}`, { replace: true })}
                  className="shrink-0 text-xs font-semibold text-status-amber underline cursor-pointer whitespace-nowrap"
                >
                  View customer
                </button>
              </div>
            )}
          </div>

          <div className="mb-4">
            <label className="block text-label font-semibold text-brand-dark tracking-[0.3px] mb-1">
              Address <span className="text-label text-brand-dark font-normal normal-case tracking-0 ml-1">(optional)</span>
            </label>
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="e.g. 14 Birch Lane, Holmfirth"
              className="w-full h-12 px-3.5 border-2 border-brand-border rounded-lg text-base font-medium text-brand-black placeholder:text-brand-muted placeholder:italic outline-none focus:border-brand-black"
            />
          </div>

          <div className="mb-4">
            <label className="block text-label font-semibold text-brand-dark tracking-[0.3px] mb-1">
              Email <span className="text-label text-brand-dark font-normal normal-case tracking-0 ml-1">(optional)</span>
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="e.g. dave@example.com"
              className="w-full h-12 px-3.5 border-2 border-brand-border rounded-lg text-base font-medium text-brand-black placeholder:text-brand-muted placeholder:italic outline-none focus:border-brand-black"
            />
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="sticky bottom-0 z-30 bg-[var(--app-shell-bg)] border-t border-brand-borderLight shadow-sheet">
        <div className="px-4 py-3 pb-[calc(32px_+_env(safe-area-inset-bottom))]">
          <Button variant="primary" onClick={handleSave} disabled={!canSave}>
            Add customer
          </Button>
        </div>
      </div>
    </div>
  );
}
