export type SupportedLanguage = "en" | "es" | "th";

export interface LocalizationConfig {
  language?: SupportedLanguage;
}

export interface TranslationStrings {
  "All set!": string;
  "Your World ID is now connected": string;
  "Something went wrong": string;
  "Request cancelled": string;
  "You've cancelled the request in World App.": string;
  "Connection lost": string;
  "Please check your connection and try again.": string;
  "We couldn't complete your request. Please try again.": string;
  "Try Again": string;
  "Open World App": string;
  "QR Code copied": string;
  "Connect your World ID": string;
  "Use phone camera to scan the QR code": string;
  "Connecting...": string;
  "Please continue in app": string;
  "You will be redirected to the app, please return to this page once you're done": string;
  "Terms & Privacy": string;
}

export type TranslationKey = keyof TranslationStrings;

export type Translations = {
  [K in SupportedLanguage]?: TranslationStrings;
};
