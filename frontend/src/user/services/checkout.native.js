import RazorpayCheckout from 'react-native-razorpay';
import { paymentsApi } from '../api/endpoints';

/** Razorpay's error codes from the Android SDK: 2 = the user closed the payment screen. */
const PAYMENT_CANCELLED = 2;

/**
 * Phone checkout with Razorpay's native SDK, the same flow as the website (services/checkout.js):
 * open the order from POST /payments/orders, then let the server verify the payment's signature.
 * Resolves with the verified payment, or rejects with { cancelled: true } / an Error.
 */
export const openCheckout = async (checkout, themeColor) => {
  let res;
  try {
    res = await RazorpayCheckout.open({
      key: checkout.key,
      order_id: checkout.orderId,
      amount: String(checkout.amount),
      currency: checkout.currency,
      name: checkout.name,
      image: checkout.image || undefined,
      description: checkout.description,
      prefill: checkout.prefill,
      theme: themeColor ? { color: themeColor } : undefined,
    });
  } catch (err) {
    const cancelled = Number(err?.code) === PAYMENT_CANCELLED;
    paymentsApi.failed(checkout.orderId, cancelled ? 'Closed by the user' : err?.description || 'Payment failed').catch(() => {});
    if (cancelled) throw Object.assign(new Error('CANCELLED'), { cancelled: true });
    throw new Error(err?.description || 'Payment failed');
  }
  const { data } = await paymentsApi.verify({ orderId: res.razorpay_order_id, paymentId: res.razorpay_payment_id, signature: res.razorpay_signature });
  return data;
};
