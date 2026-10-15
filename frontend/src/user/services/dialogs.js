/**
 * Small dialogs and "open elsewhere" actions, written once for both the website and the phone
 * (dialogs.native.js). Every function returns a Promise so screens can `await` them the same way.
 */

/** Yes/No question. Resolves true for OK. */
export const confirmAsync = (message) => Promise.resolve(window.confirm(message));

/** Ask for a line of text. Resolves the text, or null when cancelled. */
export const promptAsync = (message, initial = '') => Promise.resolve(window.prompt(message, initial));

/** An outside address: a website, tel:, a map… */
export const openUrl = (url) => window.open(url, url.startsWith('tel:') ? '_self' : '_blank', 'noopener');

/** One of the app's own content pages (Terms, Privacy…) without leaving the current screen. */
export const openPage = (slug) => window.open(`/page/${slug}`, '_blank', 'noopener');

/** Share a link (system share sheet, else copy it). Resolves 'shared' | 'copied' | 'cancelled'. */
export const shareLink = async ({ title, path }) => {
  const url = `${window.location.origin}${path}`;
  try {
    if (navigator.share) {
      await navigator.share({ title, url });
      return 'shared';
    }
    await navigator.clipboard.writeText(url);
    return 'copied';
  } catch {
    return 'cancelled';
  }
};

/** A private file from the API (needs the login token): opened in a new tab. */
export const openAuthFile = async (apiPath) => {
  const w = window.open('', '_blank'); // opened now, before the download, so the browser doesn't block it
  try {
    const { apiBlob } = await import('../api/client');
    const url = URL.createObjectURL(await apiBlob(apiPath));
    if (w) w.location.href = url;
    else window.open(url, '_blank', 'noopener');
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch (e) {
    w?.close();
    throw e;
  }
};

/** Open a screen fresh (a full reload on the website). */
export const restartAt = (path) => window.location.assign(path);

/** Save text as a file (e.g. "Download my data"). */
export const saveTextFile = (name, text, type = 'application/json') => {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
