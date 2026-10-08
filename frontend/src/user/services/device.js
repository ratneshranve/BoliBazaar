import { kv } from './storage';

/** Stable id for this browser. */
export const getDeviceId = async () => {
  let id = kv.getString('device.id');
  if (!id) {
    id = `web-${crypto.randomUUID()}`;
    kv.set('device.id', id);
  }
  return id;
};

/** App version is intentionally NOT sent for web, so native update gates never apply to the browser. */
export const deviceMeta = () => ({ platform: 'web', deviceName: navigator.userAgent.slice(0, 80) });

export const timezone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;
