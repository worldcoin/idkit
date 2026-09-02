# @worldcoin/idkit

React SDK for World ID built on top of `@worldcoin/idkit-core`. Headless hooks for custom UI, and controlled widgets with shadow DOM isolation.

## Installation

```bash
npm install @worldcoin/idkit
```

## Quickstart

### Requirements

From the [Developer Portal](https://developer.world.org): `app_id`, `rp_id`, and an RP signing key. Keep the signing key on your backend only.

There are two ways you can request proofs with IDKit, and they depend on how you want to use the SDK.

If you want to request a World ID session-scoped proof, use `useIDKitSession` / `IDKitSessionWidget` and store the result `session_id`. On a return visit, pass that `session_id` as `existing_session_id` to log and sync existing users with their session data.

```tsx
import { useIDKitSession, CredentialRequest } from "@worldcoin/idkit";

const rp_context = await fetch("/api/rp-signature").then((r) => r.json());

function CreateSessionExample() {
  const flow = useIDKitSession({
    app_id: "app_xxxxx",
    rp_context, // pass through from your backend
    constraints: CredentialRequest("proof_of_human"),
  });

  return (
    <button onClick={flow.open} disabled={flow.isAwaitingUserConnection}>
      Create session
    </button>
  );
}

// flow.result is IDKitResultSession once the user finishes:
// {
//   protocol_version: "4.0",
//   session_id: "session_<hex>",
//   nonce: string,
//   responses: [{ identifier, proof, session_nullifier, ... }],
//   environment: string,
//   ...
// }
// verify on your backend first, then save flow.result.session_id in your DB
```

```tsx
// Return visit — look up that session_id, then prove it
const flow = useIDKitSession({
  app_id: "app_xxxxx",
  rp_context, // pass through from your backend
  existing_session_id: savedSessionId,
  constraints: CredentialRequest("proof_of_human"),
});
// same shape as create — flow.result.session_id matches for the same user
// verify on your backend before treating the login as complete
```

If you want to request a credential based on an action-key scope, use `useIDKitRequest` / `IDKitRequestWidget` and store the nullifier.

```tsx
import { useIDKitRequest, CredentialRequest } from "@worldcoin/idkit";

const rp_context = await fetch("/api/rp-signature").then((r) => r.json());

function RequestExample() {
  const flow = useIDKitRequest({
    app_id: "app_xxxxx",
    action: "my-action",
    rp_context, // pass through from your backend
    allow_legacy_proofs: false,
    constraints: CredentialRequest("proof_of_human"),
  });

  return (
    <button onClick={flow.open} disabled={flow.isAwaitingUserConnection}>
      Verify
    </button>
  );
}

// flow.result is IDKitResult (v4 uniqueness):
// {
//   protocol_version: "4.0",
//   action: string,
//   nonce: string,
//   responses: [{ identifier, proof, nullifier, ... }],
//   environment: string,
//   ...
// }
// send flow.result to your backend → /api/v4/verify/{rp_id}
// only then store the nullifier; same person + same action = reject on return
```

The same configs work on the widgets (`IDKitSessionWidget`, `IDKitRequestWidget`). `onSuccess` is required on widgets. Use `handleVerify` to run host-app verification before the success screen — throw if it fails.

If the user is on a different device than World App (desktop browser ↔ phone), use `useIDKitInviteCodeRequest` / `IDKitInviteCodeRequestWidget` with the same request config as `useIDKitRequest`.

## Widget usage

```tsx
import { IDKitRequestWidget, CredentialRequest } from "@worldcoin/idkit";

function WidgetExample() {
  return (
    <IDKitRequestWidget
      open={open}
      onOpenChange={setOpen}
      app_id="app_xxxxx"
      action="my-action"
      rp_context={rpContext}
      allow_legacy_proofs={false}
      return_to="myapp://idkit/callback"
      constraints={CredentialRequest("proof_of_human")}
      onSuccess={(result) => {
        // required: runs after verification succeeds
        // IDKitResult — send to your backend, then store the nullifier
      }}
      handleVerify={async (result) => {
        // optional: run host app verification before success screen/callback
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
  );
}
```

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
