import { NextResponse } from "next/server";

// export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  try {
    const body = (await request.json()) as {
      rp_id?: string;
      devPortalPayload?: unknown;
    };

    const baseUrl =
      process.env.DEV_PORTAL_BASE_URL?.trim() || "https://developer.world.org";

    const response = await fetch(`${baseUrl}/api/v4/verify/${body.rp_id}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(body.devPortalPayload),
    });

    const payload = await response.json();

    return NextResponse.json(payload);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unknown server error",
      },
      { status: 500 },
    );
  }
}
