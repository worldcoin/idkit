/* tslint:disable */
/* eslint-disable */
/**
 * Hashes a signal string using Keccak256
 */
export function hashSignal(signal: string): string;
/**
 * Decodes base64 data
 *
 * # Errors
 *
 * Returns an error if decoding fails
 */
export function base64Decode(data: string): Uint8Array;
/**
 * Encodes data to base64
 */
export function base64Encode(data: Uint8Array): string;

export enum Credential {
    Orb = "orb",
    Face = "face",
    SecureDocument = "secure_document",
    Document = "document",
    Device = "device"
}


/**
 * Bridge encryption for secure communication between client and bridge
 */
export class BridgeEncryption {
  free(): void;
  [Symbol.dispose](): void;
  /**
   * Returns the key as a base64-encoded string
   */
  keyBase64(): string;
  /**
   * Returns the nonce as a base64-encoded string
   */
  nonceBase64(): string;
  /**
   * Creates a new `BridgeEncryption` instance with randomly generated key and nonce
   *
   * # Errors
   *
   * Returns an error if key generation fails
   */
  constructor();
  /**
   * Decrypts a base64-encoded ciphertext using AES-256-GCM
   *
   * # Errors
   *
   * Returns an error if decryption fails or the output is not valid UTF-8
   */
  decrypt(ciphertext_base64: string): string;
  /**
   * Encrypts a plaintext string using AES-256-GCM and returns base64
   *
   * # Errors
   *
   * Returns an error if encryption fails
   */
  encrypt(plaintext: string): string;
}
export class Proof {
  free(): void;
  [Symbol.dispose](): void;
  /**
   * Creates a new proof
   *
   * # Errors
   *
   * Returns an error if the verification level cannot be deserialized
   */
  constructor(proof: string, merkle_root: string, nullifier_hash: string, verification_level: any);
  /**
   * Converts the proof to JSON
   *
   * # Errors
   *
   * Returns an error if serialization fails
   */
  toJSON(): any;
}
export class Request {
  free(): void;
  [Symbol.dispose](): void;
  /**
   * Creates a new request with ABI-encoded bytes for the signal
   *
   * This is useful for on-chain use cases where RPs need ABI-encoded signals
   * according to Solidity encoding rules.
   *
   * # Errors
   *
   * Returns an error if the credential type cannot be deserialized
   */
  static withBytes(credential_type: any, signal_bytes: Uint8Array): Request;
  /**
   * Gets the signal as raw bytes
   */
  getSignalBytes(): Uint8Array | undefined;
  /**
   * Creates a new request
   *
   * # Errors
   *
   * Returns an error if the credential type cannot be deserialized
   *
   * # Arguments
   * * `credential_type` - The type of credential to request
   * * `signal` - Optional signal string. Pass `null` or `undefined` for no signal.
   */
  constructor(credential_type: any, signal?: string | null);
  /**
   * Converts the request to JSON
   *
   * # Errors
   *
   * Returns an error if serialization fails
   */
  toJSON(): any;
}

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
  readonly memory: WebAssembly.Memory;
  readonly __wbg_bridgeencryption_free: (a: number, b: number) => void;
  readonly __wbg_proof_free: (a: number, b: number) => void;
  readonly __wbg_request_free: (a: number, b: number) => void;
  readonly base64Decode: (a: number, b: number, c: number) => void;
  readonly base64Encode: (a: number, b: number, c: number) => void;
  readonly bridgeencryption_decrypt: (a: number, b: number, c: number, d: number) => void;
  readonly bridgeencryption_encrypt: (a: number, b: number, c: number, d: number) => void;
  readonly bridgeencryption_keyBase64: (a: number, b: number) => void;
  readonly bridgeencryption_new: (a: number) => void;
  readonly bridgeencryption_nonceBase64: (a: number, b: number) => void;
  readonly hashSignal: (a: number, b: number, c: number) => void;
  readonly proof_new: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number) => void;
  readonly proof_toJSON: (a: number, b: number) => void;
  readonly request_getSignalBytes: (a: number, b: number) => void;
  readonly request_new: (a: number, b: number, c: number, d: number) => void;
  readonly request_toJSON: (a: number, b: number) => void;
  readonly request_withBytes: (a: number, b: number, c: number, d: number) => void;
  readonly __wbindgen_export: (a: number, b: number) => number;
  readonly __wbindgen_export2: (a: number, b: number, c: number, d: number) => number;
  readonly __wbindgen_export3: (a: number) => void;
  readonly __wbindgen_add_to_stack_pointer: (a: number) => number;
  readonly __wbindgen_export4: (a: number, b: number, c: number) => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;
/**
* Instantiates the given `module`, which can either be bytes or
* a precompiled `WebAssembly.Module`.
*
* @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
*
* @returns {InitOutput}
*/
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
* If `module_or_path` is {RequestInfo} or {URL}, makes a request and
* for everything else, calls `WebAssembly.instantiate` directly.
*
* @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
*
* @returns {Promise<InitOutput>}
*/
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
