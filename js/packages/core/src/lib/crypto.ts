import { encodeUtf8 } from "./encoding";
import { gcm } from "@noble/ciphers/aes";
import { hkdf } from "@noble/hashes/hkdf";
import { sha256 } from "@noble/hashes/sha2";
import { bytesToHex } from "@noble/hashes/utils";
import { base64 } from "@scure/base";
import { randomBytes } from "./runtime";

export const encodeBase64 = (bytes: Uint8Array): string => base64.encode(bytes);
export const decodeBase64 = (value: string): Uint8Array => base64.decode(value);

function validateAes(key: Uint8Array, iv: Uint8Array): void {
  if (key.length !== 32) throw new Error("Key must be 32 bytes");
  if (iv.length !== 12) throw new Error("Nonce must be 12 bytes");
}

export function encrypt(
  key: Uint8Array,
  iv: Uint8Array,
  plaintext: Uint8Array,
): Uint8Array {
  validateAes(key, iv);
  return gcm(key, iv).encrypt(plaintext);
}

export function decrypt(
  key: Uint8Array,
  iv: Uint8Array,
  ciphertext: Uint8Array,
): Uint8Array {
  validateAes(key, iv);
  return gcm(key, iv).decrypt(ciphertext);
}

const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const WEIGHTS = [1, 3, 5, 7, 9];

export function generateInviteCode(entropy = randomBytes(5)): string {
  if (entropy.length !== 5)
    throw new Error("Invite code requires 5 random bytes");
  let sum = 0;
  let code = "";
  for (let i = 0; i < 5; i++) {
    const value = entropy[i] % 32;
    code += CROCKFORD[value];
    sum += value * WEIGHTS[i];
  }
  return code + CROCKFORD[sum % 32];
}

export function parseInviteCode(input: string): string {
  const code = input
    .replace(/[\t\n\f\r _-]/g, "")
    .replace(/[a-z]/g, (c) => c.toUpperCase())
    .replace(/[IL]/g, "1")
    .replace(/O/g, "0");
  if (encodeUtf8(code).length !== 6) throw new Error("WrongLength");
  const digits = Array.from(code, (c) => CROCKFORD.indexOf(c));
  if (digits.some((n) => n < 0)) throw new Error("InvalidChar");
  const sum = digits
    .slice(0, 5)
    .reduce((n, value, i) => n + value * WEIGHTS[i], 0);
  if (sum % 32 !== digits[5]) throw new Error("BadCheckDigit");
  return code;
}

export function deriveInviteCode(code: string): {
  index: string;
  key: Uint8Array;
} {
  const input = encodeUtf8(code);
  const derive = (info: string) =>
    hkdf(sha256, input, undefined, encodeUtf8(info), 32);
  return { index: bytesToHex(derive("dx")), key: derive("key") };
}
