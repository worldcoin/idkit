import { createHash, createPublicKey } from "crypto";
import { NextResponse } from "next/server";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { decode as cborDecode } from "cbor-x";
import { p256 } from "@noble/curves/nist.js";

export const runtime = "nodejs";

interface IntegrityBundle {
  version: number;
  signature_format: string;
  timestamp: number;
  /** Hex-encoded CBOR assertion containing DER signature + authenticatorData */
  signature: string;
  /** Attestation Gateway JWT with cnf.jwk key binding */
  jwt: string;
}

interface JWKPublicKey {
  kty: string;
  crv: string;
  x: string;
  y: string;
  kid: string;
}

export async function POST(request: Request): Promise<Response> {
  try {
    const body = (await request.json()) as {
      bundle?: IntegrityBundle;
      proofs?: string[];
      nonce?: string;
      protocol_version?: string;
      environment?: string;
    };

    if (
      !body.bundle?.signature ||
      !body.bundle?.jwt ||
      !Array.isArray(body.proofs)
    ) {
      return NextResponse.json(
        { error: "Missing required fields: bundle, proofs" },
        { status: 400 },
      );
    }

    const rpId = process.env.NEXT_PUBLIC_RP_ID?.trim();

    const result = await verifyIntegrityBundle(
      body.bundle,
      body.proofs,
      body.nonce,
      body.protocol_version,
      body.environment ?? "production",
      rpId,
    );

    return NextResponse.json(result);
  } catch (error) {
    console.error("Integrity bundle verification error:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unknown server error",
      },
      { status: 500 },
    );
  }
}

async function verifyIntegrityBundle(
  bundle: IntegrityBundle,
  proofs: string[],
  nonce: string | undefined,
  protocol_version: string | undefined,
  environment: string,
  rp_id: string | undefined,
) {
  const base =
    environment === "production"
      ? "https://attestation.worldcoin.org"
      : "https://attestation.worldcoin.dev";

  // Decode JWT payload without signature verification for display purposes.
  const rawJwtClaims = decodeJwtPayload(bundle.jwt);
  const expectedIss =
    environment === "production"
      ? "attestation.worldcoin.org"
      : "attestation.worldcoin.dev";

  // Step 1: Fetch JWKS and verify JWT; extract cnf.jwk
  const JWKS = createRemoteJWKSet(new URL(`${base}/.well-known/jwks.json`));

  let cnfJWK: JWKPublicKey;
  let jwtClaims: { issuer: string; audience: string[]; expiresAt: number };

  try {
    const { payload } = await jwtVerify(bundle.jwt, JWKS);

    if (payload.iss !== expectedIss) {
      throw new Error(
        `Invalid JWT issuer: got "${payload.iss}", expected "${expectedIss}"`,
      );
    }

    const audList = Array.isArray(payload.aud)
      ? payload.aud
      : [payload.aud ?? ""];
    if (!rp_id) {
      throw new Error("rp_id is required for audience validation");
    }
    if (!audList.includes(rp_id)) {
      throw new Error(
        `Invalid JWT audience: got [${audList.join(", ")}], expected "${rp_id}"`,
      );
    }

    const cnf = payload.cnf as { jwk?: JWKPublicKey } | undefined;
    if (!cnf?.jwk) {
      throw new Error("JWT missing cnf key binding");
    }

    cnfJWK = cnf.jwk;
    jwtClaims = {
      issuer: payload.iss,
      audience: audList,
      expiresAt: payload.exp ?? 0,
    };
  } catch (error) {
    return {
      valid: false,
      jwtValid: false,
      jwtError:
        error instanceof Error ? error.message : "JWT verification failed",
      expectedIss,
      rawJwtClaims,
    };
  }

  // Step 2: Decode signature bytes — format depends on platform:
  //   apple_app_attest: hex-encoded CBOR {signature, authenticatorData}
  //   android_keystore: hex-encoded DER ECDSA signature (no authenticatorData)
  let signature: Buffer;
  let authenticatorData: Buffer | null = null;

  try {
    if (bundle.signature_format === "android_keystore") {
      signature = Buffer.from(bundle.signature, "hex");
    } else {
      const assertionData = Buffer.from(bundle.signature, "hex");
      const decoded = cborDecode(assertionData) as Record<string, Uint8Array>;

      if (!decoded.signature || !decoded.authenticatorData) {
        throw new Error("CBOR assertion missing required fields");
      }

      signature = Buffer.from(decoded.signature);
      authenticatorData = Buffer.from(decoded.authenticatorData);
    }
  } catch (error) {
    return {
      valid: false,
      jwtValid: true,
      jwtClaims,
      assertionValid: false,
      assertionError:
        error instanceof Error ? error.message : "Signature decode failed",
    };
  }

  const step2 = {
    signatureBytes: signature.length,
    signatureHex: signature.toString("hex"),
    ...(authenticatorData
      ? {
          authenticatorDataBytes: authenticatorData.length,
          authenticatorDataHex: authenticatorData.toString("hex"),
        }
      : {}),
  };

  // Step 3:
  const xBytes = base64URLToBuffer(cnfJWK.x);
  const yBytes = base64URLToBuffer(cnfJWK.y);
  const x963 = Buffer.concat([Buffer.from([0x04]), xBytes, yBytes]);

  // Step 4: clientDataHash depends on protocol version:
  //   v4 = SHA256("worldcoin/proof-integrity/v4" || nonce_32_bytes_BE)
  //   v3 = proofV3Digest(proofs)
  const clientDataHash =
    protocol_version === "4.0" && nonce
      ? proofV4Digest(nonce)
      : proofV3Digest(proofs);

  // Bind the bundle timestamp: SHA256(timestamp_8_bytes_BE || clientDataHash)
  const tsBuf = Buffer.alloc(8);
  tsBuf.writeBigInt64BE(BigInt(bundle.timestamp));
  const integrityDigest = createHash("sha256")
    .update(Buffer.concat([tsBuf, clientDataHash]))
    .digest();

  const step4 = {
    clientDataHash: clientDataHash.toString("hex"),
    integrityDigest: integrityDigest.toString("hex"),
  };

  // For apple_app_attest: sigNonce = SHA256(authenticatorData || integrityDigest).
  //   CryptoKit isValidSignature SHA256s its input, so the signed hash = SHA256(sigNonce).
  // For android_keystore: NONEwithECDSA signs integrityDigest raw, so messageToVerify IS the hash.
  const messageToVerify = authenticatorData
    ? createHash("sha256")
        .update(Buffer.concat([authenticatorData, integrityDigest]))
        .digest()
    : integrityDigest;

  const step5 = authenticatorData
    ? { sigNonce: messageToVerify.toString("hex") }
    : {};

  // Step 5: Verify ECDSA-P256 signature.
  // Android (NONEwithECDSA): device signed integrityDigest raw — pass it directly as the hash.
  // iOS (CryptoKit isValidSignature): internally SHA256s the input — pass SHA256(sigNonce).
  // Both platforms emit DER-encoded signatures.
  try {
    const signatureValid = p256.verify(signature, messageToVerify, x963, {
      format: "der",
      lowS: false,
      prehash: bundle.signature_format !== "android_keystore",
    });

    return {
      valid: signatureValid,
      jwtValid: true,
      jwtClaims,
      expectedIss,
      rawJwtClaims,
      assertionValid: signatureValid,
      ...(signatureValid
        ? {}
        : { assertionError: "Assertion signature invalid" }),
      signatureFormat: bundle.signature_format,
      timestamp: bundle.timestamp,
      version: bundle.version,
      step2,
      step4,
      step5,
    };
  } catch (error) {
    return {
      valid: false,
      jwtValid: true,
      jwtClaims,
      assertionValid: false,
      assertionError:
        error instanceof Error ? error.message : "Signature verification error",
    };
  }
}

// Domain-separated SHA256 over the RP-supplied nonce field element (32-byte BE).
// Matches compute_proof_v4_digest in the Rust IDKit SDK.
function proofV4Digest(nonce: string): Buffer {
  const hash = createHash("sha256");
  hash.update("worldcoin/proof-integrity/v4");
  const nonceHex = nonce.startsWith("0x") ? nonce.slice(2) : nonce;
  const nonceBytes = Buffer.from(nonceHex.padStart(64, "0"), "hex");
  hash.update(nonceBytes);
  return hash.digest();
}

// Domain-separated SHA256 over count and length-prefixed proof strings.
// Matches proofV3Digest in IntegrityBundleVerifier.swift and
// compute_proof_v3_digest in the Rust IDKit SDK.
function proofV3Digest(proofs: string[]): Buffer {
  const hash = createHash("sha256");
  hash.update("worldcoin/proof-integrity/v3");

  const countBuf = Buffer.alloc(4);
  countBuf.writeUInt32BE(proofs.length, 0);
  hash.update(countBuf);

  for (const proof of proofs) {
    const proofBuf = Buffer.from(proof, "utf8");
    const lenBuf = Buffer.alloc(4);
    lenBuf.writeUInt32BE(proofBuf.length, 0);
    hash.update(lenBuf);
    hash.update(proofBuf);
  }

  return hash.digest();
}

function base64URLToBuffer(str: string): Buffer {
  const base64 = str.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  return Buffer.from(padded, "base64");
}

function decodeJwtPayload(jwt: string): Record<string, unknown> | null {
  try {
    const part = jwt.split(".")[1];
    if (!part) return null;
    const json = Buffer.from(
      part.replace(/-/g, "+").replace(/_/g, "/"),
      "base64",
    ).toString("utf8");
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}
