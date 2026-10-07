/* Minimal structured logger (JSON in non-dev, readable in dev). */
import { env } from '../config/env.js';

const write = (level, msg, meta) => {
  if (env.isDev) {
    const line = `[${new Date().toISOString()}] ${level.toUpperCase()} ${msg}`;
    // eslint-disable-next-line no-console
    (level === 'error' ? console.error : console.log)(line, meta ?? '');
    return;
  }
  // eslint-disable-next-line no-console
  console.log(JSON.stringify({ t: new Date().toISOString(), level, msg, ...(meta || {}) }));
};

export const logger = {
  info: (msg, meta) => write('info', msg, meta),
  warn: (msg, meta) => write('warn', msg, meta),
  error: (msg, meta) => write('error', msg, meta),
};
