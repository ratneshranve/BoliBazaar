import { Alert, PermissionsAndroid } from 'react-native';
import { launchCamera, launchImageLibrary } from 'react-native-image-picker';
import { pick, types, isErrorWithCode, errorCodes } from '@react-native-documents/picker';
import i18n from '../i18n';
import { askPhotoSource } from '../components/PhotoSourceHost';

/** Phone versions of services/files.js: camera or gallery for photos, the gallery for videos, the file picker for documents. */

const fromAsset = (a) => ({
  name: a.fileName || `file-${Date.now()}`,
  type: a.type || 'application/octet-stream',
  size: a.fileSize || 0,
  preview: a.uri,
  duration: a.duration ?? undefined,
  upload: { uri: a.uri, name: a.fileName || `file-${Date.now()}`, type: a.type || 'application/octet-stream' },
});

const PHOTO = { mediaType: 'photo', quality: 0.85, maxWidth: 2400, maxHeight: 2400 };

/** The app declares the camera permission (for later in-app camera features), so Android wants it granted before the camera opens. */
const cameraAllowed = async () => (await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.CAMERA)) === PermissionsAndroid.RESULTS.GRANTED;

export const pickImages = async ({ multiple = true } = {}) => {
  const source = await askPhotoSource();
  if (!source) return [];
  if (source === 'camera' && !(await cameraAllowed())) {
    Alert.alert(i18n.t('files.cameraBlocked'));
    return [];
  }
  const r = source === 'camera' ? await launchCamera({ ...PHOTO, cameraType: 'back', saveToPhotos: false }) : await launchImageLibrary({ ...PHOTO, selectionLimit: multiple ? 0 : 1 });
  if (r.errorCode) Alert.alert(i18n.t(r.errorCode === 'camera_unavailable' ? 'files.cameraUnavailable' : 'common.somethingWrong'));
  return r.didCancel || r.errorCode ? [] : (r.assets || []).map(fromAsset);
};

export const pickVideo = async () => {
  const r = await launchImageLibrary({ mediaType: 'video', selectionLimit: 1 });
  const a = !r.didCancel && !r.errorCode && r.assets?.[0];
  return a ? fromAsset(a) : null;
};

export const pickFiles = async ({ images = true, pdf = true, multiple = true } = {}) => {
  try {
    const picked = await pick({ type: [images && types.images, pdf && types.pdf].filter(Boolean), allowMultiSelection: multiple });
    return picked.map((f) => ({ name: f.name || 'file', type: f.type || 'application/octet-stream', size: f.size || 0, preview: f.uri, upload: { uri: f.uri, name: f.name || 'file', type: f.type || 'application/octet-stream' } }));
  } catch (err) {
    if (isErrorWithCode(err) && err.code === errorCodes.OPERATION_CANCELED) return [];
    throw err;
  }
};

export const releasePreview = () => {};
