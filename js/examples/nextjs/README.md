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

## Extra page: verify proof response

For teams testing raw World ID 4.0 proof responses, open:

- `http://localhost:4001/verify-proof`

This page lets you:

- paste a raw response JSON (`responses` required, `id` optional)
- provide explicit `action` and `nonce` values in the form
- parse compressed proof hex into the `proof: string[]` shape expected by Developer Portal
- submit the mapped payload through the existing `/api/verify-proof` endpoint
