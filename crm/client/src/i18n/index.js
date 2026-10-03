import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en/common.json';
import hi from './locales/hi/common.json';
import od from './locales/od/common.json';

// The languages of the interface. To add one: add its common.json under
// locales/<id>/, import it here and add an entry. `name` is the language's
// own name for itself (never translated); `locale` is what dates and numbers
// are formatted with ('' = the browser's own conventions).
export const LANGUAGES = [
  { id: 'en', name: 'English', locale: '', resources: en },
  { id: 'od', name: 'ଓଡ଼ିଆ', locale: 'or-IN', resources: od },
  { id: 'hi', name: 'हिन्दी', locale: 'hi-IN', resources: hi },
];

export const DEFAULT_LANGUAGE = 'en';
export const isLanguage = (id) => LANGUAGES.some((language) => language.id === id);
export const findLanguage = (id) => LANGUAGES.find((language) => language.id === id) ?? LANGUAGES.find((language) => language.id === DEFAULT_LANGUAGE);

i18n.use(initReactI18next).init({
  resources: Object.fromEntries(LANGUAGES.map((language) => [language.id, { common: language.resources }])),
  lng: DEFAULT_LANGUAGE,
  fallbackLng: DEFAULT_LANGUAGE,
  defaultNS: 'common',
  ns: ['common'],
  // React escapes what it renders.
  interpolation: { escapeValue: false },
  returnNull: false,
  // The resources are bundled, so the first render already has them.
  initAsync: false,
  react: { useSuspense: false },
});

export default i18n;
