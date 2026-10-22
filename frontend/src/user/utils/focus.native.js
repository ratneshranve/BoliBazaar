import { useContext, useEffect } from 'react';
import { RouteContext } from '../router.native';

/**
 * Run `fn` when the screen is shown, and again each time the user comes back to it. On the phone a screen stays alive
 * under the one opened on top of it, so data loaded once on arrival would be stale after e.g. saving a new address.
 */
export const useOnFocus = (fn) => {
  const ctx = useContext(RouteContext);
  const navigation = ctx?.navigation;
  useEffect(() => {
    fn();
    if (!navigation) return undefined;
    let away = false;
    const left = navigation.addListener('blur', () => {
      away = true;
    });
    const back = navigation.addListener('focus', () => {
      if (!away) return;
      away = false;
      fn();
    });
    return () => {
      left();
      back();
    };
  }, [fn, navigation]);
};
