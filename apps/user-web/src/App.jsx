import { useEffect, useState } from 'react';
import { BrowserRouter, Outlet, Route, Routes } from 'react-router-dom';
import { Provider } from 'react-redux';
import { ActivityIndicator, View } from './components/primitives';
import { missingEnv } from './config/env';
import { store, useAppDispatch, useAppSelector, fetchBootstrap, restoreSession, maintenanceDetected, sessionExpired } from './store';
import { setClientHooks } from './api/client';
import { savedLanguage } from './i18n';
import { ConfigErrorScreen, LanguageScreen, MaintenanceScreen, OfflineScreen, UpdateScreen } from './screens/GateScreens';
import { LoginScreen, OtpScreen, ProfileSetupScreen } from './screens/AuthScreens';
import { HomeScreen, ExploreScreen, SellScreen, AuctionsScreen, ProfileScreen } from './screens/TabScreens';
import { SecurityScreen } from './screens/SecurityScreen';
import { TabBar } from './components/TabBar';
import { colors } from '@theme/tokens';

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
    </Routes>
  </BrowserRouter>
);

const Gate = () => {
  const dispatch = useAppDispatch();
  const { status, maintenance, bootstrap, updateDismissed } = useAppSelector((s) => s.app);
  const session = useAppSelector((s) => s.session.status);
  const [languageChosen, setLanguageChosen] = useState(Boolean(savedLanguage()));

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
    const name = bootstrap?.branding?.appName;
    document.title = name || 'App';
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
  if (!languageChosen) return <LanguageScreen onDone={() => setLanguageChosen(true)} />;
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
