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
  selfieCheckLegacy,
} from "@worldcoin/idkit";

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

Use `selfieCheckLegacy({ signal })` for selfie-check preset requests.

Legacy preset behavior:

- `orbLegacy` returns only World ID 3.0 legacy proofs with `verification_level = "orb"`. Legacy verification returns the maximum level, and this preset only includes orb, so it always resolves to `orb`.
- `secureDocumentLegacy` returns only World ID 3.0 legacy proofs with `verification_level = "secure_document"`. Legacy verification returns the maximum level, so the proof can resolve to `secure_document` or `orb`.
- `documentLegacy` returns only World ID 3.0 legacy proofs with `verification_level = "document"`. Legacy verification returns the maximum level, so the proof can resolve to `document`, `secure_document`, or `orb`.
- `selfieCheckLegacy` returns only World ID 3.0 legacy proofs with `verification_level = "face"`.

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

## Subpath Exports

Pure JS subpath exports for server-side use (no WASM or React required):

```typescript
import { signRequest } from "@worldcoin/idkit/signing";
import { hashSignal } from "@worldcoin/idkit/hashing";
```
