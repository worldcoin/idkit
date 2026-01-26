import { WasmModule } from "./wasm";

/**
 * Encodes an ArrayBuffer to base64 string
 * @param buffer - ArrayBuffer to encode
 * @returns Base64 encoded string
 */
export const buffer_encode = (buffer: ArrayBuffer): string => {
  return WasmModule.base64Encode(new Uint8Array(buffer));
};

/**
 * Decodes a base64 string to ArrayBuffer
 * @param encoded - Base64 encoded string
 * @returns Decoded ArrayBuffer
 */
export const buffer_decode = (encoded: string): ArrayBuffer => {
  const uint8Array = WasmModule.base64Decode(encoded);
  // Create a new ArrayBuffer and copy the data
  const buffer = new ArrayBuffer(uint8Array.length);
  const view = new Uint8Array(buffer);
  view.set(uint8Array);
  return buffer;
};
