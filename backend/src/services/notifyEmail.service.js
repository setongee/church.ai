import { env } from '../config/env.js';
import { User } from '../models/User.model.js';
import { mailConfigured, sendMail } from './mail.service.js';

// Which setting on a person's profile controls each kind of email.
export const EMAIL_KINDS = { tasks: 'tasks', reminders: 'reminders', chat: 'chat', calls: 'calls' };
export const DEFAULT_EMAIL_PREFS = { tasks: true, reminders: true, chat: true, calls: true };

const esc = (v) => String(v).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
export const absoluteUrl = (href = '/dashboard') => `${env.frontendOrigin.replace(/\/$/, '')}${href.startsWith('/') ? href : `/${href}`}`;

// One look for every email the app sends about activity: a heading, a few lines, one button.
export function emailLayout({ name, heading, lines = [], cta, href, footer }) {
  const url = absoluteUrl(href);
  const text = [`Hi ${name},`, '', heading, ...lines.map((l) => (typeof l === 'string' ? l : l.text)), '', cta ? `${cta}: ${url}` : '', '', footer || 'You can switch these emails on or off in Settings.'].filter((l, i, a) => l !== '' || a[i - 1] !== '').join('\n');
  const html = `<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;max-width:520px;margin:0 auto;color:#171717">
    <p style="margin:0 0 4px;color:#a3a3a3;font-size:12px;letter-spacing:.08em;text-transform:uppercase">FAFC Media Engine</p>
    <h2 style="margin:0 0 14px;font-size:20px;line-height:1.3">${esc(heading)}</h2>
    <p style="margin:0 0 12px">Hi ${esc(name)},</p>
    ${lines
      .map((l) => (typeof l === 'string' ? `<p style="margin:0 0 10px;line-height:1.55">${esc(l)}</p>` : `<div style="margin:0 0 10px;padding:10px 14px;background:#f5f5f5;border-radius:10px;line-height:1.55;color:#404040">${l.html ?? esc(l.text)}</div>`))
      .join('')}
    ${cta ? `<p style="margin:18px 0"><a href="${esc(url)}" style="display:inline-block;background:#ea580c;color:#ffffff;text-decoration:none;border-radius:10px;padding:11px 20px;font-weight:600">${esc(cta)}</a></p>` : ''}
    <p style="margin:22px 0 0;color:#a3a3a3;font-size:12px">${esc(footer || 'You can switch these emails on or off in Settings → Email notifications.')}</p>
  </div>`;
  return { text, html };
}

// Emails each person (who has this kind switched on) - never throws and never blocks the request that caused it.
export async function emailPeople(userIds, { kind, subject, heading, lines, cta = 'Open', href }) {
  try {
    if (!mailConfigured()) return;
    const ids = [...new Set(userIds.map(String))];
    if (!ids.length) return;
    const people = await User.find({ _id: { $in: ids }, active: true }).select('name email emailPrefs').lean();
    await Promise.all(
      people
        .filter((p) => p.email && (p.emailPrefs?.[kind] ?? DEFAULT_EMAIL_PREFS[kind]) !== false)
        .map((p) => sendMail({ to: p.email, subject, ...emailLayout({ name: p.name.split(' ')[0], heading: heading || subject, lines, cta, href }) })),
    );
  } catch (err) {
    console.error('[notify-email] failed', err.message);
  }
}
