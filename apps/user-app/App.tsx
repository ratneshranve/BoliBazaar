import './src/i18n';
import React, { useCallback, useEffect, useState } from 'react';
import { AppState, StatusBar, View } from 'react-native';
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
import { AnimatedSplash } from './src/components/AnimatedSplash';

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
  const defaultRadius = bootstrap?.location?.defaultRadiusKm;
  useEffect(() => {
    const h = me?.homeLocation;
    if (h?.geo?.coordinates && !currentLocation && defaultRadius) {
      store.dispatch(
        setLocation({
          label: h.label,
          name: h.name ?? h.label.split(',')[0],
          placeId: h.placeId,
          lat: h.geo.coordinates[1],
          lng: h.geo.coordinates[0],
          address: h.address ?? {},
          scope: { type: 'radius', km: defaultRadius },
        }),
      );
    }
  }, [me, currentLocation, defaultRadius]);

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

  // the animated splash covers the screen while the app starts
  if (status === 'booting' || session === 'unknown') return <View style={{ flex: 1, backgroundColor: colors.white }} />;
  if (status === 'offline') return <OfflineScreen />;
  if (maintenance?.enabled) return <MaintenanceScreen />;
  if (bootstrap?.update.required) return <UpdateScreen required />;
  if (bootstrap?.update.available && !updateDismissed) return <UpdateScreen required={false} />;
  if (!languageValid && langs.length > 1) return <LanguageScreen onDone={() => setLangTick(n => n + 1)} />;
  return <RootNavigator />;
};

/** Shown over the app until it has started and the logo animation has played. */
const Splash = () => {
  const ready = useAppSelector(s => s.app.status !== 'booting' && s.session.status !== 'unknown');
  const [visible, setVisible] = useState(true);
  const hide = useCallback(() => setVisible(false), []);
  return visible ? <AnimatedSplash ready={ready} onDone={hide} /> : null;
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
        <Splash />
      </SafeAreaProvider>
    </Provider>
  );
}

export { navRef };
