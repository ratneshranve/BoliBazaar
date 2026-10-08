import { minorFactor } from '../listings/listing.service.js';

export const oid = (v) => String(v);

export const formatMoney = (minor, currency) =>
  new Intl.NumberFormat('en', { style: 'currency', currency, maximumFractionDigits: minorFactor(currency) > 1 ? 2 : 0 }).format(minor / minorFactor(currency));

/** Admin settings are in major units (rupees); auctions work in minor units (paise). */
export const snapshotRules = (cfg, currency) => {
  const f = minorFactor(currency);
  return {
    incrementTiers: cfg.incrementTiers.map((t) => ({ from: Math.round(t.from * f), step: Math.round(t.step * f) })),
    antiSniping: cfg.antiSniping,
    proxyBidding: cfg.proxyBidding,
    sanityCapMultiplier: cfg.sanityCapMultiplier,
    paymentWindowHours: cfg.paymentWindowHours,
    offerWindowHours: cfg.offerWindowHours,
  };
};

export const HOUR_MS = 60 * 60 * 1000;
