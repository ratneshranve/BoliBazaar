/** Browser: the tab came back into view → run `cb`. Returns unsubscribe. */
export const onAppForeground = (cb) => {
  const onVisible = () => document.visibilityState === 'visible' && cb();
  document.addEventListener('visibilitychange', onVisible);
  return () => document.removeEventListener('visibilitychange', onVisible);
};

/** Browser tab title and icon from Admin › Settings › Branding. */
export const applyBranding = (b) => {
  document.title = b?.appName || 'App';
  const icon = b?.icon?.url || b?.logo?.url;
  if (icon) document.querySelector('link[rel="icon"]')?.setAttribute('href', icon);
};
