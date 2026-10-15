import { useCallback, useState, useSyncExternalStore } from 'react';
import { StatusBar, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { store } from '../../../frontend/src/user/store';
import { PromptHost } from '../../../frontend/src/user/components/PromptHost';
import { AnimatedSplash } from './components/AnimatedSplash';

/** Started = settings loaded and the saved login checked (the same moment the website stops its spinner). */
const useStarted = () =>
  useSyncExternalStore(store.subscribe, () => {
    const s = store.getState();
    return s.app.status !== 'booting' && s.session.status !== 'unknown';
  });

/**
 * Phone shell around the shared app (frontend/src/user/App.jsx): safe areas, status bar,
 * the text-prompt box, and the animated launch screen until the app has started.
 */
export const NativeRoot = ({ children }) => {
  const started = useStarted();
  const [splash, setSplash] = useState(true);
  const hide = useCallback(() => setSplash(false), []);
  return (
    <SafeAreaProvider>
      <StatusBar barStyle="dark-content" backgroundColor="#ffffff" />
      <View style={{ flex: 1, backgroundColor: '#ffffff' }}>
        {children}
        <PromptHost />
        {splash && <AnimatedSplash ready={started} onDone={hide} />}
      </View>
    </SafeAreaProvider>
  );
};
