/** Synthetic, deterministic protocol inputs. Never use real proof or biometric data here. */
import { encrypt, encodeBase64 } from "../lib/crypto";
import { encodeUtf8 } from "../lib/encoding";
export const NOW = 1_700_000_000;
export const REQUEST_ID = "00000000-0000-4000-8000-000000000001";
export const FIELD = `0x${"00".repeat(31)}01`;
export const SESSION = `session_${"00".repeat(31)}01${"01".repeat(32)}`;
// SessionAction is a prefixed field element; an ordinary uniqueness action
// would make this response invalid before result conversion is exercised.
export const SESSION_NULLIFIER = `snil_${FIELD.slice(2)}02${"00".repeat(30)}01`;
export const config = {
  kind: "request",
  app_id: "app_staging_test",
  package_name: "idkit_js_core",
  package_version: "test",
  action: "test-action",
  allow_legacy_proofs: false,
  rp_context: {
    rp_id: "rp_1234567890abcdef",
    nonce: FIELD,
    created_at: NOW,
    expires_at: NOW + 300,
    signature: `0x${"00".repeat(64)}1b`,
  },
};
export const proof = [1n, 2n, 3n, 4n, 5n]
  .map((n) => n.toString(16).padStart(64, "0"))
  .join("");
export const item = {
  identifier: "proof_of_human",
  issuer_schema_id: 1,
  proof,
  nullifier: `nil_${FIELD.slice(2)}`,
  expires_at_min: NOW,
};
export const response = { id: REQUEST_ID, version: 1, responses: [item] };
export const context = {
  nonce: FIELD,
  action: "test-action",
  environment: "production",
  signal_hashes: { proof_of_human: FIELD },
  legacy_signal_hash: FIELD,
  require_user_presence: false,
};
export const legacy = {
  verification_level: "orb",
  proof: "0x01",
  merkle_root: "0x02",
  nullifier_hash: "0x03",
};
export const integrity = {
  version: 2,
  signature_format: "apple_app_attest",
  timestamp: NOW,
  signature: "0xabcd",
  jwt: "synthetic.jwt",
};

export interface OracleCase {
  name: string;
  input: Record<string, any>;
}
const cases: OracleCase[] = [];
const add = (name: string, input: Record<string, any>) =>
  cases.push({ name, input });

// These are the JS adapter's defaults, not the FFI builder's input schema.
// In particular, unknown environment strings historically select production.
for (const kind of ["request", "create_session", "prove_session"]) {
  const defaults: Record<string, unknown> = { ...config, kind };
  delete defaults.allow_legacy_proofs;
  if (kind === "prove_session") defaults.session_id = SESSION;
  const variants: Record<string, Record<string, unknown>> = {
    omitted: {},
    explicitFalse: { allow_legacy_proofs: false, require_user_presence: false },
    explicitTrue: { allow_legacy_proofs: true, require_user_presence: true },
    presenceOnly: { require_user_presence: true },
    legacyOnly: { allow_legacy_proofs: true },
    production: { environment: "production" },
    staging: { environment: "staging" },
    sandbox: { environment: "sandbox" },
    unknownEnvironment: { environment: "future" },
    caseSensitiveEnvironment: { environment: "STAGING" },
    nullOptionals: {
      environment: null,
      action_description: null,
      return_to: null,
    },
    emptyOptionals: { environment: "", action_description: "", return_to: "" },
  };
  for (const [name, patch] of Object.entries(variants)) {
    add(`adapter/${kind}/${name}`, {
      op: "compile",
      config: { ...defaults, ...patch },
      selection: { constraints: { type: "proof_of_human" } },
      request_id: REQUEST_ID,
      now: NOW,
    });
  }
  if (kind === "request") {
    for (const preset of ["OrbLegacy", "ProofOfHuman", "SelfieCheck"])
      for (const legacy of [undefined, false, true]) {
        add(`adapter/preset/${preset}/legacy-${legacy ?? "omitted"}`, {
          op: "compile",
          config: {
            ...defaults,
            ...(legacy === undefined ? {} : { allow_legacy_proofs: legacy }),
          },
          selection: { preset: { type: preset } },
          request_id: REQUEST_ID,
          now: NOW,
        });
      }
  }
}

for (const signal of [
  "",
  "hello",
  "Ελληνικά 🌍",
  "0x",
  "0x01",
  "0x123",
  "0X01",
  "0xzz",
  "0xdeadBEEF",
])
  add(`signal/${signal}`, { op: "hash_signal", signal });
for (const hex of ["", "00", "010203", "ff".repeat(64)]) {
  add(`field/${hex.length}`, { op: "hash_to_field", input_hex: hex });
  add(`base64/${hex.length}`, { op: "base64_encode", input_hex: hex });
  add(`encrypt/${hex.length}`, {
    op: "encrypt",
    key_hex: "01".repeat(32),
    iv_hex: "02".repeat(12),
    plaintext_hex: hex,
  });
}
for (const value of [
  "",
  "AA==",
  "AQID",
  "AA",
  "A===",
  "AB==",
  "AA==\n",
  "----",
])
  add(`decode/${value}`, { op: "base64_decode", value });
for (const code of ["000000", "ABCDEF", "GHJKMN"])
  add(`invite/derive/${code}`, { op: "invite_derive", code });
for (const code of [
  "000000",
  "ooo-ooo",
  "00_0000",
  "000001",
  "UUUUUU",
  "\u00a0000000",
  "\v000000",
])
  add(`invite/parse/${code}`, { op: "invite_parse", code });
const presets = [
  "OrbLegacy",
  "SecureDocumentLegacy",
  "DocumentLegacy",
  "DeviceLegacy",
  "SelfieCheckLegacy",
  "SelfieCheck",
  "ProofOfHuman",
  "Passport",
  "Mnc",
  "IdentityCheck",
];
for (const type of presets)
  for (const nativeVersion of [undefined, 1, 2]) {
    const preset =
      type === "IdentityCheck"
        ? {
            type,
            attributes: [
              { type: "minimum_age", value: 21 },
              { type: "nationality", value: "JPN" },
            ],
            legacy_signal: "0x01",
          }
        : { type, signal: "0x01" };
    add(`compile/${type}/${nativeVersion ?? "bridge"}`, {
      op: "compile",
      config,
      selection: { preset },
      request_id: REQUEST_ID,
      now: NOW,
      native: nativeVersion === 2,
      native_v1: nativeVersion === 1,
    });
  }
const constraints = [
  { type: "proof_of_human" },
  { type: "selfie", signal: "0x" },
  { type: "passport", signal: "🌍", expires_at_min: 123 },
  { any: [{ type: "proof_of_human" }, { type: "selfie" }] },
  {
    all: [
      { type: "proof_of_human", signal: "a" },
      { enumerate: [{ type: "passport" }, { type: "mnc" }] },
    ],
  },
  {
    any: [
      { type: "proof_of_human", signal: "first" },
      { type: "proof_of_human", signal: "last" },
    ],
  },
  { any: [] },
  { all: [] },
  { enumerate: [] },
  { type: "unknown" },
];
for (const [i, tree] of constraints.entries())
  for (const kind of ["request", "create_session", "prove_session"]) {
    add(`compile/constraints/${i}/${kind}`, {
      op: "compile",
      config: {
        ...config,
        kind,
        ...(kind === "prove_session" ? { session_id: SESSION } : {}),
      },
      selection: { constraints: tree },
      request_id: REQUEST_ID,
      now: NOW,
    });
  }
for (const [name, patch] of Object.entries({
  future: { rp_context: { ...config.rp_context, created_at: NOW + 61 } },
  expired: { rp_context: { ...config.rp_context, expires_at: NOW } },
  badRp: { rp_context: { ...config.rp_context, rp_id: "rp_wrong" } },
  badNonce: { rp_context: { ...config.rp_context, nonce: "0x01" } },
  badSignature: { rp_context: { ...config.rp_context, signature: "0x01" } },
  badApp: { app_id: "wrong" },
  badBridge: { bridge_url: "http://example.com" },
})) {
  add(`invalid/${name}`, {
    op: "compile",
    config: { ...config, ...patch },
    selection: { constraints: { type: "proof_of_human" } },
    request_id: REQUEST_ID,
    now: NOW,
  });
}
const responses = {
  bare: response,
  wrapped: {
    proof_response: response,
    integrity_bundle: integrity,
    identity_attested: true,
    user_presence_completed: true,
  },
  legacy,
  multiLegacy: {
    legacy_responses: [legacy, { ...legacy, verification_level: "face" }],
    integrity_bundle: integrity,
  },
  selfie: {
    ...response,
    responses: [
      { ...item, identifier: "face", issuer_schema_id: 11, claims: [FIELD] },
    ],
  },
  missingClaims: {
    ...response,
    responses: [{ ...item, identifier: "selfie", issuer_schema_id: 11 }],
  },
  emptyClaims: {
    ...response,
    responses: [
      { ...item, identifier: "selfie", issuer_schema_id: 11, claims: [] },
    ],
  },
  malformedProof: { ...response, responses: [{ ...item, proof: "0x01" }] },
  malformedNullifier: {
    ...response,
    responses: [{ ...item, nullifier: "0x01" }],
  },
  noNullifier: { ...response, responses: [{ ...item, nullifier: null }] },
  session: {
    ...response,
    session_id: SESSION,
    responses: [
      {
        ...item,
        nullifier: null,
        session_nullifier: `snil_${FIELD.slice(2)}${FIELD.slice(2)}`,
      },
    ],
  },
  validSession: {
    ...response,
    session_id: SESSION,
    responses: [
      { ...item, nullifier: null, session_nullifier: SESSION_NULLIFIER },
    ],
  },
  selfieSession: {
    ...response,
    session_id: SESSION,
    responses: [
      {
        ...item,
        identifier: "selfie",
        issuer_schema_id: 11,
        claims: [FIELD],
        nullifier: null,
        session_nullifier: SESSION_NULLIFIER,
      },
    ],
  },
  newSessionWithUniqueness: { ...response, session_id: SESSION },
  protocolError: { ...response, error: "nullifier_replay" },
  unknownError: { error_code: "future_error" },
  rejected: { error_code: "user_rejected" },
  nullPresence: { ...response, user_presence_completed: null },
  unknownFields: {
    ...response,
    future: 42,
    responses: [{ ...item, future: 42 }],
  },
};
for (const [name, value] of Object.entries(responses))
  for (const require_user_presence of [false, true]) {
    add(`response/${name}/${require_user_presence}`, {
      op: "response",
      response: value,
      context: { ...context, require_user_presence },
    });
  }
for (const environment of ["production", "staging", "sandbox"]) {
  add(`url/${environment}`, {
    op: "connect_url",
    context: {
      ...context,
      environment,
      key_hex: "01".repeat(32),
      request_id: REQUEST_ID,
      app_id: "app_staging_test",
      return_to: " myapp://callback?x='()+&y=🌍 ",
    },
  });
}
for (const url of [
  "https://bridge.worldcoin.org/",
  "http://localhost:3000/path",
  "http://example.com",
  "https://example.com?",
  "https://example.com#",
  "https://example.com:443",
  "http://192.168.1.2:3000",
])
  add(`bridge/${url}`, { op: "bridge_url", url, app_id: config.app_id });
for (const entropy_hex of ["0000000000", "0102030405", "ffffffffff"])
  add(`invite/generate/${entropy_hex}`, { op: "invite_generate", entropy_hex });
// Protocol-boundary regressions discovered by live comparisons.
add("compile/uppercase-signature-prefix", {
  op: "compile",
  config: {
    ...config,
    rp_context: {
      ...config.rp_context,
      signature: config.rp_context.signature.replace("0x", "0X"),
    },
  },
  selection: { constraints: { type: "proof_of_human" } },
  request_id: REQUEST_ID,
  now: NOW,
});
add("compile/untagged-fallthrough", {
  op: "compile",
  config,
  selection: { constraints: { type: "unknown", any: [{ type: "selfie" }] } },
  request_id: REQUEST_ID,
  now: NOW,
});
add("response/prototype-identifier", {
  op: "response",
  context,
  response: { ...response, responses: [{ ...item, identifier: "__proto__" }] },
});
const pollContext = { ...context, key_hex: "01".repeat(32) };
for (const status of ["initialized", "retrieved", "completed", "unknown"]) {
  add(`poll/${status}`, {
    op: "poll",
    context: pollContext,
    response: { status },
  });
  add(`poll/${status}/malformed-envelope`, {
    op: "poll",
    context: pollContext,
    response: { status, response: { iv: 123, payload: "" } },
  });
}
for (const [name, payload] of Object.entries(responses)) {
  const iv = new Uint8Array(12).fill(9);
  const ciphertext = encrypt(
    new Uint8Array(32).fill(1),
    iv,
    encodeUtf8(JSON.stringify(payload)),
  );
  add(`poll/encrypted/${name}`, {
    op: "poll",
    context: pollContext,
    response: {
      status: "completed",
      response: { iv: encodeBase64(iv), payload: encodeBase64(ciphertext) },
    },
  });
}
for (const [name, bytes] of Object.entries({
  badUtf8: new Uint8Array([0x82, 0x80]),
  loneSurrogate: encodeUtf8('{"error_code":"\\ud800"}'),
})) {
  const iv = new Uint8Array(12).fill(9);
  add(`poll/invalid/${name}`, {
    op: "poll",
    context: pollContext,
    response: {
      status: "completed",
      response: {
        iv: encodeBase64(iv),
        payload: encodeBase64(encrypt(new Uint8Array(32).fill(1), iv, bytes)),
      },
    },
  });
}
add("poll/tampered", {
  op: "poll",
  context: pollContext,
  response: {
    status: "completed",
    response: {
      iv: encodeBase64(new Uint8Array(12)),
      payload: encodeBase64(new Uint8Array(32)),
    },
  },
});
for (const key_hex of ["00", "00".repeat(31), "00".repeat(33)])
  add(`encrypt/invalid-key/${key_hex.length}`, {
    op: "encrypt",
    key_hex,
    iv_hex: "00".repeat(12),
    plaintext_hex: "00",
  });
for (const url of [
  "https://例え.テスト",
  "https://example.com/%E2%82%AC",
  "https://[::1]",
  "http://127.1:3000",
  "http://0x7f000001",
  "custom://192.168.1.2/path",
  "https://%ff.example",
  "https://EXAMPLE.com:443",
]) {
  for (const app_id of ["app_test", "app_staging_test"])
    add(`bridge/boundary/${url}/${app_id}`, { op: "bridge_url", url, app_id });
}
for (const [name, return_to] of Object.entries({
  NEL: "\u0085callback://ok\u0085",
  BOM: "\ufeffcallback://ok\ufeff",
}))
  add(`url/trim/${name}`, {
    op: "connect_url",
    context: {
      ...context,
      key_hex: "01".repeat(32),
      request_id: REQUEST_ID,
      app_id: "app_staging_test",
      return_to,
    },
  });
// Raw JSON preserves properties that JSON.parse normally erases: duplicate
// fields and floating-point number spelling. Rust's wrapped proof response
// intentionally collapses duplicate fields before parsing the protocol value.
const legacyFields = JSON.stringify(legacy).slice(1, -1);
const rawProof = JSON.stringify(response);
const duplicateProof = rawProof.replace(
  '"proof":',
  '"proof":"earlier","proof":',
);
const rawResponses: Record<string, string> = {
  duplicateError: '{"error_code":"user_rejected","error_code":"generic_error"}',
  duplicateErrorLegacyFallback: `{"error_code":"user_rejected","error_code":"generic_error",${legacyFields}}`,
  duplicateLegacyProof: `{${legacyFields},"proof":"last"}`,
  duplicateUnknown: `{${legacyFields},"extension":1,"extension":2}`,
  duplicateRawProof: duplicateProof,
  duplicateWrappedProof: `{"proof_response":${duplicateProof}}`,
  duplicateWrappedIdentity: `{"proof_response":${rawProof},"identity_attested":true,"identity_attested":false}`,
};
for (const [name, raw] of Object.entries({
  floatVersion: rawProof.replace('"version":1', '"version":1.0'),
  floatSchema: rawProof.replace(
    '"issuer_schema_id":1',
    '"issuer_schema_id":1.0',
  ),
  exponentExpiry: rawProof.replace(
    `"expires_at_min":${NOW}`,
    '"expires_at_min":0e0',
  ),
  negativeZeroExpiry: rawProof.replace(
    `"expires_at_min":${NOW}`,
    '"expires_at_min":-0',
  ),
})) {
  rawResponses[name] = raw;
  rawResponses[`wrapped-${name}`] = `{"proof_response":${raw}}`;
}
const toHex = (bytes: Uint8Array): string =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
for (const [name, raw] of Object.entries(rawResponses)) {
  add(`response/raw/${name}`, {
    op: "response",
    context,
    response_hex: toHex(encodeUtf8(raw)),
  });
  const iv = new Uint8Array(12).fill(9);
  add(`poll/raw-encrypted/${name}`, {
    op: "poll",
    context: pollContext,
    response: {
      status: "completed",
      response: {
        iv: encodeBase64(iv),
        payload: encodeBase64(
          encrypt(new Uint8Array(32).fill(1), iv, encodeUtf8(raw)),
        ),
      },
    },
  });
}
for (const [name, raw] of Object.entries({
  duplicateStatus: '{"status":"retrieved","status":"initialized"}',
  duplicateResponse: '{"status":"initialized","response":null,"response":null}',
  duplicateIv:
    '{"status":"initialized","response":{"iv":"","iv":"","payload":""}}',
  duplicateUnknown: '{"status":"initialized","extension":1,"extension":2}',
  escapedDuplicateStatus: '{"status":"retrieved","sta\\u0074us":"initialized"}',
  bom: '\ufeff{"status":"initialized"}',
}))
  add(`poll/raw/${name}`, {
    op: "poll",
    context: pollContext,
    response_hex: toHex(encodeUtf8(raw)),
  });
// 0xff is malformed UTF-8: serde ignores unknown extension bytes but validates
// consumed string fields and object keys. Keep its provenance through decoding.
for (const [name, parts] of Object.entries({
  ignoredInvalidUtf8: ['{"status":"initialized","extension":"', '"}'],
  consumedInvalidUtf8: ['{"status":"', '"}'],
  invalidUtf8Key: ['{"status":"initialized","', '":true}'],
}))
  add(`poll/raw/${name}`, {
    op: "poll",
    context: pollContext,
    response_hex: `${toHex(encodeUtf8(parts[0]))}ff${toHex(encodeUtf8(parts[1]))}`,
  });
export const fixedCases = cases;
