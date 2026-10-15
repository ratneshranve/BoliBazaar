import { useEffect, useState } from 'react';
import { Provider } from 'react-redux';
import { ActivityIndicator, View } from './components/primitives';
import { missingEnv } from './config/env';
import { store, useAppDispatch, useAppSelector, fetchBootstrap, restoreSession, maintenanceDetected, sessionExpired, setLocation, fetchUnread, notificationArrived, meUpdated } from './store';
import { connectRealtime, disconnectRealtime, onRealtime } from './services/realtime';
import { registerPushToken } from './services/push';
import { onAppForeground, applyBranding } from './services/lifecycle';
import { setClientHooks } from './api/client';
import i18n, { savedLanguage, setLanguage, ensureLanguage } from './i18n';
import { ConfigErrorScreen, LanguageScreen, MaintenanceScreen, OfflineScreen, UpdateScreen } from './screens/GateScreens';
import { Navigation } from './Navigation';
import { TabBar } from './components/TabBar';
import { AccountStatusBanner, IntroScreen, ReConsentScreen, introPending, reconsentNeeded } from './screens/FirstRunScreens';
import { meApi } from './api/endpoints';
import { colors } from '@theme/tokens';

/** Screens with the bottom tab bar. */
const TabsLayout = ({ children }) => (
  <View style={{ flex: 1, minHeight: 0 }}>
    <AccountStatusBanner />
    <View style={{ flex: 1, minHeight: 0 }}>{children}</View>
    <TabBar />
  </View>
);

/** Keeps the live connection and the unread counters in step with the login state. */
const RealtimeBridge = () => {
  const dispatch = useAppDispatch();
  const authed = useAppSelector((s) => s.session.status === 'authenticated');
  useEffect(() => {
    if (!authed) {
      disconnectRealtime();
      return undefined;
    }
    connectRealtime();
    dispatch(fetchUnread());
    registerPushToken().catch(() => {});
    const off = [
      onRealtime('notification:new', () => dispatch(notificationArrived())),
      // the team changed this account's status: refresh it (a ban ends the session on the next call)
      onRealtime('account:status', () => meApi.get().then(({ data }) => dispatch(meUpdated(data))).catch(() => {})),
      onRealtime('chat:message', () => dispatch(fetchUnread())),
      onRealtime('chat:read', () => dispatch(fetchUnread())),
    ];
    return () => off.forEach((f) => f());
  }, [authed, dispatch]);
  return null;
};

const Gate = () => {
  const dispatch = useAppDispatch();
  const { status, maintenance, bootstrap, updateDismissed } = useAppSelector((s) => s.app);
  const session = useAppSelector((s) => s.session.status);
  const [, setLangTick] = useState(0);
  const langs = bootstrap?.languages?.items ?? [];
  const saved = savedLanguage();
  const languageValid = Boolean(saved && langs.some((l) => l.code === saved));

  // One enabled language → no chooser, just use it. A saved translated language → load its strings.
  useEffect(() => {
    if (status !== 'ready') return;
    if (!languageValid && langs.length === 1) setLanguage(langs[0].code).then(() => setLangTick((n) => n + 1));
    else if (languageValid) ensureLanguage(saved).then(() => i18n.changeLanguage(saved));
  }, [status, languageValid, langs.length, saved]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setClientHooks({
      onSessionExpired: () => store.dispatch(sessionExpired()),
      onMaintenance: (d) => store.dispatch(maintenanceDetected({ enabled: true, title: d?.title, until: d?.until })),
    });
    dispatch(fetchBootstrap());
    dispatch(restoreSession());
    // Re-check maintenance/update gates when the user comes back to the app.
    return onAppForeground(() => dispatch(fetchBootstrap()));
  }, [dispatch]);

  // A logged-in user's saved place applies on this device until they pick another.
  const me = useAppSelector((s) => s.session.me);
  const currentLocation = useAppSelector((s) => s.location.current);
  const defaultRadius = bootstrap?.location?.defaultRadiusKm;
  useEffect(() => {
    const h = me?.homeLocation;
    if (h?.geo?.coordinates && !currentLocation && defaultRadius) {
      store.dispatch(
        setLocation({ label: h.label, name: h.name, placeId: h.placeId, lat: h.geo.coordinates[1], lng: h.geo.coordinates[0], address: h.address, scope: { type: 'radius', km: defaultRadius } })
      );
    }
  }, [me, currentLocation, defaultRadius]);

  useEffect(() => applyBranding(bootstrap?.branding), [bootstrap]);

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
  if (!languageValid && langs.length > 1) return <LanguageScreen onDone={() => setLangTick((n) => n + 1)} />;
  if (introPending(bootstrap)) return <IntroScreen onDone={() => setLangTick((n) => n + 1)} />;
  if (session === 'authenticated' && reconsentNeeded(me, bootstrap?.legal)) return <ReConsentScreen />;
  return (
    <Navigation TabsLayout={TabsLayout}>
      <RealtimeBridge />
    </Navigation>
  );
};

export default function App() {
  if (missingEnv.length) return <ConfigErrorScreen missing={missingEnv} />;
  return (
    <Provider store={store}>
      <Gate />
    </Provider>
  );
}
