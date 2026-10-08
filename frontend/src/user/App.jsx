import { useEffect, useState } from 'react';
import { BrowserRouter, Outlet, Route, Routes, useNavigate } from 'react-router-dom';
import { Provider } from 'react-redux';
import { ActivityIndicator, View } from './components/primitives';
import { missingEnv } from './config/env';
import { store, useAppDispatch, useAppSelector, fetchBootstrap, restoreSession, maintenanceDetected, sessionExpired, setLocation, fetchUnread, notificationArrived } from './store';
import { connectRealtime, disconnectRealtime, onRealtime } from './services/realtime';
import { setClientHooks } from './api/client';
import i18n, { savedLanguage, setLanguage, ensureLanguage } from './i18n';
import { ConfigErrorScreen, LanguageScreen, MaintenanceScreen, OfflineScreen, UpdateScreen } from './screens/GateScreens';
import { LoginScreen, OtpScreen, ProfileSetupScreen } from './screens/AuthScreens';
import { ProfileScreen } from './screens/TabScreens';
import { AuctionsScreen, AuctionDetailScreen, MyAuctionsScreen, DealsScreen, DealScreen } from './screens/AuctionScreens';
import { SellScreen } from './screens/SellScreen';
import { SearchScreen } from './screens/SearchScreen';
import { ListingDetailScreen } from './screens/ListingDetailScreen';
import { MyListingsScreen, FavouritesScreen } from './screens/MyListingsScreen';
import { HomeScreen } from './screens/HomeScreen';
import { ExploreScreen } from './screens/ExploreScreen';
import { LocationScreen } from './screens/LocationScreen';
import { SecurityScreen } from './screens/SecurityScreen';
import { PageScreen } from './screens/PageScreen';
import { NotificationsScreen } from './screens/NotificationsScreen';
import { LeadsScreen } from './screens/LeadsScreen';
import { ChatsScreen, ChatScreen } from './screens/ChatScreens';
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
    const off = [
      onRealtime('notification:new', () => dispatch(notificationArrived())),
      onRealtime('chat:message', () => dispatch(fetchUnread())),
      onRealtime('chat:read', () => dispatch(fetchUnread())),
    ];
    return () => off.forEach((f) => f());
  }, [authed, dispatch]);
  return null;
};

const Navigation = () => (
  <BrowserRouter>
    <RealtimeBridge />
    <Routes>
      <Route element={<MainTabs />}>
        <Route path="/" element={<HomeScreen />} />
        <Route path="/explore" element={<ExploreScreen />} />
        <Route path="/explore/:id" element={<ExploreScreen />} />
        <Route path="/sell" element={<SellScreen />} />
        <Route path="/sell/:id" element={<SellScreen />} />
        <Route path="/auctions" element={<AuctionsScreen />} />
        <Route path="/profile" element={<ProfileScreen />} />
      </Route>
      <Route path="/login" element={<LoginScreen />} />
      <Route path="/otp" element={<OtpScreen />} />
      <Route path="/profile-setup" element={<ProfileSetupScreen />} />
      <Route path="/security" element={<SecurityScreen />} />
      <Route path="/page/:slug" element={<PageScreen />} />
      <Route path="/language" element={<LanguageRoute />} />
      <Route path="/location" element={<LocationScreen />} />
      <Route path="/search" element={<SearchScreen />} />
      <Route path="/listing/:id" element={<ListingDetailScreen />} />
      <Route path="/my-listings" element={<MyListingsScreen />} />
      <Route path="/favourites" element={<FavouritesScreen />} />
      <Route path="/notifications" element={<NotificationsScreen />} />
      <Route path="/chats" element={<ChatsScreen />} />
      <Route path="/chat/:id" element={<ChatScreen />} />
      <Route path="/auctions/:id" element={<AuctionDetailScreen />} />
      <Route path="/auctions/:auctionId/edit" element={<SellScreen />} />
      <Route path="/my-auctions" element={<MyAuctionsScreen />} />
      <Route path="/deals" element={<DealsScreen />} />
      <Route path="/deals/:id" element={<DealScreen />} />
      <Route path="/leads/received" element={<LeadsScreen initial="received" />} />
      <Route path="/leads/sent" element={<LeadsScreen initial="sent" />} />
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
