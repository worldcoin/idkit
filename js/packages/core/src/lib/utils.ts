import { encodeBase64, decodeBase64 } from "./crypto";

export const buffer_encode = (buffer: ArrayBuffer): string =>
  encodeBase64(new Uint8Array(buffer));
export const buffer_decode = (encoded: string): ArrayBuffer => {
  const bytes = decodeBase64(encoded);
  const buffer = new ArrayBuffer(bytes.length);
  new Uint8Array(buffer).set(bytes);
  return buffer;
};
