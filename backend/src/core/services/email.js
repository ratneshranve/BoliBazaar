import nodemailer from 'nodemailer';
import { env, integrations } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { ApiError } from '../utils/ApiError.js';

/**
 * Email over SMTP (EMAIL_HOST / EMAIL_PORT / EMAIL_USER / EMAIL_PASS / EMAIL_FROM in .env).
 * Without those settings email is off: in development the message is printed to the server log
 * instead (so verification codes can still be tested), elsewhere sending is skipped.
 */
const transport = integrations.email.configured
  ? nodemailer.createTransport({
      host: env.EMAIL_HOST,
      port: env.EMAIL_PORT,
      secure: env.EMAIL_PORT === 465,
      auth: { user: env.EMAIL_USER, pass: env.EMAIL_PASS },
      connectionTimeout: 15_000,
      greetingTimeout: 15_000,
      socketTimeout: 20_000,
    })
  : null;

/** True when emails can actually be delivered (or printed, in development). */
export const emailAvailable = () => Boolean(transport) || env.isDev;

const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** Plain, readable HTML version of a short text email. */
const toHtml = ({ heading, text, appName }) => `<!doctype html><html><body style="margin:0;background:#f5f5f5;font-family:Arial,Helvetica,sans-serif;color:#1f2937">
<div style="max-width:520px;margin:24px auto;background:#fff;border-radius:12px;padding:24px">
<div style="font-weight:700;font-size:18px;color:#b91c1c;margin-bottom:16px">${escapeHtml(appName)}</div>
${heading ? `<h2 style="font-size:18px;margin:0 0 12px">${escapeHtml(heading)}</h2>` : ''}
${String(text).split('\n').map((l) => `<p style="font-size:15px;line-height:1.5;margin:0 0 10px">${escapeHtml(l)}</p>`).join('')}
</div></body></html>`;

/**
 * Send one email. Throws ApiError EMAIL_UNAVAILABLE when email is off outside development,
 * and passes SMTP errors up so callers decide whether a failure matters.
 */
export const sendEmail = async ({ to, subject, text, heading, appName = 'Boli Bazaar' }) => {
  if (!transport) {
    if (env.isDev) {
      logger.warn(`[email:console] To ${to} — ${subject}\n${text}`);
      return { delivered: false, printed: true };
    }
    throw ApiError.unavailable('EMAIL_UNAVAILABLE', 'Email is not set up yet');
  }
  await transport.sendMail({ from: env.EMAIL_FROM, to, subject, text, html: toHtml({ heading: heading ?? subject, text, appName }) });
  return { delivered: true };
};
