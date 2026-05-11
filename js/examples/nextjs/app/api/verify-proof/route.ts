import { NextResponse } from "next/server";
import type { IDKitResult } from "@worldcoin/idkit";

// export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  try {
    const body = (await request.json()) as {
      rp_id?: string;
      devPortalPayload?: IDKitResult;
      devPortalBaseUrl?: string;
    };

    const baseUrl =
      body.devPortalBaseUrl?.trim() ||
      process.env.DEV_PORTAL_BASE_URL?.trim() ||
      "https://developer.world.org";

    const response = await fetch(`${baseUrl}/api/v4/verify/${body.rp_id}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(body.devPortalPayload),
    });

    const payload = await response.json();

    console.log("Received response from Dev Portal:", {
      payload,
      status: response.status,
      statusText: response.statusText,
    });

    return NextResponse.json(payload, {
      status: response.status,
    });
  } catch (error) {
    console.error("Failed to verify proof:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unknown server error",
      },
      { status: 500 },
    );
  }
}
