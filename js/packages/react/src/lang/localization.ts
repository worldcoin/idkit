import { translations } from "./translations";
import type { LocalizationConfig, SupportedLanguage, TranslationStrings } from "./types";

let currentConfig: LocalizationConfig = {};

export const setLocalizationConfig = (config: LocalizationConfig): void => {
  currentConfig = config;
};

export const getLocalizationConfig = (): LocalizationConfig => currentConfig;

const detectBrowserLanguage = (): SupportedLanguage | undefined => {
  if (typeof navigator === "undefined") return undefined;

  for (const lang of navigator.languages) {
    const [language] = lang.split("-");
    const normalizedLang = language.toLowerCase() as SupportedLanguage;
    if (normalizedLang in translations) {
      return normalizedLang;
    }
  }

  return undefined;
};

export const getCurrentLanguage = (): SupportedLanguage => {
  const config = getLocalizationConfig();

  if (config.language && config.language in translations) {
    return config.language;
  }

  const browserLang = detectBrowserLanguage();
  if (browserLang) {
    return browserLang;
  }

  return "en";
};

export const getTranslations = (): TranslationStrings | undefined => {
  const currentLang = getCurrentLanguage();
  return translations[currentLang];
};
