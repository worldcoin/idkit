import { NextResponse } from "next/server";
import { signRequest } from "@worldcoin/idkit/signing";

// export const runtime = "nodejs";

type SignatureType = "request" | "create_session" | "session";

function isSignatureType(value: unknown): value is SignatureType {
  return (
    value === "request" || value === "create_session" || value === "session"
  );
}

export async function POST(request: Request): Promise<Response> {
  try {
    const body = (await request.json()) as {
      signature_type?: SignatureType;
      action?: string;
      ttl?: number;
    };

    const signatureType = body.signature_type ?? "request";
    if (!isSignatureType(signatureType)) {
      return NextResponse.json(
        { error: "Invalid signature_type" },
        { status: 400 },
      );
    }

    if (body.action !== undefined && typeof body.action !== "string") {
      return NextResponse.json(
        { error: "action must be a string" },
        { status: 400 },
      );
    }

    const action = body.action?.trim() || undefined;
    if (signatureType !== "request" && action) {
      return NextResponse.json(
        { error: "Session signatures must not include action" },
        { status: 400 },
      );
    }

    const signingKey = process.env.RP_SIGNING_KEY;
    const { sig, nonce, createdAt, expiresAt } = signRequest({
      ...(signatureType === "request" && action ? { action } : {}),
      signingKeyHex: signingKey!,
      ttl: body.ttl,
    });

    console.log("Generated RP signature:", {
      signatureType,
      sig,
      nonce,
      createdAt,
      expiresAt,
    });

    return NextResponse.json({
      sig: sig,
      nonce: nonce,
      created_at: createdAt,
      expires_at: expiresAt,
    });
  } catch (error) {
    console.error("Error generating RP signature:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unknown server error",
      },
      { status: 500 },
    );
  }
}
