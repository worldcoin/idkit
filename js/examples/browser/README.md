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

The page loads this checkout's `js/packages/core/dist/idkit.global.js` through
`/idkit.global.js`. Vite serves the current built file during development and
copies it into the example's production build. Rebuild core after changing its
source. This exercises the candidate browser global, exposed as `window.IDKit`,
without downloading any WASM asset.

To test a published CDN release, change both the script tag URL and
`IDKIT_SCRIPT_URL` in `index.html` to the same explicit candidate version:

```text
https://unpkg.com/@worldcoin/idkit-core@<candidate-version>
```

The package root resolves through the `unpkg` field to `dist/idkit.global.js`.
Existing releases before the JavaScript migration still use their original WASM
implementation; loading them does not validate the code in this checkout.

#### Production

The example uses `@worldcoin/idkit-core` for pure TypeScript/browser usage. In production:

```bash
npm install @worldcoin/idkit-core
```
