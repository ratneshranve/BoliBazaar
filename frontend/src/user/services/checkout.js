import { paymentsApi } from '../api/endpoints';

/**
 * Razorpay Standard Checkout on the web (the native app uses react-native-razorpay with the same
 * server calls). The script comes from Razorpay; the key and amount come from our server's order.
 */
const SCRIPT = 'https://checkout.razorpay.com/v1/checkout.js';
let loading = null;

const loadScript = () => {
  if (window.Razorpay) return Promise.resolve();
  if (!loading) {
    loading = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = SCRIPT;
      s.onload = () => resolve();
      s.onerror = () => {
        loading = null;
        reject(new Error('CHECKOUT_LOAD_FAILED'));
      };
      document.body.appendChild(s);
    });
  }
  return loading;
};

/**
 * Open checkout for an order from POST /payments/orders.
 * Resolves with the verified payment, or rejects with { cancelled: true } / an Error.
 */
export const openCheckout = async (checkout, themeColor) => {
  await loadScript();
  return new Promise((resolve, reject) => {
    const rzp = new window.Razorpay({
      key: checkout.key,
      order_id: checkout.orderId,
      amount: checkout.amount,
      currency: checkout.currency,
      name: checkout.name,
      image: checkout.image,
      description: checkout.description,
      prefill: checkout.prefill,
      theme: themeColor ? { color: themeColor } : undefined,
      handler: async (res) => {
        try {
          const { data } = await paymentsApi.verify({ orderId: res.razorpay_order_id, paymentId: res.razorpay_payment_id, signature: res.razorpay_signature });
          resolve(data);
        } catch (e) {
          reject(e);
        }
      },
      modal: {
        ondismiss: () => {
          paymentsApi.failed(checkout.orderId, 'Closed by the user').catch(() => {});
          reject(Object.assign(new Error('CANCELLED'), { cancelled: true }));
        },
      },
    });
    rzp.on('payment.failed', (r) => {
      paymentsApi.failed(checkout.orderId, r?.error?.description).catch(() => {});
    });
    rzp.open();
  });
};
