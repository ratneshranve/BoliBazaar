/** Speech-to-text from the browser (Chrome, Edge, Safari). Not every browser has it, so the mic is hidden when missing. */
const Recognition = typeof window !== 'undefined' ? window.SpeechRecognition || window.webkitSpeechRecognition : null;

export const voiceSupported = () => Boolean(Recognition);

/** Listen once. `onText(final)` gets what was said; returns a stop function. */
export const listenOnce = ({ lang, onText, onEnd, onError }) => {
  if (!Recognition) return () => {};
  const r = new Recognition();
  r.lang = lang === 'hi' ? 'hi-IN' : lang === 'en' ? 'en-IN' : lang;
  r.interimResults = false;
  r.maxAlternatives = 1;
  r.onresult = (e) => onText?.(e.results[0][0].transcript.trim());
  r.onerror = (e) => onError?.(e.error);
  r.onend = () => onEnd?.();
  r.start();
  return () => r.abort();
};
