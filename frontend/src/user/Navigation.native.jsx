import { useEffect, useMemo } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { KeyboardAvoidingView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { routes } from './routes';
import { RouteContext, goTo } from './router.native';
import { colors } from '@theme/tokens';
import { useAppSelector, store } from './store';
import { startPushListeners } from './services/push';

/**
 * Phone: every address from routes.jsx opens as a native screen ("Page" with params.path), so the
 * screens, their links and their URLs are exactly the website's.
 */
const Stack = createNativeStackNavigator();
export { navRef } from './navRef';
import { navRef } from './navRef';

/** Open an address from outside a screen (push notification taps). */
export const openPath = (path) => {
  if (navRef.isReady()) goTo(navRef, path);
};

const compiled = routes.map((r) => {
  const keys = [];
  const re = new RegExp(`^${r.path.replace(/:[^/]+/g, (m) => (keys.push(m.slice(1)), '([^/]+)'))}/?$`);
  return { ...r, re, keys };
});

const match = (pathname) => {
  for (const r of compiled) {
    const m = r.re.exec(pathname);
    if (m) return { route: r, params: Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])])) };
  }
  return null;
};

const NotFound = ({ navigation }) => {
  useEffect(() => goTo(navigation, '/'), [navigation]);
  return null;
};

const makePage = (TabsLayout) =>
  function Page({ route, navigation }) {
    const { path = '/', state } = route.params || {};
    const [pathname, search = ''] = path.split('?');
    const m = match(pathname);
    const ctx = useMemo(() => ({ pathname, search: search ? `?${search}` : '', state, params: m?.params || {}, navigation }), [pathname, search, state, m?.params, navigation]); // eslint-disable-line react-hooks/exhaustive-deps
    if (!m) return <NotFound navigation={navigation} />;
    return (
      <RouteContext.Provider value={ctx}>
        <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: colors.white }}>
          {/* the app draws edge to edge, so the screen makes room for the keyboard itself */}
          <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
            {m.route.tabs ? <TabsLayout>{m.route.element}</TabsLayout> : m.route.element}
          </KeyboardAvoidingView>
        </SafeAreaView>
      </RouteContext.Provider>
    );
  };

/** While logged in: show pushes and open the screen a tapped notification points to. */
const PushBridge = () => {
  const authed = useAppSelector((st) => st.session.status === 'authenticated');
  useEffect(() => (authed ? startPushListeners(openPath, () => store.getState().session.status === 'authenticated') : undefined), [authed]);
  return null;
};

let Page = null;

export const Navigation = ({ TabsLayout, children }) => {
  Page ??= makePage(TabsLayout);
  return (
    <NavigationContainer ref={navRef}>
      {children}
      <PushBridge />
      <Stack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right', contentStyle: { backgroundColor: colors.white } }}>
        <Stack.Screen name="Page" component={Page} initialParams={{ path: '/' }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
};
