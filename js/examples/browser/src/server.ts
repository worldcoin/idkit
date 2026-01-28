import express from "express";
import { IDKit, signRequest } from "@worldcoin/idkit-core";

const app = express();
app.use(express.json());

// Demo signing key - in production, load from environment variable
// This is a valid 32-byte hex private key for testing only
const DEMO_SIGNING_KEY =
  "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";

// Initialize WASM for server environment
await IDKit.initServer();

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
      created_at: Number(sig.createdAt),
      expires_at: Number(sig.expiresAt),
    });
  } catch (error) {
    console.error("Error computing RP signature:", error);
    res.status(500).json({
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

const PORT = 3001;
app.listen(PORT, () => {
  console.log(`RP signature server running on http://localhost:${PORT}`);
});
