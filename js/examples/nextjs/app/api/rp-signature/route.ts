import { NextResponse } from "next/server";
import { signRequest, IDKit } from "@worldcoin/idkit-core";

// export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  try {
    const body = (await request.json()) as {
      action?: string;
      ttl?: number;
    };

    const signingKey = process.env.RP_SIGNING_KEY;
    await IDKit.initServer();
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
      created_at: Number(createdAt),
      expires_at: Number(expiresAt),
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
