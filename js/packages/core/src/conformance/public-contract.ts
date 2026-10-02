/**
 * Compile-time gates on the exported declarations, using native Rust samples.
 * These check the listed fields, primitive types, and optionality; fixtures
 * separately check semantic conversion. They are not an exhaustive schema.
 */
import type {
  CredentialType,
  DocumentType,
  IDKitErrorCode,
  IDKitRequestConfig,
  IDKitResult,
  IntegrityBundle,
  IntegritySignatureFormat,
  Preset,
  ResponseItemV3,
  ResponseItemV4,
  ResponseItemSession,
  SelfieCheckResponseItemV4,
  SelfieCheckResponseItemSession,
} from "../index";
import type { manifest } from "./manifest.generated";

type Equal<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
type Assert<T extends true> = T;
type OptionalKeys<T> = {
  [K in keyof T]-?: {} extends Pick<T, K> ? K : never;
}[keyof T];
// Full samples populate optional fields and arrays. Widen values to their
// primitive types while checking all keys (including formerly optional ones).
type Shape<T> = T extends string
  ? string
  : T extends number
    ? number
    : T extends boolean
      ? boolean
      : T extends readonly (infer U)[]
        ? Shape<U>[]
        : T extends object
          ? { -readonly [K in keyof T]-?: Shape<NonNullable<T[K]>> }
          : T;
type Rust = typeof manifest;
type Full = Rust["response_shapes_full"];
type Minimal = Rust["response_shapes"];

type ResponseFieldsMatch = Assert<
  Equal<
    [
      Shape<SelfieCheckResponseItemV4>,
      Shape<ResponseItemV4>,
      Shape<SelfieCheckResponseItemSession>,
      Shape<ResponseItemSession>,
      Shape<ResponseItemV3>,
    ],
    [
      Shape<Full[0]>,
      Shape<Full[1]>,
      Shape<Full[2]>,
      Shape<Full[3]>,
      Shape<Full[4]>,
    ]
  >
>;
type ResponseOptionalityMatches = Assert<
  Equal<
    [
      OptionalKeys<SelfieCheckResponseItemV4>,
      OptionalKeys<ResponseItemV4>,
      OptionalKeys<SelfieCheckResponseItemSession>,
      OptionalKeys<ResponseItemSession>,
    ],
    [
      Exclude<keyof Full[0], keyof Minimal[0]>,
      Exclude<keyof Full[1], keyof Minimal[1]>,
      Exclude<keyof Full[2], keyof Minimal[2]>,
      Exclude<keyof Full[3], keyof Minimal[3]>,
    ]
  >
>;
// Existing public V3 declarations allow an absent signal_hash, although Rust
// always emits it. Keep that adapter contract explicit instead of widening it.
type LegacyOptionality = Assert<
  Equal<OptionalKeys<ResponseItemV3>, "signal_hash">
>;
type SelfieDiscriminants = Assert<
  Equal<
    [
      SelfieCheckResponseItemV4["identifier"],
      SelfieCheckResponseItemSession["identifier"],
      SelfieCheckResponseItemV4["issuer_schema_id"],
      SelfieCheckResponseItemSession["issuer_schema_id"],
    ],
    [
      "selfie",
      "selfie",
      Rust["credentials"]["selfie"],
      Rust["credentials"]["selfie"],
    ]
  >
>;

// Rust has a single result struct; JS keeps its established narrower union.
// Compare the aggregate fields/types without making every field required on
// every JS variant (for example, action and session_id are mutually exclusive).
type UnionKeys<T> = T extends unknown ? keyof T : never;
type UnionField<T, K extends PropertyKey> = T extends unknown
  ? K extends keyof T
    ? T[K]
    : never
  : never;
type ResultFields = {
  [K in Exclude<UnionKeys<IDKitResult>, "responses">]: NonNullable<
    UnionField<IDKitResult, K>
  >;
};
type ResultFieldsMatch = Assert<
  Equal<Shape<ResultFields>, Shape<Omit<Rust["result_shapes"][1], "responses">>>
>;
type ResultResponseVariantsMatch = Assert<
  Equal<Shape<IDKitResult["responses"][number]>, Shape<Full[number]>>
>;
type IntegrityFieldsMatch = Assert<
  Equal<
    Shape<IntegrityBundle>,
    Shape<Rust["result_shapes"][1]["integrity_bundle"]>
  >
>;
type PublicEnumsMatch = Assert<
  Equal<
    [
      CredentialType,
      DocumentType,
      IDKitErrorCode,
      IntegritySignatureFormat,
      NonNullable<IDKitRequestConfig["environment"]>,
      Preset["type"],
    ],
    [
      keyof Rust["credentials"],
      Rust["document_types"][number],
      Rust["error_codes"][number],
      Rust["integrity_signature_formats"][number],
      Rust["environments"][number],
      Rust["presets"][number]["type"],
    ]
  >
>;

// Exporting the witnesses makes this module easy to include in the same tsc
// invocation as the runtime suite; no public package code imports this file.
export type PublicContractChecks = [
  ResponseFieldsMatch,
  ResponseOptionalityMatches,
  LegacyOptionality,
  SelfieDiscriminants,
  ResultFieldsMatch,
  ResultResponseVariantsMatch,
  IntegrityFieldsMatch,
  PublicEnumsMatch,
];
