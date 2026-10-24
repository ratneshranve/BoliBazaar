/** Website: an app update link just opens (the phone version, appUpdate.native.js, installs an APK itself). */
export const installAppUpdate = async (url) => {
  window.open(url, '_blank', 'noopener');
};
