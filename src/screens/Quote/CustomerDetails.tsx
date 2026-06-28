import { useState, useEffect, useRef, useCallback } from 'react';
import { ChevronLeft, X } from 'lucide-react';
import { db } from '../../lib/db';
import { Button } from '../../components/Button';
import { useAppStore } from '../../store/useAppStore';
import { searchCustomers, findDuplicateByPhone } from '../../lib/customers';
import type { Customer } from '../../lib/db';
import { SkeletonInline } from '../../components/Skeleton';

/* ─── helpers ─── */

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

function formatUkPhoneInput(raw: string): string {
  // Strip everything except digits and +
  let digits = raw.replace(/[^\d+]/g, '');

  // If user typed +44, extract digits after it
  if (digits.startsWith('+44')) {
    digits = '0' + digits.slice(3);
  }

  // Remove any leading + if present without 44
  digits = digits.replace(/^\+/, '');

  // Ensure it starts with 0 for UK mobile
  if (!digits.startsWith('0') && digits.length > 0) {
    digits = '0' + digits;
  }

  // Cap at 11 digits (UK mobile: 07 + 9 digits)
  digits = digits.slice(0, 11);

  // Format: 0 7 00 00 00 000 -> 07700 000 000
  if (digits.length <= 1) return digits;
  if (digits.length <= 5) return digits;
  if (digits.length <= 8) return digits.slice(0, 5) + ' ' + digits.slice(5);
  return digits.slice(0, 5) + ' ' + digits.slice(5, 8) + ' ' + digits.slice(8);
}

interface CustomerDetailsProps {
  customerId?: string;
  onComplete: (customer: { id: string; name: string; phone: string; address?: string; email?: string }) => void;
  onCancel: () => void;
}

export default function CustomerDetails({ customerId, onComplete, onCancel }: CustomerDetailsProps) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(!!customerId);
  const [phoneError, setPhoneError] = useState(false);
  const [nameFocused, setNameFocused] = useState(false);
  const [autocompleteResults, setAutocompleteResults] = useState<Customer[]>([]);
  const [duplicateWarning, setDuplicateWarning] = useState<Customer | null>(null);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | undefined>(undefined);
  const userId = useAppStore((s) => s.userId);
  const [phoneFocused, setPhoneFocused] = useState(false);
  const [addressFocused, setAddressFocused] = useState(false);
  const [emailFocused, setEmailFocused] = useState(false);

  const nameRef = useRef<HTMLInputElement>(null);
  const phoneRef = useRef<HTMLInputElement>(null);

  const FORM_KEY = 'buildlogg_quote_customer_form';

  /* Load existing customer if provided, OR restore from localStorage on refresh */
  useEffect(() => {
    if (customerId) {
      db.customers.get(customerId).then((c) => {
        if (c) {
          setName(c.name === 'Unknown' ? '' : c.name);
          setPhone(c.phone);
          setAddress(c.address || '');
          setEmail(c.email || '');
        }
        setLoading(false);
      });
    } else {
      // Try restoring form fields from localStorage (handles page refresh)
      const saved = localStorage.getItem(FORM_KEY);
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          setName(parsed.name || '');
          setPhone(parsed.phone || '');
          setAddress(parsed.address || '');
          setEmail(parsed.email || '');
        } catch {}
      }
      setLoading(false);
    }
  }, [customerId]);

  // Persist form fields to localStorage on every change
  useEffect(() => {
    if (!customerId && (name || phone || address || email)) {
      localStorage.setItem(FORM_KEY, JSON.stringify({ name, phone, address, email }));
    }
  }, [name, phone, address, email, customerId]);

  const handleEdit = useCallback(() => {
    if (nameRef.current) nameRef.current.focus();
  }, []);

  // Debounced customer search
  useEffect(() => {
    if (!userId || !nameFocused || name.trim().length < 2) {
      setAutocompleteResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      const results = await searchCustomers(userId, name);
      setAutocompleteResults(results);
    }, 300);
    return () => clearTimeout(timer);
  }, [name, nameFocused, userId]);

  const selectCustomer = (c: Customer) => {
    setSelectedCustomerId(c.id);
    setName(c.name === 'Unknown' ? '' : c.name);
    setPhone(c.phone || '');
    setAddress(c.address || '');
    setEmail(c.email || '');
    setAutocompleteResults([]);
  };

  // Check for duplicate phone (excludes archived customers)
  useEffect(() => {
    if (!userId || !isValidUkPhone(phone) || !phone.trim()) {
      setDuplicateWarning(null);
      return;
    }
    // Skip if editing existing customer
    if (customerId || selectedCustomerId) { setDuplicateWarning(null); return; }
    const timer = setTimeout(async () => {
      const duplicate = await findDuplicateByPhone(userId, phone);
      setDuplicateWarning(duplicate);
    }, 500);
    return () => clearTimeout(timer);
  }, [phone, userId, customerId, selectedCustomerId]);


  const selectDuplicate = (c: Customer) => {
    setSelectedCustomerId(c.id);
    setName(c.name === 'Unknown' ? '' : c.name);
    setPhone(c.phone || '');
    setAddress(c.address || '');
    setEmail(c.email || '');
    setDuplicateWarning(null);
    // Navigate using the existing customer — set customerId in state
    // The form will use the filled data — the parent component handles customer creation/lookup
  };

  const canContinue = name.trim().length > 0 && isValidUkPhone(phone);

  const handleContinue = () => {
    if (!canContinue) return;
    if (!isValidUkPhone(phone)) {
      setPhoneError(true);
      return;
    }
    setPhoneError(false);
    // Clear persisted form — data is now saved to Dexie via the parent
    localStorage.removeItem(FORM_KEY);
    onComplete({
      id: customerId || selectedCustomerId || crypto.randomUUID(),
      name: name.trim(),
      phone: normalisePhone(phone),
      address: address.trim() || undefined,
      email: email.trim() || undefined,
    });
  };

  if (loading) {
    return (
      <div className="flex flex-col min-h-[100dvh]">
        <div className="flex-1 flex items-center justify-center">
          <SkeletonInline />
        </div>
      </div>
    );
  }

  const customerStrip = customerId && (name || phone) ? (
    <div className="bg-brand-surface border border-brand-border rounded-lg px-3.5 py-2.5 mb-5 flex items-center gap-2">
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-brand-black truncate">{name || 'Unknown'}</div>
        <div className="text-sm text-brand-muted mt-px">{phone}</div>
      </div>
      <button
        onClick={handleEdit}
        className="text-sm text-brand-mid underline underline-offset-2 cursor-pointer shrink-0"
      >
        Edit
      </button>
    </div>
  ) : null;

  return (
    <div className="flex flex-col min-h-[100dvh]">
      {/* Header */}
      <div className="sticky top-0 z-40 bg-[var(--app-shell-bg)] px-4 py-2 border-b border-brand-borderLight shrink-0 grid grid-cols-3 items-center">
        <button
          onClick={onCancel}
          className="inline-flex items-center gap-1 min-h-11 pr-4 text-sm font-medium text-brand-mid cursor-pointer justify-self-start"
        >
          <ChevronLeft size={22} className="-mt-px text-brand-muted" />
          Back
        </button>
        <span className="text-base font-bold text-brand-black text-center">New quote</span>
        <button
          onClick={onCancel}
          className="min-h-11 flex items-center text-sm text-brand-muted cursor-pointer justify-self-end"
        >
          <X size={18} />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 px-4 md:px-6 pt-4 md:pt-6 pb-[calc(96px + env(safe-area-inset-bottom))]">
        {customerStrip}

        <div className="mb-5">
          <div className="text-micro font-bold text-brand-mid tracking-[0.7px] mb-2.5">
            Customer
          </div>

          <div className="mb-4 relative">
            <label className="block text-label font-semibold text-brand-dark tracking-[0.3px] mb-1">
              Name
            </label>
            <input
              ref={nameRef}
              autoFocus
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onFocus={() => setNameFocused(true)}
              onBlur={() => { setTimeout(() => setNameFocused(false), 200); }}
              placeholder="e.g. Richards"
              className={`w-full h-12 px-3.5 border-2 rounded-lg text-base font-medium text-brand-black placeholder:text-brand-muted placeholder:italic outline-none ${
                nameFocused ? 'border-brand-black' : 'border-brand-border'
              }`}
            />
            {autocompleteResults.length > 0 && nameFocused && (
              <div className="absolute top-full left-0 right-0 z-50 bg-white border border-brand-border rounded-lg shadow-card mt-1 max-h-48 overflow-y-auto">
                {autocompleteResults.map((c) => (
                  <button
                    key={c.id}
                    onMouseDown={() => selectCustomer(c)}
                    className="w-full text-left px-4 py-2.5 hover:bg-brand-surface cursor-pointer border-b border-brand-borderLight last:border-b-0"
                  >
                    <p className="text-sm font-semibold text-brand-black">{c.name}</p>
                    {c.address && <p className="text-xs text-brand-muted truncate">{c.address}</p>}
                    {c.phone && <p className="text-xs text-brand-muted">{c.phone}</p>}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="mb-4">
            <label className="block text-label font-semibold text-brand-dark tracking-[0.3px] mb-1">
              Phone number
            </label>
            <input
              ref={phoneRef}
              type="tel"
              inputMode="numeric"
              value={phone}
              onChange={(e) => { setPhone(formatUkPhoneInput(e.target.value)); setPhoneError(false); }}
              onFocus={() => setPhoneFocused(true)}
              onBlur={() => setPhoneFocused(false)}
              placeholder="e.g. 07700 900123"
              className={`w-full h-12 px-3.5 border-2 rounded-lg text-base font-medium text-brand-black placeholder:text-brand-muted placeholder:italic outline-none ${
                phoneError ? 'border-status-error' : phoneFocused ? 'border-brand-black' : 'border-brand-border'
              }`}
            />
            {phoneError && (
              <p className="text-sm text-status-error mt-1">Enter a valid UK mobile number</p>
            )}
            {duplicateWarning && (
              <div className="mt-2 p-3 bg-status-amberBg border border-amber-200 rounded-lg flex items-center justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-status-amber">Existing customer found</p>
                  <p className="text-xs text-brand-dark truncate">
                    {duplicateWarning.name}
                    {duplicateWarning.address && ` — ${duplicateWarning.address}`}
                  </p>
                </div>
                <button
                  onClick={() => selectDuplicate(duplicateWarning)}
                  className="shrink-0 text-xs font-semibold text-status-amber underline cursor-pointer whitespace-nowrap"
                >
                  Use this customer
                </button>
              </div>
            )}
          </div>

          <div>
            <label className="block text-label font-semibold text-brand-dark tracking-[0.3px] mb-1">
              Address <span className="text-label text-brand-dark font-normal normal-case tracking-0 ml-1">(optional · used for navigation)</span>
            </label>
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              onFocus={() => setAddressFocused(true)}
              onBlur={() => setAddressFocused(false)}
              placeholder="e.g. 14 Birch Lane, Holmfirth"
              className={`w-full h-12 px-3.5 border-2 rounded-lg text-base font-medium text-brand-black placeholder:text-brand-muted placeholder:italic outline-none ${
                addressFocused ? 'border-brand-black' : 'border-brand-border'
              }`}
            />
          </div>

          <div className="mt-4">
            <label className="block text-label font-semibold text-brand-dark tracking-[0.3px] mb-1">
              Email <span className="text-label text-brand-dark font-normal normal-case tracking-0 ml-1">(optional · for reminders)</span>
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onFocus={() => setEmailFocused(true)}
              onBlur={() => setEmailFocused(false)}
              placeholder="e.g. sarah@example.com"
              className={`w-full h-12 px-3.5 border-2 rounded-lg text-base font-medium text-brand-black placeholder:text-brand-muted placeholder:italic outline-none ${
                emailFocused ? 'border-brand-black' : 'border-brand-border'
              }`}
            />
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="sticky bottom-0 z-30 bg-[var(--app-shell-bg)] border-t border-brand-borderLight shadow-sheet">
        <div className="px-4 py-3 pb-[calc(32px_+_env(safe-area-inset-bottom))]">
          <Button
            variant="primary"
            onClick={handleContinue}
            disabled={!canContinue}
          >
            Continue →
          </Button>
        </div>
      </div>
    </div>
  );
}
