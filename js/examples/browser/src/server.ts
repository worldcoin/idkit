import "dotenv/config";
import express from "express";
import { signRequest } from "@worldcoin/idkit-core/signing";

const app = express();
app.use(express.json());

// Demo signing key - in production, load from environment variable
// This is a valid 32-byte hex private key for testing only
const DEMO_SIGNING_KEY =
  "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";
const DEV_PORTAL_BASE_URL =
  process.env.DEV_PORTAL_BASE_URL || "https://developer.world.org";

app.post("/api/rp-signature", (req, res) => {
  const { action, ttl } = req.body;

  if (!action || typeof action !== "string") {
    res.status(400).json({ error: "action is required" });
    return;
  }

  try {
    const sig = signRequest(
      action,
      DEMO_SIGNING_KEY,
      ttl ? Number(ttl) : undefined,
    );

    res.json({
      sig: sig.sig,
      nonce: sig.nonce,
      created_at: sig.createdAt,
      expires_at: sig.expiresAt,
    });
  } catch (error) {
    console.error("Error computing RP signature:", error);
    res.status(500).json({
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

app.post("/api/verify-proof", async (req, res) => {
  const { rp_id, devPortalPayload } = req.body;

  if (!rp_id || !devPortalPayload) {
    res
      .status(400)
      .json({ error: "Missing required fields: rp_id, devPortalPayload" });
    return;
  }

  try {
    const portalResponse = await fetch(
      `${DEV_PORTAL_BASE_URL}/api/v4/verify/${rp_id}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(devPortalPayload),
      },
    );

    const result = await portalResponse.json();

    if (!portalResponse.ok) {
      res
        .status(portalResponse.status)
        .json({ error: "Verification failed", details: result });
      return;
    }

    res.json(result);
  } catch (error) {
    console.error("Verification error:", error);
    res.status(500).json({
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

const PORT = 3001;
app.listen(PORT, () => {
  console.log(`RP signature server running on http://localhost:${PORT}`);
});
