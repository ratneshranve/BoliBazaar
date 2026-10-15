import { launchImageLibrary } from 'react-native-image-picker';
import { pick, types, isErrorWithCode, errorCodes } from '@react-native-documents/picker';

/** Phone versions of services/files.js: the gallery for photos and videos, the file picker for documents. */

const fromAsset = (a) => ({
  name: a.fileName || `file-${Date.now()}`,
  type: a.type || 'application/octet-stream',
  size: a.fileSize || 0,
  preview: a.uri,
  duration: a.duration ?? undefined,
  upload: { uri: a.uri, name: a.fileName || `file-${Date.now()}`, type: a.type || 'application/octet-stream' },
});

export const pickImages = async ({ multiple = true } = {}) => {
  const r = await launchImageLibrary({ mediaType: 'photo', selectionLimit: multiple ? 0 : 1, quality: 0.85, maxWidth: 2400, maxHeight: 2400 });
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
