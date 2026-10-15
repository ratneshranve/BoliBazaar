import { AppState } from 'react-native';

/** Phone: the app came back to the foreground → run `cb`. Returns unsubscribe. */
export const onAppForeground = (cb) => {
  const sub = AppState.addEventListener('change', (s) => s === 'active' && cb());
  return () => sub.remove();
};

/** The app name and icon are part of the installed app; nothing to change at runtime. */
export const applyBranding = () => {};
