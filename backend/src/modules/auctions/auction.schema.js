import { z } from 'zod';
import { listingInput } from '../listings/listing.schema.js';

const wholeAmount = z.number().int('Whole amounts only').positive().max(1_000_000_000_000);

/** Auction settings the seller chooses. Amounts are whole major units (rupees). */
export const auctionSettingsInput = z.object({
  startingBid: wholeAmount,
  reservePrice: wholeAmount.nullable().optional(),
  buyNowPrice: wholeAmount.nullable().optional(),
  increment: wholeAmount.nullable().optional(),
  startAt: z.coerce.date().nullable().optional(), // empty = as soon as it is approved
  durationHours: z.number().min(1).max(24 * 90),
});

/** The item (same fields as a normal ad, without the price) plus the auction settings. */
export const auctionInput = listingInput.omit({ price: true, listingType: true }).extend({ auction: auctionSettingsInput });

export const bidInput = z.object({
  amount: wholeAmount,
  maxAmount: wholeAmount.optional(), // private ceiling for automatic bidding
  confirmHigh: z.boolean().optional(),
});
