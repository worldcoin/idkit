# @worldcoin/idkit

React SDK for World ID built on top of `@worldcoin/idkit-core`.

## Highlights

- Headless hooks for custom UI
- Built-in controlled widgets with shadow DOM isolation
- Separate request and session APIs

## Installation

```bash
npm install @worldcoin/idkit
```

## Hook usage

```tsx
import { useIDKitRequest, orbLegacy } from "@worldcoin/idkit";

function Example() {
  const flow = useIDKitRequest({
    app_id: "app_xxxxx",
    action: "my-action",
    rp_context,
    allow_legacy_proofs: false,
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
