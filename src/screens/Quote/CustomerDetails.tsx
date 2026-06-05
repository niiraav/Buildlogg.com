import { useState, useEffect, useRef, useCallback } from 'react';
import { ChevronLeft, X } from 'lucide-react';
import { db } from '../../lib/db';
import { Button } from '../../components/Button';

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

interface CustomerDetailsProps {
  customerId?: string;
  onComplete: (customer: { id: string; name: string; phone: string; address?: string }) => void;
  onCancel: () => void;
}

export default function CustomerDetails({ customerId, onComplete, onCancel }: CustomerDetailsProps) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [loading, setLoading] = useState(!!customerId);
  const [phoneError, setPhoneError] = useState(false);
  const [nameFocused, setNameFocused] = useState(false);
  const [phoneFocused, setPhoneFocused] = useState(false);
  const [addressFocused, setAddressFocused] = useState(false);

  const nameRef = useRef<HTMLInputElement>(null);
  const phoneRef = useRef<HTMLInputElement>(null);

  /* Load existing customer if provided */
  useEffect(() => {
    if (!customerId) { setLoading(false); return; }
    db.customers.get(customerId).then((c) => {
      if (c) {
        setName(c.name === 'Unknown' ? '' : c.name);
        setPhone(c.phone);
        setAddress(c.address || '');
      }
      setLoading(false);
    });
  }, [customerId]);

  const handleEdit = useCallback(() => {
    if (nameRef.current) nameRef.current.focus();
  }, []);

  const canContinue = name.trim().length > 0 && isValidUkPhone(phone);

  const handleContinue = () => {
    if (!canContinue) return;
    if (!isValidUkPhone(phone)) {
      setPhoneError(true);
      return;
    }
    setPhoneError(false);
    onComplete({
      id: customerId || crypto.randomUUID(),
      name: name.trim(),
      phone: normalisePhone(phone),
      address: address.trim() || undefined,
    });
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

  const customerStrip = customerId && (name || phone) ? (
    <div className="bg-[#F9FAFB] border border-[#E5E7EB] rounded-lg px-3.5 py-2.5 mb-5 flex items-center gap-2">
      <div className="flex-1 min-w-0">
        <div className="text-[14px] font-semibold text-[#111827] truncate">{name || 'Unknown'}</div>
        <div className="text-[12px] text-[#9CA3AF] mt-px">{phone}</div>
      </div>
      <button
        onClick={handleEdit}
        className="text-[12px] text-[#6B7280] underline underline-offset-2 cursor-pointer shrink-0"
      >
        Edit
      </button>
    </div>
  ) : null;

  return (
    <div className="flex flex-col min-h-[100svh]">
      {/* Header */}
      <div className="px-4 pt-2 pb-3 border-b border-[#F3F4F6] shrink-0 flex items-center justify-between">
        <button
          onClick={onCancel}
          className="inline-flex items-center gap-1 min-h-[44px] pr-4 text-[14px] font-medium text-[#6B7280] cursor-pointer"
        >
          <ChevronLeft size={22} color="#9CA3AF" className="-mt-px" />
          Back
        </button>
        <span className="text-[16px] font-bold text-[#111827]">{customerId ? 'New quote' : 'Customer details'}</span>
        <button
          onClick={onCancel}
          className="min-h-[44px] flex items-center text-[14px] text-[#9CA3AF] cursor-pointer"
        >
          <X size={18} />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-4 pt-4 pb-2">
        {customerStrip}

        <div className="mb-5">
          <div className="text-[10px] font-bold text-[#6B7280] uppercase tracking-[0.7px] mb-2.5">
            Customer
          </div>

          <div className="mb-2.5">
            <label className="block text-[11px] font-semibold text-[#9CA3AF] uppercase tracking-[0.3px] mb-1">
              Name
            </label>
            <input
              ref={nameRef}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onFocus={() => setNameFocused(true)}
              onBlur={() => setNameFocused(false)}
              placeholder="e.g. Richards"
              className={`w-full h-[48px] px-3.5 border-[1.5px] rounded-[10px] text-[16px] font-medium text-[#111827] placeholder:text-[#D1D5DB] placeholder:italic outline-none ${
                nameFocused ? 'border-[#111827]' : 'border-[#E5E7EB]'
              }`}
            />
          </div>

          <div className="mb-2.5">
            <label className="block text-[11px] font-semibold text-[#9CA3AF] uppercase tracking-[0.3px] mb-1">
              Phone number
            </label>
            <input
              ref={phoneRef}
              type="tel"
              inputMode="tel"
              value={phone}
              onChange={(e) => { setPhone(e.target.value); setPhoneError(false); }}
              onFocus={() => setPhoneFocused(true)}
              onBlur={() => setPhoneFocused(false)}
              placeholder="e.g. 07700 900123"
              className={`w-full h-[48px] px-3.5 border-[1.5px] rounded-[10px] text-[16px] font-medium text-[#111827] placeholder:text-[#D1D5DB] placeholder:italic outline-none ${
                phoneError ? 'border-[#EF4444]' : phoneFocused ? 'border-[#111827]' : 'border-[#E5E7EB]'
              }`}
            />
            {phoneError && (
              <p className="text-[12px] text-[#EF4444] mt-1">Enter a valid UK mobile number</p>
            )}
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-[#9CA3AF] uppercase tracking-[0.3px] mb-1">
              Address <span className="text-[11px] text-[#9CA3AF] font-normal normal-case tracking-0 ml-1">(optional · used for navigation)</span>
            </label>
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              onFocus={() => setAddressFocused(true)}
              onBlur={() => setAddressFocused(false)}
              placeholder="e.g. 14 Birch Lane, Holmfirth"
              className={`w-full h-[48px] px-3.5 border-[1.5px] rounded-[10px] text-[16px] font-medium text-[#111827] placeholder:text-[#D1D5DB] placeholder:italic outline-none ${
                addressFocused ? 'border-[#111827]' : 'border-[#E5E7EB]'
              }`}
            />
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="sticky bottom-0 z-30 bg-white border-t border-[#F3F4F6] shadow-sheet">
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
