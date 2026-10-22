import { useEffect, useState } from 'react';
import { Keyboard } from 'react-native';

/** True while the on-screen keyboard is open, so a screen can drop less important parts and keep its main button in view. */
export const useKeyboardOpen = () => {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const shown = Keyboard.addListener('keyboardDidShow', () => setOpen(true));
    const hidden = Keyboard.addListener('keyboardDidHide', () => setOpen(false));
    return () => {
      shown.remove();
      hidden.remove();
    };
  }, []);
  return open;
};
