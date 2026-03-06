import { NextResponse } from "next/server";

// export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  try {
    const body = (await request.json()) as {
      rp_id?: string;
      devPortalPayload?: unknown;
    };
    const rpId = body.rp_id?.trim();

    if (!rpId || !body.devPortalPayload) {
      return NextResponse.json(
        { error: "Missing required fields: rp_id, devPortalPayload" },
        { status: 400 },
      );
    }

    const baseUrl =
      process.env.DEV_PORTAL_BASE_URL?.trim() || "https://developer.world.org";

    const response = await fetch(`${baseUrl}/api/v4/verify/${rpId}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(body.devPortalPayload),
    });

    const payload = await response.json();

    return NextResponse.json(payload, { status: response.status });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unknown server error",
      },
      { status: 500 },
    );
  }
}
