"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactElement,
} from "react";
import {
  CredentialRequest,
  IDKitErrorCodes,
  IDKitRequestWidget,
  all,
  any,
  documentLegacy,
  deviceLegacy,
  orbLegacy,
  secureDocumentLegacy,
  selfieCheckLegacy,
  setDebug,
  type ConstraintNode,
  type CredentialType,
  type IDKitResult,
  type Preset,
  type RpContext,
} from "@worldcoin/idkit";

setDebug(true);

type RpContextCaseId =
  | "valid_success"
  | "invalid_rp_signature"
  | "duplicate_nonce"
  | "nullifier_replayed"
  | "invalid_rp_id_format"
  | "unknown_rp"
  | "inactive_rp"
  | "timestamp_too_old"
  | "timestamp_too_far_in_future"
  | "invalid_timestamp"
  | "rp_signature_expired";

type ArenaCaseId =
  | "v3_orb_success"
  | "v3_selfie_success"
  | "v3_secure_document_success"
  | "v3_document_success"
  | "v3_device_success"
  | "v4_poh_success"
  | "v4_passport_success"
  | "v4_mnc_success"
  | "v4_poh_and_passport_success"
  | "v4_poh_or_passport_success"
  | "v4_poh_and_mnc_success"
  | "v4_poh_or_mnc_success"
  | "v4_passport_or_mnc_success"
  | "v4_poh_and_passport_or_mnc_success"
  | "v4_3_only_no_fallback"
  | "v4_3_only_fallback_success"
  | "v4_3_only_fallback_no_match"
  | "v4_constraint_unsatisfied"
  | "v4_future_genesis_no_fallback"
  | "v4_future_genesis_fallback_success"
  | "error_invalid_rp_signature"
  | "error_duplicate_nonce"
  | "error_nullifier_replayed"
  | "error_invalid_rp_id_format"
  | "error_unknown_rp"
  | "error_inactive_rp"
  | "error_timestamp_too_old"
  | "error_timestamp_too_far_in_future"
  | "error_invalid_timestamp"
  | "error_rp_signature_expired";

type PresetKind = "orb" | "secure_document" | "document" | "device" | "selfie";

type ConstraintKind =
  | "proof_of_human"
  | "passport"
  | "mnc"
  | "poh_and_passport"
  | "poh_or_passport"
  | "poh_and_mnc"
  | "poh_or_mnc"
  | "passport_or_mnc"
  | "poh_and_passport_or_mnc";

type ExpectedOutcome = "success" | IDKitErrorCodes;
type ExpectedProtocol = "3.0" | "4.0";
type RunPhase = "run" | "prime";
type ResultStatus = "idle" | "running" | "ready" | "pass" | "fail" | "skipped";

type RequestDefinition =
  | {
      type: "preset";
      presetKind: PresetKind;
    }
  | {
      type: "constraints";
      constraintKind: ConstraintKind;
      allowLegacyProofs: boolean;
      genesisIssuedAtMin?: "future";
    };

type ArenaCaseDefinition = {
  id: ArenaCaseId;
  title: string;
  expected: ExpectedOutcome;
  expectedProtocol?: ExpectedProtocol;
  description: string;
  prerequisite: string;
  request: RequestDefinition;
  contextCaseId?: RpContextCaseId;
};

type ArenaSection = {
  id: string;
  title: string;
  description: string;
  cases: ArenaCaseDefinition[];
};

type TestCaseResult = {
  status: ResultStatus;
  message: string;
  expected?: string;
  actual?: string;
  note?: string;
};

type TestCaseResponse =
  | {
      configured: true;
      caseId: RpContextCaseId;
      action: string;
      rpContext: RpContext;
      note?: string;
    }
  | {
      configured: false;
      error: string;
    };

type ActiveRun = {
  caseId: ArenaCaseId;
  contextCaseId: RpContextCaseId;
  phase: RunPhase;
  expected: ExpectedOutcome;
  expectedProtocol?: ExpectedProtocol;
  finalExpected?: IDKitErrorCodes;
  action: string;
  rpContext: RpContext;
  signal: string;
  request: RequestDefinition;
};

type FlowConfig =
  | {
      preset: Preset;
      constraints?: never;
    }
  | {
      constraints: ConstraintNode;
      preset?: never;
    };

const APP_ID = process.env.NEXT_PUBLIC_APP_ID as `app_${string}` | undefined;
const RP_ID = process.env.NEXT_PUBLIC_RP_ID;
const STAGING_CONNECT_BASE_URL = "https://staging.world.org/verify";
const FUTURE_GENESIS_OFFSET_SEC = 365 * 24 * 60 * 60;

const PRESET_KIND_TO_NAME: Record<PresetKind, string> = {
  orb: "Orb / Proof of Human",
  secure_document: "Secure Document",
  document: "Document",
  device: "Device",
  selfie: "Selfie Check",
};

const CONSTRAINT_KIND_TO_NAME: Record<ConstraintKind, string> = {
  proof_of_human: "Proof of Human",
  passport: "Passport",
  mnc: "MNC",
  poh_and_passport: "Proof of Human AND Passport",
  poh_or_passport: "Proof of Human OR Passport",
  poh_and_mnc: "Proof of Human AND MNC",
  poh_or_mnc: "Proof of Human OR MNC",
  passport_or_mnc: "Passport OR MNC",
  poh_and_passport_or_mnc: "Proof of Human AND (Passport OR MNC)",
};

const ARENA_SECTIONS: ArenaSection[] = [
  {
    id: "world-id-3-presets",
    title: "World ID 3.0 Preset Cases",
    description:
      "Legacy preset requests that should keep using the existing 3.0 flow.",
    cases: [
      {
        id: "v3_orb_success",
        title: "Orb / Proof of Human",
        expected: "success",
        expectedProtocol: "3.0",
        prerequisite: "Account has the matching 3.0 Orb credential.",
        description: "Runs the Orb legacy preset and expects a 3.0 proof.",
        request: { type: "preset", presetKind: "orb" },
      },
      {
        id: "v3_selfie_success",
        title: "Selfie Check",
        expected: "success",
        expectedProtocol: "3.0",
        prerequisite: "Account can satisfy the legacy selfie-check preset.",
        description: "Runs the selfie-check legacy preset and expects success.",
        request: { type: "preset", presetKind: "selfie" },
      },
      {
        id: "v3_secure_document_success",
        title: "Secure Document",
        expected: "success",
        expectedProtocol: "3.0",
        prerequisite: "Account can satisfy the secure document legacy preset.",
        description:
          "Runs the secure document legacy preset and expects a 3.0 proof.",
        request: { type: "preset", presetKind: "secure_document" },
      },
      {
        id: "v3_document_success",
        title: "Document",
        expected: "success",
        expectedProtocol: "3.0",
        prerequisite: "Account can satisfy the document legacy preset.",
        description: "Runs the document legacy preset and expects a 3.0 proof.",
        request: { type: "preset", presetKind: "document" },
      },
      {
        id: "v3_device_success",
        title: "Device",
        expected: "success",
        expectedProtocol: "3.0",
        prerequisite: "Account can satisfy the device legacy preset.",
        description: "Runs the device legacy preset and expects a 3.0 proof.",
        request: { type: "preset", presetKind: "device" },
      },
    ],
  },
  {
    id: "world-id-4-success",
    title: "World ID 4.0 Success Cases",
    description:
      "Direct 4.0 proof_request cases where the account satisfies the requested constraints.",
    cases: [
      {
        id: "v4_poh_success",
        title: "Proof of Human",
        expected: "success",
        expectedProtocol: "4.0",
        prerequisite: "Account has a 4.0 Proof of Human credential.",
        description: "Requests proof_of_human with legacy fallback disabled.",
        request: {
          type: "constraints",
          constraintKind: "proof_of_human",
          allowLegacyProofs: false,
        },
      },
      {
        id: "v4_passport_success",
        title: "Passport",
        expected: "success",
        expectedProtocol: "4.0",
        prerequisite: "Account has a 4.0 Passport credential.",
        description: "Requests passport with legacy fallback disabled.",
        request: {
          type: "constraints",
          constraintKind: "passport",
          allowLegacyProofs: false,
        },
      },
      {
        id: "v4_mnc_success",
        title: "MNC",
        expected: "success",
        expectedProtocol: "4.0",
        prerequisite: "Account has a 4.0 MNC credential.",
        description: "Requests mnc with legacy fallback disabled.",
        request: {
          type: "constraints",
          constraintKind: "mnc",
          allowLegacyProofs: false,
        },
      },
      {
        id: "v4_poh_and_passport_success",
        title: "Proof of Human AND Passport",
        expected: "success",
        expectedProtocol: "4.0",
        prerequisite: "Account has both 4.0 Proof of Human and Passport.",
        description: "Exercises the all(...) branch for two credentials.",
        request: {
          type: "constraints",
          constraintKind: "poh_and_passport",
          allowLegacyProofs: false,
        },
      },
      {
        id: "v4_poh_or_passport_success",
        title: "Proof of Human OR Passport",
        expected: "success",
        expectedProtocol: "4.0",
        prerequisite: "Account has either 4.0 Proof of Human or Passport.",
        description: "Exercises the any(...) branch for two credentials.",
        request: {
          type: "constraints",
          constraintKind: "poh_or_passport",
          allowLegacyProofs: false,
        },
      },
      {
        id: "v4_poh_and_mnc_success",
        title: "Proof of Human AND MNC",
        expected: "success",
        expectedProtocol: "4.0",
        prerequisite: "Account has both 4.0 Proof of Human and MNC.",
        description: "Exercises the all(...) branch with MNC.",
        request: {
          type: "constraints",
          constraintKind: "poh_and_mnc",
          allowLegacyProofs: false,
        },
      },
      {
        id: "v4_poh_or_mnc_success",
        title: "Proof of Human OR MNC",
        expected: "success",
        expectedProtocol: "4.0",
        prerequisite: "Account has either 4.0 Proof of Human or MNC.",
        description: "Exercises the any(...) branch with MNC.",
        request: {
          type: "constraints",
          constraintKind: "poh_or_mnc",
          allowLegacyProofs: false,
        },
      },
      {
        id: "v4_passport_or_mnc_success",
        title: "Passport OR MNC",
        expected: "success",
        expectedProtocol: "4.0",
        prerequisite: "Account has either 4.0 Passport or MNC.",
        description: "Exercises document-style alternatives in 4.0.",
        request: {
          type: "constraints",
          constraintKind: "passport_or_mnc",
          allowLegacyProofs: false,
        },
      },
      {
        id: "v4_poh_and_passport_or_mnc_success",
        title: "Proof of Human AND (Passport OR MNC)",
        expected: "success",
        expectedProtocol: "4.0",
        prerequisite:
          "Account has 4.0 Proof of Human plus either Passport or MNC.",
        description: "Exercises the nested all(..., any(...)) branch.",
        request: {
          type: "constraints",
          constraintKind: "poh_and_passport_or_mnc",
          allowLegacyProofs: false,
        },
      },
    ],
  },
  {
    id: "world-id-4-migration",
    title: "World ID 4.0 Migration / Fallback Cases",
    description:
      "Decision-tree cases for account state, allow_legacy_proofs, constraint failures, and genesis cutoffs.",
    cases: [
      {
        id: "v4_3_only_no_fallback",
        title: "3.0-only account, fallback disabled",
        expected: IDKitErrorCodes.WorldId4NotAvailable,
        prerequisite:
          "Run with an account that only has the matching 3.0 Orb credential.",
        description:
          "Requests proof_of_human with allow_legacy_proofs=false and expects the 4.0-not-available branch.",
        request: {
          type: "constraints",
          constraintKind: "proof_of_human",
          allowLegacyProofs: false,
        },
      },
      {
        id: "v4_3_only_fallback_success",
        title: "3.0-only account, fallback enabled",
        expected: "success",
        expectedProtocol: "3.0",
        prerequisite:
          "Run with an account that only has the matching 3.0 Orb credential.",
        description:
          "Requests proof_of_human with allow_legacy_proofs=true and expects legacy fallback success.",
        request: {
          type: "constraints",
          constraintKind: "proof_of_human",
          allowLegacyProofs: true,
        },
      },
      {
        id: "v4_3_only_fallback_no_match",
        title: "3.0-only account, fallback has no match",
        expected: IDKitErrorCodes.CredentialUnavailable,
        prerequisite:
          "Run with a 3.0-only account that cannot satisfy the requested document credential.",
        description:
          "Requests passport with allow_legacy_proofs=true and expects constraint failure after fallback evaluation.",
        request: {
          type: "constraints",
          constraintKind: "passport",
          allowLegacyProofs: true,
        },
      },
      {
        id: "v4_constraint_unsatisfied",
        title: "4.0 constraints unsatisfied",
        expected: IDKitErrorCodes.CredentialUnavailable,
        prerequisite:
          "Run with a 4.0 account that has Proof of Human but not Passport.",
        description:
          "Requests Proof of Human AND Passport with fallback disabled and expects credential_unavailable.",
        request: {
          type: "constraints",
          constraintKind: "poh_and_passport",
          allowLegacyProofs: false,
        },
      },
      {
        id: "v4_future_genesis_no_fallback",
        title: "Genesis cutoff fails, fallback disabled",
        expected: IDKitErrorCodes.WorldId4NotAvailable,
        prerequisite:
          "Run with a 4.0 Proof of Human account whose credential predates the generated future genesis cutoff.",
        description:
          "Adds a future genesis_issued_at_min and expects the 4.0-not-available branch.",
        request: {
          type: "constraints",
          constraintKind: "proof_of_human",
          allowLegacyProofs: false,
          genesisIssuedAtMin: "future",
        },
      },
      {
        id: "v4_future_genesis_fallback_success",
        title: "Genesis cutoff fails, fallback enabled",
        expected: "success",
        expectedProtocol: "3.0",
        prerequisite:
          "Run with an account whose 4.0 credential predates the generated future cutoff and has matching 3.0 fallback.",
        description:
          "Adds a future genesis_issued_at_min with allow_legacy_proofs=true and expects legacy fallback success.",
        request: {
          type: "constraints",
          constraintKind: "proof_of_human",
          allowLegacyProofs: true,
          genesisIssuedAtMin: "future",
        },
      },
    ],
  },
  {
    id: "world-id-4-errors",
    title: "World ID 4.0 Error Cases",
    description:
      "Malformed or rejected 4.0 requests that should return a specific IDKit error code.",
    cases: [
      {
        id: "error_invalid_rp_signature",
        title: "Invalid RP signature",
        expected: IDKitErrorCodes.InvalidRpSignature,
        prerequisite: "Any account that can open a 4.0 Proof of Human request.",
        description:
          "Flips one byte in the RP signature while keeping the payload parseable.",
        request: {
          type: "constraints",
          constraintKind: "proof_of_human",
          allowLegacyProofs: false,
        },
        contextCaseId: "invalid_rp_signature",
      },
      {
        id: "error_duplicate_nonce",
        title: "Duplicate nonce",
        expected: IDKitErrorCodes.DuplicateNonce,
        prerequisite:
          "Any account that can complete a 4.0 Proof of Human request. This case requires two runs.",
        description:
          "Consumes a signed nonce once, then signs a fresh action with that nonce.",
        request: {
          type: "constraints",
          constraintKind: "proof_of_human",
          allowLegacyProofs: false,
        },
        contextCaseId: "duplicate_nonce",
      },
      {
        id: "error_nullifier_replayed",
        title: "Nullifier replayed",
        expected: IDKitErrorCodes.NullifierReplayed,
        prerequisite:
          "Any account that can complete a 4.0 Proof of Human request. This case requires two runs.",
        description:
          "Verifies once for a stable action, then requests another proof for it.",
        request: {
          type: "constraints",
          constraintKind: "proof_of_human",
          allowLegacyProofs: false,
        },
        contextCaseId: "nullifier_replayed",
      },
      {
        id: "error_invalid_rp_id_format",
        title: "Invalid RP ID format",
        expected: IDKitErrorCodes.InvalidRpIdFormat,
        prerequisite: "No World App account state required.",
        description: "Uses an RP ID that cannot be parsed by the SDK.",
        request: {
          type: "constraints",
          constraintKind: "proof_of_human",
          allowLegacyProofs: false,
        },
        contextCaseId: "invalid_rp_id_format",
      },
      {
        id: "error_unknown_rp",
        title: "Unknown RP",
        expected: IDKitErrorCodes.UnknownRp,
        prerequisite: "Any account that can open a 4.0 Proof of Human request.",
        description: "Uses an RP ID that should not exist in the RP registry.",
        request: {
          type: "constraints",
          constraintKind: "proof_of_human",
          allowLegacyProofs: false,
        },
        contextCaseId: "unknown_rp",
      },
      {
        id: "error_inactive_rp",
        title: "Inactive RP",
        expected: IDKitErrorCodes.InactiveRp,
        prerequisite:
          "Requires TEST_INACTIVE_RP_ID for an RP that exists but is inactive.",
        description:
          "Requires an RP ID that exists in the registry but is inactive.",
        request: {
          type: "constraints",
          constraintKind: "proof_of_human",
          allowLegacyProofs: false,
        },
        contextCaseId: "inactive_rp",
      },
      {
        id: "error_timestamp_too_old",
        title: "Timestamp too old",
        expected: IDKitErrorCodes.TimestampTooOld,
        prerequisite: "Any account that can open a 4.0 Proof of Human request.",
        description:
          "Signs a request created outside the accepted freshness window.",
        request: {
          type: "constraints",
          constraintKind: "proof_of_human",
          allowLegacyProofs: false,
        },
        contextCaseId: "timestamp_too_old",
      },
      {
        id: "error_timestamp_too_far_in_future",
        title: "Timestamp too far in future",
        expected: IDKitErrorCodes.TimestampTooFarInFuture,
        prerequisite: "Any account that can open a 4.0 Proof of Human request.",
        description:
          "Signs a request with a created_at timestamp ahead of the freshness window.",
        request: {
          type: "constraints",
          constraintKind: "proof_of_human",
          allowLegacyProofs: false,
        },
        contextCaseId: "timestamp_too_far_in_future",
      },
      {
        id: "error_invalid_timestamp",
        title: "Invalid timestamp",
        expected: IDKitErrorCodes.InvalidTimestamp,
        prerequisite: "No World App account state required.",
        description:
          "Uses a timestamp value intended to fail parser-level timestamp validation.",
        request: {
          type: "constraints",
          constraintKind: "proof_of_human",
          allowLegacyProofs: false,
        },
        contextCaseId: "invalid_timestamp",
      },
      {
        id: "error_rp_signature_expired",
        title: "RP signature expired",
        expected: IDKitErrorCodes.RpSignatureExpired,
        prerequisite: "Any account that can open a 4.0 Proof of Human request.",
        description:
          "Signs a request whose expires_at value is already in the past.",
        request: {
          type: "constraints",
          constraintKind: "proof_of_human",
          allowLegacyProofs: false,
        },
        contextCaseId: "rp_signature_expired",
      },
    ],
  },
];

const FINAL_EXPECTED: Partial<Record<ArenaCaseId, IDKitErrorCodes>> = {
  error_duplicate_nonce: IDKitErrorCodes.DuplicateNonce,
  error_nullifier_replayed: IDKitErrorCodes.NullifierReplayed,
};

function createChromeAppDeeplink(url: string): string {
  const parsed = new URL(url);
  return parsed.protocol === "https:" ? "googlechromes://" : "googlechrome://";
}

function resultClass(status: ResultStatus): string {
  return `test-case-status ${status}`;
}

function expectedLabel(
  expected: ExpectedOutcome,
  expectedProtocol?: ExpectedProtocol,
): string {
  if (expected === "success" && expectedProtocol) {
    return `success (${expectedProtocol})`;
  }

  return expected;
}

function caseExpectedLabel(testCase: ArenaCaseDefinition): string {
  return expectedLabel(testCase.expected, testCase.expectedProtocol);
}

function makeAction(caseId: ArenaCaseId, actionPrefix: string): string {
  const base = actionPrefix.trim() || "idkit-arena";
  if (caseId === "error_nullifier_replayed") {
    return `${base}-${caseId}`;
  }
  return `${base}-${caseId}-${Date.now()}`;
}

function makeSignal(caseId: ArenaCaseId, action: string): string {
  if (caseId === "error_nullifier_replayed") {
    return `${action}-signal`;
  }

  return `${caseId}-${Date.now()}`;
}

function createPreset(kind: PresetKind, signal: string): Preset {
  switch (kind) {
    case "orb":
      return orbLegacy({ signal });
    case "secure_document":
      return secureDocumentLegacy({ signal });
    case "document":
      return documentLegacy({ signal });
    case "device":
      return deviceLegacy({ signal });
    case "selfie":
      return selfieCheckLegacy({ signal });
    default: {
      const exhaustive: never = kind;
      throw new Error(`Unsupported preset: ${String(exhaustive)}`);
    }
  }
}

function credential(
  type: CredentialType,
  signal: string,
  genesisIssuedAtMin?: number,
) {
  return CredentialRequest(type, {
    signal,
    genesis_issued_at_min: genesisIssuedAtMin,
  });
}

function buildConstraint(
  kind: ConstraintKind,
  signal: string,
  genesisIssuedAtMin?: number,
): ConstraintNode {
  const poh = () => credential("proof_of_human", signal, genesisIssuedAtMin);
  const passport = () => credential("passport", signal, genesisIssuedAtMin);
  const mnc = () => credential("mnc", signal, genesisIssuedAtMin);

  switch (kind) {
    case "proof_of_human":
      return poh();
    case "passport":
      return passport();
    case "mnc":
      return mnc();
    case "poh_and_passport":
      return all(poh(), passport());
    case "poh_or_passport":
      return any(poh(), passport());
    case "poh_and_mnc":
      return all(poh(), mnc());
    case "poh_or_mnc":
      return any(poh(), mnc());
    case "passport_or_mnc":
      return any(passport(), mnc());
    case "poh_and_passport_or_mnc":
      return all(poh(), any(passport(), mnc()));
    default: {
      const exhaustive: never = kind;
      throw new Error(`Unsupported constraint: ${String(exhaustive)}`);
    }
  }
}

function futureGenesisIssuedAtMin(): number {
  return Math.floor(Date.now() / 1000) + FUTURE_GENESIS_OFFSET_SEC;
}

function buildFlowConfig(activeRun: ActiveRun): FlowConfig {
  if (activeRun.request.type === "preset") {
    return {
      preset: createPreset(activeRun.request.presetKind, activeRun.signal),
    };
  }

  const genesisIssuedAtMin =
    activeRun.request.genesisIssuedAtMin === "future"
      ? futureGenesisIssuedAtMin()
      : undefined;

  return {
    constraints: buildConstraint(
      activeRun.request.constraintKind,
      activeRun.signal,
      genesisIssuedAtMin,
    ),
  };
}

function requestLabel(request: RequestDefinition): string {
  if (request.type === "preset") {
    return `preset: ${PRESET_KIND_TO_NAME[request.presetKind]}`;
  }

  const fallback = request.allowLegacyProofs
    ? "allow_legacy_proofs=true"
    : "allow_legacy_proofs=false";
  const genesis =
    request.genesisIssuedAtMin === "future" ? ", future genesis min" : "";

  return `${CONSTRAINT_KIND_TO_NAME[request.constraintKind]} (${fallback}${genesis})`;
}

function resultProtocol(result: IDKitResult): ExpectedProtocol {
  return result.protocol_version === "3.0" ? "3.0" : "4.0";
}

async function fetchArenaContext(
  caseId: RpContextCaseId,
  action: string,
  nonce?: string,
): Promise<TestCaseResponse> {
  const response = await fetch("/api/arena/rp-context", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ caseId, action, nonce }),
  });
  const payload = (await response.json()) as
    | TestCaseResponse
    | { error?: string };

  if (response.status === 422 && "configured" in payload) {
    return payload as TestCaseResponse;
  }

  if (!response.ok) {
    throw new Error(
      "error" in payload && payload.error
        ? payload.error
        : "Failed to create Arena RP context",
    );
  }

  return payload as TestCaseResponse;
}

async function verifyProof(
  payload: IDKitResult,
  rpContext: RpContext,
): Promise<unknown> {
  const response = await fetch("/api/verify-proof", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ rp_id: rpContext.rp_id, devPortalPayload: payload }),
  });

  const json = await response.json();
  if (!response.ok) {
    throw new Error(json.error ?? "Verification failed");
  }

  return json;
}

export function ArenaClient(): ReactElement {
  const [isLightTheme, setIsLightTheme] = useState(false);
  const [environment, setEnvironment] = useState<"production" | "staging">(
    "production",
  );
  const [useStagingConnectBaseUrl, setUseStagingConnectBaseUrl] =
    useState(false);
  const [useReturnTo, setUseReturnTo] = useState(false);
  const [returnTo, setReturnTo] = useState("");
  const [actionPrefix, setActionPrefix] = useState("idkit-arena");
  const [results, setResults] = useState<
    Partial<Record<ArenaCaseId, TestCaseResult>>
  >({});
  const [activeRun, setActiveRun] = useState<ActiveRun | null>(null);
  const [widgetOpen, setWidgetOpen] = useState(false);
  const [duplicateNoncePrime, setDuplicateNoncePrime] = useState<{
    caseId: ArenaCaseId;
    nonce: string;
  } | null>(null);
  const [nullifierReplayAction, setNullifierReplayAction] = useState<{
    action: string;
    caseId: ArenaCaseId;
  } | null>(null);
  const [lastProof, setLastProof] = useState<IDKitResult | null>(null);
  const [lastVerifyResult, setLastVerifyResult] = useState<unknown>(null);

  const overrideConnectBaseUrl =
    environment === "staging" && useStagingConnectBaseUrl
      ? STAGING_CONNECT_BASE_URL
      : undefined;
  const effectiveReturnTo = useReturnTo
    ? returnTo.trim() || undefined
    : undefined;
  const activeFlowConfig = useMemo(
    () => (activeRun ? buildFlowConfig(activeRun) : null),
    [activeRun],
  );

  useEffect(() => {
    document.documentElement.setAttribute(
      "data-theme",
      isLightTheme ? "light" : "dark",
    );
  }, [isLightTheme]);

  useEffect(() => {
    if (environment !== "staging") {
      setUseStagingConnectBaseUrl(false);
    }
  }, [environment]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    setReturnTo((current) =>
      current.length > 0
        ? current
        : createChromeAppDeeplink(window.location.href),
    );
  }, []);

  const setCaseResult = (caseId: ArenaCaseId, result: TestCaseResult) => {
    setResults((current) => ({ ...current, [caseId]: result }));
  };

  const resetTwoStepState = () => {
    setDuplicateNoncePrime(null);
    setNullifierReplayAction(null);
  };

  const startCase = async (testCase: ArenaCaseDefinition) => {
    if (!APP_ID || !RP_ID) {
      setCaseResult(testCase.id, {
        status: "fail",
        message: "Missing NEXT_PUBLIC_APP_ID or NEXT_PUBLIC_RP_ID",
      });
      return;
    }

    setLastProof(null);
    setLastVerifyResult(null);
    setWidgetOpen(false);

    try {
      const contextCaseId = testCase.contextCaseId ?? "valid_success";
      const finalExpected = FINAL_EXPECTED[testCase.id];
      let phase: RunPhase = "run";
      let expected = testCase.expected;
      let action = makeAction(testCase.id, actionPrefix);
      let nonce: string | undefined;
      let note: string | undefined;

      if (
        contextCaseId === "duplicate_nonce" &&
        duplicateNoncePrime?.caseId === testCase.id
      ) {
        nonce = duplicateNoncePrime.nonce;
        expected = IDKitErrorCodes.DuplicateNonce;
      } else if (contextCaseId === "duplicate_nonce") {
        phase = "prime";
        expected = "success";
      }

      if (
        contextCaseId === "nullifier_replayed" &&
        nullifierReplayAction?.caseId === testCase.id
      ) {
        action = nullifierReplayAction.action;
        expected = IDKitErrorCodes.NullifierReplayed;
      } else if (contextCaseId === "nullifier_replayed") {
        phase = "prime";
        expected = "success";
      }

      setCaseResult(testCase.id, {
        status: "running",
        message:
          phase === "prime"
            ? "Priming with a successful request first"
            : "Waiting for World App",
        expected: finalExpected
          ? expectedLabel(finalExpected)
          : expectedLabel(expected, testCase.expectedProtocol),
      });

      const response = await fetchArenaContext(contextCaseId, action, nonce);
      if (!response.configured) {
        setCaseResult(testCase.id, {
          status: "skipped",
          message: response.error,
          expected: caseExpectedLabel(testCase),
        });
        return;
      }

      action = response.action;
      note = response.note;

      setActiveRun({
        caseId: testCase.id,
        contextCaseId,
        phase,
        expected,
        expectedProtocol: testCase.expectedProtocol,
        finalExpected,
        action,
        rpContext: response.rpContext,
        signal: makeSignal(testCase.id, action),
        request: testCase.request,
      });
      setWidgetOpen(true);

      if (note) {
        setCaseResult(testCase.id, {
          status: "running",
          message: "Waiting for World App",
          expected: finalExpected
            ? expectedLabel(finalExpected)
            : caseExpectedLabel(testCase),
          note,
        });
      }
    } catch (error) {
      setCaseResult(testCase.id, {
        status: "fail",
        message: error instanceof Error ? error.message : "Unknown error",
        expected: caseExpectedLabel(testCase),
      });
    }
  };

  const completeSuccess = (result: IDKitResult) => {
    if (!activeRun) {
      return;
    }

    setLastProof(result);
    setWidgetOpen(false);

    if (activeRun.expected !== "success") {
      setCaseResult(activeRun.caseId, {
        status: "fail",
        message: "Expected an error, but the request succeeded",
        expected: expectedLabel(activeRun.expected),
        actual: `success (${resultProtocol(result)})`,
      });
      setActiveRun(null);
      return;
    }

    if (
      activeRun.expectedProtocol &&
      resultProtocol(result) !== activeRun.expectedProtocol
    ) {
      setCaseResult(activeRun.caseId, {
        status: "fail",
        message: "Received success with a different protocol version",
        expected: expectedLabel("success", activeRun.expectedProtocol),
        actual: `success (${resultProtocol(result)})`,
      });
      setActiveRun(null);
      return;
    }

    if (
      activeRun.phase === "prime" &&
      activeRun.contextCaseId === "duplicate_nonce"
    ) {
      setDuplicateNoncePrime({
        caseId: activeRun.caseId,
        nonce: activeRun.rpContext.nonce,
      });
      setCaseResult(activeRun.caseId, {
        status: "ready",
        message:
          "Nonce consumed. Run this case again to sign a fresh action with that nonce.",
        expected: activeRun.finalExpected
          ? expectedLabel(activeRun.finalExpected)
          : undefined,
        actual: `success (${resultProtocol(result)})`,
      });
      setActiveRun(null);
      return;
    }

    if (
      activeRun.phase === "prime" &&
      activeRun.contextCaseId === "nullifier_replayed"
    ) {
      setNullifierReplayAction({
        action: activeRun.action,
        caseId: activeRun.caseId,
      });
      setCaseResult(activeRun.caseId, {
        status: "ready",
        message:
          "Action verified once. Run this case again to expect nullifier_replayed.",
        expected: activeRun.finalExpected
          ? expectedLabel(activeRun.finalExpected)
          : undefined,
        actual: `success (${resultProtocol(result)})`,
      });
      setActiveRun(null);
      return;
    }

    setCaseResult(activeRun.caseId, {
      status: "pass",
      message: "Received expected success",
      expected: expectedLabel("success", activeRun.expectedProtocol),
      actual: `success (${resultProtocol(result)})`,
    });
    setActiveRun(null);
  };

  const completeError = (errorCode: IDKitErrorCodes) => {
    if (!activeRun) {
      return;
    }

    setWidgetOpen(false);

    const expected =
      activeRun.phase === "prime" && activeRun.finalExpected
        ? activeRun.finalExpected
        : activeRun.expected;

    if (errorCode === expected) {
      setCaseResult(activeRun.caseId, {
        status: "pass",
        message: "Received expected error code",
        expected: expectedLabel(expected),
        actual: errorCode,
      });
      setActiveRun(null);
      return;
    }

    setCaseResult(activeRun.caseId, {
      status: "fail",
      message: "Received a different result than expected",
      expected: expectedLabel(expected),
      actual: errorCode,
    });
    setActiveRun(null);
  };

  const handleWidgetOpenChange = useCallback(
    (open: boolean) => {
      setWidgetOpen(open);
      if (open || !activeRun) {
        return;
      }

      setCaseResult(activeRun.caseId, {
        status: "idle",
        message: "Not run",
      });
      setActiveRun(null);
    },
    [activeRun],
  );

  if (!APP_ID || !RP_ID) {
    return (
      <>
        <button
          className="theme-toggle secondary"
          onClick={() => setIsLightTheme((value) => !value)}
        >
          {isLightTheme ? "Dark" : "Light"}
        </button>
        <section>
          <h2>Missing environment configuration</h2>
          <p>
            Set <code>NEXT_PUBLIC_APP_ID</code>, <code>NEXT_PUBLIC_RP_ID</code>,
            and <code>RP_SIGNING_KEY</code> in <code>.env.local</code>.
          </p>
        </section>
      </>
    );
  }

  return (
    <>
      <button
        className="theme-toggle secondary"
        onClick={() => setIsLightTheme((value) => !value)}
      >
        {isLightTheme ? "Dark" : "Light"}
      </button>

      <section className="config-panel">
        <div className="config-row">
          <label htmlFor="arenaAppId">App ID</label>
          <input type="text" id="arenaAppId" value={APP_ID} readOnly />
        </div>
        <div className="config-row">
          <label htmlFor="arenaRpId">RP ID</label>
          <input type="text" id="arenaRpId" value={RP_ID} readOnly />
        </div>
        <div className="config-row">
          <label htmlFor="arenaActionPrefix">Action prefix</label>
          <input
            type="text"
            id="arenaActionPrefix"
            value={actionPrefix}
            onChange={(event) => {
              setActionPrefix(event.target.value);
              resetTwoStepState();
            }}
          />
        </div>
        <div className="config-row">
          <label htmlFor="arenaEnv">Environment</label>
          <select
            id="arenaEnv"
            value={environment}
            onChange={(event) =>
              setEnvironment(event.target.value as "production" | "staging")
            }
          >
            <option value="production">Production</option>
            <option value="staging">Staging</option>
          </select>
        </div>
        {environment === "staging" && (
          <div className="config-row">
            <label htmlFor="arenaConnectOverride">Connect override</label>
            <input
              type="checkbox"
              id="arenaConnectOverride"
              checked={useStagingConnectBaseUrl}
              onChange={(event) =>
                setUseStagingConnectBaseUrl(event.target.checked)
              }
            />
            <span className="config-note">{STAGING_CONNECT_BASE_URL}</span>
          </div>
        )}
        <div className="config-row">
          <label htmlFor="arenaReturnToEnabled">Return to</label>
          <input
            type="checkbox"
            id="arenaReturnToEnabled"
            checked={useReturnTo}
            onChange={(event) => setUseReturnTo(event.target.checked)}
          />
          <input
            type="text"
            id="arenaReturnTo"
            value={returnTo}
            onChange={(event) => setReturnTo(event.target.value)}
            disabled={!useReturnTo}
          />
        </div>
      </section>

      <div className="arena-sections">
        {ARENA_SECTIONS.map((section) => (
          <section className="arena-section" key={section.id}>
            <div className="arena-section-header">
              <h2>{section.title}</h2>
              <p>{section.description}</p>
            </div>

            <div className="arena-cases">
              {section.cases.map((testCase) => {
                const result = results[testCase.id] ?? {
                  status: "idle",
                  message: "Not run",
                };
                const isRunning =
                  result.status === "running" ||
                  activeRun?.caseId === testCase.id;
                const buttonLabel =
                  result.status === "ready"
                    ? "Run Again"
                    : isRunning
                      ? "Running"
                      : "Run";

                return (
                  <article className="test-case-row" key={testCase.id}>
                    <div className="test-case-copy">
                      <h3>{testCase.title}</h3>
                      <p>{testCase.description}</p>
                      <dl className="test-case-meta">
                        <div>
                          <dt>Request</dt>
                          <dd>{requestLabel(testCase.request)}</dd>
                        </div>
                        <div>
                          <dt>Prerequisite</dt>
                          <dd>{testCase.prerequisite}</dd>
                        </div>
                        <div>
                          <dt>Expected</dt>
                          <dd>
                            <code>{caseExpectedLabel(testCase)}</code>
                          </dd>
                        </div>
                      </dl>
                    </div>
                    <div className="test-case-actions">
                      <button
                        type="button"
                        onClick={() => void startCase(testCase)}
                        disabled={isRunning}
                      >
                        {buttonLabel}
                      </button>
                      <span className={resultClass(result.status)}>
                        {result.status}
                      </span>
                    </div>
                    <div className="test-case-result">
                      <span>{result.message}</span>
                      {result.expected && (
                        <span>
                          Expected: <code>{result.expected}</code>
                        </span>
                      )}
                      {result.actual && (
                        <span>
                          Actual: <code>{result.actual}</code>
                        </span>
                      )}
                      {result.note && <span>{result.note}</span>}
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        ))}
      </div>

      {activeRun && activeFlowConfig && (
        <IDKitRequestWidget
          open={widgetOpen}
          onOpenChange={handleWidgetOpenChange}
          app_id={APP_ID}
          action={activeRun.action}
          rp_context={activeRun.rpContext}
          allow_legacy_proofs={
            activeRun.request.type === "constraints"
              ? activeRun.request.allowLegacyProofs
              : true
          }
          {...activeFlowConfig}
          handleVerify={async (result) => {
            if (activeRun.expected !== "success") {
              return;
            }

            const verified = await verifyProof(result, activeRun.rpContext);
            setLastVerifyResult(verified);
          }}
          onSuccess={completeSuccess}
          onError={completeError}
          environment={environment}
          override_connect_base_url={overrideConnectBaseUrl}
          return_to={effectiveReturnTo}
        />
      )}

      {(lastProof || lastVerifyResult !== null) && (
        <section>
          {lastProof && (
            <>
              <h2>Last IDKit response</h2>
              <pre>{JSON.stringify(lastProof, null, 2)}</pre>
            </>
          )}
          {lastVerifyResult !== null && (
            <>
              <h2>Last verification response</h2>
              <pre>{JSON.stringify(lastVerifyResult, null, 2)}</pre>
            </>
          )}
        </section>
      )}
    </>
  );
}
