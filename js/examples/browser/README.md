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

The browser page loads the latest release CDN build by default. The URL points
at the 4.2.0 package root, so unpkg resolves it through the core package's
`unpkg` entry (`./dist/idkit.global.js`):

```text
https://unpkg.com/@worldcoin/idkit-core@4.2.0
```

This verifies the package was published with `dist/idkit.global.js`, exposes
`window.IDKit`, and can fetch the sibling `dist/idkit_wasm_bg.wasm` file.

#### Production

The example uses `@worldcoin/idkit-core` for pure TypeScript/browser usage. In production:

```bash
npm install @worldcoin/idkit-core
```
