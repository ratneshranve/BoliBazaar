import { NativeModules } from 'react-native';
import i18n from '../i18n';

/**
 * Voice search on the phone: the phone's own "Speak now" dialog (native module BBVoice, VoiceModule.kt).
 * Same calls as voice.js, so the search screens do not care which one they got.
 */
const Voice = NativeModules.BBVoice;

const locale = (lang) => (lang === 'en' ? 'en-IN' : lang === 'hi' ? 'hi-IN' : lang);

export const voiceSupported = () => Boolean(Voice);

/** Listen once. `onText(said)` gets what was said; `onError('service-not-allowed')` when the phone has no voice input. */
export const listenOnce = ({ lang, onText, onEnd, onError }) => {
  if (!Voice) {
    onError?.('service-not-allowed');
    onEnd?.();
    return () => {};
  }
  Voice.listen(locale(lang), i18n.t('search.voicePrompt'))
    .then((said) => said && onText?.(String(said).trim()))
    .catch((e) => onError?.(e?.code === 'NO_VOICE_APP' ? 'service-not-allowed' : e?.code || 'error'))
    .finally(() => onEnd?.());
  return () => {}; // the dialog is the phone's own; the user closes it
};
