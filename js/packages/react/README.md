# @worldcoin/idkit

React SDK for World ID built on top of `@worldcoin/idkit-core`.

## Highlights

- Built-in controlled widgets with shadow DOM isolation
- Separate request and session APIs
- Pure JS `/signing` and `/hashing` subpath exports for server-side use

## Installation

```bash
npm install @worldcoin/idkit
```

## Quickstart

### Requirements

From the [Developer Portal](https://developer.world.org): `app_id`, `rp_id`, and an RP signing key. Keep the signing key on your backend only.

There are two ways you can request proofs with IDKit, and they depend on how you want to use the SDK.

If you want to request a World ID session-scoped proof, use `IDKitSessionWidget` and store the result `session_id`. On a return visit, pass that `session_id` as `existing_session_id` to log and sync existing users with their session data.

```tsx
import { useState } from "react";
import { IDKitSessionWidget, CredentialRequest } from "@worldcoin/idkit";

// Fresh rp_context for every request creation (nonce is single-use; signature expires)
const rp_context = await fetch("/api/rp-signature").then((r) => r.json());

function CreateSessionExample() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button onClick={() => setOpen(true)}>Create session</button>
      <IDKitSessionWidget
        open={open}
        onOpenChange={setOpen}
        app_id="app_xxxxx"
        rp_context={rp_context} // pass through from your backend
        constraints={CredentialRequest("proof_of_human")}
        onSuccess={(result) => {
          // IDKitResultSession — verify on your backend first, then save result.session_id
        }}
      />
    </>
  );
}

// onSuccess result shape:
// {
//   protocol_version: "4.0",
//   session_id: "session_<hex>",
//   nonce: string,
//   responses: [{ identifier, proof, session_nullifier, ... }],
//   environment: string,
//   ...
// }
```

```tsx
// Return visit — look up that session_id, then prove it
<IDKitSessionWidget
  open={open}
  onOpenChange={setOpen}
  app_id="app_xxxxx"
  rp_context={rp_context} // pass through from your backend
  existing_session_id={savedSessionId}
  constraints={CredentialRequest("proof_of_human")}
  onSuccess={(result) => {
    // same shape as create — result.session_id matches for the same user
    // verify on your backend before treating the login as complete
  }}
/>
```

If you want to request a credential based on an action-key scope, use `IDKitRequestWidget` and store the nullifier.

```tsx
import { useState } from "react";
import { IDKitRequestWidget, CredentialRequest } from "@worldcoin/idkit";

// Fresh rp_context for every request creation (nonce is single-use; signature expires)
const rp_context = await fetch("/api/rp-signature").then((r) => r.json());

function RequestExample() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button onClick={() => setOpen(true)}>Verify</button>
      <IDKitRequestWidget
        open={open}
        onOpenChange={setOpen}
        app_id="app_xxxxx"
        action="my-action"
        rp_context={rp_context} // pass through from your backend
        allow_legacy_proofs={false}
        constraints={CredentialRequest("proof_of_human")}
        onSuccess={(result) => {
          // IDKitResult — send to your backend → /api/v4/verify/{rp_id}
          // only then store the nullifier; same person + same action = reject on return
        }}
        handleVerify={async (result) => {
          // optional: run host-app verification before the success screen — throw if it fails
          const response = await fetch("/api/verify-proof", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(result),
          });

          if (!response.ok) {
            throw new Error("Proof verification failed");
          }
        }}
        onError={(errorCode) => {
          console.error(errorCode);
        }}
      />
    </>
  );
}
```

`onSuccess` is required on widgets. Use `handleVerify` to run host-app verification before the success screen — throw if it fails.

If the user is on a different device than World App (desktop browser ↔ phone), use `IDKitInviteCodeRequestWidget` with the same request config as `IDKitRequestWidget`.

## Subpath Exports

Pure JS subpath exports are available for server-side use without WASM or React:

| Subpath    | Exports                             |
| ---------- | ----------------------------------- |
| `/signing` | `signRequest`, `RpSignature` (type) |
| `/hashing` | `hashSignal`                        |

```typescript
import { signRequest } from "@worldcoin/idkit/signing";
import { hashSignal } from "@worldcoin/idkit/hashing";
```
