/** Compile-time checks instantiated with current Rust DTO samples by test:conformance. */
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

type Equal<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
type OptionalKeys<T> = {
  [K in keyof T]-?: {} extends Pick<T, K> ? K : never;
}[keyof T];
// Full native samples populate optional fields and arrays. Compare primitive
// types and every key, including fields omitted from minimal samples.
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
interface NativeContract {
  credentials: Record<string, number>;
  document_types: readonly string[];
  error_codes: readonly string[];
  integrity_signature_formats: readonly string[];
  environments: readonly string[];
  presets: readonly { type: string }[];
  response_shapes: readonly [object, object, object, object, object];
  response_shapes_full: readonly [object, object, object, object, object];
  result_shapes: readonly [
    object,
    { responses: readonly unknown[]; integrity_bundle: object },
  ];
}

// A tuple of `true` is assignable only when all comparisons pass. These gates
// check the listed fields/types/optionality, not an exhaustive protocol schema.
export type PublicContractChecks<Rust extends NativeContract> = [
  Equal<
    [
      Shape<SelfieCheckResponseItemV4>,
      Shape<ResponseItemV4>,
      Shape<SelfieCheckResponseItemSession>,
      Shape<ResponseItemSession>,
      Shape<ResponseItemV3>,
    ],
    [
      Shape<Rust["response_shapes_full"][0]>,
      Shape<Rust["response_shapes_full"][1]>,
      Shape<Rust["response_shapes_full"][2]>,
      Shape<Rust["response_shapes_full"][3]>,
      Shape<Rust["response_shapes_full"][4]>,
    ]
  >,
  Equal<
    [
      OptionalKeys<SelfieCheckResponseItemV4>,
      OptionalKeys<ResponseItemV4>,
      OptionalKeys<SelfieCheckResponseItemSession>,
      OptionalKeys<ResponseItemSession>,
    ],
    [
      Exclude<
        keyof Rust["response_shapes_full"][0],
        keyof Rust["response_shapes"][0]
      >,
      Exclude<
        keyof Rust["response_shapes_full"][1],
        keyof Rust["response_shapes"][1]
      >,
      Exclude<
        keyof Rust["response_shapes_full"][2],
        keyof Rust["response_shapes"][2]
      >,
      Exclude<
        keyof Rust["response_shapes_full"][3],
        keyof Rust["response_shapes"][3]
      >,
    ]
  >,
  // The established JS V3 adapter permits absent signal_hash; Rust always emits it.
  Equal<OptionalKeys<ResponseItemV3>, "signal_hash">,
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
  >,
  // Rust has one result struct; JS keeps its established narrower result union.
  Equal<
    Shape<ResultFields>,
    Shape<Omit<Rust["result_shapes"][1], "responses">>
  >,
  Equal<
    Shape<IDKitResult["responses"][number]>,
    Shape<Rust["response_shapes_full"][number]>
  >,
  Equal<
    Shape<IntegrityBundle>,
    Shape<Rust["result_shapes"][1]["integrity_bundle"]>
  >,
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
  >,
];
