import { getTranslations } from "./localization";
import type { TranslationStrings } from "./types";

const getLang = (): TranslationStrings | undefined => {
  return getTranslations();
};

type HasPlaceholder<T extends string> = T extends `${string}:${string}`
  ? true
  : false;

type GetPlaceholderName<T extends string> = T extends `:${infer Name}`
  ? Name extends `${infer Word}${" " | "," | ":" | "!" | "?" | "."}${string}`
    ? Word
    : Name
  : never;

type GetAllPlaceholders<T extends string> = T extends `${string}:${infer After}`
  ? GetAllPlaceholders<After> | GetPlaceholderName<`:${After}`>
  : never;

type TranslationParams<T extends string> =
  GetAllPlaceholders<T> extends never
    ? never
    : { [K in GetAllPlaceholders<T>]: string };

const replaceParams = (
  str: string,
  params?: Record<string, string>,
): string => {
  if (!params) return str;

  let result = str;
  for (const [key, value] of Object.entries(params)) {
    result = result.replace(`:${key}`, value);
  }
  return result;
};

export function __<T extends string>(
  str: T,
  ...args: HasPlaceholder<T> extends true ? [params: TranslationParams<T>] : []
): string {
  const [params] = args;

  if (typeof navigator === "undefined" && typeof window === "undefined") {
    return replaceParams(str, params);
  }

  const translated = getLang()?.[str as keyof TranslationStrings] ?? str;
  return replaceParams(translated, params);
}

export {
  setLocalizationConfig,
  getLocalizationConfig,
  getCurrentLanguage,
} from "./localization";
export type { SupportedLanguage, TranslationStrings } from "./types";
