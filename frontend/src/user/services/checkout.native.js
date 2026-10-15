import { ApiError } from '../api/client';

/**
 * Phone checkout. Razorpay's native SDK (react-native-razorpay) is added together with the live Razorpay
 * keys; until then the server cannot open an order anyway, so this point is only reached if it somehow did.
 */
export const openCheckout = async () => {
  throw new ApiError(503, 'PAYMENTS_UNAVAILABLE', 'Payments are not available in the app yet');
};
