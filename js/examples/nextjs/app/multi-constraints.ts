import {
  CredentialRequest,
  all,
  any,
  enumerate,
  type ConstraintNode,
  type CredentialType,
} from "@worldcoin/idkit";

/** Combinators exposed by the "Multiple credentials" option. */
export type MultiCombinator = "any" | "all" | "enumerate";

/**
 * Credentials that can be combined. The order here is the order sent to
 * World App, which matters for `any` (earlier entries have higher priority).
 */
export const MULTI_CREDENTIALS: readonly CredentialType[] = [
  "proof_of_human",
  "selfie",
  "passport",
  "mnc",
];

export const MULTI_COMBINATORS: readonly MultiCombinator[] = [
  "any",
  "all",
  "enumerate",
];

export const DEFAULT_MULTI_CREDENTIALS: readonly CredentialType[] = [
  "proof_of_human",
  "selfie",
];
export const DEFAULT_MULTI_COMBINATOR: MultiCombinator = "any";

export const MULTI_CREDENTIAL_TO_NAME: Record<CredentialType, string> = {
  proof_of_human: "PoH",
  selfie: "Selfie",
  passport: "Passport",
  mnc: "MNC",
};

export const MULTI_COMBINATOR_TO_NAME: Record<MultiCombinator, string> = {
  any: "Any (OR)",
  all: "All (AND)",
  enumerate: "Enumerate",
};

export type MultiCredentialOptions = {
  signal?: string;
  genesis_issued_at_min?: number;
};

/** Keeps only known credentials, deduplicated, in canonical priority order. */
export function normalizeMultiCredentials(
  value: unknown,
  fallback: readonly CredentialType[],
): CredentialType[] {
  if (!Array.isArray(value)) {
    return [...fallback];
  }

  return MULTI_CREDENTIALS.filter((credential) => value.includes(credential));
}

function selectedInPriorityOrder(
  credentials: readonly CredentialType[],
): CredentialType[] {
  return MULTI_CREDENTIALS.filter((credential) =>
    credentials.includes(credential),
  );
}

/**
 * Builds the constraint tree exactly as the widget sends it, using IDKit's own
 * `any()` / `all()` / `enumerate()` helpers around `CredentialRequest(...)`.
 *
 * An empty selection is passed through so the IDKit core rejects it
 * ("... constraint must have at least one child"); callers should gate on it.
 */
export function buildMultiConstraints(
  combinator: MultiCombinator,
  credentials: readonly CredentialType[],
  options: MultiCredentialOptions = {},
): ConstraintNode {
  const nodes = selectedInPriorityOrder(credentials).map((credential) =>
    CredentialRequest(credential, options),
  );

  switch (combinator) {
    case "any":
      return any(...nodes);
    case "all":
      return all(...nodes);
    case "enumerate":
      return enumerate(...nodes);
    default: {
      const exhaustive: never = combinator;
      throw new Error(`Unsupported combinator: ${String(exhaustive)}`);
    }
  }
}

/** Human-readable label, e.g. "PoH OR Passport" or "Enumerate(PoH, MNC)". */
export function describeMultiConstraints(
  combinator: MultiCombinator,
  credentials: readonly CredentialType[],
): string {
  const names = selectedInPriorityOrder(credentials).map(
    (credential) => MULTI_CREDENTIAL_TO_NAME[credential],
  );

  if (names.length === 0) {
    return "no credentials";
  }

  switch (combinator) {
    case "any":
      return names.join(" OR ");
    case "all":
      return names.join(" AND ");
    case "enumerate":
      return `Enumerate(${names.join(", ")})`;
    default: {
      const exhaustive: never = combinator;
      throw new Error(`Unsupported combinator: ${String(exhaustive)}`);
    }
  }
}
