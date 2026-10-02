# Native headless acceptance smoke

This copy-in component exercises the actual React Native renderer, host networking,
World App handoff, background/resume and backend proof acceptance. It deliberately
has no workspace package manifest: running `pnpm install` for the SDK does not
install React Native or Expo.

Use an existing bare RN or Expo app on the release's supported RN baseline. Build
and pack this checkout's server, core and React packages, then install those
candidate tarballs into the app. Ensure the core package resolves the candidate
server version and React resolves the candidate core version; do not accidentally
validate published dependencies instead of this checkout.

1. Copy `IDKitSmoke.tsx` into the app and import it from the app's normal screen.
2. Configure a secure random provider before rendering. Expo apps with
   `expo-crypto` installed can use:

   ```ts
   import * as Crypto from "expo-crypto";
   import { configureIDKitRuntime } from "@worldcoin/idkit/hooks";

   configureIDKitRuntime({
     getRandomValues: (bytes) => Crypto.getRandomValues(bytes),
   });
   ```

   Bare RN apps use their existing secure entropy provider with the same adapter.
   Do not use `Math.random`. The provider is a host integration, not an IDKit
   native module.

3. Supply `appId`, `action`, `returnTo`, `rpContextEndpoint` and
   `verificationEndpoint` props. The first backend endpoint accepts
   `{ app_id, action }` and returns a fresh signed `RpContext`; the second accepts
   the SDK result, performs the normal server verification and returns
   `{ verified: true }` only after acceptance. Keep RP signing keys on the backend.
4. Register the `returnTo` scheme or universal/app link in the app. Install World
   App on the same device. Use a test account and a registered test app/action.
5. Run on Android and iOS with Hermes and the normal Metro configuration. Prepare
   a request, start verification, open World App, approve, and return to the app.
   Accept only `PASS: backend verified the proof` as the full-flow success signal.
6. Repeat after cancelling, backgrounding and reopening, and resetting while a
   request is pending. Verify stale attempts cannot update the new screen. Also
   test network interruption, expired RP context and user rejection.
7. Repeat the flow with the session hooks, invite-code hook and Self Check preset
   as covered by the migration acceptance matrix. The supplied screen is the
   minimal uniqueness-proof smoke, not the whole acceptance suite.

Record RN/Expo, Hermes, OS and device versions with the result. A Metro bundle or
standalone Hermes run does not prove the device handoff or backend acceptance.
The screen displays statuses only; do not add proof payloads or signing contexts
to logs or committed fixtures.

For a standalone engine regression run using this repository's native Rust
fixture corpus, set `HERMES_BIN` to the React Native distribution's **Hermes VM**
executable (not `hermesc`) and run:

```sh
HERMES_BIN=/absolute/path/to/hermes node scripts/test-hermes.mjs
```

This engine check runs JS protocol/crypto outputs against checked-in Rust outputs.
It applies the class and lexical-binding transforms required by Hermes, removes
host UTF-8 codecs, and adds no platform polyfills. It does not run Metro or provide
networking, an entropy source or a React Native renderer. CI runs this corpus in
the pinned Hermes VM from React Native 0.79.2; this is engine qualification, not a
claim that device acceptance has passed.
