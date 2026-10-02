import { afterEach, describe, expect, it, vi } from "vitest";
import {
  computeRpSignatureMessage,
  hashToField,
  signRequest,
} from "../lib/signing";
import fixtures from "./fixtures/rust-signing.json";

const bytes = (hex: string) =>
  new Uint8Array(Buffer.from(hex.replace(/^0x/, ""), "hex"));
const hex = (value: Uint8Array) => Buffer.from(value).toString("hex");

type Fixture = {
  name: string;
  request: {
    op: string;
    input_hex?: string;
    nonce?: string;
    created_at?: number;
    expires_at?: number;
    action?: string;
    key_hex?: string;
  };
  random_bytes_hex?: string;
  response: { ok: boolean; value: unknown };
};

// Ordinary JS tests consume checked-in native outputs. test:conformance also
// executes each request against current Rust so stale fixtures cannot mask drift.
// Regenerate deliberately with: node scripts/update-conformance-fixtures.mjs.
describe("native Rust signing and hash compatibility", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it.each(fixtures.cases as Fixture[])(
    "$name",
    ({ request, response, random_bytes_hex }) => {
      expect(response.ok).toBe(true);
      if (request.op === "hash_to_field") {
        expect(`0x${hex(hashToField(bytes(request.input_hex!)))}`).toBe(
          response.value,
        );
        return;
      }
      if (request.op === "signature_message") {
        const result = computeRpSignatureMessage(
          bytes(request.nonce!),
          request.created_at!,
          request.expires_at!,
          request.action,
        );
        expect({ message_hex: hex(result) }).toEqual(response.value);
        return;
      }
      expect(request.op).toBe("sign");
      const entropy = bytes(random_bytes_hex!);
      vi.spyOn(Date, "now").mockReturnValue(request.created_at! * 1000);
      vi.stubGlobal("crypto", {
        getRandomValues: (target: Uint8Array) => {
          target.set(entropy);
          return target;
        },
      });
      const result = signRequest({
        signingKeyHex: request.key_hex!,
        ttl: request.expires_at! - request.created_at!,
        action: request.action,
      });
      expect({
        sig: result.sig,
        nonce: result.nonce,
        created_at: result.createdAt,
        expires_at: result.expiresAt,
      }).toEqual(response.value);
    },
  );
});
