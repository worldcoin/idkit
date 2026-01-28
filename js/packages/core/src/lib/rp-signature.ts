import { isServerEnvironment } from "./platform";
import { WasmModule } from "./wasm";
import type { RpSignature } from "../../wasm/idkit_wasm";

/**
 * Signs an RP request for World ID proof verification
 *
 * **Backend-only**: This function should ONLY be used in Node.js/server environments.
 * Never use this in browser/client-side code as it requires access to your signing key.
 *
 * This function generates a cryptographic signature that authenticates your proof request.
 * The returned signature, nonce, and timestamps should be passed as `rp_context` to the client.
 *
 * @param action - The action tied to the proof request
 * @param signingKeyHex - The ECDSA private key as hex (0x-prefixed or not, 32 bytes)
 * @param ttlSeconds - Optional time-to-live in seconds (defaults to 300 = 5 minutes)
 * @returns RpSignature object with sig, nonce, createdAt, expiresAt to use as rp_context
 * @throws Error if called in non-Node.js environment or if parameters are invalid
 *
 * @example
 * ```typescript
 * import { signRequest } from '@worldcoin/idkit-core'
 *
 * const signingKey = process.env.RP_SIGNING_KEY // Load from secure env var
 * const signature = signRequest('my-action', signingKey)
 * console.log(signature.sig, signature.nonce, signature.createdAt, signature.expiresAt)
 * ```
 */
export function signRequest(
  action: string,
  signingKeyHex: string,
  ttlSeconds?: number,
): RpSignature {
  if (!isServerEnvironment()) {
    throw new Error(
      "signRequest can only be used in Node.js environments. " +
        "This function requires access to signing keys and should never be called from browser/client-side code.",
    );
  }

  // Convert number to BigInt if TTL is provided
  const ttlBigInt = ttlSeconds !== undefined ? BigInt(ttlSeconds) : undefined;

  return WasmModule.signRequest(action, signingKeyHex, ttlBigInt);
}

export type { RpSignature } from "../../wasm/idkit_wasm";
