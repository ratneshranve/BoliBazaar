import { createContext, useCallback, useContext, useEffect, useMemo } from 'react';
import { CommonActions, StackActions } from '@react-navigation/native';
import { TAB_ROOTS } from './tabRoots';

/**
 * The phone's stand-in for react-router-dom: the screens keep using useNavigate / useParams /
 * useSearchParams / useLocation / <Navigate>, and every address opens as a native screen
 * (Android back button and slide animation included). See Navigation.native.jsx.
 */
export const RouteContext = createContext(null);

const useRoute = () => {
  const ctx = useContext(RouteContext);
  if (!ctx) throw new Error('Router hook used outside a screen');
  return ctx;
};

const pathOnly = (p) => p.split('?')[0] || '/';

/** Open an address from anywhere (also used by push notification taps). */
export const goTo = (navigation, to, opts = {}) => {
  if (typeof to === 'number') {
    if (navigation.canGoBack()) navigation.goBack();
    else navigation.dispatch(CommonActions.reset({ index: 0, routes: [{ name: 'Page', params: { path: '/' } }] }));
    return;
  }
  const params = { path: to, state: opts.state };
  if (TAB_ROOTS.includes(pathOnly(to))) {
    // a tab: start that tab fresh, with Home underneath so Back returns home
    const stack = pathOnly(to) === '/' ? [{ name: 'Page', params }] : [{ name: 'Page', params: { path: '/' } }, { name: 'Page', params }];
    navigation.dispatch(CommonActions.reset({ index: stack.length - 1, routes: stack }));
    return;
  }
  navigation.dispatch(opts.replace ? StackActions.replace('Page', params) : StackActions.push('Page', params));
};

export const useNavigate = () => {
  const { navigation } = useRoute();
  return useCallback((to, opts) => goTo(navigation, to, opts), [navigation]);
};

export const useParams = () => useRoute().params;

export const useLocation = () => {
  const { pathname, search, state } = useRoute();
  return useMemo(() => ({ pathname, search, state: state ?? null }), [pathname, search, state]);
};

export const useSearchParams = () => {
  const { pathname, search, navigation } = useRoute();
  const sp = useMemo(() => new URLSearchParams(search), [search]);
  const set = useCallback(
    (next) => {
      const qs = new URLSearchParams(next instanceof URLSearchParams ? next : Object.entries(next).filter(([, v]) => v !== undefined && v !== null)).toString();
      navigation.setParams({ path: qs ? `${pathname}?${qs}` : pathname });
    },
    [pathname, navigation]
  );
  return [sp, set];
};

/** Redirect while rendering (same as react-router's <Navigate>). */
export const Navigate = ({ to, replace, state }) => {
  const navigate = useNavigate();
  useEffect(() => {
    navigate(to, { replace, state });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
};

/* Website-only parts of react-router; the phone builds its screens in Navigation.native.jsx. */
export const Outlet = () => null;
export const BrowserRouter = ({ children }) => children;
export const Routes = () => null;
export const Route = () => null;
