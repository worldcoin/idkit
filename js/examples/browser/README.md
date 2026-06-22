# IDKit Browser Example

A simple browser example demonstrating World ID verification using the IDKit core package.

## Usage

#### Local Development

From the repo root:

```bash
pnpm install
pnpm build
```

Then run the example:

```bash
cd js/examples/browser
pnpm dev
```

Open http://localhost:4000 in your browser (Vite will auto-open it).

The single `index.html` file has three separate examples:

- Package import request: uses the workspace package through Vite and shows QR
  or invite-code requests.
- CDN global legacy request: loads `window.IDKit` from a script URL and runs
  selectable 4.0 migration presets plus legacy-only presets.
- CDN global 4.0 session: uses the same CDN global for `createSession` and
  `proveSession` with selectable 4.0 credential constraints.

The CDN sections default to:
`https://cdn.jsdelivr.net/npm/@worldcoin/idkit-core/dist/idkit.global.js`.
They verify the package was published with `dist/idkit.global.js` and the
sibling `dist/idkit_wasm_bg.wasm` file. The example does not serve a local
fallback for these files, so a missing CDN artifact fails visibly.

For pre-publish CDN testing, publish a temporary package or point the CDN script
URL input at a branch artifact:

```text
https://cdn.jsdelivr.net/gh/worldcoin/idkit@<branch-or-sha>/js/packages/core/dist/idkit.global.js
```

All examples use the local `/api/rp-signature` endpoint for backend-only RP
signing.

#### Production

The example uses `@worldcoin/idkit-core` for pure TypeScript/browser usage. In production:

```bash
npm install @worldcoin/idkit-core
```
