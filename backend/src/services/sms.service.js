import { env } from '../config/env.js';

const BASE_URL = 'https://app.multitexter.com/v2/app';

export const smsConfigured = () => Boolean(env.multitexter.apiKey && env.multitexter.senderName);

// Nigerian numbers to the 234xxxxxxxxxx form MultiTexter expects.
export function normalizePhone(raw) {
  const digits = String(raw || '').replace(/[^\d]/g, '');
  if (digits.startsWith('234')) return digits;
  if (digits.startsWith('0')) return `234${digits.slice(1)}`;
  return digits;
}

// Returns { ok } or { ok: false, error }; never throws, like sendMail.
export async function sendSms({ to, message }) {
  if (!smsConfigured()) return { ok: false, error: 'SMS is not set up on the server (MULTITEXTER_API_KEY / MULTITEXTER_SENDER_NAME).' };
  try {
    // The live endpoint wants lowercase field names, whatever the docs say.
    const res = await fetch(`${BASE_URL}/sendsms`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.multitexter.apiKey}`, Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ message, sender_name: env.multitexter.senderName, recipients: normalizePhone(to) }),
    });
    const data = await res.json();
    return data.status === 1 ? { ok: true } : { ok: false, error: data.msg || 'Failed to send SMS' };
  } catch (err) {
    console.error('[sms] failed', err.message);
    return { ok: false, error: err.message };
  }
}
