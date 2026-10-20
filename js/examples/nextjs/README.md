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

For a World ID 4.0 uniqueness proof, keep `Flow` set to `Request` and check
`Create Session`. The request adds `session_id: "create"` while keeping its action
and uniqueness proof type. The returned IDKit response should include the action,
a new session ID, and each credential's uniqueness nullifier. Legacy fallback is
disabled for this option. The checkbox is also saved by `Share config` and works
with invite codes.

This is an SDK experiment: the Developer Portal verifier also needs to accept
and verify uniqueness proofs bound to a session. The demo displays the IDKit
response and the Portal HTTP status/body separately, including on verification
failure. A returned session ID alone does not mean the backend verified the
binding. After validating enrollment, use the returned ID in the existing
`Session` flow to test continuity.

The `/arena` route includes grouped mobile implementation test cases for
World ID 3.0 presets, World ID 4.0 constraints, migration fallback behavior,
and 4.0 error handling.

## Run

From repo root:

```bash
corepack pnpm install --frozen-lockfile
corepack pnpm build
corepack pnpm -C js/examples/nextjs install --frozen-lockfile
cp js/examples/nextjs/.env.example js/examples/nextjs/.env.local
corepack pnpm -C js/examples/nextjs dev
```

Open `http://localhost:4001`.

This example installs separately so Next.js tooling stays outside the SDK dependency
graph. Its SDK dependencies link to the local packages; rebuild those packages
after making changes. Next.js tooling can include optional WASM variants, while
the SDK itself has no WASM assets.

## Eruda

[Eruda](https://github.com/liriliri/eruda) is enabled by default for this
example so you can inspect the console inside World App.
