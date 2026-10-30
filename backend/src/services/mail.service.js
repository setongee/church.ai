import nodemailer from 'nodemailer';
import { env } from '../config/env.js';

let transport = null;

// Two ways to send: an HTTPS email API (Resend) - needed on hosts that block outbound SMTP, like Railway - or plain SMTP.
export const mailConfigured = () => Boolean(env.smtp.from && (env.resendApiKey || env.smtp.host));

function getTransport() {
  if (!transport) {
    transport = nodemailer.createTransport({
      host: env.smtp.host,
      port: env.smtp.port,
      secure: env.smtp.port === 465,
      auth: env.smtp.user ? { user: env.smtp.user, pass: env.smtp.pass } : undefined,
      // A blocked or unreachable SMTP server must fail in seconds, not leave the request hanging.
      connectionTimeout: 8000,
      greetingTimeout: 8000,
      socketTimeout: 15000,
    });
  }
  return transport;
}

// Returns { ok } or { ok: false, error }. Never throws: a mail problem must not fail the request that triggered it.
export async function sendMail({ to, subject, text, html }) {
  if (!mailConfigured()) {
    console.log(`[mail] SMTP is not configured - would have sent "${subject}" to ${to}`);
    return { ok: false, error: 'Email is not set up on the server (RESEND_API_KEY or SMTP_HOST, and MAIL_FROM).' };
  }
  try {
    if (env.resendApiKey) {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${env.resendApiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: env.smtp.from, to: [to], subject, text, html }),
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) throw new Error(`Resend ${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}`);
      return { ok: true };
    }
    await getTransport().sendMail({ from: env.smtp.from, to, subject, text, html });
    return { ok: true };
  } catch (err) {
    console.error('[mail] failed', to, err.message);
    return { ok: false, error: err.message };
  }
}
