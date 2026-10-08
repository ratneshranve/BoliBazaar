import crypto from 'node:crypto';
import { env, integrations } from '../../core/config/env.js';
import { ApiError } from '../../core/utils/ApiError.js';

/**
 * Razorpay REST API (keys only from backend .env). Without keys, paid orders are refused with
 * PAYMENTS_UNAVAILABLE — there is no fake "success" mode.
 */
const API = 'https://api.razorpay.com/v1';

const assertConfigured = () => {
  if (!integrations.razorpay.configured) throw ApiError.unavailable('PAYMENTS_UNAVAILABLE', 'Payments are not available right now');
};

const call = async (path, { method = 'GET', body } = {}) => {
  assertConfigured();
  const auth = Buffer.from(`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`).toString('base64');
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(20_000),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Razorpay ${res.status}: ${json?.error?.description || 'request failed'}`);
  return json;
};

const safeEqual = (a, b) => {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

export const razorpay = {
  keyId: () => env.RAZORPAY_KEY_ID,

  createOrder: ({ amountMinor, currency, receipt, notes }) => call('/orders', { method: 'POST', body: { amount: amountMinor, currency, receipt, notes } }),

  /** Checkout success callback: HMAC(order_id|payment_id) with the key secret. */
  verifyPayment: ({ orderId, paymentId, signature }) => {
    assertConfigured();
    const expected = crypto.createHmac('sha256', env.RAZORPAY_KEY_SECRET).update(`${orderId}|${paymentId}`).digest('hex');
    return safeEqual(expected, signature);
  },

  /** Webhooks are signed with the separate webhook secret over the raw body. */
  verifyWebhook: (rawBody, signature) => {
    if (!env.RAZORPAY_WEBHOOK_SECRET) return false;
    const expected = crypto.createHmac('sha256', env.RAZORPAY_WEBHOOK_SECRET).update(rawBody).digest('hex');
    return safeEqual(expected, signature || '');
  },

  fetchPayment: (paymentId) => call(`/payments/${paymentId}`),

  refund: ({ paymentId, amountMinor, notes }) => call(`/payments/${paymentId}/refund`, { method: 'POST', body: { amount: amountMinor, notes } }),
};
