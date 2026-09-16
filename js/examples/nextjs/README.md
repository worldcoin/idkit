# IDKit Next.js Example

This example demonstrates end-to-end World ID verification with:

- `@worldcoin/idkit` widget request flow
- `@worldcoin/idkit-core` server RP signature generation
- Next.js API routes for RP signature + proof verification

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
pnpm install
pnpm build
cd js/examples/nextjs
cp .env.example .env.local
pnpm dev
```

Open `http://localhost:4001`.

## Eruda

[Eruda](https://github.com/liriliri/eruda) is enabled by default for this
example so you can inspect the console inside World App.
