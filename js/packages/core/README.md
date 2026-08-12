# @worldcoin/idkit-core

World ID verification SDK for JavaScript/TypeScript. Zero dependencies, WASM-powered.

## Installation

```bash
npm install @worldcoin/idkit-core
```

## Quickstart

World ID 4.0 has two kinds of verification flows. Pick the one that matches your use case — both can be dropped into an HTML page with the CDN build below.

| Flow | Entry point | Use it when | `action` field |
| --- | --- | --- | --- |
| **Action proof** | `IDKit.request()` | One-time check scoped to a specific action (e.g. `claim-airdrop-2026`). The action scopes the nullifier, so your backend can detect double-claims. | Required |
| **Session proof** | `IDKit.createSession()` / `IDKit.proveSession()` | Returning-user continuity. The user proves they're the same person across visits without redoing a full verification each time. You get back a `session_id` to save and reuse. | Not accepted — sessions are scoped to your app via `rp_context` |

Both flows let you configure the credential level the same way, via `.constraints(...)` (a tree of `CredentialRequest(...)` combined with `any` / `all` / `enumerate`). Action proofs also accept `.preset(...)` for common scenarios — see [Using Presets](#using-presets).

### Action proof on an HTML page

```html
<script src="https://cdn.jsdelivr.net/npm/@worldcoin/idkit-core"></script>
<script>
  async function verify() {
    // 1. Get an RP signature from your backend (see "Backend" section below).
    const sig = await fetch("/api/rp-signature", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "claim-airdrop-2026" }),
    }).then((r) => r.json());

    // 2. Build the request with the credential level you want.
    const request = await IDKit.request({
      app_id: "app_xxxxx",
      action: "claim-airdrop-2026",
      rp_context: {
        rp_id: "rp_xxxxx",
        nonce: sig.nonce,
        created_at: sig.created_at,
        expires_at: sig.expires_at,
        signature: sig.sig,
      },
      allow_legacy_proofs: false,
    }).constraints(IDKit.CredentialRequest("proof_of_human"));

    // 3. Render this URL as a QR code; the user scans it with World App.
    console.log(request.connectorURI);

    // 4. Wait for the user to approve.
    const completion = await request.pollUntilCompletion();
    if (!completion.success) {
      console.error("Verification failed:", completion.error);
      return;
    }

    // 5. Send completion.result to your backend, which calls
    //    POST https://developer.worldcoin.org/api/v4/verify/{rp_id}
  }
  void verify();
</script>
```

### Session proof on an HTML page

`createSession` returns a `session_id` on success — save it server-side as the stable identifier for that user. On return visits, call `proveSession` with the saved ID; the response's `session_id` will match for the same user.

```html
<script src="https://cdn.jsdelivr.net/npm/@worldcoin/idkit-core"></script>
<script>
  async function createSession() {
    const sig = await fetch("/api/rp-context").then((r) => r.json());

    // No `action` field — sessions are scoped via rp_context.
    const request = await IDKit.createSession({
      app_id: "app_xxxxx",
      rp_context: {
        rp_id: "rp_xxxxx",
        nonce: sig.nonce,
        created_at: sig.created_at,
        expires_at: sig.expires_at,
        signature: sig.sig,
      },
    }).constraints(
      // Credential level is configured the same way as action proofs.
      IDKit.any(
        IDKit.CredentialRequest("proof_of_human"),
        IDKit.CredentialRequest("passport"),
      ),
    );

    console.log(request.connectorURI); // render as QR
    const completion = await request.pollUntilCompletion();
    if (!completion.success) return;

    // Save this server-side — it's the stable link for this user.
    await fetch("/api/session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ session_id: completion.result.session_id }),
    });
  }

  async function proveSession(sessionId) {
    const sig = await fetch("/api/rp-context").then((r) => r.json());

    const request = await IDKit.proveSession(sessionId, {
      app_id: "app_xxxxx",
      rp_context: {
        rp_id: "rp_xxxxx",
        nonce: sig.nonce,
        created_at: sig.created_at,
        expires_at: sig.expires_at,
        signature: sig.sig,
      },
    }).constraints(IDKit.CredentialRequest("proof_of_human"));

    const completion = await request.pollUntilCompletion();
    // completion.result.session_id matches sessionId for the same user.
  }
</script>
```

## Script Tag / CDN

The package also publishes a browser global build at
`dist/idkit.global.js`. CDN package roots use that file via the `unpkg` and
`jsdelivr` fields:

```html
<script src="https://cdn.jsdelivr.net/npm/@worldcoin/idkit-core"></script>
```

The script exposes the client namespace as `window.IDKit`. It includes
`IDKit.request`, `IDKit.requestWithInviteCode`, `IDKit.createSession`,
`IDKit.proveSession`, `IDKit.CredentialRequest`, `IDKit.any`, `IDKit.all`,
`IDKit.enumerate`, the World ID 4.0 helpers (`proofOfHuman`, `passport`,
`mnc`, `identityCheck`), and the legacy migration presets.

The WASM file is fetched automatically from the same CDN directory as the
script (`idkit_wasm_bg.wasm`). RP signing is intentionally not exposed on the
browser global; generate RP signatures on your backend with
`@worldcoin/idkit-core/signing`.

```html
<script src="https://cdn.jsdelivr.net/npm/@worldcoin/idkit-core"></script>
<script>
  async function start() {
    const sig = await fetch("/api/rp-signature").then((r) => r.json());
    const request = await IDKit.request({
      app_id: "app_xxxxx",
      action: "my-action",
      rp_context: {
        rp_id: "rp_xxxxx",
        nonce: sig.nonce,
        created_at: sig.created_at,
        expires_at: sig.expires_at,
        signature: sig.sig,
      },
      allow_legacy_proofs: false,
    }).constraints(IDKit.CredentialRequest("proof_of_human"));
  }
  void start();
</script>
```

## Backend: Generate RP Signature

The RP signature authenticates your verification requests. Generate it server-side using the `/signing` subpath (pure JS, no WASM init needed):

```typescript
import { signRequest } from "@worldcoin/idkit-core/signing";

// Never expose RP_SIGNING_KEY to clients
const sig = signRequest({
  action: "my-action",
  signingKeyHex: process.env.RP_SIGNING_KEY!,
});

// Return to client
res.json({
  sig: sig.sig,
  nonce: sig.nonce,
  created_at: sig.createdAt,
  expires_at: sig.expiresAt,
});
```

## Client: Create Verification Request

### Using Presets

For common verification scenarios with World ID 3.0 backward compatibility:

```typescript
import { IDKit, orbLegacy } from "@worldcoin/idkit-core";

// Fetch signature from your backend
const rpSig = await fetch("/api/rp-signature").then((r) => r.json());

const request = await IDKit.request({
  app_id: "app_xxxxx",
  action: "my-action",
  rp_context: {
    rp_id: "rp_xxxxx",
    nonce: rpSig.nonce,
    created_at: rpSig.created_at,
    expires_at: rpSig.expires_at,
    signature: rpSig.sig,
  },
  allow_legacy_proofs: false,
  return_to: "myapp://idkit/callback",
}).preset(orbLegacy({ signal: "user-123" }));

// Display QR code for World App
const qrUrl = request.connectorURI;
```

**Available presets:** `orbLegacy`, `documentLegacy`, `secureDocumentLegacy`, `deviceLegacy`, `selfieCheckLegacy`

Selfie check preset example:

```typescript
import { IDKit, selfieCheckLegacy } from "@worldcoin/idkit-core";

const request = await IDKit.request({
  app_id: "app_xxxxx",
  action: "my-action",
  rp_context: rpContext,
  allow_legacy_proofs: false,
}).preset(selfieCheckLegacy({ signal: "user-123" }));
```

## Handling the Result

Poll for the verification proof, then verify it server-side:

```typescript
// Wait for the user to scan and approve
const completion = await request.pollUntilCompletion({
  pollInterval: 2000,
  timeout: 120_000,
});

if (!completion.success) {
  console.error("Verification failed:", completion.error);
  return;
}

// Send proof to your backend for verification
const verified = await fetch("/api/verify-proof", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(completion.result),
}).then((r) => r.json());
```

On your backend, forward the result to the Developer Portal:

```typescript
const response = await fetch(
  `https://developer.worldcoin.org/api/v4/verify/${RP_ID}`,
  {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req.body),
  },
);

const { success } = await response.json();
```

## Subpath Exports

Pure JS subpath exports are available for server-side use without WASM initialization:

| Subpath    | Exports                                                                                   |
| ---------- | ----------------------------------------------------------------------------------------- |
| `/signing` | `signRequest`, `computeRpSignatureMessage`, `RpSignature` and `SignRequestParams` (types) |
| `/hashing` | `hashSignal`                                                                              |

```typescript
import { signRequest } from "@worldcoin/idkit-core/signing";
import { hashSignal } from "@worldcoin/idkit-core/hashing";
```
