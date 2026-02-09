import { NextResponse } from "next/server";
import { verifyWithDeveloperPortal } from "../../../lib/idkit";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  try {
    const body = (await request.json()) as {
      rp_id?: unknown;
      devPortalPayload?: unknown;
    };

    if (!body.rp_id || typeof body.rp_id !== "string") {
      return NextResponse.json(
        { error: "rp_id is required" },
        { status: 400 },
      );
    }

    if (!body.devPortalPayload) {
      return NextResponse.json(
        { error: "devPortalPayload is required" },
        { status: 400 },
      );
    }

    const portalResponse = await verifyWithDeveloperPortal(
      body.rp_id,
      body.devPortalPayload,
    );

    if (portalResponse.status >= 400) {
      return NextResponse.json(
        {
          error: "Verification failed",
          details: portalResponse.payload,
        },
        { status: portalResponse.status },
      );
    }

    return NextResponse.json(portalResponse.payload);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unknown server error",
      },
      { status: 500 },
    );
  }
}
