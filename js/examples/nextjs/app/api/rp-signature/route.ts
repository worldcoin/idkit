import { NextResponse } from "next/server";
import { createRpSignature } from "../../../lib/idkit";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  try {
    const body = (await request.json()) as {
      action?: unknown;
      ttl?: unknown;
    };

    if (!body.action || typeof body.action !== "string") {
      return NextResponse.json(
        { error: "action is required" },
        { status: 400 },
      );
    }

    const ttl = typeof body.ttl === "number" ? body.ttl : undefined;
    const signature = await createRpSignature(body.action, ttl);

    return NextResponse.json(signature);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unknown server error",
      },
      { status: 500 },
    );
  }
}
