import './src/i18n';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, AppState, StatusBar, View } from 'react-native';
import { Provider } from 'react-redux';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { env, missingEnv } from './src/config/env';
import { store, useAppDispatch, useAppSelector, fetchBootstrap, restoreSession, maintenanceDetected, sessionExpired, setLocation } from './src/store';
import { setClientHooks } from './src/api/client';
import { RootNavigator, navRef } from './src/navigation/RootNavigator';
import { ConfigErrorScreen, LanguageScreen, MaintenanceScreen, OfflineScreen, UpdateScreen } from './src/screens/GateScreens';
import i18n, { savedLanguage, setLanguage, ensureLanguage } from './src/i18n';
import { registerPushToken, startPushListeners } from './src/services/push';
import { colors } from './src/theme/tokens';

const Gate = () => {
  const dispatch = useAppDispatch();
  const { status, maintenance, bootstrap, updateDismissed } = useAppSelector(s => s.app);
  const session = useAppSelector(s => s.session.status);
  const [, setLangTick] = useState(0);
  const langs = bootstrap?.languages?.items ?? [];
  const saved = savedLanguage();
  const languageValid = Boolean(saved && langs.some(l => l.code === saved));

  // One enabled language → no chooser, just use it. A saved translated language → load its strings.
  useEffect(() => {
    if (status !== 'ready') return;
    if (!languageValid && langs.length === 1) setLanguage(langs[0].code).then(() => setLangTick(n => n + 1));
    else if (languageValid && saved) ensureLanguage(saved).then(() => i18n.changeLanguage(saved));
  }, [status, languageValid, langs.length, saved]); // eslint-disable-line react-hooks/exhaustive-deps

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

  // A logged-in user's saved place applies on this device until they pick another.
  const me = useAppSelector(s => s.session.me);
  const currentLocation = useAppSelector(s => s.location.current);
  useEffect(() => {
    const h = me?.homeLocation;
    if (h?.leafId && !currentLocation) {
      store.dispatch(setLocation({ id: h.leafId, name: String(h.displayName).split(',')[0], path: h.displayName, type: h.leafType }));
    }
  }, [me, currentLocation]);

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
  if (!languageValid && langs.length > 1) return <LanguageScreen onDone={() => setLangTick(n => n + 1)} />;
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
