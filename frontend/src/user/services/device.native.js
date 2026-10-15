import { Platform } from 'react-native';
import DeviceInfo from 'react-native-device-info';

let cachedId = null;

/** Stable id for this phone (also links pushes and sessions to the device). */
export const getDeviceId = async () => {
  if (!cachedId) cachedId = await DeviceInfo.getUniqueId();
  return cachedId;
};

/** Sent with every request; the app version lets Admin › Maintenance force an update. */
export const deviceMeta = () => ({
  platform: Platform.OS === 'ios' ? 'ios' : 'android',
  appVersion: DeviceInfo.getVersion(),
  osVersion: DeviceInfo.getSystemVersion(),
  model: DeviceInfo.getModel(),
  deviceName: `${DeviceInfo.getBrand()} ${DeviceInfo.getModel()}`,
});

export const timezone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;
