import { useEffect, useState } from 'react';

/** 100 for INR/USD (paise, cents), 1 for currencies without decimals. */
export const factorOf = (currency) => 10 ** (new Intl.NumberFormat('en', { style: 'currency', currency: currency || 'USD' }).resolvedOptions().maximumFractionDigits);

/** Money in minor units → "₹1,200". `factor` is 100 for currencies with paise/cents. */
export const formatMinor = (minor, currency, factor = 100, lang = 'en') => {
  if (minor == null || !currency) return '';
  const locale = currency === 'INR' ? 'en-IN' : lang;
  return new Intl.NumberFormat(locale, { style: 'currency', currency, minimumFractionDigits: 0, maximumFractionDigits: Math.round(Math.log10(factor)) }).format(minor / factor);
};

/** Difference between the server clock and this device, so countdowns follow the server. */
let serverOffsetMs = 0;
export const syncServerTime = (serverTime) => {
  if (serverTime) serverOffsetMs = new Date(serverTime).getTime() - Date.now();
};
export const serverNow = () => Date.now() + serverOffsetMs;

/** Re-renders every second while mounted; returns ms left until `iso`. */
export const useCountdown = (iso) => {
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);
  return iso ? new Date(iso).getTime() - serverNow() : null;
};

/** "2d 4h", "3h 12m", "4m 09s" */
export const formatLeft = (ms) => {
  if (ms == null) return '';
  if (ms <= 0) return '0s';
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
  return `${m}m ${String(sec).padStart(2, '0')}s`;
};
