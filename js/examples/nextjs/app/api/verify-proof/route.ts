import { IDKitResult } from "@worldcoin/idkit";
import { NextResponse } from "next/server";

// export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  try {
    const body = (await request.json()) as {
      rp_id?: string;
      devPortalPayload?: IDKitResult;
    };

    const baseUrl =
      process.env.DEV_PORTAL_BASE_URL?.trim() || "https://developer.world.org";

    const devPortalPayloadWithDefaultSignal = {
      ...body.devPortalPayload,
      responses:
        body.devPortalPayload?.responses.map((r) => {
          let signal_hash = r.signal_hash;
          // 3.0 proof and signal doens't exist
          if (
            !signal_hash &&
            body.devPortalPayload?.protocol_version === "3.0"
          ) {
            signal_hash =
              "0x00c5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a4";
          }
          // 4.0 proof and signal doesn't exist
          else if (
            !signal_hash &&
            body.devPortalPayload?.protocol_version === "4.0"
          ) {
            signal_hash = "0x0";
          }

          return {
            ...r,
            signal_hash,
          };
        }) || [],
    };

    const response = await fetch(`${baseUrl}/api/v4/verify/${body.rp_id}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(body.devPortalPayload),
    });

    const payload = await response.json();

    return NextResponse.json(payload, {
      status: response.status,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unknown server error",
      },
      { status: 500 },
    );
  }
}
