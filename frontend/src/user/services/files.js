/**
 * Choosing files, the same way on the website and the phone (files.native.js).
 * Every picked file is { name, type, size, preview, duration?, upload } — `upload` goes into the
 * upload form as-is, `preview` can be shown right away, `duration` is a video's length in seconds.
 */

const IMAGES = 'image/jpeg,image/png,image/webp';
const VIDEOS = 'video/mp4,video/webm,video/quicktime';

const choose = ({ accept, multiple }) =>
  new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.multiple = Boolean(multiple);
    input.onchange = () => resolve([...(input.files || [])].map((f) => ({ name: f.name, type: f.type, size: f.size, preview: URL.createObjectURL(f), upload: f })));
    input.oncancel = () => resolve([]);
    input.click();
  });

const videoSeconds = (url) =>
  new Promise((resolve) => {
    const v = document.createElement('video');
    v.preload = 'metadata';
    v.onloadedmetadata = () => resolve(v.duration);
    v.onerror = () => resolve(null);
    v.src = url;
  });

export const pickImages = ({ multiple = true } = {}) => choose({ accept: IMAGES, multiple });

export const pickVideo = async () => {
  const [f] = await choose({ accept: VIDEOS });
  if (!f) return null;
  return { ...f, duration: await videoSeconds(f.preview) };
};

/** Photos and/or PDFs (chat attachments, ID documents). */
export const pickFiles = ({ images = true, pdf = true, multiple = true } = {}) =>
  choose({ accept: [images && IMAGES, pdf && 'application/pdf'].filter(Boolean).join(','), multiple });

/** Free a preview once it is no longer shown. */
export const releasePreview = (url) => url && url.startsWith('blob:') && URL.revokeObjectURL(url);
