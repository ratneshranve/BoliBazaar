/** Speech-to-text from the browser (Chrome, Edge, Safari). Not every browser has it, so the mic is hidden when missing. */
const Recognition = typeof window !== 'undefined' ? window.SpeechRecognition || window.webkitSpeechRecognition : null;

export const voiceSupported = () => Boolean(Recognition);

/** Listen once. `onPartial(text)` while speaking, `onText(final)` gets what was said; returns a stop function. */
export const listenOnce = ({ lang, onStart, onPartial, onText, onEnd, onError }) => {
  if (!Recognition) return () => {};
  const r = new Recognition();
  r.lang = lang === 'hi' ? 'hi-IN' : lang === 'en' ? 'en-IN' : lang;
  r.interimResults = true;
  r.maxAlternatives = 1;
  r.onstart = () => onStart?.();
  r.onresult = (e) => {
    const last = e.results[e.results.length - 1];
    const said = last[0].transcript.trim();
    if (last.isFinal) onText?.(said);
    else onPartial?.(said);
  };
  r.onerror = (e) => {
    if (e.error !== 'no-speech' && e.error !== 'aborted') onError?.(e.error);
  };
  r.onend = () => onEnd?.();
  r.start();
  return () => r.stop(); // what was heard so far still arrives through onText
};
