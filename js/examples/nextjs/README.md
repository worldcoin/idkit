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

Use the ↑ / ↓ buttons under `Credential order` to reorder selected credentials.
New selections are appended to the end. The chosen order is used in the JSON
preview, requests and sessions, and is preserved in shared configuration links.

The request is built with IDKit's `any()`, `all()` and `enumerate()` helpers
around `CredentialRequest(...)` (see `app/multi-constraints.ts`), and the exact
constraint tree is previewed in the configuration panel before you start.

`Connect base URL` sets `override_connect_base_url`, the base of the connector
link and QR code. Leave it empty to use the default for the selected
environment, pick a preset (staging World App, staging web authenticator) or
type any `https://` URL in canonical form (`http://` is accepted for
`localhost` and `127.0.0.1` only; a query string or fragment is rejected). IDKit applies the override in every
environment. The value is preserved in shared configuration links; a link that
carries an override opens with the configuration panel expanded, and the page
shows the active override next to the verify button. On desktop, `Open Connector
URL` below the QR code opens the connector link in the same browser.

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

After building the SDK packages and installing this example, run its
regression tests with `corepack pnpm -C js/examples/nextjs test` (Node 24).

This example installs separately so Next.js tooling stays outside the SDK dependency
graph. Its SDK dependencies link to the local packages; rebuild those packages
after making changes. Next.js tooling can include optional WASM variants, while
the SDK itself has no WASM assets.

## Eruda

[Eruda](https://github.com/liriliri/eruda) is enabled by default for this
example so you can inspect the console inside World App.
