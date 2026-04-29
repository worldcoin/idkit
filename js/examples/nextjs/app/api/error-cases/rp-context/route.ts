import { NextResponse } from "next/server";
import {
  computeRpSignatureMessage,
  signRequest,
} from "@worldcoin/idkit-server";
import { bytesToHex, hexToBytes, keccak256, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

type TestCaseId =
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

type RpContextPayload = {
  rp_id: string;
  nonce: string;
  created_at: number;
  expires_at: number;
  signature: string;
};

type RequestBody = {
  caseId: TestCaseId;
  action?: string;
  nonce?: string;
};

const KNOWN_CASES = new Set<TestCaseId>([
  "valid_success",
  "invalid_rp_signature",
  "duplicate_nonce",
  "nullifier_replayed",
  "invalid_rp_id_format",
  "unknown_rp",
  "inactive_rp",
  "timestamp_too_old",
  "timestamp_too_far_in_future",
  "invalid_timestamp",
  "rp_signature_expired",
]);

const DEFAULT_ACTION = "idkit-test-case";
const DEFAULT_TTL_SEC = 300;
const RP_ID_FORMAT = /^rp_[0-9a-fA-F]{1,16}$/;

function normalizePrivateKey(key: string): Hex {
  const normalized = key.startsWith("0x") ? key : `0x${key}`;
  if (!/^0x[0-9a-fA-F]{64}$/.test(normalized)) {
    throw new Error("Expected a 32-byte hex RP signing key");
  }
  return normalized as Hex;
}

function randomFieldElement(): Hex {
  const randomBytes = crypto.getRandomValues(new Uint8Array(32));
  const field = BigInt(keccak256(randomBytes)) >> 8n;
  return `0x${field.toString(16).padStart(64, "0")}` as Hex;
}

function randomUnknownRpId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return `rp_${bytesToHex(bytes).slice(2)}`;
}

function normalizeNonceOverride(nonce?: string): Hex | undefined {
  if (!nonce) {
    return undefined;
  }

  const normalized = nonce.startsWith("0x") ? nonce : `0x${nonce}`;
  if (!/^0x[0-9a-fA-F]{64}$/.test(normalized)) {
    throw new Error("Expected nonce to be a 32-byte hex string");
  }

  return normalized as Hex;
}

function getUnknownRpId(): { rpId: string; note?: string } {
  const configuredRpId = process.env.TEST_UNKNOWN_RP_ID?.trim();
  if (!configuredRpId) {
    return { rpId: randomUnknownRpId() };
  }

  if (RP_ID_FORMAT.test(configuredRpId)) {
    return { rpId: configuredRpId };
  }

  return {
    rpId: randomUnknownRpId(),
    note: "Ignored TEST_UNKNOWN_RP_ID because it must be rp_ followed by up to 16 hex characters.",
  };
}

async function signControlledRequest({
  action,
  rpId,
  signingKeyHex,
  nonce = randomFieldElement(),
  createdAt,
  expiresAt,
}: {
  action: string;
  rpId: string;
  signingKeyHex: string;
  nonce?: Hex;
  createdAt: number;
  expiresAt: number;
}): Promise<RpContextPayload> {
  const account = privateKeyToAccount(normalizePrivateKey(signingKeyHex));
  const message = computeRpSignatureMessage(
    hexToBytes(nonce),
    createdAt,
    expiresAt,
    action,
  );
  const signature = await account.signMessage({ message: { raw: message } });

  return {
    rp_id: rpId,
    nonce,
    created_at: createdAt,
    expires_at: expiresAt,
    signature,
  };
}

function signDefaultRequest({
  action,
  rpId,
  signingKeyHex,
  ttl = DEFAULT_TTL_SEC,
}: {
  action: string;
  rpId: string;
  signingKeyHex: string;
  ttl?: number;
}): RpContextPayload {
  const signature = signRequest({ action, signingKeyHex, ttl });
  return {
    rp_id: rpId,
    nonce: signature.nonce,
    created_at: signature.createdAt,
    expires_at: signature.expiresAt,
    signature: signature.sig,
  };
}

function mutateSignature(signature: string): string {
  const bytes = hexToBytes(signature as Hex);
  bytes[0] = bytes[0] ^ 0x01;
  return bytesToHex(bytes);
}

function jsonError(message: string, status: number): Response {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(request: Request): Promise<Response> {
  try {
    const body = (await request.json()) as RequestBody;
    if (!KNOWN_CASES.has(body.caseId)) {
      return jsonError(`Unknown test case: ${String(body.caseId)}`, 400);
    }

    const signingKey = process.env.RP_SIGNING_KEY;
    const rpId = process.env.NEXT_PUBLIC_RP_ID;
    if (!signingKey || !rpId) {
      return jsonError("Missing RP_SIGNING_KEY or NEXT_PUBLIC_RP_ID", 500);
    }

    const action = body.action?.trim() || DEFAULT_ACTION;
    const now = Math.floor(Date.now() / 1000);
    let rpContext: RpContextPayload;
    let returnedAction = action;
    let note: string | undefined;

    switch (body.caseId) {
      case "valid_success":
      case "nullifier_replayed":
        rpContext = signDefaultRequest({
          action,
          rpId,
          signingKeyHex: signingKey,
        });
        break;
      case "duplicate_nonce": {
        const nonceOverride = normalizeNonceOverride(body.nonce);
        if (nonceOverride) {
          rpContext = await signControlledRequest({
            action,
            rpId,
            signingKeyHex: signingKey,
            nonce: nonceOverride,
            createdAt: now,
            expiresAt: now + DEFAULT_TTL_SEC,
          });
        } else {
          rpContext = signDefaultRequest({
            action,
            rpId,
            signingKeyHex: signingKey,
          });
        }
        break;
      }
      case "invalid_rp_signature":
        rpContext = signDefaultRequest({
          action,
          rpId,
          signingKeyHex: signingKey,
        });
        rpContext.signature = mutateSignature(rpContext.signature);
        break;
      case "invalid_rp_id_format":
        rpContext = signDefaultRequest({
          action,
          rpId: "invalid_rp_id",
          signingKeyHex: signingKey,
        });
        note =
          "Fails local RP ID validation before the request is opened in World App.";
        break;
      case "unknown_rp":
        {
          const unknownRp = getUnknownRpId();
          note = unknownRp.note;
          rpContext = signDefaultRequest({
            action,
            rpId: unknownRp.rpId,
            signingKeyHex: signingKey,
          });
        }
        break;
      case "inactive_rp": {
        const inactiveRpId = process.env.TEST_INACTIVE_RP_ID;
        if (!inactiveRpId) {
          return NextResponse.json(
            {
              configured: false,
              error:
                "inactive_rp requires TEST_INACTIVE_RP_ID for an RP that exists in the registry but is inactive; random valid RP IDs return unknown_rp",
            },
            { status: 422 },
          );
        }
        rpContext = signDefaultRequest({
          action,
          rpId: inactiveRpId,
          signingKeyHex: process.env.TEST_INACTIVE_RP_SIGNING_KEY || signingKey,
        });
        break;
      }
      case "timestamp_too_old":
        rpContext = await signControlledRequest({
          action,
          rpId,
          signingKeyHex: signingKey,
          createdAt: now - 20 * 60,
          expiresAt: now + 5 * 60,
        });
        break;
      case "timestamp_too_far_in_future":
        rpContext = await signControlledRequest({
          action,
          rpId,
          signingKeyHex: signingKey,
          createdAt: now + 20 * 60,
          expiresAt: now + 25 * 60,
        });
        break;
      case "invalid_timestamp":
        rpContext = await signControlledRequest({
          action,
          rpId,
          signingKeyHex: signingKey,
          createdAt: now,
          expiresAt: now - 1,
        });
        note =
          "Fails local timestamp validation before the request is opened in World App.";
        break;
      case "rp_signature_expired":
        rpContext = await signControlledRequest({
          action,
          rpId,
          signingKeyHex: signingKey,
          createdAt: now - 120,
          expiresAt: now - 30,
        });
        break;
      default: {
        const exhaustive: never = body.caseId;
        throw new Error(`Unhandled test case: ${String(exhaustive)}`);
      }
    }

    if (body.caseId === "invalid_rp_signature") {
      returnedAction = action;
    }

    return NextResponse.json({
      configured: true,
      caseId: body.caseId,
      action: returnedAction,
      rpContext,
      note,
    });
  } catch (error) {
    console.error("Error generating test-case RP context:", error);
    return jsonError(
      error instanceof Error ? error.message : "Unknown server error",
      500,
    );
  }
}
