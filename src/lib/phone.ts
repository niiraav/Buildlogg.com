/**
 * Phone number utilities — shared across all phone inputs in the app.
 * All phones are stored in E.164 format (+countrycode + number, no spaces).
 */

/**
 * Validate a phone number. Accepts:
 * - UK mobile: 07XXXXXXXXX, 447XXXXXXXXX, +447XXXXXXXXX
 * - UK landline: 0XXXXXXXXXX (area code + number)
 * - International: +<countrycode><number> (7-15 digits total)
 * - International with 00 prefix: 00<countrycode><number>
 * Returns null if valid, error message if invalid.
 * Empty string returns null (phone is optional in some contexts).
 */
export function validatePhone(value: string): string | null {
  const cleaned = value.replace(/[\s-()]/g, '');
  if (!cleaned) return null;

  if (/^(\+?44)?0?7\d{9}$/.test(cleaned)) return null;       // UK mobile
  if (/^0[123]\d{8,9}$/.test(cleaned)) return null;           // UK landline
  if (/^\+\d{7,15}$/.test(cleaned)) return null;              // International with +
  if (/^00\d{7,15}$/.test(cleaned)) return null;              // International with 00

  if (!cleaned.startsWith('+') && !cleaned.startsWith('00') && !cleaned.startsWith('0')) {
    return "This doesn't look like a UK number. Add the country code — e.g. +353 for Ireland, +48 for Poland.";
  }
  return 'Enter a valid phone number (e.g. 07700 900123 or +353 86 123 4567)';
}

/**
 * Normalise a phone number to E.164 format.
 * - 07XXXXXXXXX → +447XXXXXXXXX
 * - 0XXXXXXXXXX (landline) → +44XXXXXXXXXX
 * - 447XXXXXXXXX → +447XXXXXXXXX
 * - +447XXXXXXXXX → +447XXXXXXXXX (already E.164)
 * - 00XXXXXXXXXXX → +XXXXXXXXXXX
 * - +XXXXXXXXXXX (already E.164) → +XXXXXXXXXXX
 * - Unknown format → return as-is (trimmed)
 */
export function normalizePhone(phone: string): string {
  if (!phone) return '';
  const cleaned = phone.replace(/[\s-()]/g, '');
  if (!cleaned) return '';

  if (/^0?7\d{9}$/.test(cleaned)) return '+44' + cleaned.replace(/^0/, '');
  if (/^447\d{9}$/.test(cleaned)) return '+' + cleaned;
  if (/^\+447\d{9}$/.test(cleaned)) return cleaned;
  if (/^0[123]\d{8,9}$/.test(cleaned)) return '+44' + cleaned.slice(1);
  if (/^00\d{7,15}$/.test(cleaned)) return '+' + cleaned.slice(2);
  if (/^\+\d{7,15}$/.test(cleaned)) return cleaned;
  return phone.trim();
}

/**
 * Format a phone number for display (readable, with spaces).
 * UK mobile: +447XXXXXXXXX → 07XXX XXX XXX
 * UK landline: +44XXXXXXXXXX → 0XXXX XXX XXXX
 * International: show as-is
 */
export function formatPhoneDisplay(phone: string): string {
  if (!phone) return '';
  const normalized = normalizePhone(phone);

  if (/^\+447\d{9}$/.test(normalized)) {
    const local = '0' + normalized.slice(3);
    return local.slice(0, 5) + ' ' + local.slice(5, 8) + ' ' + local.slice(8);
  }
  if (/^\+44[123]\d{8,9}$/.test(normalized)) {
    const local = '0' + normalized.slice(3);
    return local.slice(0, 5) + ' ' + local.slice(5);
  }
  return phone.trim();
}

/**
 * Live-format a phone number as the user types.
 * UK numbers get spaces (07837 391 174).
 * International numbers are left as-is (user controls formatting).
 * Does NOT enforce a max length (international numbers vary).
 */
export function formatPhoneInput(raw: string): string {
  let digits = raw.replace(/[^\d+]/g, '');

  if (digits.startsWith('+44')) {
    digits = '0' + digits.slice(3);
  } else if (digits.startsWith('0044')) {
    digits = '0' + digits.slice(4);
  }

  digits = digits.replace(/^\+/, '');

  if (/^0[0-9]/.test(digits) && digits.length <= 11) {
    if (digits.startsWith('07')) {
      let formatted = digits.slice(0, 5);
      if (digits.length > 5) formatted += ' ' + digits.slice(5, 8);
      if (digits.length > 8) formatted += ' ' + digits.slice(8);
      return formatted;
    }
    let formatted = digits.slice(0, 5);
    if (digits.length > 5) formatted += ' ' + digits.slice(5);
    return formatted;
  }

  // International: keep original with spaces trimmed
  if (raw.startsWith('+')) {
    return raw.trim();
  }

  return raw.trim();
}

/**
 * Strip a phone number for wa.me deep links (digits only, no +).
 * Normalises to E.164 first, then strips non-digits.
 */
export function phoneForWhatsApp(phone: string): string {
  const normalized = normalizePhone(phone);
  return normalized.replace(/\D/g, '');
}

/**
 * Check if a phone number looks like a UK number.
 */
export function isUKPhone(phone: string): boolean {
  const normalized = normalizePhone(phone);
  return normalized.startsWith('+44');
}
