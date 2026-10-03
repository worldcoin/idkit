import { decodeUtf8Lossy, encodeUtf8 } from "./encoding";

/**
 * Build-scoped adapter for whatwg-url 14.2's internal encoding module. Its
 * parser and IDNA behavior remain unchanged; only host TextEncoder/Decoder
 * access is replaced. No globals are installed. Keep BOM bytes as U+FEFF,
 * matching the upstream decoder's ignoreBOM: true option.
 */
export const utf8Encode = encodeUtf8;
export const utf8DecodeWithoutBOM = decodeUtf8Lossy;
