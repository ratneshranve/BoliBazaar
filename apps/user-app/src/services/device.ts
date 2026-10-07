import { Platform } from 'react-native';
import DeviceInfo from 'react-native-device-info';

let cachedId: string | null = null;

export const getDeviceId = async () => {
  if (!cachedId) cachedId = await DeviceInfo.getUniqueId();
  return cachedId;
};

export const deviceMeta = () => ({
  platform: Platform.OS === 'ios' ? ('ios' as const) : ('android' as const),
  appVersion: DeviceInfo.getVersion(),
  osVersion: DeviceInfo.getSystemVersion(),
  model: DeviceInfo.getModel(),
  deviceName: `${DeviceInfo.getBrand()} ${DeviceInfo.getModel()}`,
});

export const timezone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;
