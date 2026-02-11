# @worldcoin/idkit

React SDK for World ID built on top of `@worldcoin/idkit-core`.

## Highlights

- Headless hooks for custom UI
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

  return (
    <button onClick={flow.open} disabled={flow.status === "awaiting_confirmation"}>
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
