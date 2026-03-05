"use client";

import { useState, type ReactElement } from "react";

const RP_ID = process.env.NEXT_PUBLIC_RP_ID ?? "";

type Environment = "production" | "staging";

type InputResponse = {
  identifier: string;
  issuer_schema_id: number;
  proof: string;
  nullifier: string;
  expires_at_min: number;
  signal_hash?: string;
};

type InputPayload = {
  environment?: string;
  responses: InputResponse[];
};

type DevPortalPayload = {
  protocol_version: "4.0";
  nonce: string;
  action: string;
  action_description?: string;
  responses: Array<{
    identifier: string;
    signal_hash?: string;
    issuer_schema_id: number;
    proof: string[];
    nullifier: string;
    expires_at_min: number;
  }>;
  environment: Environment;
};

const SAMPLE_RESPONSE = `{
  "id": "request_6367765D-976B-4413-9616-425136C09087",
  "version": 1,
  "responses": [
    {
      "identifier": "credential",
      "issuer_schema_id": 128,
      "proof": "570f894104ed66d57bb6ff8f2be175db70bb470f4c6fb914c1464edbcb82099f28af2217f4d582318fee1a0da87b2147f2741e5e6aceffa2d56c98b22c10daa02a81686df3227297cc2a57ce1e5d925c6d2643b0de9761b79d8f1b3bb60f5b05298b069964bb311021e2aaac0c0e21da9ccafe92d070299d94d37e5a7238afa71f15ba5e9c790e3e5ffc32c7d90e59df6f0a23fd4d55ecda4c725ed1bc1a6128",
      "nullifier": "0x2391dfe4686e49e35355e777db3687202ac2e3a553b58a3f1886034823d307da",
      "expires_at_min": 1772584197
    }
  ]
}`;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function readInteger(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isInteger(parsed)) {
      return parsed;
    }
  }

  return null;
}

function expectedShapeError(): Error {
  return new Error(
    'Expected shape: { "responses": [{ "identifier": string, "issuer_schema_id": number, "proof": string, "nullifier": string, "expires_at_min": number }] }',
  );
}

function parseExpectedInput(raw: unknown): InputPayload {
  if (!isRecord(raw)) {
    throw expectedShapeError();
  }

  const responsesRaw = raw.responses;

  if (!Array.isArray(responsesRaw) || responsesRaw.length === 0) {
    throw expectedShapeError();
  }

  const firstItem = responsesRaw[0];
  const firstIdentifier = isRecord(firstItem)
    ? readString(firstItem.identifier)
    : null;
  if (!firstIdentifier) {
    throw expectedShapeError();
  }

  const responses = responsesRaw.map((item, index) => {
    if (!isRecord(item)) {
      throw new Error(`responses[${index}] must be an object`);
    }

    const identifier = readString(item.identifier);
    const issuerSchemaId = readInteger(item.issuer_schema_id);
    const proof = readString(item.proof);
    const nullifier = readString(item.nullifier);
    const expiresAtMin = readInteger(item.expires_at_min);
    const signalHash = readString(item.signal_hash) ?? undefined;

    if (!identifier) {
      throw new Error(`responses[${index}].identifier is required`);
    }
    if (issuerSchemaId === null) {
      throw new Error(
        `responses[${index}].issuer_schema_id must be an integer`,
      );
    }
    if (!proof) {
      throw new Error(`responses[${index}].proof must be a hex string`);
    }
    if (!nullifier) {
      throw new Error(`responses[${index}].nullifier is required`);
    }
    if (expiresAtMin === null) {
      throw new Error(`responses[${index}].expires_at_min must be an integer`);
    }

    return {
      identifier,
      issuer_schema_id: issuerSchemaId,
      proof,
      nullifier,
      expires_at_min: expiresAtMin,
      ...(signalHash ? { signal_hash: signalHash } : {}),
    };
  });

  return {
    responses,
  };
}

function parseHexToBytes(hexValue: string, responseIndex: number): Uint8Array {
  const normalized = hexValue.trim().replace(/^0x/i, "");

  if (!/^[0-9a-fA-F]+$/.test(normalized)) {
    throw new Error(`responses[${responseIndex}].proof must be hex`);
  }
  if (normalized.length % 2 !== 0) {
    throw new Error(
      `responses[${responseIndex}].proof hex length must be even`,
    );
  }

  const bytes = new Uint8Array(normalized.length / 2);
  for (let i = 0; i < normalized.length; i += 2) {
    const byteHex = normalized.slice(i, i + 2);
    const parsed = Number.parseInt(byteHex, 16);
    if (Number.isNaN(parsed)) {
      throw new Error(
        `responses[${responseIndex}].proof has invalid hex bytes`,
      );
    }
    bytes[i / 2] = parsed;
  }

  return bytes;
}

function bytesToHex(bytes: Uint8Array): string {
  let output = "";
  for (let i = 0; i < bytes.length; i += 1) {
    output += bytes[i]!.toString(16).padStart(2, "0");
  }
  return output;
}

// proof.rs logic: decode compressed hex proof into exactly 160 bytes (5 x 32 bytes).
function parseCompressedProofWords(
  proofHex: string,
  responseIndex: number,
): string[] {
  const bytes = parseHexToBytes(proofHex, responseIndex);
  if (bytes.length !== 160) {
    throw new Error(
      `responses[${responseIndex}].proof must decode to 160 bytes, got ${bytes.length}`,
    );
  }

  const words: string[] = [];
  for (let i = 0; i < 5; i += 1) {
    const start = i * 32;
    const end = start + 32;
    words.push(`0x${bytesToHex(bytes.slice(start, end))}`);
  }
  return words;
}

function mapToDevPortalPayload(
  inputJson: InputPayload,
  action: string,
  nonceFromInput: string,
  environment: "staging" | "production",
): DevPortalPayload {
  const nonce = nonceFromInput;
  if (!nonce) {
    throw new Error("Nonce is required");
  }

  return {
    protocol_version: "4.0",
    nonce,
    action,
    responses: inputJson.responses.map((response, index) => ({
      identifier: response.identifier,
      issuer_schema_id: response.issuer_schema_id,
      proof: parseCompressedProofWords(response.proof, index),
      nullifier: response.nullifier,
      expires_at_min: response.expires_at_min,
      ...(response.signal_hash ? { signal_hash: response.signal_hash } : {}),
    })),
    environment,
  };
}

function extractErrorMessage(payload: unknown): string {
  if (isRecord(payload)) {
    const error = readString(payload.error);
    if (error) {
      return error;
    }

    const details = payload.details;
    if (details !== undefined) {
      return `Verification failed: ${JSON.stringify(details)}`;
    }
  }

  return "Verification failed";
}

export function VerifyProofClient(): ReactElement {
  const [inputValue, setInputValue] = useState(SAMPLE_RESPONSE);
  const [actionValue, setActionValue] = useState("");
  const [nonceValue, setNonceValue] = useState("");
  const [environment, setEnvironment] = useState<"staging" | "production">(
    "staging",
  );
  const [verifyResult, setVerifyResult] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const onSubmit = async () => {
    setError(null);
    setVerifyResult(null);
    setIsSubmitting(true);

    try {
      const action = actionValue.trim();
      const nonce = nonceValue.trim();
      if (!action) {
        throw new Error("Action is required");
      }

      const parsed = JSON.parse(inputValue) as unknown;
      const inputJson = parseExpectedInput(parsed);
      const devPortalPayload = mapToDevPortalPayload(
        inputJson,
        action,
        nonce,
        environment,
      );

      if (!RP_ID.trim()) {
        throw new Error("Missing NEXT_PUBLIC_RP_ID");
      }

      const response = await fetch("/api/verify-proof", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          rp_id: RP_ID,
          devPortalPayload,
        }),
      });

      const payload = (await response.json()) as unknown;
      setVerifyResult(payload);

      if (!response.ok) {
        throw new Error(extractErrorMessage(payload));
      }
    } catch (submitError) {
      setError(
        submitError instanceof Error ? submitError.message : "Unknown error",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <section className="config-panel">
        <div className="config-row">
          <label htmlFor="verifyProofRpId">RP ID</label>
          <input type="text" id="verifyProofRpId" value={RP_ID} disabled />
        </div>
        <div className="config-row">
          <label htmlFor="verifyProofAction">Action</label>
          <input
            type="text"
            id="verifyProofAction"
            value={actionValue}
            onChange={(event) => setActionValue(event.target.value)}
            placeholder="Enter action"
          />
        </div>
        <div className="config-row">
          <label htmlFor="verifyProofNonce">Nonce</label>
          <input
            type="text"
            id="verifyProofNonce"
            value={nonceValue}
            onChange={(event) => setNonceValue(event.target.value)}
            placeholder="Enter nonce"
          />
        </div>
        <div className="config-row">
          <label htmlFor="cfgEnv">Environment</label>
          <select
            id="cfgEnv"
            value={environment}
            onChange={(e) =>
              setEnvironment(e.target.value as "production" | "staging")
            }
          >
            <option value="production">Production</option>
            <option value="staging">Staging</option>
          </select>
        </div>
      </section>

      <section>
        <h2>Paste response JSON</h2>
        <textarea
          className="json-input"
          value={inputValue}
          onChange={(event) => setInputValue(event.target.value)}
        />
        <div className="stack">
          <button onClick={onSubmit} disabled={isSubmitting}>
            {isSubmitting ? "Verifying..." : "Verify 4.0 proof response"}
          </button>
        </div>
        <p className="status">Nonce comes only from the form input.</p>
      </section>

      {error && <p className="status">Error: {error}</p>}

      {verifyResult && (
        <section>
          <h3>Verification response</h3>
          <pre>{JSON.stringify(verifyResult, null, 2)}</pre>
        </section>
      )}
    </>
  );
}
