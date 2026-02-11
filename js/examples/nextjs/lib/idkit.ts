import { IDKit, signRequest } from "@worldcoin/idkit-core";

let initPromise: Promise<void> | null = null;

function getEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

async function ensureServerInit(): Promise<void> {
  if (!initPromise) {
    initPromise = IDKit.initServer().catch((error) => {
      // Allow retry if initialization fails (e.g. after hot-reload with stale state).
      initPromise = null;
      throw error;
    });
  }
  await initPromise;
}

export async function createRpSignature(
  action: string,
  ttl?: number,
): Promise<{
  sig: string;
  nonce: string;
  created_at: number;
  expires_at: number;
}> {
  await ensureServerInit();

  const signingKey = getEnv("RP_SIGNING_KEY");
  const signature = signRequest(action, signingKey, ttl);

  return {
    sig: signature.sig,
    nonce: signature.nonce,
    created_at: Number(signature.createdAt),
    expires_at: Number(signature.expiresAt),
  };
}

export async function verifyWithDeveloperPortal(
  rpId: string,
  devPortalPayload: unknown,
): Promise<{ status: number; payload: unknown }> {
  const baseUrl =
    process.env.DEV_PORTAL_BASE_URL?.trim() || "https://developer.world.org";

  const response = await fetch(`${baseUrl}/api/v4/verify/${rpId}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(devPortalPayload),
  });

  const payload = await response.json();
  return {
    status: response.status,
    payload,
  };
}
