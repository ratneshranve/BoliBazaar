import { useEffect } from 'react';

/**
 * Run `fn` when the screen is shown, and again each time the user comes back to it (phone: focus.native.js).
 * Website: screens are rebuilt on every visit, so running on arrival is enough.
 */
export const useOnFocus = (fn) => {
  useEffect(() => {
    fn();
  }, [fn]);
};
