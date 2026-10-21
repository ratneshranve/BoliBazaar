import { DeviceEventEmitter, NativeModules, PermissionsAndroid } from 'react-native';

/**
 * Voice search on the phone, inside the app: the phone's speech recogniser (native module BBVoice, VoiceModule.kt)
 * with no pop-up. Same calls as voice.js, so the search screens do not care which one they got.
 */
const Voice = NativeModules.BBVoice;

const locale = (lang) => (lang === 'en' ? 'en-IN' : lang === 'hi' ? 'hi-IN' : lang);

export const voiceSupported = () => Boolean(Voice);

/**
 * Listen once. `onStart()` when the mic is ready, `onPartial(text)` while the user speaks, `onText(said)` with the final words,
 * `onEnd()` always at the end, `onError(code)` for 'not-allowed' | 'service-not-allowed' | 'network' | 'language-not-supported'.
 * Returns a function that stops listening (the words heard so far still arrive through onText).
 */
export const listenOnce = ({ lang, onStart, onPartial, onText, onEnd, onError }) => {
  if (!Voice) {
    onError?.('service-not-allowed');
    onEnd?.();
    return () => {};
  }
  let sub = null;
  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    sub?.remove();
    onEnd?.();
  };
  (async () => {
    const asked = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);
    if (asked !== PermissionsAndroid.RESULTS.GRANTED) {
      onError?.('not-allowed');
      finish();
      return;
    }
    if (finished) return; // stopped while the permission box was open
    sub = DeviceEventEmitter.addListener('bbVoice', (e) => {
      if (e.type === 'start') onStart?.();
      else if (e.type === 'partial') onPartial?.(e.text);
      else if (e.type === 'result') {
        if (e.text) onText?.(String(e.text).trim());
        finish();
      } else if (e.type === 'error') {
        if (e.code !== 'no-speech' && e.code !== 'cancelled') onError?.(e.code);
        finish();
      }
    });
    Voice.start(locale(lang));
  })();
  return () => {
    if (sub) Voice.stop();
    else finish();
  };
};
