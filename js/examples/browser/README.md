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

By default, the example uses the built workspace package through Vite, so run
the root `pnpm build` first to keep `dist/index.js` and
`dist/idkit_wasm_bg.wasm` in sync. The `Use CDN version` checkbox reveals the
core package URL and runs the same flow through that CDN global instead:

```text
https://unpkg.com/@worldcoin/idkit-core/dist/idkit.global.js
```

This verifies the package was published with `dist/idkit.global.js` and the
sibling `dist/idkit_wasm_bg.wasm` file.

#### Production

The example uses `@worldcoin/idkit-core` for pure TypeScript/browser usage. In production:

```bash
npm install @worldcoin/idkit-core
```
