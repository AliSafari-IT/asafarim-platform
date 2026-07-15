export {
  LOCALES,
  BASE_LANGUAGES,
  DEFAULT_LOCALE,
  LOCALE_COOKIE,
  toBaseLanguage,
  isLocale,
  type Locale,
  type BaseLanguage,
  type Dict,
  type Dictionaries,
} from "./types";

export {
  readLocaleFromCookieHeader,
  readLocaleFromDocument,
  writeLocaleCookie,
} from "./cookie";

export { format } from "./format";

export {
  I18nProvider,
  useTranslation,
  useOptionalLocale,
  type I18nContextValue,
  type I18nProviderProps,
  type TranslateFn,
} from "./provider";

export {
  baseDictionaries,
  mergeDictionaries,
  en,
  nl,
  fr,
  de,
} from "./dictionaries";
