import { writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { afterEach, describe, it, expect, vi } from "vitest";
import fc from "fast-check";
import {
  fixedCases,
  config,
  context,
  response,
  item,
  NOW,
  REQUEST_ID,
  type OracleCase,
} from "./cases";
import {
  assertConformanceRejection,
  classifyConformanceError,
  dispatch,
} from "./dispatch";
import { CREDENTIAL_SCHEMA_IDS, APP_ERROR_CODES } from "../protocol";
import type { Preset } from "../types/protocol";
import { IDKitErrorCodes } from "../index";
import {
  computeRpSignatureMessage,
  hashToField,
  signRequest,
} from "../../../server/src/lib/signing";

type OracleOutput =
  | { ok: true; value: any }
  | { ok: false; error: { kind: string; message: string } };
const binary = process.env.IDKIT_RUST_ORACLE;
function rust(inputs: Record<string, any>[]): OracleOutput[] {
  if (!binary)
    throw new Error("IDKIT_RUST_ORACLE is required for live conformance");
  const run = spawnSync(binary, [], {
    input: inputs.map((input) => JSON.stringify(input)).join("\n") + "\n",
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
  if (run.error) throw run.error;
  if (run.status !== 0)
    throw new Error(run.stderr || `Rust runner exited ${run.status}`);
  const results = run.stdout
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  expect(results).toHaveLength(inputs.length);
  return results;
}

// Expected values always come from the current production Rust core. The
// optional export lets other JS engines run these same cases without snapshots.
const outputs = binary ? rust(fixedCases.map((test) => test.input)) : [];
if (process.env.IDKIT_CONFORMANCE_CORPUS) {
  if (!binary) throw new Error("Corpus export requires IDKIT_RUST_ORACLE");
  writeFileSync(
    process.env.IDKIT_CONFORMANCE_CORPUS,
    JSON.stringify({
      cases: fixedCases.map((test, i) => ({ ...test, expected: outputs[i] })),
    }),
  );
}

function compare(test: OracleCase, expected: OracleOutput): void {
  if (expected.ok) {
    expect(dispatch(test.input), test.name).toEqual(expected.value);
    return;
  }
  let rejected = false;
  let error: unknown;
  try {
    dispatch(test.input);
  } catch (caught) {
    rejected = true;
    error = caught;
  }
  expect(rejected, `${test.name}: Rust rejects (${expected.error.kind})`).toBe(
    true,
  );
  expect(
    () => assertConformanceRejection(test.input.op, expected.error, error),
    test.name,
  ).not.toThrow();
}

describe("conformance rejection classifier", () => {
  it("permits only the documented serde boundaries and identical app error codes", () => {
    const jsonError = {
      kind: "json_error",
      message: "JSON error: malformed typed DTO",
    };
    expect(() =>
      assertConformanceRejection(
        "compile",
        jsonError,
        new Error("Invalid configuration: invalid field"),
      ),
    ).not.toThrow();
    expect(() =>
      assertConformanceRejection(
        "poll",
        jsonError,
        new Error("unexpected_response"),
      ),
    ).not.toThrow();
    expect(() =>
      assertConformanceRejection(
        "decrypt",
        jsonError,
        new Error("unexpected_response"),
      ),
    ).toThrow();
    expect(() =>
      assertConformanceRejection(
        "compile",
        jsonError,
        new TypeError("Invalid configuration: accidental undefined access"),
      ),
    ).toThrow();
    expect(() =>
      assertConformanceRejection(
        "proof_response",
        { kind: "app_error", message: "App error: UserRejected" },
        new Error("user_rejected"),
      ),
    ).not.toThrow();
    expect(() =>
      assertConformanceRejection(
        "proof_response",
        { kind: "app_error", message: "App error: UserRejected" },
        new Error("generic_error"),
      ),
    ).toThrow();
  });
  it("does not accept programming errors or a missing operation adapter", () => {
    expect(
      classifyConformanceError(
        new TypeError("Invalid configuration: accidental undefined access"),
      ),
    ).toBeUndefined();
    expect(
      classifyConformanceError(new ReferenceError("missing dependency")),
    ).toBeUndefined();
    expect(
      classifyConformanceError(
        new Error("No JS conformance operation missing"),
      ),
    ).toBeUndefined();
    expect(
      classifyConformanceError(new Error("unreviewed dependency failure")),
    ).toBeUndefined();
    expect(classifyConformanceError("unexpected_response")).toBeUndefined();
  });
  it("distinguishes validation, wire, authentication, encoding, and app failures", () => {
    expect(
      classifyConformanceError(
        new Error("Invalid configuration: Invalid nonce format"),
      )?.kind,
    ).toBe("invalid_configuration");
    expect(
      classifyConformanceError(new Error("unexpected_response"))?.kind,
    ).toBe("unexpected_response");
    expect(
      classifyConformanceError(new Error("aes/gcm: invalid ghash tag"))?.kind,
    ).toBe("crypto_error");
    expect(
      classifyConformanceError(new Error("Non-zero padding: 16"))?.kind,
    ).toBe("base64_error");
    expect(
      classifyConformanceError(new Error("utf8: invalid source encoding"))
        ?.kind,
    ).toBe("json_error");
    expect(classifyConformanceError(new Error("user_rejected"))).toEqual({
      kind: "app_error",
      appCode: "user_rejected",
    });
    try {
      JSON.parse("{");
    } catch (error) {
      expect(classifyConformanceError(error)?.kind).toBe("json_error");
    }
  });
});

describe.skipIf(!binary)("live native Rust conformance", () => {
  fixedCases.forEach((test, i) =>
    it(test.name, () => compare(test, outputs[i]!)),
  );

  it("matches native credential schema IDs, error codes, and presets", () => {
    const result = rust([{ op: "manifest" }])[0]!;
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.message);
    const manifest = result.value;
    expect(CREDENTIAL_SCHEMA_IDS).toEqual(manifest.credentials);
    expect([...APP_ERROR_CODES].sort()).toEqual(
      [...manifest.error_codes].sort(),
    );
    expect(Object.values(IDKitErrorCodes).sort()).toEqual(
      [
        ...manifest.error_codes,
        "invalid_rp_id_format",
        "timeout",
        "cancelled",
      ].sort(),
    );
    const presetTags: Record<Preset["type"], true> = {
      OrbLegacy: true,
      SecureDocumentLegacy: true,
      DocumentLegacy: true,
      DeviceLegacy: true,
      SelfieCheckLegacy: true,
      SelfieCheck: true,
      ProofOfHuman: true,
      Passport: true,
      Mnc: true,
      IdentityCheck: true,
    };
    expect(Object.keys(presetTags).sort()).toEqual(
      manifest.presets.map((preset: Preset) => preset.type).sort(),
    );
  });
  it("preserves the former JS adapter safe-integer boundary without rounding native u64 values", () => {
    // The former WASM adapter used Serializer::new().serialize_maps_as_objects(true).
    // serde-wasm-bindgen 0.6.5 defaults serialize_large_number_types_as_bigints
    // to false and serialize_u64 rejects values above Number.MAX_SAFE_INTEGER.
    // Native Rust can represent those values; that broader domain is explicit.
    const wide = 9_007_199_254_740_992;
    const input = {
      op: "response",
      context,
      response: { ...response, responses: [{ ...item, expires_at_min: wide }] },
    };
    const native = rust([input])[0]!;
    expect(native.ok).toBe(true);
    if (native.ok) {
      expect(native.value.result.responses[0].expires_at_min).toEqual({
        $u64: "9007199254740992",
      });
    }
    expect(() => dispatch(input)).toThrow(/^unexpected_response$/);
    const safe = {
      ...input,
      response: {
        ...response,
        responses: [{ ...item, expires_at_min: Number.MAX_SAFE_INTEGER }],
      },
    };
    compare(
      { name: "maximum safe integer response", input: safe },
      rust([safe])[0]!,
    );
  });
  it("checks generated inputs with reproducible seeds and shrinking", () => {
    const leaf = fc.record({
      type: fc.constantFrom("proof_of_human", "selfie", "passport", "mnc"),
      signal: fc.oneof(
        fc.string(),
        fc.constantFrom("0x", "0x00", "🌍", "0x123"),
      ),
      expires_at_min: fc.nat({ max: 2_000_000_000 }),
    });
    const tree = fc
      .tuple(
        fc.constantFrom("any", "all", "enumerate"),
        fc.array(leaf, { minLength: 1, maxLength: 5 }),
      )
      .map(([kind, items]) => ({ [kind]: items }));
    const scenario = fc.record({
      constraints: fc.oneof(leaf, tree),
      kind: fc.constantFrom("request", "create_session"),
      native: fc.boolean(),
    });
    fc.assert(
      fc.property(scenario, (value) => {
        const input = {
          op: "compile",
          config: { ...config, kind: value.kind },
          selection: { constraints: value.constraints },
          native: value.native,
          request_id: REQUEST_ID,
          now: NOW,
        };
        compare({ name: JSON.stringify(value), input }, rust([input])[0]!);
      }),
      { seed: 20260912, numRuns: 150 },
    );
    fc.assert(
      fc.property(fc.uint8Array({ maxLength: 256 }), (bytes) => {
        const input = {
          op: "encrypt",
          key_hex: "01".repeat(32),
          iv_hex: "02".repeat(12),
          plaintext_hex: Buffer.from(bytes).toString("hex"),
        };
        const expected = rust([input])[0]!;
        compare({ name: "generated AES", input }, expected);
        if (expected.ok) {
          const decryptInput = {
            op: "decrypt",
            key_hex: input.key_hex,
            iv_hex: input.iv_hex,
            ciphertext_hex: expected.value.ciphertext_hex,
          };
          compare(
            { name: "cross-decrypt", input: decryptInput },
            rust([decryptInput])[0]!,
          );
        }
      }),
      { seed: 20260912, numRuns: 50 },
    );
  });
});

const bytes = (hex: string) =>
  new Uint8Array(Buffer.from(hex.replace(/^0x/, ""), "hex"));
const hex = (value: Uint8Array) => Buffer.from(value).toString("hex");
const entropy = Uint8Array.from({ length: 32 }, (_, i) => i);
const signingInput = {
  nonce: "0x008ae1aa597fa146ebd3aa2ceddf360668dea5e526567e92b0321816a4e895bd",
  created_at: NOW,
  expires_at: NOW + 300,
  key_hex: "ab".repeat(32),
};
const serverCases: OracleCase[] = [
  ...["", "746573745f7369676e616c", "010203", "68656c6c6f"].map(
    (input_hex) => ({
      name: `server/hash-fixed-${input_hex || "empty"}`,
      input: { op: "hash_to_field", input_hex },
    }),
  ),
  ...[
    1, 2, 7, 15, 16, 17, 31, 32, 33, 63, 64, 65, 127, 128, 129, 255, 256, 257,
    511, 512,
  ].map((length) => ({
    name: `server/hash-generated-${length}`,
    input: {
      op: "hash_to_field",
      input_hex: hex(
        Uint8Array.from({ length }, (_, i) => length * 17 + i * 31),
      ),
    },
  })),
  ...[undefined, "test-action", "", "id-🙂-世界", "0x010203"].flatMap(
    (action) =>
      ["signature_message", "sign"].map((op) => ({
        name: `server/${op}/${JSON.stringify(action)}`,
        input: { op, ...signingInput, action },
      })),
  ),
  {
    name: "server/message-zero",
    input: {
      op: "signature_message",
      nonce: `0x${"00".repeat(32)}`,
      created_at: 0,
      expires_at: 0,
    },
  },
];
const serverOutputs = binary ? rust(serverCases.map((test) => test.input)) : [];
describe.skipIf(!binary)("server signing against native Rust", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });
  serverCases.forEach(({ name, input }, i) =>
    it(name, () => {
      const expected = serverOutputs[i]!;
      expect(expected.ok).toBe(true);
      if (!expected.ok) throw new Error(expected.error.message);
      if (input.op === "hash_to_field") {
        expect(`0x${hex(hashToField(bytes(input.input_hex)))}`).toBe(
          expected.value,
        );
      } else if (input.op === "signature_message") {
        expect({
          message_hex: hex(
            computeRpSignatureMessage(
              bytes(input.nonce),
              input.created_at,
              input.expires_at,
              input.action,
            ),
          ),
        }).toEqual(expected.value);
      } else {
        vi.spyOn(Date, "now").mockReturnValue(input.created_at * 1000);
        vi.stubGlobal("crypto", {
          getRandomValues: (target: Uint8Array) => {
            target.set(entropy);
            return target;
          },
        });
        const result = signRequest({
          signingKeyHex: input.key_hex,
          ttl: input.expires_at - input.created_at,
          action: input.action,
        });
        expect({
          sig: result.sig,
          nonce: result.nonce,
          created_at: result.createdAt,
          expires_at: result.expiresAt,
        }).toEqual(expected.value);
      }
    }),
  );
});
