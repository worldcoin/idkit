import { NextResponse } from "next/server";
import { signRequest } from "@worldcoin/idkit/signing";

// export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  try {
    const body = (await request.json()) as {
      action?: string;
      ttl?: number;
    };

    const signingKey = process.env.RP_SIGNING_KEY;
    const { sig, nonce, createdAt, expiresAt } = signRequest(
      body.action!,
      signingKey!,
      body.ttl,
    );

    console.log("Generated RP signature:", {
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
