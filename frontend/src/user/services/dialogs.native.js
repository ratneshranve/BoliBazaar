import { Alert, Linking, Share } from 'react-native';
import ReactNativeBlobUtil from 'react-native-blob-util';
import { navRef } from '../navRef';
import { goTo } from '../router.native';
import { env } from '../config/env';
import { getAccessToken } from '../api/client';
import { getDeviceId } from './device';
import { showPrompt } from '../components/PromptHost';
import i18n from '../i18n';

/** Phone versions of services/dialogs.js (same names, same results). */

export const confirmAsync = (message) =>
  new Promise((resolve) =>
    Alert.alert('', String(message), [
      { text: i18n.t('common.cancel'), style: 'cancel', onPress: () => resolve(false) },
      { text: 'OK', onPress: () => resolve(true) },
    ], { cancelable: true, onDismiss: () => resolve(false) })
  );

export const promptAsync = (message, initial = '') => showPrompt(String(message), initial);

export const openUrl = (url) => Linking.openURL(url).catch(() => Alert.alert(url));

/** The app's own pages open inside the app. */
export const openPage = (slug) => navRef.isReady() && goTo(navRef, `/page/${slug}`);

export const shareLink = async ({ title, path }) => {
  const url = `${env.webUrl || ''}${path}`;
  try {
    const r = await Share.share({ title, message: env.webUrl ? `${title}\n${url}` : title });
    return r.action === Share.sharedAction ? 'shared' : 'cancelled';
  } catch {
    return 'cancelled';
  }
};

const MIME_EXT = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png', 'text/html': 'html' };

/** A private file from the API: downloaded with the login token, then opened in the phone's viewer. */
export const openAuthFile = async (apiPath) => {
  const res = await ReactNativeBlobUtil.config({ fileCache: true }).fetch('GET', `${env.apiBaseUrl}${apiPath}`, {
    Authorization: `Bearer ${getAccessToken()}`,
    'X-Device-Id': await getDeviceId(),
  });
  const status = res.info().status;
  if (status >= 400) throw new Error(i18n.t('errors.UNKNOWN_ERROR'));
  const mime = (res.info().headers['Content-Type'] || res.info().headers['content-type'] || 'application/octet-stream').split(';')[0];
  const ext = MIME_EXT[mime] || 'bin';
  const target = `${ReactNativeBlobUtil.fs.dirs.CacheDir}/open-${Date.now()}.${ext}`;
  await ReactNativeBlobUtil.fs.mv(res.path(), target);
  await ReactNativeBlobUtil.android.actionViewIntent(target, mime);
};

/** Open a screen fresh: tab screens start over when opened (router.native.jsx). */
export const restartAt = (path) => navRef.isReady() && goTo(navRef, path);

/** "Download my data": hand the text to the share sheet (save to Files, Drive, email…). */
export const saveTextFile = (name, text) => Share.share({ title: name, message: text });
