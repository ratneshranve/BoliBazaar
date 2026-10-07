import './src/i18n';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, AppState, StatusBar, View } from 'react-native';
import { Provider } from 'react-redux';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { env, missingEnv } from './src/config/env';
import { store, useAppDispatch, useAppSelector, fetchBootstrap, restoreSession, maintenanceDetected, sessionExpired } from './src/store';
import { setClientHooks } from './src/api/client';
import { RootNavigator, navRef } from './src/navigation/RootNavigator';
import { ConfigErrorScreen, LanguageScreen, MaintenanceScreen, OfflineScreen, UpdateScreen } from './src/screens/GateScreens';
import { savedLanguage } from './src/i18n';
import { registerPushToken, startPushListeners } from './src/services/push';
import { colors } from './src/theme/tokens';

const Gate = () => {
  const dispatch = useAppDispatch();
  const { status, maintenance, bootstrap, updateDismissed } = useAppSelector(s => s.app);
  const session = useAppSelector(s => s.session.status);
  const [languageChosen, setLanguageChosen] = useState(Boolean(savedLanguage()));

  useEffect(() => {
    setClientHooks({
      onSessionExpired: () => store.dispatch(sessionExpired()),
      onMaintenance: d => store.dispatch(maintenanceDetected({ enabled: true, title: d?.title as string, until: d?.until as string })),
    });
    dispatch(fetchBootstrap());
    dispatch(restoreSession());
    // Re-check maintenance/update gates whenever the app returns to foreground.
    const sub = AppState.addEventListener('change', s => s === 'active' && dispatch(fetchBootstrap()));
    return () => sub.remove();
  }, [dispatch]);

  // Push: register the device token whenever a session exists, and handle taps.
  useEffect(() => {
    if (session !== 'authenticated') return;
    registerPushToken().catch(() => {});
    return startPushListeners(
      r => {
        // Deep-link routing is wired as screens land (docs/10-notifications.md §5).
        if (__DEV__) console.log('push open', r);
      },
      () => store.getState().session.status === 'authenticated',
    );
  }, [session]);

  if (status === 'booting' || session === 'unknown') {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.white }}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }
  if (status === 'offline') return <OfflineScreen />;
  if (maintenance?.enabled) return <MaintenanceScreen />;
  if (bootstrap?.update.required) return <UpdateScreen required />;
  if (bootstrap?.update.available && !updateDismissed) return <UpdateScreen required={false} />;
  if (!languageChosen) return <LanguageScreen onDone={() => setLanguageChosen(true)} />;
  return <RootNavigator />;
};

export default function App() {
  if (missingEnv.length) {
    return (
      <SafeAreaProvider>
        <ConfigErrorScreen missing={missingEnv} />
      </SafeAreaProvider>
    );
  }
  void env;
  return (
    <Provider store={store}>
      <SafeAreaProvider>
        <StatusBar barStyle="dark-content" />
        <Gate />
      </SafeAreaProvider>
    </Provider>
  );
}

export { navRef };
