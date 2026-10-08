import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { ApiError } from '../utils/ApiError.js';

/**
 * OTP delivery. Provider chosen by SMS_PROVIDER (validated at startup).
 * "console" is only accepted in development (enforced in env.js).
 */
const providers = {
  /**
   * SMS India Hub HTTP API (as used in OyeChotuu). Parameter names are case-sensitive.
   * It answers HTTP 200 even on failure, so the JSON ErrorCode is checked ("000" = accepted).
   */
  async smsindiahub({ phone, code }) {
    const digits = phone.replace(/\D/g, '');
    const url = new URL('http://cloud.smsindiahub.in/vendorsms/pushsms.aspx');
    url.searchParams.append('APIKey', env.SMS_INDIA_HUB_API_KEY);
    url.searchParams.append('sid', env.SMS_INDIA_HUB_SENDER_ID);
    url.searchParams.append('msisdn', digits);
    url.searchParams.append('msg', env.SMS_INDIA_HUB_OTP_MESSAGE.replaceAll('{{otp}}', code));
    url.searchParams.append('gwid', '2');
    url.searchParams.append('fl', '0');
    if (env.SMS_INDIA_HUB_USERNAME) url.searchParams.append('uname', env.SMS_INDIA_HUB_USERNAME);
    if (env.SMS_INDIA_HUB_DLT_TEMPLATE_ID) url.searchParams.append('DLT_TE_ID', env.SMS_INDIA_HUB_DLT_TEMPLATE_ID);

    const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    const text = await res.text();
    let body = null;
    try {
      body = JSON.parse(text);
    } catch {
      /* some accounts answer in plain text */
    }
    if (!res.ok) throw new Error(`SMS India Hub HTTP ${res.status}: ${text.slice(0, 200)}`);
    if (body?.ErrorCode && body.ErrorCode !== '000') {
      const hint = body.ErrorCode === '006' ? ' (message does not match the DLT template — check SMS_INDIA_HUB_OTP_MESSAGE)' : '';
      throw new Error(`SMS India Hub [${body.ErrorCode}] ${body.ErrorMessage || text.slice(0, 200)}${hint}`);
    }
    logger.info('OTP SMS accepted by SMS India Hub', { to: `${digits.slice(0, 4)}****${digits.slice(-2)}` });
  },

  async msg91({ phone, code }) {
    // MSG91 OTP API: template must be DLT-approved and contain ##OTP##
    const url = new URL('https://control.msg91.com/api/v5/otp');
    url.searchParams.set('template_id', env.MSG91_OTP_TEMPLATE_ID);
    url.searchParams.set('mobile', phone.replace('+', ''));
    url.searchParams.set('otp', code);
    const res = await fetch(url, { method: 'POST', headers: { authkey: env.MSG91_AUTH_KEY, 'Content-Type': 'application/json' } });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || body.type === 'error') throw new Error(`MSG91: ${body.message || res.status}`);
  },

  async twilio({ phone, code, appName }) {
    const auth = Buffer.from(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`).toString('base64');
    const form = new URLSearchParams({
      To: phone,
      From: env.TWILIO_FROM_NUMBER,
      Body: `${code} is your ${appName || ''} verification code`.replace('  ', ' '),
    });
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}/Messages.json`, {
      method: 'POST',
      headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form,
    });
    if (!res.ok) throw new Error(`Twilio: ${res.status} ${await res.text()}`);
  },

  async console({ phone, code }) {
    logger.warn(`[DEV OTP] ${phone} → ${code}`);
  },
};

export const sendOtpSms = async ({ phone, code, appName }) => {
  try {
    await providers[env.SMS_PROVIDER]({ phone, code, appName });
  } catch (err) {
    logger.error('OTP SMS failed', { provider: env.SMS_PROVIDER, err: err.message });
    throw ApiError.unavailable('OTP_DELIVERY_FAILED', 'Could not send OTP, please try again');
  }
};
