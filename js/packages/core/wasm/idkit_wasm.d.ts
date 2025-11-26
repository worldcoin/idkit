/* tslint:disable */
/* eslint-disable */
/**
 * Encodes data to base64
 */
export function base64Encode(data: Uint8Array): string;
/**
 * Decodes base64 data
 *
 * # Errors
 *
 * Returns an error if decoding fails
 */
export function base64Decode(data: string): Uint8Array;
/**
 * Hashes a signal string using Keccak256
 */
export function hashSignal(signal: string): string;
/**
 * Hashes raw bytes using Keccak256
 */
export function hashSignalBytes(bytes: Uint8Array): string;

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
export class IDKitProof {
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
export class IDKitRequest {
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
  static withBytes(credential_type: any, signal_bytes: Uint8Array): IDKitRequest;
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
/**
 * World ID verification session
 *
 * Manages the verification flow with World App via the bridge.
 */
export class Session {
  free(): void;
  [Symbol.dispose](): void;
  /**
   * Returns the request ID for this session
   *
   * # Errors
   *
   * Returns an error if the session has been closed
   */
  requestId(): string;
  /**
   * Returns the connect URL for World App
   *
   * This URL should be displayed as a QR code for users to scan with World App.
   *
   * # Errors
   *
   * Returns an error if the session has been closed
   */
  connectUrl(): string;
  /**
   * Polls the bridge for the current status (non-blocking)
   *
   * Returns a status object with type:
   * - `"waiting_for_connection"` - Waiting for World App to retrieve the request
   * - `"awaiting_confirmation"` - World App has retrieved the request, waiting for user
   * - `"confirmed"` - User confirmed and provided a proof
   * - `"failed"` - Request has failed
   *
   * # Errors
   *
   * Returns an error if the request fails or the response is invalid
   */
  pollForStatus(): Promise<any>;
  /**
   * Creates a new session from explicit requests and optional constraints
   *
   * # Arguments
   * * `app_id` - Application ID from the Developer Portal
   * * `action` - Action identifier
   * * `requests` - Array of objects: { credential_type, signal?, signal_bytes?, face_auth? }
   * * `constraints` - Optional constraints JSON matching Rust `Constraints` (any/all of credential types)
   * * `action_description` - Optional user-facing description
   * * `bridge_url` - Optional custom bridge URL
   */
  static createWithRequests(app_id: string, action: string, requests: any, constraints?: any | null, action_description?: string | null, bridge_url?: string | null): Promise<any>;
  /**
   * Creates a new session from a verification level
   *
   * This is a convenience method that maps a verification level (like `"device"` or `"orb"`)
   * to the appropriate set of credential requests and constraints.
   *
   * # Errors
   *
   * Returns an error if the session cannot be created or the request fails
   *
   * # Arguments
   *
   * * `app_id` - Application ID from the Developer Portal (e.g., `"app_staging_xxxxx"`)
   * * `action` - Action identifier
   * * `verification_level` - Verification level as string (`"orb"`, `"device"`, etc.)
   * * `signal` - Optional signal string for cryptographic binding
   */
  constructor(app_id: string, action: string, verification_level: any, signal?: string | null);
}

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
  readonly memory: WebAssembly.Memory;
  readonly __wbg_bridgeencryption_free: (a: number, b: number) => void;
  readonly __wbg_idkitproof_free: (a: number, b: number) => void;
  readonly __wbg_idkitrequest_free: (a: number, b: number) => void;
  readonly __wbg_session_free: (a: number, b: number) => void;
  readonly base64Decode: (a: number, b: number, c: number) => void;
  readonly base64Encode: (a: number, b: number, c: number) => void;
  readonly bridgeencryption_decrypt: (a: number, b: number, c: number, d: number) => void;
  readonly bridgeencryption_encrypt: (a: number, b: number, c: number, d: number) => void;
  readonly bridgeencryption_keyBase64: (a: number, b: number) => void;
  readonly bridgeencryption_new: (a: number) => void;
  readonly bridgeencryption_nonceBase64: (a: number, b: number) => void;
  readonly hashSignal: (a: number, b: number, c: number) => void;
  readonly idkitproof_new: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number) => void;
  readonly idkitproof_toJSON: (a: number, b: number) => void;
  readonly idkitrequest_getSignalBytes: (a: number, b: number) => void;
  readonly idkitrequest_new: (a: number, b: number, c: number, d: number) => void;
  readonly idkitrequest_toJSON: (a: number, b: number) => void;
  readonly idkitrequest_withBytes: (a: number, b: number, c: number, d: number) => void;
  readonly session_connectUrl: (a: number, b: number) => void;
  readonly session_createWithRequests: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number) => number;
  readonly session_new: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => number;
  readonly session_pollForStatus: (a: number) => number;
  readonly session_requestId: (a: number, b: number) => void;
  readonly hashSignalBytes: (a: number, b: number, c: number) => void;
  readonly __wasm_bindgen_func_elem_508: (a: number, b: number, c: number) => void;
  readonly __wasm_bindgen_func_elem_507: (a: number, b: number) => void;
  readonly __wasm_bindgen_func_elem_452: (a: number, b: number) => void;
  readonly __wasm_bindgen_func_elem_451: (a: number, b: number) => void;
  readonly __wasm_bindgen_func_elem_1086: (a: number, b: number, c: number, d: number) => void;
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
