import { Linking } from 'react-native';
import ReactNativeBlobUtil from 'react-native-blob-util';

/**
 * "Update the app" on the phone. When the admin's update link (Admin › Maintenance › store URL) points to an .apk file,
 * the app downloads it and opens Android's install screen (needs REQUEST_INSTALL_PACKAGES, declared in the manifest);
 * any other link (Play Store, a web page) just opens. `onProgress(0..1)` reports the download.
 */
export const installAppUpdate = async (url, onProgress) => {
  if (!/\.apk(\?|#|$)/i.test(url)) return Linking.openURL(url);
  const path = `${ReactNativeBlobUtil.fs.dirs.CacheDir}/bolibazaar-update.apk`;
  await ReactNativeBlobUtil.fs.unlink(path).catch(() => {});
  const res = await ReactNativeBlobUtil.config({ path })
    .fetch('GET', url)
    .progress({ interval: 250 }, (received, total) => onProgress?.(Number(total) > 0 ? Number(received) / Number(total) : 0));
  if (res.info().status >= 400) throw new Error(`Download failed (${res.info().status})`);
  return ReactNativeBlobUtil.android.actionViewIntent(res.path(), 'application/vnd.android.package-archive');
};
