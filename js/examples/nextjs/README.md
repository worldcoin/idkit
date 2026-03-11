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
