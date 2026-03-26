# @worldcoin/idkit

React SDK for World ID built on top of `@worldcoin/idkit-core`.

## Highlights

- Headless hooks for custom UI
- Built-in controlled widgets with shadow DOM isolation
- Separate request and session APIs
- Pure JS `/signing` and `/hashing` subpath exports for server-side use

## Installation

```bash
npm install @worldcoin/idkit
```

## Basic usage

```tsx
import {
  useIDKitRequest,
  orbLegacy,
  deviceLegacy,
  selfieCheckLegacy,
} from "@worldcoin/idkit";

function Example() {
  const flow = useIDKitRequest({
    app_id: "app_xxxxx",
    action: "my-action",
    rp_context,
    allow_legacy_proofs: false,
    return_to: "myapp://idkit/callback",
    preset: orbLegacy({ signal: "user-123" }),
  });
  const isBusy =
    flow.isAwaitingUserConnection || flow.isAwaitingUserConfirmation;

  return (
    <button onClick={flow.open} disabled={isBusy}>
      Verify
    </button>
  );
}
```

Use `deviceLegacy({ signal })` for orb-or-device legacy requests and `selfieCheckLegacy({ signal })` for selfie-check preset requests.

```tsx
import type { IDKitRequestHookConfig } from "@worldcoin/idkit";

const config: IDKitRequestHookConfig = {
  app_id: "app_xxxxx",
  action: "my-action",
  rp_context,
  allow_legacy_proofs: false,
  preset: { type: "OrbLegacy" },
};
```

## Widget usage

```tsx
import { IDKitRequestWidget, orbLegacy } from "@worldcoin/idkit";

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
      preset={orbLegacy({ signal: "user-123" })}
      onSuccess={(result) => {
        // required: runs after verification succeeds
        console.log(result);
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

Pure JS subpath exports for server-side use (no WASM or React required):

```typescript
import { signRequest } from "@worldcoin/idkit/signing";
import { hashSignal } from "@worldcoin/idkit/hashing";
```
