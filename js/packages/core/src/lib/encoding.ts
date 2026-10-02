import { encode, decode } from "@stablelib/utf8";

/** WHATWG TextEncoder semantics, including replacement of unpaired UTF-16 surrogates. */
export function normalizeUtf16(value: string): string {
  let normalized = "";
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        normalized += value[i] + value[++i];
      } else normalized += "\ufffd";
    } else normalized += code >= 0xdc00 && code <= 0xdfff ? "\ufffd" : value[i];
  }
  return normalized;
}

export const encodeUtf8 = (value: string): Uint8Array =>
  encode(normalizeUtf16(value));

/** Strict UTF-8 for protocol JSON. No platform TextDecoder is needed. */
export function decodeUtf8(value: Uint8Array): string {
  const text = decode(value);
  // stablelib's decoder accepts some noncanonical lead bytes; the Rust wire
  // parser does not. Re-encoding must reproduce every original byte exactly.
  const canonical = encode(text);
  if (
    canonical.length !== value.length ||
    canonical.some((byte, i) => byte !== value[i])
  ) {
    throw new Error("Invalid UTF-8");
  }
  return text;
}

/** Replacement decoding for diagnostics and URL parsing, preserving an initial BOM. */
export function decodeUtf8Lossy(bytes: Uint8Array): string {
  let text = "";
  for (let i = 0; i < bytes.length; ) {
    const lead = bytes[i];
    if (lead < 0x80) {
      text += String.fromCharCode(lead);
      i++;
      continue;
    }
    const size =
      lead >= 0xc2 && lead <= 0xdf
        ? 2
        : lead >= 0xe0 && lead <= 0xef
          ? 3
          : lead >= 0xf0 && lead <= 0xf4
            ? 4
            : 0;
    if (!size) {
      text += "\ufffd";
      i++;
      continue;
    }
    let code = lead & (0x7f >> size);
    let consumed = 1;
    for (; consumed < size; consumed++) {
      const byte = bytes[i + consumed];
      const min =
        consumed === 1 && lead === 0xe0
          ? 0xa0
          : consumed === 1 && lead === 0xf0
            ? 0x90
            : 0x80;
      const max =
        consumed === 1 && lead === 0xed
          ? 0x9f
          : consumed === 1 && lead === 0xf4
            ? 0x8f
            : 0xbf;
      if (byte === undefined || byte < min || byte > max) break;
      code = (code << 6) | (byte & 0x3f);
    }
    text += consumed === size ? String.fromCodePoint(code) : "\ufffd";
    i += consumed;
  }
  return text;
}
