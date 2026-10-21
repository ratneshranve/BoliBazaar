import { Alert } from 'react-native';
import { launchCamera, launchImageLibrary } from 'react-native-image-picker';
import { pick, types, isErrorWithCode, errorCodes } from '@react-native-documents/picker';
import i18n from '../i18n';

/** Phone versions of services/files.js: camera or gallery for photos, the gallery for videos, the file picker for documents. */

const fromAsset = (a) => ({
  name: a.fileName || `file-${Date.now()}`,
  type: a.type || 'application/octet-stream',
  size: a.fileSize || 0,
  preview: a.uri,
  duration: a.duration ?? undefined,
  upload: { uri: a.uri, name: a.fileName || `file-${Date.now()}`, type: a.type || 'application/octet-stream' },
});

/** "Take photo" or "Choose from gallery" — null when the user backs out. */
const askPhotoSource = () =>
  new Promise((resolve) => {
    Alert.alert(
      i18n.t('files.addPhoto'),
      undefined,
      [
        { text: i18n.t('files.camera'), onPress: () => resolve('camera') },
        { text: i18n.t('files.gallery'), onPress: () => resolve('gallery') },
        { text: i18n.t('common.cancel'), style: 'cancel', onPress: () => resolve(null) },
      ],
      { cancelable: true, onDismiss: () => resolve(null) }
    );
  });

const PHOTO = { mediaType: 'photo', quality: 0.85, maxWidth: 2400, maxHeight: 2400 };

export const pickImages = async ({ multiple = true } = {}) => {
  const source = await askPhotoSource();
  if (!source) return [];
  // the system camera app takes the picture, so this app needs no camera permission
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
