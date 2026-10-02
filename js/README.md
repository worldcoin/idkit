# JavaScript SDK development

IDKit's JavaScript packages implement the World ID protocol in TypeScript. Rust
remains the protocol reference, and the compatibility suite compares production
Rust functions with the JavaScript implementation. Package builds, installations
and ordinary tests need no Rust compiler, `wasm-pack` or WASM assets.

## Packages and runtime boundaries

| Package or entry                | Responsibility                                                                                             |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `@worldcoin/idkit-core`         | Request/session builders, protocol validation, bridge encryption, polling and World App Mini App transport |
| `@worldcoin/idkit-core/signing` | Backend RP signature helpers, supplied by the server package                                               |
| `@worldcoin/idkit-core/hashing` | Signal hashing                                                                                             |
| `@worldcoin/idkit-core/session` | Session commitment extraction                                                                              |
| `@worldcoin/idkit/hooks`        | React request, session and invite-code hooks without web widgets or React DOM                              |
| `@worldcoin/idkit`              | The hooks plus existing browser widgets                                                                    |
| `@worldcoin/idkit-server`       | Backend RP signing and session utilities                                                                   |

Core's `src/protocol` owns deterministic validation and wire transformations;
`src/lib` owns crypto, encodings and host capability adapters; `src/transports`
owns HTTP and Mini App integration. React adds lifecycle and UI behavior without
reimplementing protocol rules. Conditional Node entries supply secure entropy
without installing global polyfills. Portable entries do not load Node built-ins.

Core uses `@noble/ciphers` for AES-GCM, `@noble/hashes` for hashes and KDFs,
`@scure/base` for base encodings, `@stablelib/utf8` for UTF-8 and `whatwg-url` for
consistent URL parsing. The server package uses `@noble/secp256k1` and
`@noble/hashes` for RP signing. Portable primitives are bundled using browser
conditions so an importing app does not accidentally resolve Node-specific
implementations. The source manifests and lockfile record the dependency versions.

Applications provide networking, timers, cancellation and secure entropy.
`configureIDKitRuntime({ getRandomValues, fetch })`, exported from core and React
hooks, allows explicit entropy and fetch adapters. Configure it once before
creating flows; calls replace the supplied configuration. No pure JavaScript
package can manufacture secure random entropy, so React Native hosts without
`crypto.getRandomValues` need their existing secure entropy provider. Native apps
own rendering, `Linking` and return URL registration. See the
[React integration guide](./packages/react/README.md#react-native-and-headless-react)
and [device smoke example](./examples/react-native-smoke/README.md).

## Build and test

Run these commands from the repository root with Node.js 22 and pinned pnpm 9.15.4:

```sh
corepack pnpm install --frozen-lockfile
corepack pnpm build
corepack pnpm test
corepack pnpm type-check
corepack pnpm audit:dependencies
corepack pnpm test:tooling
corepack pnpm test:packages
```

The root dependency audit checks every locked package, including optional
platform dependencies, and recursively checks installed assets. The tsup build
uses a scoped pure JavaScript source-map replacement; its composition regression
and upgrade requirements are documented in [`patches/README.md`](../patches/README.md).

Next.js and Miniflare have independent dependency graphs that include optional
WASM variants. They are explicitly isolated in `js/examples/nextjs` and
`tools/runtime`, each with its own manifest and lockfile; normal SDK installs,
builds and unit tests do not include them. Run the
[Next example](./examples/nextjs/README.md) with `pnpm prepare:next` after building
to install actual local SDK tarballs. Their integrity is refreshed on rebuild.

The published packages support Node.js 18 and newer. Development tooling uses a
newer Node version; CI builds on Node.js 22, then executes packed-package CommonJS
and ES module smoke tests on Node.js 18, 22 and 24. The pack test installs all three
candidate tarballs together and exercises imports, signing, hashing, requests and
invite codes.

## Compatibility gates

Ordinary `pnpm test` consumes the checked-in Rust-derived core and signing
fixtures. With the toolchain from `rust-toolchain.toml` installed, run:

```sh
pnpm test:conformance
```

This builds the native `idkit-conformance` binary against the locked Rust
dependencies, compares the current Rust output with retained fixtures and JS,
checks schema and enum coverage, generates reproducible property-test cases,
and compares encrypted HTTP request transcripts against a loopback bridge.
The loopback server uses an ephemeral port on `127.0.0.1`; it needs permission
to listen locally, and requires no external bridge or account.

When an intentional protocol change requires fixture updates, review the input
corpus and regenerate explicitly:

```sh
IDKIT_CONFORMANCE_UPDATE=1 pnpm test:conformance
node js/packages/server/scripts/update-conformance-fixtures.mjs
```

Review the resulting fixture and Rust manifest changes; preserve existing cases
and add regressions for compatibility failures. Do not update expected values
just to make the JavaScript implementation pass. The native oracle contract is
documented in [`rust/core/CONFORMANCE.md`](../rust/core/CONFORMANCE.md).

CI also runs the core fixture corpus in the Hermes VM distributed with React
Native 0.79.2. Use an actual Hermes VM path to run the same check locally:

```sh
HERMES_BIN=/absolute/path/to/hermes node scripts/test-hermes.mjs
HERMES_BIN=/absolute/path/to/hermes node scripts/test-hermes-entry.mjs
```

The engine gate does not run Metro or a device renderer. Device handoff and live
backend acceptance follow the [native smoke procedure](./examples/react-native-smoke/README.md).
For the browser and Worker runtime gate, install Chromium and run:

```sh
corepack pnpm -C tools/runtime install --frozen-lockfile
corepack pnpm -C tools/runtime exec playwright install chromium
corepack pnpm test:portable
```

The portable runtime test also installs a fresh packed-package consumer. Release
CI supplies the checksummed prepared tarballs to Node, browser/Worker and Hermes
entry tests without rebuilding them. Target-only Node consumers resolve exact
prerequisite versions from the registry with no local overrides.

All three JavaScript publish workflows require the reusable compatibility gate
on the exact release candidate. Follow the
[release checklist](../docs/pure-js-sdk-release.md) to publish in dependency order.
