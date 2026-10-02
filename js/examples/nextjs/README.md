# IDKit Next.js Example

This example demonstrates end-to-end World ID verification with:

- `@worldcoin/idkit` widget request flow
- `@worldcoin/idkit-core` server RP signature generation
- Next.js API routes for RP signature + proof verification

The SDK builds are JavaScript-only. Next.js does not need WASM asset tracing,
custom loaders or an IDKit-specific `serverExternalPackages` setting.

The UI includes request buttons matching the browser example presets:

- Orb Legacy
- Secure Document Legacy
- Document Legacy
- Device Legacy
- Selfie Check Legacy

For World ID 4.0 requests and sessions, the `Credential` select also offers
`Multiple credentials`. Pick any subset of Proof of Human, Selfie, Passport and
My Number Card, then choose how they combine:

- `Any (OR)`: World App satisfies the request with the first selected
  credential the account holds (selection order is priority).
- `All (AND)`: every selected credential is required.
- `Enumerate`: every selected credential the account holds is included; at
  least one is required.

The request is built with IDKit's `any()`, `all()` and `enumerate()` helpers
around `CredentialRequest(...)` (see `app/multi-constraints.ts`), and the exact
constraint tree is previewed in the configuration panel before you start.

The `/arena` route includes grouped mobile implementation test cases for
World ID 3.0 presets, World ID 4.0 constraints, migration fallback behavior,
and 4.0 error handling.

## Run

From repo root:

```bash
corepack pnpm install --frozen-lockfile
corepack pnpm build
corepack pnpm prepare:next
cp js/examples/nextjs/.env.example js/examples/nextjs/.env.local
corepack pnpm -C js/examples/nextjs dev
```

Open `http://localhost:4001`.

This example is a separate pnpm workspace. Next.js and its image tooling are not
installed by the SDK workspace. `prepare:next` packs the three locally built SDKs,
copies them into ignored `.idkit-candidate/` files, and installs those tarballs
with exact local overrides so no older registry SDK is accidentally used.
Rerun it after rebuilding an SDK. Its isolated lockfile retains external versions
and updates the local tarball integrity when the build changes. To consume a
verified release candidate instead, use `pnpm prepare:next --artifacts <directory>`.
The SDK itself has no WASM assets; Next's independent tool dependencies can have
optional WASM variants.

## Eruda

[Eruda](https://github.com/liriliri/eruda) is enabled by default for this
example so you can inspect the console inside World App.
