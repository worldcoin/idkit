# @worldcoin/idkit

React SDK for World ID built on top of `@worldcoin/idkit-core`.

## Highlights

- Headless hooks for custom UI
- DOM-free `@worldcoin/idkit/hooks` entry for React Native
- Built-in controlled widgets with shadow DOM isolation
- Separate request and session APIs
- JavaScript core with no WASM build or runtime dependency
- `/signing` and `/hashing` subpath exports for server-side use

## Installation

```bash
npm install @worldcoin/idkit
```

React is a peer dependency. Install React DOM when using the web widgets; it is
optional for applications that only import `@worldcoin/idkit/hooks`.

## Basic usage

```tsx
import {
  useIDKitRequest,
  orbLegacy,
  deviceLegacy,
  selfieCheck,
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

Use `deviceLegacy({ signal })` for orb-or-device legacy requests. The
`selfieCheck({ signal })` preset requests the Selfie Check credential and always
disables fallback to legacy proofs.

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

## Developing widget styles

Edit the CSS files in `src/styles`. `widget.css` imports them in cascade order;
PostCSS combines them into the JavaScript bundle. The widgets apply that CSS
inside their shadow roots, so applications do not need a separate CSS import.

Keep each component's base rules, variants, media queries, and keyframes together:

- `variables.css`: shared variables and theme values.
- `fonts.css`: font-face declarations.
- `modal.css`: backdrop, dialog, close button, content layout, and footer.
- `typography.css`: headings and descriptive text shared by the screens.
- `connection.css`: World ID badge, QR display, connection overlay, copy toast,
  simulator link, and mobile app handoff.
- `loading.css`: loading indicator shared by QR and host verification.
- `success.css` and `error.css`: the corresponding verification screens.

Put media queries beside the rules they modify. Keep a blank line between rules.

Run `pnpm -C js/packages/react dev` from the repository root alongside your
application's dev server. It watches all source files and keeps `dist` available
during rebuilds.

## Subpath Exports

Pure JS subpath exports for server-side use (no WASM or React required):

```typescript
import { signRequest } from "@worldcoin/idkit/signing";
import { hashSignal } from "@worldcoin/idkit/hashing";
```

## React Native and headless React

Import hooks from `@worldcoin/idkit/hooks` to avoid loading the web widgets or
React DOM. The core and hooks use JavaScript implementations, with no WASM
loader. Your app owns its UI and opens the connector URL using its platform's
linking API. The existing widgets from `@worldcoin/idkit` render web UI.

For Expo SDK 57, install `expo-crypto` and import from `@worldcoin/idkit/expo`.
This entry provides secure randomness automatically, without a polyfill or
`configureIDKitRuntime()` call. Expo Crypto is an optional peer dependency;
ordinary core/hooks imports do not load it.

```sh
npx expo install expo-crypto
```

```tsx
import { Linking, Button } from "react-native";
import {
  useIDKitRequest,
  type IDKitRequestHookConfig,
} from "@worldcoin/idkit/expo";

// Fetch rp_context from your backend; signing keys belong on the server.
export function VerifyButton({ config }: { config: IDKitRequestHookConfig }) {
  const request = useIDKitRequest(config);

  return (
    <Button
      title={request.connectorURI ? "Open World App" : "Start verification"}
      onPress={() => {
        if (request.connectorURI) {
          void Linking.openURL(request.connectorURI);
        } else {
          request.open();
        }
      }}
    />
  );
}
```

Pass an app-owned callback URL in `config.return_to` and configure the matching
URL scheme or universal/app link in your app. Observe `request.result` and send
it to your backend for verification before accepting it. The session and invite
code hooks are available from the same entry.

Hook `polling.timeout` covers creation, polling and retries together. Temporary
network errors and HTTP 408/429/5xx retry within that deadline. Timeout, reset,
and unmount abort pending bridge fetches; late results cannot update a newer run.
With Metro package exports enabled, mixed `import` and `require` calls resolve
the same core runtime, including the adapter configured through the hooks entry.

Bare React Native apps can use `@worldcoin/idkit/hooks` and provide their secure
entropy implementation through `configureIDKitRuntime({ getRandomValues })`
when `globalThis.crypto.getRandomValues` is unavailable. The host must also
provide `fetch`, timers and `AbortController`. Explicit runtime configuration
takes precedence over the Expo default; resetting it restores host defaults.
JavaScript cannot create secure entropy by itself;
do not substitute `Math.random`. An entropy module is a host integration, not a
required native IDKit module. React Native uses the HTTP bridge flow; the World
App Mini App transport is a separate WebView integration.

CI checks the built core and hooks in Hermes. Metro bundling, native linking and
live backend verification must also be tested in the consuming app.
