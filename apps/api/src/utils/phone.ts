import { AppError } from './errors';

const E164_REGEX = /^\+[1-9]\d{7,14}$/;
const DEFAULT_COUNTRY_CODE = process.env.NOTIFICATION_DEFAULT_COUNTRY_CODE ?? '+968';

function normalizedCountryCode() {
  const digits = DEFAULT_COUNTRY_CODE.replace(/[^\d]/g, '');
  return digits ? `+${digits}` : '+968';
}

export function normalizePhoneToE164(rawValue: string): string {
  const trimmed = rawValue.trim();
  if (!trimmed) {
    throw new AppError(400, 'invalid_phone_number', 'Phone number is required.');
  }

  const cleaned = trimmed.replace(/[\s\-().]/g, '');
  let candidate: string;

  if (cleaned.startsWith('+')) {
    candidate = `+${cleaned.slice(1).replace(/[^\d]/g, '')}`;
  } else if (cleaned.startsWith('00')) {
    candidate = `+${cleaned.slice(2).replace(/[^\d]/g, '')}`;
  } else {
    const digits = cleaned.replace(/[^\d]/g, '');
    const local = digits.replace(/^0+/, '');
    candidate = `${normalizedCountryCode()}${local}`;
  }

  if (!E164_REGEX.test(candidate)) {
    throw new AppError(
      400,
      'invalid_phone_number',
      'Phone number must be a valid E.164 number (example: +96890000000).',
    );
  }

  return candidate;
}
