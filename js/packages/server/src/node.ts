import { randomBytes } from "node:crypto";
import {
  signRequestWithEntropy,
  type RpSignature,
  type SignRequestParams,
} from "./lib/signing";

export {
  computeRpSignatureMessage,
  type RpSignature,
  type SignRequestParams,
} from "./lib/signing";
export { getSessionCommitment } from "./lib/session";

/** Node 18 CommonJS does not always expose global Web Crypto. */
export function signRequest(params: SignRequestParams): RpSignature {
  return signRequestWithEntropy(params, () =>
    globalThis.crypto?.getRandomValues
      ? globalThis.crypto.getRandomValues(new Uint8Array(32))
      : new Uint8Array(randomBytes(32)),
  );
}

export { Nullifier } from "./lib/nullifier";
