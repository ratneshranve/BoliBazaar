import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from '@locales/en.json';
import hi from '@locales/hi.json';
import { kv, KV } from '../services/storage';
import { ApiError } from '../api/client';

export const LANGUAGES = [
  { code: 'hi', nativeName: 'हिन्दी' },
  { code: 'en', nativeName: 'English' },
];

export const savedLanguage = () => kv.getString(KV.language);

i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, hi: { translation: hi } },
  lng: savedLanguage() ?? 'en',
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
  returnNull: false,
});

export const setLanguage = async (code) => {
  kv.set(KV.language, code);
  document.documentElement.lang = code;
  await i18n.changeLanguage(code);
};

export const errorText = (err) => {
  const code = err instanceof ApiError ? err.code : 'UNKNOWN_ERROR';
  const key = `errors.${code}`;
  return i18n.exists(key) ? i18n.t(key) : err instanceof ApiError ? err.message : i18n.t('errors.UNKNOWN_ERROR');
};

export default i18n;
