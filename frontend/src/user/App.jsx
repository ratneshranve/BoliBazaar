import { useEffect, useState } from 'react';
import { BrowserRouter, Outlet, Route, Routes, useNavigate } from 'react-router-dom';
import { Provider } from 'react-redux';
import { ActivityIndicator, View } from './components/primitives';
import { missingEnv } from './config/env';
import { store, useAppDispatch, useAppSelector, fetchBootstrap, restoreSession, maintenanceDetected, sessionExpired } from './store';
import { setClientHooks } from './api/client';
import i18n, { savedLanguage, setLanguage, ensureLanguage } from './i18n';
import { ConfigErrorScreen, LanguageScreen, MaintenanceScreen, OfflineScreen, UpdateScreen } from './screens/GateScreens';
import { LoginScreen, OtpScreen, ProfileSetupScreen } from './screens/AuthScreens';
import { HomeScreen, ExploreScreen, SellScreen, AuctionsScreen, ProfileScreen } from './screens/TabScreens';
import { SecurityScreen } from './screens/SecurityScreen';
import { PageScreen } from './screens/PageScreen';
import { TabBar } from './components/TabBar';
import { colors } from '@theme/tokens';

/** Change language later from Profile (same list as the first-run chooser) */
const LanguageRoute = () => {
  const navigate = useNavigate();
  return <LanguageScreen onDone={() => navigate(-1)} />;
};

/** Screens with the bottom tab bar (same as the app's MainTabs). */
const MainTabs = () => (
  <View style={{ flex: 1, minHeight: 0 }}>
    <View style={{ flex: 1, minHeight: 0 }}>
      <Outlet />
    </View>
    <TabBar />
  </View>
);

const Navigation = () => (
  <BrowserRouter>
    <Routes>
      <Route element={<MainTabs />}>
        <Route path="/" element={<HomeScreen />} />
        <Route path="/explore" element={<ExploreScreen />} />
        <Route path="/sell" element={<SellScreen />} />
        <Route path="/auctions" element={<AuctionsScreen />} />
        <Route path="/profile" element={<ProfileScreen />} />
      </Route>
      <Route path="/login" element={<LoginScreen />} />
      <Route path="/otp" element={<OtpScreen />} />
      <Route path="/profile-setup" element={<ProfileSetupScreen />} />
      <Route path="/security" element={<SecurityScreen />} />
      <Route path="/page/:slug" element={<PageScreen />} />
      <Route path="/language" element={<LanguageRoute />} />
    </Routes>
  </BrowserRouter>
);

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
    // Re-check maintenance/update gates when the tab becomes visible again.
    const onVisible = () => document.visibilityState === 'visible' && dispatch(fetchBootstrap());
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [dispatch]);

  useEffect(() => {
    const b = bootstrap?.branding;
    document.title = b?.appName || 'App';
    // Tab icon comes from Admin › Settings › Branding (icon, else logo)
    const icon = b?.icon?.url || b?.logo?.url;
    if (icon) document.querySelector('link[rel="icon"]')?.setAttribute('href', icon);
  }, [bootstrap]);

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
  return <Navigation />;
};

export default function App() {
  if (missingEnv.length) return <ConfigErrorScreen missing={missingEnv} />;
  return (
    <Provider store={store}>
      <Gate />
    </Provider>
  );
}
